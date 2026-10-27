"""Standalone, loopback-only demo of the real API/Web. No customer configuration."""
import argparse,hashlib,json,os,socket,sys,threading,time,uuid,webbrowser
from pathlib import Path

def resources():
    return Path(getattr(sys,'_MEIPASS',Path(__file__).resolve().parents[2]))

def create_demo(data_dir:Path,bundle:Path|None=None):
    source_mode=bundle is None and not hasattr(sys,'_MEIPASS')
    bundle=bundle or resources();data_dir=data_dir.resolve();data_dir.mkdir(parents=True,exist_ok=True)
    photos=data_dir/'photos';photos.mkdir(exist_ok=True)
    web=bundle/('web/dist' if source_mode else 'web'); fixtures=bundle/('demo/generated' if source_mode else 'demo')
    os.environ['WEB_DIR']=str(web)
    os.environ['DATABASE_URL']='sqlite:///'+str(data_dir/'demo.db')
    os.environ['UPLOAD_DIR']=str(photos)
    from app.main import create_app,User,Site,Assignment,Report,Photo,Change,hash_password,select,utcnow
    from app.contracts import ReportData,report_payload
    api=create_app(database_url=os.environ['DATABASE_URL'],storage=str(photos),initialize=True)
    raw=json.loads((fixtures/'reports.json').read_text(encoding='utf-8'))
    with api.state.db() as db:
        if not db.scalar(select(User.id).limit(1)):
            users={role:User(login='demo-'+role,password_hash=hash_password('Demo-Only-2026!'),role=role) for role in ['admin','manager','foreman']}
            sites=[Site(name=name) for name in raw['sites']]
            db.add_all([*users.values(),*sites]);db.flush()
            db.add_all([Assignment(user_id=user.id,site_id=site.id) for user in users.values() for site in sites])
            for i,item in enumerate(raw['reports']):
                rid=str(uuid.uuid4());aid=str(uuid.uuid4());receipt=str(uuid.uuid4());now=utcnow()
                payload=report_payload(ReportData(client_report_id=uuid.uuid4(),site_id=sites[item['site']].id,work_date=item['date'],kind=item['kind'],work_entries=item['entries'],no_work_reason=item.get('reason'),comment=item['comment'],required_photo_ids=[aid],crew=item.get('crew'),materials=item.get('materials'),incidents=item.get('incidents')))
                db.add(Report(id=rid,client_report_id=payload['client_report_id'],site_id=payload['site_id'],author_id=users['foreman'].id,work_date=item['date'],payload=payload,status=item['status'],revision=1,receipt_id=receipt,submitted_at=now))
                content=(fixtures/f'report-{i+1}.png').read_bytes();sha=hashlib.sha256(content).hexdigest();name=f'{aid}-{sha}.png';(photos/name).write_bytes(content)
                db.add(Photo(id=aid,report_id=rid,sha256=sha,content_type='image/png',filename=name))
                db.add(Change(report_id=rid,actor_id=users['foreman'].id,revision=1,event='submitted',receipt_id=receipt,occurred_at=now))
                if item['status'] in ['reviewed','needs_revision']:
                    db.add(Change(report_id=rid,actor_id=users['manager'].id,revision=1,event=item['status'],reason='Демо: уточните, были ли подготовительные работы' if item['status']=='needs_revision' else None,occurred_at=now))
            db.commit()
    @api.get('/demo-info')
    def info():return {'notice':raw['notice'],'accounts':{'admin':'demo-admin','manager':'demo-manager','foreman':'demo-foreman'},'password':'Demo-Only-2026!'}
    mount=next(route for route in api.router.routes if route.name=='web');api.router.routes.remove(mount);api.router.routes.append(mount)
    return api

def main():
    p=argparse.ArgumentParser();p.add_argument('--no-browser',action='store_true');p.add_argument('--data-dir',type=Path)
    args=p.parse_args()
    root=args.data_dir or Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'ConstructionReporting'/'Demo-0.4.0'
    root.mkdir(parents=True,exist_ok=True)
    # One instance per demo directory; the lock is released by the OS on exit.
    lock=(root/'instance.lock').open('a+b');lock.seek(0);lock.write(b'0');lock.flush();lock.seek(0)
    try:
        if os.name=='nt':
            import msvcrt
            msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
        else:
            import fcntl
            fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
    except OSError:
        print('Demo is already running for this data directory.',flush=True);return 2
    import uvicorn
    app=create_demo(root)
    listener=socket.socket();listener.bind(('127.0.0.1',0));listener.listen(128)
    url=f'http://127.0.0.1:{listener.getsockname()[1]}'
    server=uvicorn.Server(uvicorn.Config(app,host='127.0.0.1',port=0,workers=1,proxy_headers=False,log_level='info'))
    def open_when_ready():
        while not server.started and not server.should_exit:time.sleep(.1)
        if server.started:
            (root/'running.json').write_text(json.dumps({'url':url}),encoding='utf-8')
            print('DEMO READY: '+url,flush=True)
            if not args.no_browser:webbrowser.open(url)
    threading.Thread(target=open_when_ready,daemon=True).start()
    print('Construction Reporting DEMO. Close this console or Ctrl+C to stop. Data: '+str(root),flush=True)
    try:server.run(sockets=[listener])
    finally:
        listener.close();(root/'running.json').unlink(missing_ok=True);lock.close()
    return 0
if __name__=='__main__':raise SystemExit(main())
