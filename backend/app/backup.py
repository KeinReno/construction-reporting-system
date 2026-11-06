"""Offline backup/restore of DB and referenced photos; no network storage or live snapshots.

Stop API before use. Restore only into a NEW database and an empty upload directory.
PostgreSQL requires matching installed client tools or CRS_PG_BIN_DIR. Credentials stay in child environment.
"""
import argparse
import hashlib
import json
import os
import re
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


def pg_candidates(name, server_major):
    folder=os.environ.get('CRS_PG_BIN_DIR')
    filename=name+('.exe' if os.name=='nt' else '')
    if folder:return [str(Path(folder)/filename)]
    installed=[Path('/usr/lib/postgresql')/str(server_major)/'bin'/filename,
               Path(os.environ.get('ProgramFiles','C:/Program Files'))/'PostgreSQL'/str(server_major)/'bin'/filename]
    return list(dict.fromkeys([p for p in [shutil.which(name),*(str(p) for p in installed if p.is_file())] if p]))


def pg_tool(name, server_major):
    """Choose a matching installed client before creating a snapshot or changing a restore target."""
    for executable in pg_candidates(name,server_major):
        try:result=subprocess.run([executable,'--version'],check=True,capture_output=True,text=True)
        except (OSError,subprocess.CalledProcessError):continue
        version=re.search(r'PostgreSQL\)\s+(\d+)',result.stdout)
        if version and int(version[1])==server_major:return executable
    raise ValueError('PostgreSQL client major must match server; configure CRS_PG_BIN_DIR')


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
            engine=create_engine(database_url)
            with engine.connect() as db:major=int(db.scalar(text('SHOW server_version_num')))//10000
            executable=pg_tool('pg_dump',major)
            subprocess.run([executable,'--format=custom','--file',str(stage/name)],env=pg_environment(url),check=True,capture_output=True)
        else:raise ValueError('Unsupported database')
        if engine is None:engine=create_engine(database_url)
        with engine.connect() as db:
            photos=list(db.execute(text('SELECT filename,sha256 FROM photos')).all())
            if inspect(engine).has_table('imported_corpora'):
                for raw, in db.execute(text('SELECT payload FROM imported_corpora')):
                    corpus=json.loads(raw) if isinstance(raw,str) else raw
                    for item in corpus.get('media',[]):
                        if item.get('storage_file'):photos.append((item['storage_file'],item['sha256']))
        unique={}
        for filename,sha in photos:
            if filename in unique and unique[filename]!=sha:raise ValueError('Conflicting photo checksum')
            unique[filename]=sha
        (stage/'uploads').mkdir()
        for filename,sha in unique.items():
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
            with engine.connect() as db:major=int(db.scalar(text('SHOW server_version_num')))//10000
            restore_executable=pg_tool('pg_restore',major)
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
            subprocess.run([restore_executable,'--exit-on-error','--no-owner','--no-privileges','--dbname',url.database,str(source/'database.dump')],env=pg_environment(url),check=True,capture_output=True)
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
