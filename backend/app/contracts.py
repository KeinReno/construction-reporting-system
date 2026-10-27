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
