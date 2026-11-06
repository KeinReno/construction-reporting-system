"""Materialize legacy local photo links into ordinary DB/storage, without changing reports.

Used by the one-time legacy importer. Runtime API and backups require no export files.
Only explicit photo links are copied; date-only candidates keep their uncertainty.
"""
from __future__ import annotations
import hashlib
import io
import os
import tempfile
import uuid
from datetime import datetime,timezone
from pathlib import Path
from PIL import Image
from sqlalchemy import select,inspect,text
from app.main import Report, ReportSource, Photo

NAMESPACE=uuid.UUID('71ba9675-8db3-4fe6-91ec-5625bb541207')

def materialize_evidence(db,storage:Path,media_root:Path,context:dict,media:dict):
    storage=storage.resolve();media_root=media_root.resolve()
    storage.mkdir(parents=True,exist_ok=True)
    has_decisions=inspect(db.get_bind()).has_table('owner_archive_reviews')
    for client_id,item in context.items():
        report=db.scalar(select(Report).where(Report.client_report_id==client_id))
        if not report:raise ValueError('Imported report missing')
        source=db.get(ReportSource,report.id)
        if not source:raise ValueError('Imported source missing')
        linked=[]
        for photo in item.get('photos',[]):
            relation=photo['relation']
            if relation not in ('same_message','same_work_date'):raise ValueError('Unknown photo relation')
            original=media.get(photo['id'])
            if not original:raise ValueError('Photo metadata missing')
            path=(media_root/original['file']).resolve()
            if media_root not in path.parents or not path.is_file():raise ValueError('Photo file missing or outside import directory')
            data=path.read_bytes()
            if not data or len(data)>8*1024*1024:raise ValueError('Imported photo size limit')
            with Image.open(io.BytesIO(data)) as image:
                if image.width*image.height>40_000_000:raise ValueError('Imported photo dimensions')
                mime={'JPEG':'image/jpeg','PNG':'image/png','WEBP':'image/webp'}.get(image.format)
                if not mime:raise ValueError('Unsupported imported photo')
                image.verify()
            digest=hashlib.sha256(data).hexdigest()
            photo_id=str(uuid.uuid5(NAMESPACE,client_id+'\n'+photo['id']))
            filename=photo_id+'-'+digest+{'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[mime]
            existing=db.get(Photo,photo_id)
            if existing and (existing.report_id!=report.id or existing.sha256!=digest):raise ValueError('Imported photo changed; explicit reconciliation required')
            target=storage/filename
            if target.is_symlink():raise ValueError('Stored photo must not be a symlink')
            if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=digest:raise ValueError('Stored photo checksum mismatch')
            if not target.exists():
                fd,temp=tempfile.mkstemp(dir=storage)
                try:
                    with os.fdopen(fd,'wb') as stream:stream.write(data);stream.flush();os.fsync(stream.fileno())
                    os.replace(temp,target)
                finally:Path(temp).unlink(missing_ok=True)
            if not existing:db.add(Photo(id=photo_id,report_id=report.id,sha256=digest,content_type=mime,filename=filename))
            linked.append({'id':photo_id,'relation':relation,'date':photo['message_date']})
        decisions=[]
        if has_decisions:
            rows=db.execute(text('SELECT id,decision,reason,actor_id,revision,created_at FROM owner_archive_reviews WHERE client_report_id=:client_id ORDER BY revision'),{'client_id':client_id}).mappings().all()
            for row in rows:
                occurred=row['created_at']
                if not isinstance(occurred,datetime):occurred=datetime.fromisoformat(str(occurred).replace('Z','+00:00'))
                if occurred.tzinfo is None:occurred=occurred.replace(tzinfo=timezone.utc)
                decisions.append({'id':row['id'],'decision':row['decision'],'reason':row['reason'],'actor_id':row['actor_id'],'revision':row['revision'],'created_at':occurred.isoformat()})
        # A legacy decision does not reassign the report's actual site_id.
        # Preserve it as evidence; do not claim the placeholder site is confirmed.
        requires_confirmation=bool(item.get('other_site_mentioned'))
        evidence={'photos':linked,'requires_site_confirmation':requires_confirmation,'decisions':decisions}
        previous=source.payload.get('_evidence')
        if previous is not None:
            old_decisions=previous.get('decisions',[])
            if previous.get('photos')!=linked or decisions[:len(old_decisions)]!=old_decisions:raise ValueError('Evidence changed; explicit reconciliation required')
        source.payload={**source.payload,'_evidence':evidence}
    db.flush()


def main():
    import argparse
    import sys
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.backup import backup
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--legacy-export',type=Path,required=True)
    parser.add_argument('--backup-dir',type=Path,required=True)
    parser.add_argument('--service-stopped',action='store_true')
    args=parser.parse_args()
    if not args.service_stopped:parser.error('Stop the API and acknowledge --service-stopped')
    database_url=os.environ.get('DATABASE_URL');storage=os.environ.get('UPLOAD_DIR')
    if not database_url or not storage:parser.error('Set DATABASE_URL and UPLOAD_DIR privately')
    sys.path.insert(0,str(Path(__file__).resolve().parents[2]))
    from scripts.demo.owner_max_real_app import build_archive_context
    context,media=build_archive_context(args.legacy_export.resolve())
    backup(database_url,Path(storage),args.backup_dir,service_stopped=True)
    engine=create_engine(database_url)
    try:
        with Session(engine) as db:
            materialize_evidence(db,Path(storage),args.legacy_export,context,media);db.commit()
        print(f'Materialized evidence for {len(context)} reports. Start the ordinary API with the same DB and storage.')
    finally:engine.dispose()


if __name__=='__main__':main()
