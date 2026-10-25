"""Disposable HTTPS server for Android transport integration; never packaged as runtime."""
import argparse,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import uvicorn
from fastapi.responses import JSONResponse,RedirectResponse
from app.main import create_app,User,Site,Assignment,hash_password

scratch=tempfile.TemporaryDirectory(prefix='crs-android-')
api=create_app(database_url=f'sqlite:///{scratch.name}/test.db',storage=f'{scratch.name}/photos',initialize=True)
with api.state.db() as db:
    site=Site(name='Synthetic HTTPS site')
    users=[User(login=role,password_hash=hash_password('SyntheticPassword123'),role=role) for role in ['foreman','manager']]
    db.add(site);db.add_all(users);db.flush()
    db.add_all([Assignment(user_id=u.id,site_id=site.id) for u in users]);db.commit()
stats={'photo_put_count':0,'submit_count':0,'lost_response_count':0}
@api.middleware('http')
async def injected_failure(request,call_next):
    if request.url.path.endswith('/auth/login'):
        import json
        body=await request.body()
        if json.loads(body).get('login')=='redirect':return RedirectResponse('https://example.invalid/never-follow',status_code=302)
    if '/attachments/' in request.url.path and request.method=='PUT':stats['photo_put_count']+=1
    response=await call_next(request)
    if request.url.path.endswith('/submit') and response.status_code==200:
        stats['submit_count']+=1
        if stats['lost_response_count']==0:
            stats['lost_response_count']=1
            return JSONResponse(status_code=503,content={'detail':'Synthetic failure AFTER committed submit'})
    return response
@api.get('/api/v1/test/stats')
def test_stats():return stats
# create_app mounts the optional Web at '/'. Keep test-only routes ahead of it.
web_mount=next((route for route in api.router.routes if route.name=='web'),None)
if web_mount is not None:
    api.router.routes.remove(web_mount);api.router.routes.append(web_mount)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--cert',required=True);p.add_argument('--key',required=True);args=p.parse_args()
    uvicorn.run(api,host='127.0.0.1',port=8443,ssl_certfile=args.cert,ssl_keyfile=args.key)
