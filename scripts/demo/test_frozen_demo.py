"""Windows CI: start the actual frozen EXE, then prove its private API and Web work."""
import argparse,json,subprocess,tempfile,time,urllib.request
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('exe',type=Path);args=p.parse_args()
with tempfile.TemporaryDirectory(prefix='crs-demo-') as temp:
    root=Path(temp)/'private';root.mkdir()
    with (Path(temp)/'process.log').open('w') as log:
        process=subprocess.Popen([str(args.exe.resolve()),'--no-browser','--data-dir',str(root)],stdout=log,stderr=subprocess.STDOUT)
        try:
            for _ in range(180):
                if process.poll() is not None:raise AssertionError((Path(temp)/'process.log').read_text())
                if (root/'running.json').exists():break
                time.sleep(.5)
            else:raise AssertionError('Frozen demo did not become ready: '+(Path(temp)/'process.log').read_text())
            url=json.loads((root/'running.json').read_text())['url'];assert url.startswith('http://127.0.0.1:')
            assert b'<html' in urllib.request.urlopen(url).read().lower()
            info=json.load(urllib.request.urlopen(url+'/demo-info'))
            request=urllib.request.Request(url+'/api/v1/auth/login',data=json.dumps({'login':info['accounts']['manager'],'password':info['password']}).encode(),headers={'Content-Type':'application/json'})
            token=json.load(urllib.request.urlopen(request))['access_token']
            headers={'Authorization':'Bearer '+token}
            rows=json.load(urllib.request.urlopen(urllib.request.Request(url+'/api/v1/reports',headers=headers)));assert len(rows)==6
            aid=rows[0]['data']['required_photo_ids'][0]
            assert urllib.request.urlopen(urllib.request.Request(url+'/api/v1/attachments/'+aid,headers=headers)).read().startswith(b'\x89PNG')
            summary=json.load(urllib.request.urlopen(urllib.request.Request(url+'/api/v1/analytics/summary',headers=headers)));assert summary['report_count']==5 and summary['volumes'][0]['quantity']=='8.5'
            second=subprocess.run([str(args.exe.resolve()),'--no-browser','--data-dir',str(root)],capture_output=True,timeout=60);assert second.returncode==2
            print('Frozen EXE PASS: loopback, Web, demo login, six reports, PNG, exact volume and single instance')
        finally:
            subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True);process.wait(timeout=30)
