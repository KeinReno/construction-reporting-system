"""Run on Windows; freeze Python/API/Web into an offline demo executable."""
import subprocess,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
subprocess.run([sys.executable,str(ROOT/'scripts/prepare_demo.py')],check=True)
subprocess.run([sys.executable,'-m','PyInstaller','--noconfirm','--clean','--onefile','--console','--name','ConstructionReportingDemo','--paths',str(ROOT/'backend'),'--collect-submodules','uvicorn','--collect-submodules','sqlalchemy.dialects.sqlite','--copy-metadata','fastapi','--add-data',str(ROOT/'web/dist')+':web','--add-data',str(ROOT/'demo/generated')+':demo','--distpath',str(ROOT/'dist/demo'),'--workpath',str(ROOT/'build/demo'),str(ROOT/'scripts/demo/windows_demo.py')],check=True,cwd=ROOT)
with zipfile.ZipFile(ROOT/'construction-windows-demo.zip','w',zipfile.ZIP_DEFLATED) as z:
    z.write(ROOT/'dist/demo/ConstructionReportingDemo.exe','ConstructionReportingDemo.exe')
    z.write(ROOT/'docs/DEMO_QUICKSTART.md','START_HERE.md')
    z.writestr('Start-Demo.cmd','@echo off\r\ncd /d "%~dp0"\r\nConstructionReportingDemo.exe\r\nif errorlevel 1 pause\r\n')
