"""Explicit owner operations. Never infer payroll from historical names or modify source reports."""
import uuid
from datetime import date
from decimal import Decimal
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

def install(api, dbdep, current, allowed, admin_log, WorkType, Worker, LaborDay, AdminEvent, User, stamp):
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
    @api.get('/api/v1/owner/labor-days/{did}/history')
    def day_history(did:uuid.UUID,db:Session=Depends(dbdep),u=Depends(owner)):
        row=db.get(LaborDay,str(did))
        if not row:raise HTTPException(404,'Unknown labor day')
        allowed(db,u,row.site_id)
        events=[]
        entries=list(db.scalars(select(AdminEvent).where(AdminEvent.action=='labor_day_saved',AdminEvent.target_id==row.id).order_by(AdminEvent.occurred_at,AdminEvent.id)))
        for entry in entries:
            before=entry.details.get('before');after=entry.details.get('after')
            if not isinstance(after,dict):raise HTTPException(409,'History snapshot cannot be scoped')
            for snapshot in (before,after):
                if snapshot is None:continue
                if not isinstance(snapshot,dict) or not snapshot.get('site_id'):raise HTTPException(409,'History snapshot cannot be scoped')
                allowed(db,u,snapshot['site_id'])
            events.append({'id':entry.id,'actor_id':entry.actor_id,'occurred_at':stamp(entry.occurred_at),'before':before,'after':after})
        actors=dict(db.execute(select(User.id,User.login).where(User.id.in_({event['actor_id'] for event in events}))).all())
        for event in events:event['actor_login']=actors.get(event['actor_id'])
        events.sort(key=lambda event:(event['after']['revision'],event['id']))
        return {'id':row.id,'events':events}
    @api.get('/api/v1/owner/labor-days')
    def labor_days(site_id:uuid.UUID|None=None,from_date:date|None=None,to_date:date|None=None,db:Session=Depends(dbdep),u=Depends(owner)):
        if from_date and to_date and from_date>to_date:raise HTTPException(422,'Invalid date range')
        q=select(LaborDay)
        if site_id:allowed(db,u,str(site_id));q=q.where(LaborDay.site_id==str(site_id))
        if from_date:q=q.where(LaborDay.work_date>=str(from_date))
        if to_date:q=q.where(LaborDay.work_date<=str(to_date))
        # Owner is still restricted to explicitly assigned objects.
        rows=db.scalars(q.order_by(LaborDay.work_date,LaborDay.worker_id)).all();result=[];access={}
        for row in rows:
            if row.site_id not in access:
                try:allowed(db,u,row.site_id);access[row.site_id]=True
                except HTTPException as e:
                    if e.status_code!=403:raise
                    access[row.site_id]=False
            if access[row.site_id]:result.append(day_view(row))
        return result
    @api.get('/api/v1/owner/labor-summary')
    def labor_summary(site_id:uuid.UUID|None=None,from_date:date|None=None,to_date:date|None=None,db:Session=Depends(dbdep),u=Depends(owner)):
        rows=labor_days(site_id=site_id,from_date=from_date,to_date=to_date,db=db,u=u)
        names={w.id:w.name for w in db.scalars(select(Worker).where(Worker.id.in_({r['worker_id'] for r in rows})))}
        def totals(items):
            standard_hours=sum(r['standard_hours'] for r in items if r['worked'])
            calendar_days=len({r['work_date'] for r in items if r['worked']})
            return {'record_count':len(items),'worker_count':len({r['worker_id'] for r in items}),
                    'worked_days':sum(bool(r['worked']) for r in items),
                    'worked_calendar_days':calendar_days,
                    'standard_hours':standard_hours,
                    'avg_standard_hours_per_workday':str((Decimal(standard_hours)/calendar_days).quantize(Decimal('0.01'))) if calendar_days else None,
                    'business_trip_days':sum(bool(r['business_trip']) for r in items),
                    **{key:sum(r[key] for r in items) for key in ('base_kopecks','allowance_kopecks','fine_kopecks','total_kopecks')},
                    'source_day_ids':[r['id'] for r in items]}
        worker_rows={};site_rows={}
        for row in rows:
            worker_rows.setdefault(row['worker_id'],[]).append(row)
            site_rows.setdefault(row['site_id'],[]).append(row)
        return {'period':{'from_date':str(from_date) if from_date else None,'to_date':str(to_date) if to_date else None},
                'totals':totals(rows),
                'days':rows,
                'by_worker':[{'worker_id':wid,'name':names[wid],**totals(items)} for wid,items in sorted(worker_rows.items(),key=lambda item:(names[item[0]],item[0]))],
                'by_site':[{'site_id':sid,**totals(items)} for sid,items in sorted(site_rows.items())]}
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
