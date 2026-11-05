from __future__ import annotations
import uuid
from datetime import date
from decimal import Decimal
from typing import Literal
from pydantic import BaseModel,Field,ConfigDict,model_validator

class Input(BaseModel):
    model_config = ConfigDict(extra='forbid')

class HistoricalSource(Input):
    source_ref:str=Field(min_length=1,max_length=500)
    text:str=Field(min_length=1,max_length=100000)
    reported_author:str|None=Field(default=None,max_length=500)
    message_date:date|None=None
    @model_validator(mode='after')
    def valid(self):
        if not self.source_ref.strip() or not self.text.strip():raise ValueError('source reference and text required')
        return self

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

class Material(Input):
    name:str=Field(min_length=1,max_length=200)
    quantity:Decimal|None=Field(default=None,ge=0,max_digits=20,decimal_places=6,allow_inf_nan=False)
    unit:str|None=Field(default=None,max_length=50)
    direction:Literal['mentioned','received','consumed']='mentioned'
    @model_validator(mode='after')
    def valid(self):
        if not self.name.strip():raise ValueError('material name required')
        if self.quantity is not None and not (self.unit or '').strip():raise ValueError('unit required with quantity')
        if self.direction!='mentioned' and (self.quantity is None or self.quantity<=0):raise ValueError('positive quantity required for material movement')
        return self

class Incident(Input):
    description:str=Field(min_length=1,max_length=2000)
    @model_validator(mode='after')
    def valid(self):
        if not self.description.strip():raise ValueError('incident description required')
        return self

class FinancialEntry(Input):
    id:uuid.UUID
    kind:Literal['expense','funding_received','advance_issued']
    operation_date:date
    amount_kopecks:int=Field(gt=0,le=10_000_000_000)
    category:str=Field(min_length=1,max_length=100)
    description:str|None=Field(default=None,max_length=1000)
    receipt_photo_id:uuid.UUID|None=None
    @model_validator(mode='after')
    def valid(self):
        if not self.category.strip():raise ValueError('financial category required')
        return self

class EquipmentEntry(Input):
    type:str=Field(min_length=1,max_length=100)
    hours:Decimal=Field(gt=0,max_digits=8,decimal_places=2,allow_inf_nan=False)
    hired:bool=False
    @model_validator(mode='after')
    def valid(self):
        if not self.type.strip():raise ValueError('equipment type required')
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
    crew:str|None=Field(default=None,max_length=1000)
    materials:list[Material]|None=Field(default=None,max_length=100)
    incidents:list[Incident]|None=Field(default=None,max_length=100)
    financial_entries:list[FinancialEntry]|None=Field(default=None,max_length=100)
    equipment:list[EquipmentEntry]|None=Field(default=None,max_length=50)
    next_shift_plans:list[str]|None=Field(default=None,max_length=30)
    @model_validator(mode='after')
    def valid(self):
        if self.kind=='work' and not self.work_entries: raise ValueError('work_entries required')
        if self.kind=='no_work' and not (self.no_work_reason or '').strip(): raise ValueError('no_work_reason required')
        if self.kind=='no_work' and self.work_entries: raise ValueError('no_work cannot contain work entries')
        if len(set(self.required_photo_ids)) != len(self.required_photo_ids): raise ValueError('duplicate photo ids')
        if self.financial_entries:
            ids=[entry.id for entry in self.financial_entries]
            if len(set(ids))!=len(ids):raise ValueError('duplicate financial entry ids')
            if any(entry.receipt_photo_id and entry.receipt_photo_id not in self.required_photo_ids for entry in self.financial_entries):raise ValueError('receipt photo must be attached to report')
        if self.next_shift_plans and any(not item.strip() or len(item)>500 for item in self.next_shift_plans):raise ValueError('invalid next shift plan')
        return self

def report_payload(data:ReportData):
    payload=data.model_dump(mode='json')
    for key in ('crew','materials','incidents','financial_entries','equipment','next_shift_plans'):
        if payload[key] is None:payload.pop(key)
    return payload
