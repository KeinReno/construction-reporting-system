import importlib.util,json,zipfile,hashlib
from pathlib import Path
import pytest

spec=importlib.util.spec_from_file_location('release',Path(__file__).resolve().parents[2]/'scripts/package_release.py')
release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)

def test_release_contains_only_runtime_and_public_assets(tmp_path):
    root=tmp_path/'source'
    for folder in ['backend/app','backend/migrations','scripts/windows','web/dist/assets','docs']: (root/folder).mkdir(parents=True)
    for name in ['docs/WINDOWS_INSTALL.md','backend/app/main.py','backend/alembic.ini','backend/requirements.lock.txt','scripts/windows/Run.ps1','scripts/windows/config.example.json','scripts/windows/Caddyfile.example','web/dist/index.html','web/dist/assets/app.js']:(root/name).write_text('synthetic')
    for name in ['backend/private.db','backend/app/secret.env','scripts/windows/config.local.json','web/dist/secret.env','web/dist/assets/secret.pem']:(root/name).write_text('do not package')
    output=tmp_path/'release.zip';release.package(root,output)
    with zipfile.ZipFile(output) as z:
        names=z.namelist();assert 'web/index.html' in names and 'web/assets/app.js' in names
        assert not any('private.db' in n or 'secret' in n or 'config.local' in n for n in names)
        manifest=json.loads(z.read('release-manifest.json'))
        assert all(hashlib.sha256(z.read(name)).hexdigest()==sha for name,sha in manifest['sha256'].items())
