"""Explicit owner operations. Never infer payroll from historical names or modify source reports."""
import uuid
from datetime import date
from typing import Literal
from fastapi import Depends, HTTPException
from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.contracts import Input

class WorkTypeData(Input):
    name:str=Field(min_length=1,max_length=200)
    kind:Literal['main','auxiliary','special']
    parent_id:uuid.UUID|None=None
    active:bool=True
    expected_revision:int|None=Field(default=None,ge=1)
    @model_validator(mode='after')
    def valid(self):
        if not self.name.strip() or (self.kind=='auxiliary')!=(self.parent_id is not None):raise ValueError('Auxiliary work requires a main parent')
        return self
class WorkerData(Input):
    name:str=Field(min_length=1,max_length=200)
    @model_validator(mode='after')
    def valid(self):
        if not self.name.strip():raise ValueError('Name required')
        return self
class DayData(Input):
    id:uuid.UUID
    worker_id:uuid.UUID
    site_id:uuid.UUID
    work_date:date
    worked:bool=True
    business_trip:bool=False
    allowance_kopecks:int=Field(default=0,ge=0,le=10_000_000_000,strict=True)
    fine_kopecks:int=Field(default=0,ge=0,le=10_000_000_000,strict=True)
    reason:str=Field(default='',max_length=2000)
    expected_revision:int|None=Field(default=None,ge=1)
    @model_validator(mode='after')
    def valid(self):
        if (self.allowance_kopecks or self.fine_kopecks) and not self.reason.strip():raise ValueError('Adjustment reason required')
        return self

def install(api, dbdep, current, allowed, admin_log, WorkType, Worker, LaborDay):
    def owner(u=Depends(current)):
        if u.role!='manager' or u.id!=api.state.owner_user_id:raise HTTPException(403,'Owner role required')
        return u
    def view(w):return {key:getattr(w,key) for key in ('id','name','kind','parent_id','active','revision')}
    @api.get('/api/v1/reference/work-types')
    def catalog(db:Session=Depends(dbdep),u=Depends(current)):
        return [view(w) for w in db.scalars(select(WorkType).order_by(WorkType.name))]
    def save_type(w,data,db,u):
        for other in db.scalars(select(WorkType)):
            if other.id!=w.id and data.name.strip().casefold() in {name.casefold() for name in [other.name,*(other.aliases or [])]}:
                raise HTTPException(409,'Work type name already used in history')
        if data.parent_id:
            parent=db.get(WorkType,str(data.parent_id))
            if not parent or parent.kind!='main' or not parent.active or parent.id==w.id:raise HTTPException(422,'Active main parent required')
        children=db.scalars(select(WorkType).where(WorkType.parent_id==w.id,WorkType.active==True)).all()
        if children and (not data.active or data.kind!='main'):raise HTTPException(409,'Archive auxiliary work first')
        before=view(w) if w.name else None
        if w.name and w.name!=data.name.strip():w.aliases=list(dict.fromkeys([*(w.aliases or []),w.name]))
        w.name=data.name.strip();w.kind=data.kind;w.parent_id=str(data.parent_id) if data.parent_id else None;w.active=data.active
        db.add(w);db.flush();admin_log(db,u,'work_type_saved',w.id,{'before':before,'after':view(w)});db.commit();return view(w)
    @api.post('/api/v1/owner/work-types',status_code=201)
    def create_type(data:WorkTypeData,db:Session=Depends(dbdep),u=Depends(owner)):
        if data.expected_revision is not None:raise HTTPException(422,'Revision not valid for create')
        return save_type(WorkType(id=str(uuid.uuid4()),revision=1),data,db,u)
    @api.patch('/api/v1/owner/work-types/{wid}')
    def edit_type(wid:uuid.UUID,data:WorkTypeData,db:Session=Depends(dbdep),u=Depends(owner)):
        w=db.get(WorkType,str(wid))
        if not w:raise HTTPException(404,'Unknown work type')
        if data.expected_revision!=w.revision:raise HTTPException(409,'Revision conflict')
        return save_type(w,data,db,u)
    @api.get('/api/v1/owner/workers')
    def workers(db:Session=Depends(dbdep),u=Depends(owner)):
        return [{'id':w.id,'name':w.name,'active':w.active} for w in db.scalars(select(Worker).order_by(Worker.name,Worker.id))]
    @api.post('/api/v1/owner/workers',status_code=201)
    def create_worker(data:WorkerData,db:Session=Depends(dbdep),u=Depends(owner)):
        w=Worker(name=data.name.strip());db.add(w);db.flush();admin_log(db,u,'worker_created',w.id,{'name':w.name});db.commit();return {'id':w.id,'name':w.name,'active':w.active}
    def day_view(d):return {'id':d.id,'worker_id':d.worker_id,'site_id':d.site_id,'work_date':d.work_date,'revision':d.revision,**d.payload}
    @api.get('/api/v1/owner/labor-days')
    def labor_days(site_id:uuid.UUID|None=None,from_date:date|None=None,to_date:date|None=None,db:Session=Depends(dbdep),u=Depends(owner)):
        if from_date and to_date and from_date>to_date:raise HTTPException(422,'Invalid date range')
        q=select(LaborDay)
        if site_id:allowed(db,u,str(site_id));q=q.where(LaborDay.site_id==str(site_id))
        # Owner is still restricted to explicitly assigned objects.
        rows=db.scalars(q.order_by(LaborDay.work_date,LaborDay.worker_id)).all();result=[]
        for row in rows:
            if from_date and row.work_date<str(from_date) or to_date and row.work_date>str(to_date):continue
            try:allowed(db,u,row.site_id)
            except HTTPException as e:
                if e.status_code==403:continue
                raise
            result.append(day_view(row))
        return result
    @api.put('/api/v1/owner/labor-days/{did}')
    def save_day(did:uuid.UUID,data:DayData,db:Session=Depends(dbdep),u=Depends(owner)):
        if did!=data.id:raise HTTPException(422,'Identity cannot change')
        allowed(db,u,str(data.site_id));worker=db.get(Worker,str(data.worker_id))
        if not worker or not worker.active:raise HTTPException(422,'Active worker required')
        payload=data.model_dump(mode='json',exclude={'id','worker_id','site_id','work_date','expected_revision'})
        payload['day_rate_kopecks']=500000;payload['standard_hours']=8
        payload['base_kopecks']=500000 if data.worked else 0
        payload['total_kopecks']=payload['base_kopecks']+data.allowance_kopecks-data.fine_kopecks
        row=db.get(LaborDay,str(did));before=day_view(row) if row else None
        if row:
            allowed(db,u,row.site_id)
            if (row.worker_id,row.work_date)!=(str(data.worker_id),str(data.work_date)):raise HTTPException(409,'Identity cannot change')
            if row.site_id==str(data.site_id) and row.payload==payload:return day_view(row)
            if row.revision!=data.expected_revision:raise HTTPException(409,'Revision conflict')
            row.site_id=str(data.site_id);row.payload=payload
        else:
            if data.expected_revision is not None:raise HTTPException(409,'Unknown revision')
            row=LaborDay(id=str(did),worker_id=str(data.worker_id),site_id=str(data.site_id),work_date=str(data.work_date),payload=payload);db.add(row)
        db.flush();admin_log(db,u,'labor_day_saved',row.id,{'before':before,'after':day_view(row)});db.commit();return day_view(row)
