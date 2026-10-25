from __future__ import annotations
import hashlib, hmac, os, secrets, tempfile, uuid, io, threading, time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, Depends, HTTPException, Header, Request, Response, Query
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field, model_validator, ConfigDict
from sqlalchemy import create_engine, select, JSON, String, ForeignKey, DateTime, Integer
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker, Session
from sqlalchemy.orm.exc import StaleDataError
from sqlalchemy.exc import IntegrityError


def new_id(): return str(uuid.uuid4())
def utcnow(): return datetime.now(timezone.utc)

class Base(DeclarativeBase): pass
class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')

class User(Base):
    __tablename__='users'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=new_id)
    login:Mapped[str]=mapped_column(String(128),unique=True)
    password_hash:Mapped[str]=mapped_column(String(256))
    role:Mapped[str]=mapped_column(String(32),default='foreman')
    active:Mapped[bool]=mapped_column(default=True)
class Site(Base):
    __tablename__='sites'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=new_id)
    name:Mapped[str]=mapped_column(String(255))
class Assignment(Base):
    __tablename__='assignments'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=new_id)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id'))
    site_id:Mapped[str]=mapped_column(ForeignKey('sites.id'))
class Token(Base):
    __tablename__='tokens'
    digest:Mapped[str]=mapped_column(String(64),primary_key=True)
    user_id:Mapped[str]=mapped_column(ForeignKey('users.id'))
    expires:Mapped[datetime]=mapped_column(DateTime(timezone=True))
class Report(Base):
    __tablename__='reports'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=new_id)
    client_report_id:Mapped[str]=mapped_column(String(36),unique=True,index=True)
    site_id:Mapped[str]=mapped_column(ForeignKey('sites.id'))
    author_id:Mapped[str]=mapped_column(ForeignKey('users.id'))
    work_date:Mapped[str]=mapped_column(String(10))
    payload:Mapped[dict]=mapped_column(JSON)
    status:Mapped[str]=mapped_column(String(24),default='draft')
    revision:Mapped[int]=mapped_column(Integer,default=1)
    receipt_id:Mapped[str|None]=mapped_column(String(36),nullable=True)
    created_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),default=utcnow,nullable=True)
    submitted_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),nullable=True)
    lock_version:Mapped[int]=mapped_column(Integer,default=1,nullable=False)
    __mapper_args__ = {'version_id_col': lock_version}
class Photo(Base):
    __tablename__='photos'
    id:Mapped[str]=mapped_column(String(36),primary_key=True)
    report_id:Mapped[str]=mapped_column(ForeignKey('reports.id'))
    sha256:Mapped[str]=mapped_column(String(64))
    content_type:Mapped[str]=mapped_column(String(64))
    filename:Mapped[str]=mapped_column(String(120))
class Change(Base):
    __tablename__='changes'
    id:Mapped[str]=mapped_column(String(36),primary_key=True,default=new_id)
    report_id:Mapped[str]=mapped_column(ForeignKey('reports.id'))
    actor_id:Mapped[str]=mapped_column(ForeignKey('users.id'))
    revision:Mapped[int]=mapped_column(Integer)
    event:Mapped[str]=mapped_column(String(30))
    payload_before:Mapped[dict|None]=mapped_column(JSON,nullable=True)
    reason:Mapped[str|None]=mapped_column(String(500),nullable=True)
    occurred_at:Mapped[datetime|None]=mapped_column(DateTime(timezone=True),default=utcnow,nullable=True)
    receipt_id:Mapped[str|None]=mapped_column(String(36),nullable=True)

def hash_password(p:str)->str:
    salt=secrets.token_bytes(16)
    value=hashlib.pbkdf2_hmac('sha256',p.encode(),salt,600_000)
    return f'pbkdf2:600000:{salt.hex()}:{value.hex()}'
def password_ok(p:str, stored:str)->bool:
    try:
        alg,n,salt,value=stored.split(':')
        if alg!='pbkdf2': return False
        return hmac.compare_digest(hashlib.pbkdf2_hmac('sha256',p.encode(),bytes.fromhex(salt),int(n)),bytes.fromhex(value))
    except (ValueError,TypeError): return False

class Login(Input):
    login:str=Field(min_length=1,max_length=128)
    password:str=Field(min_length=1,max_length=1024)
class Work(Input):
    type:str=Field(min_length=1,max_length=200)
    quantity:Decimal|None=Field(default=None,ge=0,max_digits=20,decimal_places=6,allow_inf_nan=False)
    unit:str|None=Field(default=None,max_length=50)
    description:str|None=Field(default=None,max_length=2000)
    @model_validator(mode='after')
    def valid(self):
        if not self.type.strip(): raise ValueError('type required')
        if self.quantity is None and not (self.description or '').strip(): raise ValueError('quantity or description required')
        if self.quantity is not None and not (self.unit or '').strip(): raise ValueError('unit required')
        return self
class ReportData(Input):
    client_report_id:uuid.UUID
    site_id:uuid.UUID
    work_date:date
    kind:Literal['work','no_work']
    no_work_reason:str|None=Field(default=None,max_length=2000)
    work_entries:list[Work]=Field(default_factory=list,max_length=100)
    comment:str|None=Field(default=None,max_length=5000)
    required_photo_ids:list[uuid.UUID]=Field(default_factory=list,max_length=30)
    @model_validator(mode='after')
    def valid(self):
        if self.kind=='work' and not self.work_entries: raise ValueError('work_entries required')
        if self.kind=='no_work' and not (self.no_work_reason or '').strip(): raise ValueError('no_work_reason required')
        if self.kind=='no_work' and self.work_entries: raise ValueError('no_work cannot contain work entries')
        if len(set(self.required_photo_ids)) != len(self.required_photo_ids): raise ValueError('duplicate photo ids')
        return self
class Revision(Input):
    expected_revision:int=Field(ge=1)
class Edit(Revision):
    data:ReportData
    reason:str=Field(min_length=2,max_length=500)
class Review(Revision):
    decision:Literal['reviewed','needs_revision']
    reason:str|None=Field(default=None,max_length=500)

class AnalyticsFilters(Input):
    site_id:uuid.UUID|None=None
    from_date:date|None=None
    to_date:date|None=None
    @model_validator(mode="after")
    def valid(self):
        if self.from_date and self.to_date and self.from_date>self.to_date: raise ValueError("Invalid date range")
        return self

class Ask(Input):
    question:str=Field(min_length=1,max_length=1000)
    intent:Literal["summary","work_volume","no_work","site_timeline"]="summary"
    filters:AnalyticsFilters=Field(default_factory=AnalyticsFilters)

def stamp(value):
    if value is None:return None
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

def present(r):
    return dict(id=r.id,client_report_id=r.client_report_id,site_id=r.site_id,revision=r.revision,status=r.status,receipt_id=r.receipt_id,created_at=stamp(r.created_at),submitted_at=stamp(r.submitted_at),data=r.payload)

def create_app(database_url=None, storage=None, initialize=False):
    url=database_url or os.environ.get('DATABASE_URL','sqlite:///./dev.db')
    folder=Path(storage or os.environ.get('UPLOAD_DIR','./dev-uploads')).resolve()
    engine=create_engine(url,connect_args={'check_same_thread':False} if url.startswith('sqlite:') else {},pool_pre_ping=True)
    SessionLocal=sessionmaker(bind=engine,expire_on_commit=False)
    if initialize or os.environ.get('AUTO_CREATE_SCHEMA')=='1': Base.metadata.create_all(engine)
    api=FastAPI(title='Construction Reporting API',version='0.1.0')
    api.state.db=SessionLocal
    @api.exception_handler(StaleDataError)
    async def stale_handler(request, exc):
        return JSONResponse(status_code=409,content={'detail':'Concurrent update; reload report'})
    @api.exception_handler(IntegrityError)
    async def integrity_handler(request, exc):
        return JSONResponse(status_code=409,content={'detail':'Concurrent or duplicate write; retry with same UUID'})
    # Single-process bound for the intended small deployment. Multi-worker needs a shared limiter.
    attempts={}; attempts_lock=threading.Lock()

    def dbdep():
        with SessionLocal() as db: yield db
    def current(request:Request,db:Session=Depends(dbdep)):
        header=request.headers.get('Authorization','')
        if not header.startswith('Bearer '): raise HTTPException(401,'Authentication required')
        token=db.get(Token,hashlib.sha256(header[7:].encode()).hexdigest())
        if not token: raise HTTPException(401,'Invalid token')
        expiry=token.expires.replace(tzinfo=timezone.utc) if token.expires.tzinfo is None else token.expires
        u=db.get(User,token.user_id)
        if not u or not u.active or expiry<utcnow(): raise HTTPException(401,'Expired token')
        return u
    def allowed(db,u,sid):
        if not db.get(Site,sid): raise HTTPException(404,'Unknown object')
        if u.role!='admin' and not db.scalar(select(Assignment.id).where(Assignment.user_id==u.id,Assignment.site_id==sid)):
            raise HTTPException(403,'Object access denied')
    def fetch(db,u,rid):
        r=db.get(Report,rid)
        if not r: raise HTTPException(404,'Unknown report')
        allowed(db,u,r.site_id)
        if u.role=='foreman' and r.author_id!=u.id: raise HTTPException(403,'Author access denied')
        return r
    def log(db,r,u,event,before=None,reason=None):
        db.add(Change(report_id=r.id,actor_id=u.id,revision=r.revision,event=event,payload_before=before if before is not None else r.payload,reason=reason,receipt_id=r.receipt_id))
    @api.get('/health')
    def health(): return {'status':'ok'}
    @api.post('/api/v1/auth/login')
    def login(data:Login,request:Request,db:Session=Depends(dbdep)):
        key=request.client.host if request.client else 'unknown'
        now=time.monotonic()
        with attempts_lock:
            for host in list(attempts):
                attempts[host]=[t for t in attempts[host] if now-t<60]
                if not attempts[host]: del attempts[host]
            if len(attempts.get(key,[]))>=10: raise HTTPException(429,'Too many login attempts',headers={'Retry-After':'60'})
            attempts.setdefault(key,[]).append(now)
        u=db.scalar(select(User).where(User.login==data.login))
        if not u or not u.active or not password_ok(data.password,u.password_hash): raise HTTPException(401,'Invalid credentials')
        secret=secrets.token_urlsafe(48)
        db.add(Token(digest=hashlib.sha256(secret.encode()).hexdigest(),user_id=u.id,expires=utcnow()+timedelta(hours=8)))
        db.commit()
        return {'access_token':secret,'token_type':'bearer','expires_in':28800}
    @api.post('/api/v1/auth/logout')
    def logout(request:Request,db:Session=Depends(dbdep),u:User=Depends(current)):
        digest=hashlib.sha256(request.headers['Authorization'][7:].encode()).hexdigest()
        db.delete(db.get(Token,digest));db.commit()
        return {'revoked':True}
    @api.get('/api/v1/me')
    def me(u:User=Depends(current)): return {'id':u.id,'login':u.login,'role':u.role}
    @api.get('/api/v1/sites')
    def sites(db:Session=Depends(dbdep),u:User=Depends(current)):
        q=select(Site)
        if u.role!='admin': q=q.join(Assignment,Assignment.site_id==Site.id).where(Assignment.user_id==u.id)
        return [{'id':s.id,'name':s.name} for s in db.scalars(q).all()]
    @api.post('/api/v1/reports',status_code=201)
    def draft(data:ReportData,response:Response,db:Session=Depends(dbdep),u:User=Depends(current)):
        sid=str(data.site_id); allowed(db,u,sid)
        saved=db.scalar(select(Report).where(Report.client_report_id==str(data.client_report_id)))
        payload=data.model_dump(mode='json')
        if saved:
            if saved.author_id!=u.id or saved.payload!=payload: raise HTTPException(409,'UUID collision')
            response.status_code=200
            return present(saved)
        r=Report(client_report_id=str(data.client_report_id),site_id=sid,author_id=u.id,work_date=str(data.work_date),payload=payload)
        try:
            db.add(r);db.flush();log(db,r,u,'created');db.commit()
        except IntegrityError:
            db.rollback()
            saved=db.scalar(select(Report).where(Report.client_report_id==str(data.client_report_id)))
            if saved and saved.author_id==u.id and saved.payload==payload:
                response.status_code=200
                return present(saved)
            raise HTTPException(409,'UUID collision')
        return present(r)
    @api.get('/api/v1/reports/by-client/{client_id}')
    def by_client(client_id:uuid.UUID,db:Session=Depends(dbdep),u:User=Depends(current)):
        r=db.scalar(select(Report).where(Report.client_report_id==str(client_id)))
        if not r: raise HTTPException(404,'Unknown report')
        return present(fetch(db,u,r.id))
    @api.get('/api/v1/reports')
    def reports(db:Session=Depends(dbdep),u:User=Depends(current),site_id:uuid.UUID|None=None,from_date:date|None=None,to_date:date|None=None,page:int=Query(1,ge=1),page_size:int=Query(100,ge=1,le=200)):
        q=select(Report)
        if site_id: allowed(db,u,str(site_id));q=q.where(Report.site_id==str(site_id))
        if u.role!='admin': q=q.join(Assignment,Assignment.site_id==Report.site_id).where(Assignment.user_id==u.id)
        if u.role=='foreman': q=q.where(Report.author_id==u.id)
        validate_period(from_date,to_date)
        if from_date:q=q.where(Report.work_date>=str(from_date))
        if to_date:q=q.where(Report.work_date<=str(to_date))
        return [present(r) for r in db.scalars(q.order_by(Report.work_date.desc(),Report.id).offset((page-1)*page_size).limit(page_size)).unique().all()]
    @api.get('/api/v1/reports/{rid}')
    def report(rid:uuid.UUID,db:Session=Depends(dbdep),u:User=Depends(current)):
        return present(fetch(db,u,str(rid)))
    @api.patch('/api/v1/reports/{rid}')
    def edit(rid:uuid.UUID,data:Edit,db:Session=Depends(dbdep),u:User=Depends(current)):
        r=fetch(db,u,str(rid))
        if r.status not in ('draft','needs_revision') or r.revision!=data.expected_revision: raise HTTPException(409,'Revision conflict')
        payload=data.data.model_dump(mode='json')
        if payload['client_report_id']!=r.client_report_id or payload['site_id']!=r.site_id: raise HTTPException(409,'Identity cannot change')
        previous=r.payload;r.payload=payload;r.work_date=payload['work_date'];r.revision+=1;r.status='draft';r.receipt_id=None;r.submitted_at=None
        log(db,r,u,'edited',previous,data.reason);db.commit();return present(r)
    @api.put('/api/v1/reports/{rid}/attachments/{aid}')
    async def upload(rid:uuid.UUID,aid:uuid.UUID,request:Request,x_content_sha256:str=Header(),db:Session=Depends(dbdep),u:User=Depends(current)):
        r=fetch(db,u,str(rid))
        existing=db.get(Photo,str(aid))
        data=bytearray()
        async for chunk in request.stream():
            data.extend(chunk)
            if len(data)>8*1024*1024:raise HTTPException(413,'Photo size limit')
        data=bytes(data)
        if not data or len(data)>8*1024*1024: raise HTTPException(413,'Photo size limit')
        mime=request.headers.get('content-type')
        magic={'image/jpeg':data.startswith(b'\xff\xd8\xff'),'image/png':data.startswith(b'\x89PNG\r\n\x1a\n'),'image/webp':len(data)>12 and data[:4]==b'RIFF' and data[8:12]==b'WEBP'}
        if not magic.get(mime,False): raise HTTPException(422,'Invalid photo type/signature')
        sha=hashlib.sha256(data).hexdigest()
        if not hmac.compare_digest(sha,x_content_sha256.lower()): raise HTTPException(422,'Checksum mismatch')
        try:
            with Image.open(io.BytesIO(data)) as image:
                if image.width*image.height>40_000_000:raise ValueError('Image dimensions too large')
                image.verify()
        except (UnidentifiedImageError,OSError,ValueError,Image.DecompressionBombError):
            raise HTTPException(422,'Invalid image')
        if existing:
            if existing.report_id!=r.id or existing.sha256!=sha: raise HTTPException(409,'Attachment UUID collision')
            if not (folder/existing.filename).is_file():raise HTTPException(503,'Photo missing from storage')
            return {'id':existing.id,'status':'stored'}
        if r.status!='draft': raise HTTPException(409,'Report is not a draft')
        # Touch the optimistic version so upload cannot race a submit/review.
        r.lock_version+=1
        folder.mkdir(parents=True,exist_ok=True)
        suffix={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[mime]
        filename=str(aid)+"-"+sha+suffix
        fd,temp=tempfile.mkstemp(dir=folder)
        try:
            with os.fdopen(fd,'wb') as fp: fp.write(data);fp.flush();os.fsync(fp.fileno())
            os.replace(temp,folder/filename)
            db.add(Photo(id=str(aid),report_id=r.id,sha256=sha,content_type=mime,filename=filename));db.commit()
        finally:
            Path(temp).unlink(missing_ok=True)
        return {'id':str(aid),'status':'stored'}
    @api.get('/api/v1/attachments/{aid}')
    def get_photo(aid:uuid.UUID,db:Session=Depends(dbdep),u:User=Depends(current)):
        photo=db.get(Photo,str(aid))
        if not photo: raise HTTPException(404,'Unknown photo')
        fetch(db,u,photo.report_id)
        if not (folder/photo.filename).is_file():raise HTTPException(503,'Photo missing from storage')
        return FileResponse(folder/photo.filename,media_type=photo.content_type,headers={'Cache-Control':'private, no-store'})
    @api.post('/api/v1/reports/{rid}/submit')
    def submit(rid:uuid.UUID,data:Revision,db:Session=Depends(dbdep),u:User=Depends(current)):
        r=fetch(db,u,str(rid))
        if data.expected_revision!=r.revision: raise HTTPException(409,'Revision conflict')
        if r.status in ('submitted','reviewed') and r.receipt_id: return present(r)
        if r.status!='draft': raise HTTPException(409,'Not ready for submission')
        needed=set(r.payload.get('required_photo_ids',[]))
        loaded=set(db.scalars(select(Photo.id).where(Photo.report_id==r.id)).all())
        if not needed.issubset(loaded): raise HTTPException(422,'Required photos incomplete')
        for photo in db.scalars(select(Photo).where(Photo.report_id==r.id)):
            if photo.id in needed and (not (folder/photo.filename).is_file() or hashlib.sha256((folder/photo.filename).read_bytes()).hexdigest()!=photo.sha256):
                raise HTTPException(503,'Required photo missing or corrupt')
        r.status='submitted';r.receipt_id=new_id();r.submitted_at=utcnow();log(db,r,u,'submitted');db.commit();return present(r)
    @api.post('/api/v1/reports/{rid}/review')
    def review(rid:uuid.UUID,data:Review,db:Session=Depends(dbdep),u:User=Depends(current)):
        if u.role not in ('manager','admin'):raise HTTPException(403,'Manager role required')
        r=fetch(db,u,str(rid))
        if r.revision!=data.expected_revision or r.status!='submitted':raise HTTPException(409,'Revision/status conflict')
        if data.decision=='needs_revision' and not (data.reason or '').strip():raise HTTPException(422,'Reason required')
        r.status=data.decision;log(db,r,u,data.decision,reason=data.reason);db.commit();return present(r)
    def validate_period(start,end):
        if start and end and start>end:raise HTTPException(422,'Invalid date range')
    def analytic_rows(db,u,site_id=None,from_date=None,to_date=None):
        validate_period(from_date,to_date)
        q=select(Report).where(Report.status.in_(['submitted','reviewed']))
        if site_id:
            allowed(db,u,str(site_id));q=q.where(Report.site_id==str(site_id))
        if u.role!='admin':q=q.join(Assignment,Assignment.site_id==Report.site_id).where(Assignment.user_id==u.id)
        if u.role=='foreman':q=q.where(Report.author_id==u.id)
        if from_date:q=q.where(Report.work_date>=str(from_date))
        if to_date:q=q.where(Report.work_date<=str(to_date))
        return db.scalars(q.order_by(Report.work_date,Report.id)).unique().all()
    def metrics(rows,from_date,to_date):
        volumes={}; daily={}
        for r in rows:
            daily[r.work_date]=daily.get(r.work_date,0)+1
            for w in r.payload.get('work_entries',[]):
                if w['quantity'] is not None:
                    key=(r.site_id,w['type'],w['unit'])
                    volumes[key]=volumes.get(key,Decimal(0))+Decimal(w['quantity'])
        return {'report_count':len(rows),'no_work_count':sum(r.payload['kind']=='no_work' for r in rows),
                'period':{'from_date':str(from_date) if from_date else None,'to_date':str(to_date) if to_date else None},
                'source_report_ids':[r.id for r in rows],
                'volumes':[{'site_id':s,'work_type':t,'unit':unit,'quantity':str(qty)} for (s,t,unit),qty in sorted(volumes.items())],
                'daily':[{'date':d,'report_count':n} for d,n in sorted(daily.items())],
                'limitations':['Только отправленные и проверенные отчёты. Нет отчётов — не означает отсутствие работ.',
                               'Нет утверждённых планов и расписаний: план-факт и просрочки не рассчитаны.']}
    @api.get('/api/v1/analytics/summary')
    def summary(db:Session=Depends(dbdep),u:User=Depends(current),site_id:uuid.UUID|None=None,from_date:date|None=None,to_date:date|None=None):
        return metrics(analytic_rows(db,u,site_id,from_date,to_date),from_date,to_date)
    @api.post('/api/v1/analytics/ask')
    def ask(data:Ask,db:Session=Depends(dbdep),u:User=Depends(current)):
        f=data.filters
        rows=analytic_rows(db,u,f.site_id,f.from_date,f.to_date)
        result=metrics(rows,f.from_date,f.to_date)
        # Explicit intent is the entire whitelist. Free text never becomes SQL, tools or instructions.
        answers={
            'summary':f"Получено отчётов: {result['report_count']}. Без работ: {result['no_work_count']}.",
            'no_work':f"Отчётов без работ: {result['no_work_count']}. Причины доступны в исходных отчётах.",
            'work_volume':'Объёмы рассчитаны сервером отдельно по объектам, видам работ и единицам.',
            'site_timeline':'Хронология полученных отчётов доступна в источниках и дневной сводке.'}
        return {'answer':answers[data.intent],'mode':'local_analytics','intent':data.intent,
                'period':result['period'],'metrics':result,'source_report_ids':result['source_report_ids'],
                'limitations':result['limitations']+['Свободный вопрос не интерпретируется: используется выбранный вид анализа. LLM отключена до согласования B13.']}
    @api.get('/api/v1/reports/{rid}/history')
    def history(rid:uuid.UUID,db:Session=Depends(dbdep),u:User=Depends(current)):
        fetch(db,u,str(rid))
        return [{'id':x.id,'revision':x.revision,'event':x.event,'reason':x.reason,'actor_id':x.actor_id,'occurred_at':stamp(x.occurred_at),'payload_before':x.payload_before,'receipt_id':x.receipt_id} for x in db.scalars(select(Change).where(Change.report_id==str(rid)).order_by(Change.occurred_at,Change.id)).all()]
    return api
app=create_app()
