"""Explicit, validated historical import using the current account. No MAX scraping or inferred dates."""
import argparse,getpass,hashlib,json,os,tempfile,uuid
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
import httpx
from PIL import Image
from pydantic import BaseModel,ConfigDict,Field
from app.contracts import ReportData,HistoricalSource,report_payload

class PhotoInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:uuid.UUID
    file:str
    mime:Literal['image/png','image/jpeg','image/webp']
class ImportItem(BaseModel):
    model_config=ConfigDict(extra='forbid')
    source_ref:str=Field(min_length=1,max_length=500)
    source:HistoricalSource|None=None
    data:ReportData
    photos:list[PhotoInput]=Field(default_factory=list,max_length=30)
class Bundle(BaseModel):
    model_config=ConfigDict(extra='forbid')
    format_version:Literal[1]
    reports:list[ImportItem]=Field(min_length=1,max_length=500)

def read_bundle(path):
    path=Path(path).resolve();bundle=Bundle.model_validate_json(path.read_text(encoding='utf-8'))
    clients=set();photo_ids=set();root=path.parent
    for item in bundle.reports:
        if item.source is not None and item.source.source_ref!=item.source_ref:raise ValueError('Source reference must match item source_ref')
        cid=str(item.data.client_report_id)
        if cid in clients:raise ValueError('Duplicate client_report_id in bundle')
        clients.add(cid)
        ids=[p.id for p in item.photos]
        if len(ids)!=len(set(ids)) or set(ids)!=set(item.data.required_photo_ids):raise ValueError('Photo list must exactly match required_photo_ids')
        for photo in item.photos:
            if photo.id in photo_ids:raise ValueError('Attachment UUID used by multiple reports')
            photo_ids.add(photo.id);image=(root/photo.file).resolve()
            if root not in image.parents or not image.is_file():raise ValueError('Photo must be a file inside the import bundle directory')
            if not 0<image.stat().st_size<=8*1024*1024:raise ValueError('Photo exceeds size limit')
            with Image.open(image) as p:
                if p.format!={'image/png':'PNG','image/jpeg':'JPEG','image/webp':'WEBP'}[photo.mime] or p.width*p.height>40_000_000:raise ValueError('Invalid photo format/dimensions')
                p.verify()
    return bundle,root

def import_bundle(bundle,root,request,token,checkpoint=lambda results:None):
    headers={'Authorization':'Bearer '+token,'X-Report-Capabilities':'report-extras-v2'}
    def call(method,path,**kwargs):
        r=request(method,path,headers={**headers,**kwargs.pop('headers',{})},**kwargs);r.raise_for_status();return r.json()
    sites={s['id'] for s in call('GET','sites')}
    if any(str(item.data.site_id) not in sites for item in bundle.reports):raise ValueError('Bundle contains a site not assigned to this account')
    results=[]
    for item in bundle.reports:
        payload=report_payload(item.data);cid=payload['client_report_id']
        # POST is also the authoritative author/idempotency check. Manager GET access
        # must never allow reusing another author's receipt during import.
        created=request('POST','reports',headers=headers,json=payload)
        if created.status_code==409:raise ValueError('Existing report differs or belongs to another author; never overwrite history during import')
        created.raise_for_status();remote=created.json()
        if remote['data']!=payload:raise ValueError('Existing report differs; never overwrite history during import')
        if item.source is not None:
            call('PUT',f"reports/{remote['id']}/source",json=item.source.model_dump(mode='json'))
        else:
            saved_source=call('GET',f"reports/{remote['id']}/source")
            if saved_source is not None and saved_source['source_ref']!=item.source_ref:
                raise ValueError('Source reference differs from stored original; never overwrite history during import')
        if remote['status'] in ('submitted','reviewed') and remote.get('receipt_id'):receipt=remote
        else:
            if remote['status']!='draft':raise ValueError('Returned report requires explicit revision workflow')
            for photo in item.photos:
                blob=(root/photo.file).read_bytes()
                call('PUT',f"reports/{remote['id']}/attachments/{photo.id}",content=blob,headers={'Content-Type':photo.mime,'X-Content-SHA256':hashlib.sha256(blob).hexdigest()})
            receipt=call('POST',f"reports/{remote['id']}/submit",json={'expected_revision':remote['revision']})
        results.append({'source_ref':item.source_ref,'client_report_id':cid,'server_id':receipt['id'],'revision':receipt['revision'],'receipt_id':receipt['receipt_id']})
        checkpoint(results)
    return results

def validate_output(output,bundle_path,bundle,root):
    target=Path(output).resolve()
    protected={Path(bundle_path).resolve()} | {(root/photo.file).resolve() for item in bundle.reports for photo in item.photos}
    if target in protected:raise ValueError('Receipt output must not replace the bundle or source photos')
    if target.exists():
        try:
            saved=json.loads(target.read_text(encoding='utf-8'))
            sources={str(item.data.client_report_id):item.source_ref for item in bundle.reports}
            valid=set(saved)=={'format_version','results'} and saved['format_version']==1 and isinstance(saved['results'],list)
            valid=valid and all(row.get('client_report_id') in sources and row.get('source_ref')==sources[row['client_report_id']] and row.get('receipt_id') for row in saved['results'])
        except (OSError,ValueError,TypeError,AttributeError):valid=False
        if not valid:raise ValueError('Output already exists and is not a receipt log for this bundle')

def atomic_result(path,results):
    path=Path(path).resolve();path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists():
        previous=json.loads(path.read_text(encoding='utf-8'))['results']
        merged={row['client_report_id']:row for row in previous}
        merged.update({row['client_report_id']:row for row in results});results=list(merged.values())
    fd,temp=tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump({'format_version':1,'results':results},f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
        os.replace(temp,path)
    finally:Path(temp).unlink(missing_ok=True)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('bundle',type=Path);p.add_argument('--apply',action='store_true');p.add_argument('--api');p.add_argument('--login');p.add_argument('--output',type=Path);args=p.parse_args()
    bundle,root=read_bundle(args.bundle)
    if args.output:validate_output(args.output,args.bundle,bundle,root)
    if not args.apply:print(f'VALIDATED: {len(bundle.reports)} reports. No server requests made.');return
    if not args.api or not args.login or not args.output:p.error('--apply requires --api, --login, --output')
    uri=urlsplit(args.api)
    if uri.scheme!='https' or not uri.hostname or uri.username or uri.password or uri.query or uri.fragment or not uri.path.rstrip('/').endswith('/api/v1'):p.error('Use an HTTPS API /api/v1 URL without credentials/query/fragment')
    with httpx.Client(base_url=args.api.rstrip('/')+'/',follow_redirects=False,timeout=30) as client:
        response=client.post('auth/login',json={'login':args.login,'password':getpass.getpass('Account password: ')})
        response.raise_for_status();token=response.json()['access_token']
        try:
            results=import_bundle(bundle,root,client.request,token,lambda results:atomic_result(args.output,results))
            print(f'IMPORTED: {len(results)} reports. Receipt log saved.')
        finally:
            try:client.post('auth/logout',headers={'Authorization':'Bearer '+token})
            except httpx.HTTPError:pass
if __name__=='__main__':main()
