"""Offline backup/restore of DB and referenced photos; no network storage or live snapshots.

Stop API before use. Restore only into a NEW database and an empty upload directory.
PostgreSQL requires pg_dump/pg_restore on PATH. Credentials stay in child environment.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream,'sha256').hexdigest()


def pg_environment(url):
    env=os.environ.copy()
    for name,value in {'PGHOST':url.host,'PGPORT':url.port,'PGUSER':url.username,'PGPASSWORD':url.password,'PGDATABASE':url.database}.items():
        if value is not None:env[name]=str(value)
    # Never print env or the connection URL; never invoke a shell.
    return env


def backup(database_url, uploads, output, service_stopped=False):
    if not service_stopped:raise ValueError('Stop the API and acknowledge service_stopped before backup')
    uploads=Path(uploads).resolve();output=Path(output).resolve();url=make_url(database_url)
    if output.exists():raise ValueError('Backup output must not exist')
    output.parent.mkdir(parents=True,exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='.crs-backup-',dir=output.parent))
    engine=None
    try:
        if url.get_backend_name()=='sqlite':
            source=Path(url.database).resolve()
            if not source.is_file():raise ValueError('Source database does not exist')
            name='database.sqlite3'
            with closing(sqlite3.connect(source.as_uri()+'?mode=ro',uri=True)) as src, closing(sqlite3.connect(stage/name)) as dst:
                src.backup(dst)
        elif url.get_backend_name()=='postgresql':
            name='database.dump'
            subprocess.run(['pg_dump','--format=custom','--file',str(stage/name)],env=pg_environment(url),check=True,capture_output=True)
        else:raise ValueError('Unsupported database')
        engine=create_engine(database_url)
        with engine.connect() as db:
            photos=db.execute(text('SELECT filename,sha256 FROM photos')).all()
        (stage/'uploads').mkdir()
        for filename,sha in photos:
            if Path(filename).name!=filename:raise ValueError('Invalid photo storage key')
            path=uploads/filename
            if not path.is_file() or path.is_symlink() or digest(path)!=sha:raise ValueError('Missing or corrupt source photo')
            shutil.copyfile(path,stage/'uploads'/filename)
        files={p.relative_to(stage).as_posix():digest(p) for p in stage.rglob('*') if p.is_file()}
        manifest={'version':1,'database_kind':url.get_backend_name(),'created_at':datetime.now(timezone.utc).isoformat(),'files':files}
        (stage/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
        os.replace(stage,output)
    finally:
        if engine is not None:engine.dispose()
        if stage.exists():shutil.rmtree(stage)


def verify(source):
    source=Path(source).resolve()
    manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('version')!=1 or not isinstance(manifest.get('files'),dict):raise ValueError('Unsupported backup manifest')
    expected_db={'sqlite':'database.sqlite3','postgresql':'database.dump'}.get(manifest.get('database_kind'))
    if expected_db not in manifest['files']:raise ValueError('Missing database snapshot')
    for name,sha in manifest['files'].items():
        path=source/name
        if name!=expected_db and not (name.startswith('uploads/') and len(Path(name).parts)==2):raise ValueError('Invalid manifest path')
        if path.is_symlink() or source not in path.resolve().parents or not path.is_file() or digest(path)!=sha:raise ValueError('Backup checksum mismatch')
    return manifest


def restore(source,database_url,uploads,service_stopped=False):
    if not service_stopped:raise ValueError('Stop the API and acknowledge service_stopped before restore')
    source=Path(source).resolve();uploads=Path(uploads).resolve();manifest=verify(source);url=make_url(database_url)
    if url.get_backend_name()!=manifest['database_kind']:raise ValueError('Database kind mismatch')
    if uploads.exists() and (not uploads.is_dir() or any(uploads.iterdir())):raise ValueError('Upload destination must be empty')
    if url.get_backend_name()=='sqlite':
        target=Path(url.database).resolve()
        if target.exists():raise ValueError('Restore database must not exist')
        target.parent.mkdir(parents=True,exist_ok=True)
    else:
        engine=create_engine(database_url)
        try:
            if inspect(engine).get_table_names():raise ValueError('Restore database must be empty')
        finally:engine.dispose()
    uploads.parent.mkdir(parents=True,exist_ok=True)
    stage=Path(tempfile.mkdtemp(prefix='.crs-restore-',dir=uploads.parent))
    try:
        for name in manifest['files']:
            if name.startswith('uploads/'):shutil.copyfile(source/name,stage/Path(name).name)
        if url.get_backend_name()=='sqlite':
            with closing(sqlite3.connect((source/'database.sqlite3').as_uri()+'?mode=ro',uri=True)) as src, closing(sqlite3.connect(target)) as dst:
                if src.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise ValueError('Database integrity check failed')
                src.backup(dst)
        else:
            subprocess.run(['pg_restore','--exit-on-error','--no-owner','--no-privileges','--dbname',url.database,str(source/'database.dump')],env=pg_environment(url),check=True,capture_output=True)
        if uploads.exists():uploads.rmdir()  # Verified empty above; never remove existing media.
        os.replace(stage,uploads)
    finally:
        if stage.exists():shutil.rmtree(stage)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['backup','verify','restore'])
    parser.add_argument('snapshot',type=Path)
    parser.add_argument('--service-stopped',action='store_true')
    args=parser.parse_args()
    try:
        if args.action=='verify':verify(args.snapshot)
        else:
            database_url=os.environ['DATABASE_URL'];uploads=os.environ['UPLOAD_DIR']
            if args.action=='backup':backup(database_url,uploads,args.snapshot,args.service_stopped)
            else:restore(args.snapshot,database_url,uploads,args.service_stopped)
    except subprocess.CalledProcessError:raise SystemExit('Database backup/restore command failed; inspect server locally without logging credentials')
    print('OK')
if __name__=='__main__':main()
