"""Package source/runtime scripts and built public assets; never include customer files."""
import argparse,hashlib,json,zipfile
from pathlib import Path

def package(root:Path,output:Path):
    root=root.resolve();files=[]
    for folder in ['backend/app','backend/migrations','scripts/windows']:
        for p in (root/folder).rglob('*'):
            if p.is_file() and p.suffix in {'.py','.ps1'}:files.append(p)
    files += [root/p for p in ['backend/alembic.ini','backend/requirements.lock.txt','scripts/windows/config.example.json','scripts/windows/Caddyfile.example']]
    dist=root/'web/dist'
    if not (dist/'index.html').is_file():raise ValueError('Build web first')
    for p in dist.rglob('*'):
        if p.is_file() and (p.name=='index.html' or p.relative_to(dist).parts[0]=='assets'):
            if p.suffix not in {'.html','.js','.css','.svg','.png','.jpg','.jpeg','.woff','.woff2','.ico'}:continue
            files.append(p)
    records={}
    for p in sorted(set(files)):
        if p.is_symlink() or not p.is_file():raise ValueError('Missing or unsafe release input')
        name=p.relative_to(root).as_posix().replace('web/dist/','web/')
        records[name]=p.read_bytes()
    manifest={'format_version':1,'sha256':{name:hashlib.sha256(data).hexdigest() for name,data in records.items()}}
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
        for name,data in records.items():z.writestr(name,data)
        z.writestr('release-manifest.json',json.dumps(manifest,indent=2))
    return manifest
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    package(Path(__file__).resolve().parents[1],a.output)
