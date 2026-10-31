"""Create an independent private runtime COPY with a verified backup. Never overwrite the source."""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path
from sqlalchemy import create_engine,text,delete,select
from sqlalchemy.orm import Session

CODE=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(CODE/'backend'))
sys.path.insert(0,str(CODE))
from app.backup import backup,restore
from app.import_evidence import materialize_evidence
from app.main import Token,User,Report,Photo
from scripts.demo.owner_max_real_app import build_archive_context


def signature(engine):
    with engine.connect() as db:
        rows=[tuple(row) for row in db.execute(text('SELECT * FROM reports ORDER BY id'))]
    return hashlib.sha256(json.dumps(rows,default=str,ensure_ascii=False).encode()).hexdigest()


def prepare(source:Path,target:Path,port:int):
    source=source.resolve();target=target.resolve()
    if target.exists():raise ValueError('Target exists; never overwrite a running runtime')
    if target==CODE or CODE in target.parents:raise ValueError('Private runtime must stay outside Git')
    if source==target or source in target.parents:raise ValueError('Use a separate runtime directory')
    database=source/'owner-demo.db';archive=source/'archive'
    if not database.is_file() or not (archive/'data.js').is_file():raise ValueError('Source database or local evidence snapshot missing')
    credentials=json.loads((source/'credentials.json').read_text(encoding='utf-8-sig'))
    target.mkdir(parents=True);(target/'data').mkdir()
    original_url='sqlite:///'+database.as_posix()
    restored_url='sqlite:///'+(target/'data'/'crs.db').as_posix()
    uploads=target/'data'/'uploads'
    backup(original_url,source/'report-photos',target/'backup-before-conversion',service_stopped=True)
    restore(target/'backup-before-conversion',restored_url,uploads,service_stopped=True)
    context,media=build_archive_context(archive)
    engine=create_engine(restored_url)
    try:
        before=signature(engine)
        with Session(engine) as db:
            materialize_evidence(db,uploads,archive,context,media)
            db.execute(delete(Token))  # Old copied browser sessions are not valid on the public preview.
            owner=db.scalar(select(User).where(User.login==credentials['manager_login']))
            if not owner or not owner.active:raise ValueError('Owner account missing or inactive')
            db.commit()
            counts={'reports':len(db.scalars(select(Report.id)).all()),'stored_photo_links':len(db.scalars(select(Photo.id)).all())}
        if signature(engine)!=before:raise ValueError('Report content changed during evidence conversion')
    finally:engine.dispose()
    # The deployable bundle is only compiled assets; database, credentials and originals are never public files.
    shutil.copytree(CODE/'web'/'dist',target/'web')
    config={'code_root':str(CODE),'database_url':restored_url,'uploads':str(uploads),'web_dir':str(target/'web'),'port':port}
    (target/'config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
    (target/'ДОСТУП.txt').write_text('Вход в CRS\n\nЛогин: '+credentials['manager_login']+'\nПароль: '+credentials['manager_password']+'\n\nНе публикуйте этот файл. Заказчику передайте только ссылку и эти данные входа.\n',encoding='utf-8-sig')
    config_snapshot={'reports_preserved':True,'source_untouched':True,**counts}
    (target/'preparation.json').write_text(json.dumps(config_snapshot,indent=2),encoding='utf-8')
    print(json.dumps(config_snapshot))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--target',type=Path,required=True)
    parser.add_argument('--port',type=int,default=58494)
    args=parser.parse_args()
    if not 1024<=args.port<=65535:parser.error('Port must be 1024..65535')
    prepare(args.source,args.target,args.port)
