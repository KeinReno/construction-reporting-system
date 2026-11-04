"""Single-PC authenticated preview. Private configuration/data must stay outside the repo.

Local API stays on loopback; an outbound SSH tunnel supplies a temporary HTTPS URL.
This is a manual pilot launcher, not a production service or public database port.
"""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
from urllib.request import urlopen


def write_json(path:Path,value):
    temporary=path.with_suffix('.new')
    temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
    os.replace(temporary,path)


def public_tunnel_url(line:str):
    # Gateway banners also print admin.localhost.run; that is never the user's app.
    match=re.search(r'https://(?:[a-zA-Z0-9-]+\.lhr\.life|[a-z2-7]+\.srv\.us)(?=[/\s]|$)',line)
    return match.group(0) if match else None


def gateway_command(ssh,root,port,provider):
    command=[ssh,'-T','-F',os.devnull,'-o','BatchMode=yes',
        '-o','IdentityAgent=none','-o','IdentitiesOnly=yes','-o','ForwardAgent=no',
        '-o','StrictHostKeyChecking=accept-new','-o',f'UserKnownHostsFile={root / "known_hosts"}',
        '-o','ConnectTimeout=15','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3',
        '-o','ExitOnForwardFailure=yes']
    if provider=='srv.us':
        key=root/'gateway_ed25519'
        if not key.is_file():raise ValueError('Dedicated srv.us gateway key missing')
        return command+['-i',str(key),'-o','PreferredAuthentications=publickey',
            '-R',f'1:127.0.0.1:{port}','nomatch@srv.us']
    if provider=='localhost.run':
        return command+['-o','PreferredAuthentications=none','-R',f'80:127.0.0.1:{port}','nokey@localhost.run']
    raise ValueError('Unsupported gateway provider')


def run(root:Path,local_only=False):
    root=root.resolve();cfg=json.loads((root/'config.json').read_text(encoding='utf-8-sig'))
    code=Path(cfg['code_root']).resolve()
    if root==code or code in root.parents:raise ValueError('Private runtime must stay outside the repository')
    web=Path(cfg['web_dir']).resolve();uploads=Path(cfg['uploads']).resolve()
    if web==uploads or web in uploads.parents or uploads in web.parents:raise ValueError('Public and private directories must be separate')
    if not (web/'index.html').is_file():raise ValueError('Build Web before launch')
    sys.path.insert(0,str(code/'backend'))
    from app.main import create_app
    import uvicorn
    stop=root/'stop.request'
    stop.unlink(missing_ok=True)
    state_path=root/'running.json'
    local_url=f"http://127.0.0.1:{int(cfg['port'])}"
    instance_id=secrets.token_hex(16)
    state={'pid':os.getpid(),'instance_id':instance_id,'local_url':local_url,'public_url':None,'status':'starting','started_at':time.time()}
    state_lock=threading.Lock()
    def gateway_state(status,public_url=None):
        with state_lock:
            state.update(status=status,public_url=public_url)
            write_json(state_path,state)
            message=(public_url+'\n\nИспользуйте выданные учётные данные.\n'
                'Адрес временный и может измениться. При ошибке проверьте этот файл снова.\n') if public_url else (
                'Внешнее соединение отсутствует. CRS переподключается автоматически.\n'
                'Дождитесь появления HTTPS-ссылки в этом файле.\n')
            (root/'ССЫЛКА.txt').write_text(message,encoding='utf-8-sig')
    write_json(state_path,state)
    os.environ['WEB_DIR']=str(web)
    os.environ.pop('CRS_IMPORT_USER_IDS',None)  # Imports require admin in this public-facing runtime.
    api=create_app(database_url=cfg['database_url'],storage=str(uploads))
    @api.middleware('http')
    async def identify_ready(request,call_next):
        response=await call_next(request)
        if request.url.path=='/ready':response.headers['X-CRS-Instance']=instance_id
        return response
    server=uvicorn.Server(uvicorn.Config(api,host='127.0.0.1',port=int(cfg['port']),workers=1,
        proxy_headers=False,access_log=False,log_level='warning'))
    thread=threading.Thread(target=server.run,daemon=True)
    thread.start()
    tunnel=None
    reader=None
    if os.name=='nt':
        import ctypes
        ctypes.windll.kernel32.SetThreadExecutionState(0x80000001)
    try:
        for _ in range(60):
            if not thread.is_alive():raise RuntimeError('API failed to start; check private log')
            try:
                with urlopen(local_url+'/ready',timeout=1) as response:
                    if response.status==200:break
            except Exception:time.sleep(.5)
        else:raise RuntimeError('API readiness timeout')
        state['status']='local_ready';write_json(state_path,state)
        if not local_only:
            ssh=shutil.which('ssh.exe') or shutil.which('ssh')
            if not ssh:raise RuntimeError('Windows OpenSSH client is required')
            # Isolated configuration: never send the user's keys or forward their SSH agent.
            command=gateway_command(ssh,root,int(cfg['port']),cfg.get('gateway','localhost.run'))
            def read_gateway(process):
                with (root/'gateway.log').open('a',encoding='utf-8') as log:
                    for line in process.stdout:
                        log.write(line);log.flush()
                        public_url=public_tunnel_url(line)
                        if public_url:
                            gateway_state('online',public_url)
            def connect():
                gateway_state('gateway_connecting')
                process=subprocess.Popen(command,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
                    text=True,encoding='utf-8',errors='replace',creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
                reader=threading.Thread(target=read_gateway,args=(process,),daemon=True)
                reader.start()
                return process,reader
            tunnel,reader=connect()
        reconnect_at=0
        while thread.is_alive() and not stop.exists():
            if tunnel is not None and tunnel.poll() is not None:
                if not reconnect_at:
                    reader.join(timeout=2)
                    gateway_state('gateway_disconnected')
                    reconnect_at=time.monotonic()+5
                if time.monotonic()>=reconnect_at:
                    tunnel,reader=connect()
                    reconnect_at=0
            time.sleep(.5)
    finally:
        if tunnel is not None and tunnel.poll() is None:
            tunnel.terminate()
            try:tunnel.wait(timeout=10)
            except subprocess.TimeoutExpired:tunnel.kill()
        server.should_exit=True;thread.join(timeout=15)
        api.state.db.kw['bind'].dispose()
        if os.name=='nt':ctypes.windll.kernel32.SetThreadExecutionState(0x80000000)
        if reader is not None:
            reader.join(timeout=2)
        gateway_state('stopped')
        (root/'ССЫЛКА.txt').write_text('CRS остановлен. Запустите START-CRS.cmd для получения новой ссылки.\n',encoding='utf-8-sig')
        stop.unlink(missing_ok=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--local-only',action='store_true')
    args=parser.parse_args()
    run(args.root,args.local_only)
