"""Execute actual PowerShell install/migration/start on a disposable Windows runner."""
import json,os,subprocess,sys,time,zipfile
from pathlib import Path
import pytest
import httpx
from test_release import release

@pytest.mark.skipif(sys.platform!='win32',reason='Requires Windows PowerShell and Task Scheduler')
def test_windows_release_lifecycle(tmp_path):
    source=Path(__file__).resolve().parents[2];archive=tmp_path/'release.zip';release.package(source,archive)
    root=tmp_path/'release with spaces'
    with zipfile.ZipFile(archive) as z:z.extractall(root)
    ps=Path(os.environ['SystemRoot'])/'System32/WindowsPowerShell/v1.0/powershell.exe'
    def run(script,*args,timeout=180):
        return subprocess.run([str(ps),'-NoProfile','-ExecutionPolicy','Bypass','-File',str(root/'scripts/windows'/script),*map(str,args)],capture_output=True,text=True,timeout=timeout)
    installed=run('Install-Runtime.ps1','-Python',sys.executable)
    assert installed.returncode==0,installed.stdout+installed.stderr
    data=tmp_path/'private данные';data.mkdir();database=tmp_path/'runtime.db';config=data/'config.local.json'
    config.write_text(json.dumps({'database_url':'sqlite:///'+database.as_posix(),'data_dir':str(data)},ensure_ascii=False),encoding='utf-8')
    args=['-ConfigPath',str(config),'-AllowSqliteForTests','-Port','8043']
    # Normal production mode rejects SQLite before any mutation; credentials are never printed.
    denied=run('Run.ps1','-ConfigPath',config,'-ValidateOnly')
    assert denied.returncode!=0 and 'sqlite:///' not in denied.stdout+denied.stderr
    valid=run('Run.ps1',*args,'-ValidateOnly');assert valid.returncode==0,valid.stderr
    asset=root/'web/index.html';original=asset.read_bytes();asset.write_bytes(b'corrupt')
    corrupt=run('Run.ps1',*args,'-ValidateOnly')
    assert corrupt.returncode!=0 and 'checksum mismatch' in corrupt.stderr
    asset.write_bytes(original)
    assert run('Run.ps1',*args,'-MigrateOnly').returncode==0
    cfg_pg=data/'task-config.json';cfg_pg.write_text(json.dumps({'database_url':'postgresql+psycopg://user:SecretNotPrinted123@localhost/test','data_dir':str(data)},ensure_ascii=False),encoding='utf-8')
    task=run('Register-Startup.ps1','-ConfigPath',cfg_pg,'-ValidateOnly')
    assert task.returncode==0,task.stderr
    assert 'SecretNotPrinted123' not in task.stdout+task.stderr
    assert json.loads(task.stdout)['Trigger']=='MSFT_TaskBootTrigger'
    process=subprocess.Popen([str(ps),'-NoProfile','-ExecutionPolicy','Bypass','-File',str(root/'scripts/windows/Run.ps1'),*args],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
    try:
        deadline=time.monotonic()+45
        while time.monotonic()<deadline:
            try:
                if httpx.get('http://127.0.0.1:8043/ready').status_code==200:break
            except httpx.HTTPError:pass
            time.sleep(.25)
        else:pytest.fail('Windows server did not become ready')
        assert httpx.get('http://127.0.0.1:8043/').status_code==200
        assert httpx.get('http://127.0.0.1:8043/api/v1/sites').status_code==401
        duplicate=run('Run.ps1',*args,timeout=30)
        assert duplicate.returncode!=0 and 'Another server' in duplicate.stderr
    finally:
        subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True)
        process.communicate(timeout=20)
