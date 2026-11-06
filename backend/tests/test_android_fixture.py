"""The shared Android/Web fixture must retain its HTTP proof endpoint."""
import importlib.util
from pathlib import Path
from fastapi.testclient import TestClient


def test_android_fixture_stats_precedes_web_mount(tmp_path,monkeypatch):
    public=tmp_path/'web';public.mkdir();(public/'index.html').write_text('Synthetic Web')
    monkeypatch.setenv('WEB_DIR',str(public))
    spec=importlib.util.spec_from_file_location('android_fixture',Path(__file__).with_name('android_server.py'))
    fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
    try:
        with TestClient(fixture.api) as client:
            assert client.get('/').text=='Synthetic Web'
            assert client.get('/api/v1/test/stats').json()=={'photo_put_count':0,'submit_count':0,'lost_response_count':0}
    finally:
        fixture.api.state.db.kw['bind'].dispose();fixture.scratch.cleanup()
