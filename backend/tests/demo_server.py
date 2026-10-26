"""Temporary source-mode demo for browser verification; frozen EXE is tested separately."""
import importlib.util,sys,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'backend'))
import uvicorn
spec=importlib.util.spec_from_file_location('windows_demo',ROOT/'scripts/demo/windows_demo.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
scratch=tempfile.TemporaryDirectory(prefix='crs-demo-web-')
bundle=Path(scratch.name)/'bundle';bundle.mkdir();import shutil
shutil.copytree(ROOT/'web/dist',bundle/'web');shutil.copytree(ROOT/'demo/generated',bundle/'demo')
api=module.create_demo(Path(scratch.name)/'private',bundle)
if __name__=='__main__':uvicorn.run(api,host='127.0.0.1',port=8001)
