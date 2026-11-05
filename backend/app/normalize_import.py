"""Offline, evidence-preserving normalization. No network calls or LLM writes.

Canonical submitted reports are immutable. Only a hash-bound analytical projection
is added to private source metadata. The complete supplied corpus is stored in DB.
"""
from __future__ import annotations
import argparse
from copy import deepcopy
from decimal import Decimal
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import uuid

VERSION=2
NAMESPACE=uuid.UUID('bc111c78-323d-4ae2-a262-8920b0811053')


def fingerprint(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()


def current_normalization(payload,source):
    result=(source or {}).get('_normalization')
    if not result or result.get('version')!=VERSION:return None
    if result.get('payload_sha256')!=fingerprint(payload):return None
    if result.get('text_sha256')!=fingerprint((source or {}).get('text','')):return None
    return result


def analysis_payload(payload,source):
    result=current_normalization(payload,source)
    return {**payload,**result['fields']} if result else payload


# Ordered categories describe the stated activity, never a percentage of readiness.
CATEGORIES=[
    (r'покрас|покраск','Покраска'),(r'свар|обвар','Сварочные работы'),
    (r'демонтаж|разбор(?!ались|ался|алась|алось|ается|аемся)|разобрал(?![исьао]?сь)|срезк|срезал','Демонтаж'),(r'опалуб','Опалубочные работы'),
    (r'арматур','Арматурные работы'),(r'праймер|рубероид|монтаж [12] слоя|закатали','Гидроизоляция'),
    (r'залив|залили|бетономешал','Бетонирование'),(r'пролив|пролил|накрыли.*бетон','Уход за бетоном'),
    (r'монтаж.*блок|пристрелка.*ряда|монтаж \d.*ряд','Монтаж блоков'),
    (r'монтаж.*плит','Монтаж плит'),(r'перемыч','Монтаж перемычек'),
    (r'металлоконструк|конструкци|нарезка|резка.*труб|резка швеллер','Металлоконструкции'),
    (r'провод|кабел|изолятор|ввод|отвод|закладн.*натяж|монтаж креплений','Электромонтажные работы'),
    (r'сетк|трос','Монтаж сетки и троса'),(r'кирпич','Кирпичная кладка'),
    (r'столб','Монтаж опор'),(r'размет|отбив|диагонал','Разметка и геодезия'),
    (r'разгруз|при[её]м|приняли|перемещ|вывоз','Приёмка и перемещение материалов'),
    (r'насып|отсып|подсып|трамб','Подготовка основания'),
    (r'убор|мусор|навели порядок|очистка','Уборка и подготовка площадки'),
    (r'подготов|обустрой|вод|инструмент|недоч[её]т|совещан|знакомство|распил|заделк','Организация и подготовка работ'),
]
CONTEXT=re.compile(r'^(?:допуск|выезд|забрали допускающего|дали отключения)\b',re.I)
# Work named in the genitive after "под" is the target of a preparation, not a completed activity.
PREP_FOR=re.compile(r'\bподготов\w*\s+под\b',re.I)
# Money stated as a hand-out is an advance, never a cost of the object.
ADVANCE=re.compile(r'\bаванс\w*|\bвыда[тч]\w*\b|\bкомандировочн\w*|\bкомандировочн\w*\s+(?:выдач|расход)',re.I)
DATE_TOKEN=re.compile(r'\b\d{1,2}\.\d{1,2}(?:\.\d{2,4})?\b')
# A period date keeps the "по" prefix from reading as a per-unit rate.
def without_dates(text):return DATE_TOKEN.sub('Х',text)
PROBLEM=re.compile(r'^(?:дождь\s*$|праймер не высох|сломался|пробная .*не получилось)',re.I)
NON_EXPENSE=re.compile(r'командиров|аванс|выдач|итого|всего|остат|получ|перев[её]л|оплатить|счет|счёт|цен[аыу]|возврат|возмещ|долг|не\s|[-−–]\s*\d|план|предстои|буд[еу]|нужно|надо|необходим|пример|около|[~≈]|\bпо\s+\d|/\s*(?:час|ч\b|шт|м\b)|\bза\s+(?:час|ч\b|лист|шт|единиц|метр|кг|\d)',re.I)
NON_ACTUAL_CONTEXT=re.compile(r'итого|всего|остат|цен|возврат|возмещ|не\s|[-−–]\s*\d|план|предстои|буд[еу]|нужно|надо|необходим|пример|около|[~≈]|\bпо\s+\d|/\s*(?:час|ч\b|шт|м\b|сут|день)|\bза\s+(?:час|ч\b|лист|шт|единиц|метр|кг|сут|день|ноч|\d)',re.I)
AMOUNT=r'\d[\d \u00a0]*(?:[.,]\d{1,2})?'
CURRENCY=r'(?:руб(?:лей|ля|ль)?\.?|р\.?|₽)(?!\w)'
# A labelled fragment can be separated from an otherwise ambiguous expense line.
# Label and amount must touch: proximity alone would move money to the wrong operation.
LABELED=[
    (re.compile(rf'\b(?:жиль[её]|проживание)\s+({AMOUNT})\s*{CURRENCY}',re.I),'Проживание','expense'),
    (re.compile(rf'\b({AMOUNT})\s*{CURRENCY}\s*(?:командировочн\w*|аванс\w*)',re.I),'Командировочные','advance_issued'),
    (re.compile(rf'\b(?:командировочн\w*|аванс\w*)\D{{0,12}}?({AMOUNT})\s*{CURRENCY}',re.I),'Командировочные','advance_issued'),
]


def normalize(payload,source_text):
    fields={'work_entries':[],'incidents':deepcopy(payload.get('incidents') or []),
        'materials':deepcopy(payload.get('materials') or []),'financial_entries':[], 'equipment':[]}
    facts=[];pending=[];context=[]
    def evidence(kind,line,value=None):
        start=source_text.find(line)
        if start<0:raise ValueError('Projection line is not in the original source')
        item={'kind':kind,'text':line,'start':start,'end':start+len(line)}
        if value is not None:item['value']=value
        facts.append(item)
        return item
    def review(kind,line,reason):
        item=evidence(kind,line)
        pending.append({**item,'reason':reason})
    accepted_expenses=set()
    def expense(line,amount,category,kind='expense'):
        if line.casefold() in accepted_expenses:
            review('finance',line,'Повтор денежного фрагмента; повторно не учтён');return
        accepted_expenses.add(line.casefold())
        item={'id':str(uuid.uuid5(NAMESPACE,str(payload['client_report_id'])+f':{kind}:'+line)),
            'kind':kind,'operation_date':str(payload['work_date']),'amount_kopecks':amount,
            'category':category,'description':line,'date_basis':'report_date',
            'evidence_basis':'declared_expense' if kind=='expense' else 'declared_advance'}
        fields['financial_entries'].append(item);evidence('finance',line,item)
    for w in payload.get('work_entries',[]):
        line=w.get('description') or w['type']
        if CONTEXT.search(line):context.append(evidence('shift_context',line));continue
        if re.search(r'^(?:не\s|нет\s|нужно\s|надо\s|необходим\w*\s|план\w*\b|предстоит\s|осталось\s|будет\s|будут\s|требуется\s)|\bне\s+(?:выполн|установ|произвед|сделан)|(?<![+\w])[-−–]\s*\d+(?:[.,]\d+)?\s*шт\b',line,re.I):
            review('work',line,'Отрицание или план не являются выполненным объёмом');continue
        if PROBLEM.search(line):
            if not any(e['description'].casefold()==line.casefold() for e in fields['incidents']):fields['incidents'].append({'description':line})
            evidence('incident',line);continue
        category='Организация и подготовка работ' if PREP_FOR.search(line) else next((name for pattern,name in CATEGORIES if re.search(pattern,line,re.I)),None)
        categorized=category is not None
        if not category and w.get('quantity') is None:
            category='Прочие заявленные работы';review('work_category',line,'Нужна классификация вида работ')
        # Voltage, size, row numbers and approximate amounts are not completed volumes.
        quantity=w.get('quantity');unit=w.get('unit')
        matches=list(re.finditer(r'(?<![\d.])(?P<n>\d+(?:[.,]\d+)?)\s*шт\b',line,re.I))
        match=matches[0] if len(matches)==1 else None
        if quantity is not None:category=w['type']
        elif categorized and match and not re.search(r'\+\s*[-–]|около|пример|план|нужно|размер|\bиз\s+\d|\d[.,]\d\s*м|\bне\b',line,re.I):
            quantity=str(Decimal(match['n'].replace(',','.')));unit='шт'
        item={'type':category,'description':line,'quantity':quantity,'unit':unit}
        fields['work_entries'].append(item);evidence('work',line,item)
    section=None;seen_expenses=set()
    for raw in source_text.splitlines():
        line=re.sub(r'^[-–]\s+(?=\D)','',raw.strip()).strip()
        if not line:continue
        if re.match(r'^расходы\b',line,re.I):
            section='finance';line=line.split(':',1)[1].strip() if ':' in line else ''
            if not line:continue
        elif re.match(r'^работа спец\s*техники',line,re.I):
            # Hours declared on the section title are real claims with no machine type attached.
            declared=re.search(r'(?<![\d.,])(\d+(?:[.,]\d+)?)\s*(?:часов|часа|час\b|ч\.?)\s*(.*)$',line,re.I)
            if declared:
                item=evidence('equipment',line,{'hours':str(Decimal(declared[1].replace(',','.'))),'type':None})
                unresolved=(declared[2] or '').strip()
                pending.append({**item,'reason':'Часы заявлены без указания вида техники; в итоги по технике не входят'
                    + (f'; значение помечено как спорное ({unresolved})' if unresolved else '')})
            section='equipment';continue
        elif re.match(r'^планы на завтра',line,re.I):section='plans';continue
        elif re.match(r'^(?:состав бригады|выполненные работы|работы|материалы|события|инциденты)\s*:',line,re.I):section=None;continue
        elif re.fullmatch(r'\d{1,2}\.\d{1,2}\.20\d{2}',line):section=None;continue
        if section=='equipment':
            match=re.fullmatch(r'(.+?)\s+(\d+(?:[.,]\d+)?)\s*(?:час(?:а|ов)?|ч\.?)(\s*\([^)]*\))?',line,re.I)
            if not match:
                review('equipment',line,'Не указаны однозначные часы техники');continue
            original_type=match[1].strip()
            typ=next((label for pattern,label in ((r'манипулятор','Манипулятор'),(r'кран','Кран'),(r'вышк','Вышка'),(r'экск[ао]ватор','Экскаватор'),(r'лент.*трансп','Лента транспортёрная')) if re.search(pattern,original_type,re.I)),original_type)
            hired=True if re.search(r'на[её]мн',line,re.I) else False if re.search(r'\bсво[яй]\b',line,re.I) else None
            item={'type':typ,'hours':str(Decimal(match[2].replace(',','.'))),'hired':hired}
            if Decimal(item['hours'])<=0 or Decimal(item['hours'])>=1_000_000:
                review('equipment',line,'Часы вне допустимого диапазона');continue
            fields['equipment'].append(item);evidence('equipment',line,item)
        elif section=='finance' and line not in ('-','нет'):
            if line.casefold() in seen_expenses:
                review('finance',line,'Повтор денежной строки в одном отчёте; повторно не учтён');continue
            seen_expenses.add(line.casefold())
            amounts=list(re.finditer(r'(?<![\d.,])\d[\d \u00a0]*(?:[.,]\d{1,2})?\s*(?:руб(?:лей|ля|ль)?\.?|р\.?|₽)(?!\w)',line,re.I))
            # An explicitly labelled amount can be separated from other ambiguous
            # payments on the same expense line. Keep the rest for review.
            if len(amounts)>1 and not NON_ACTUAL_CONTEXT.search(line):
                for pattern,category,kind in LABELED:
                    for part in pattern.finditer(line):
                        amount=int(Decimal(part[1].replace(' ','').replace('\u00a0','').replace(',','.'))*100)
                        if 0<amount<=10_000_000_000:expense(part.group(),amount,category,kind)
            # A hand-out is tracked as an advance, never as a cost of the object.
            # "по 14.07" names the period, so a date is not an unexplained second number.
            if amounts and len(amounts)==1 and ADVANCE.search(line):
                single=re.match(r'[\d \u00a0]+(?:[.,]\d{1,2})?',amounts[0].group()).group()
                if not NON_ACTUAL_CONTEXT.search(without_dates(line)) and not re.search(r'\d',without_dates(line[:amounts[0].start()]+line[amounts[0].end():])):
                    amount=int(Decimal(single.replace(' ','').replace('\u00a0','').replace(',','.'))*100)
                    if 0<amount<=10_000_000_000:
                        expense(line,amount,'Командировочные' if re.search(r'командиров',line,re.I) else 'Аванс','advance_issued');continue
            # A single expense amount with an explicit currency and no other numbers.
            if len(amounts)!=1 or NON_EXPENSE.search(line) or NON_ACTUAL_CONTEXT.search(line) or (amounts and re.search(r'\d',line[:amounts[0].start()]+line[amounts[0].end():])):
                review('finance',line,'Нужно подтвердить суммы, вид операции и дату; не включено в денежные итоги');continue
            amount_text=re.match(r'[\d \u00a0]+(?:[.,]\d{1,2})?',amounts[0].group()).group().replace(' ','').replace('\u00a0','').replace(',','.')
            amount=int(Decimal(amount_text)*100)
            if not 0<amount<=10_000_000_000:
                review('finance',line,'Сумма вне допустимого диапазона');continue
            category='Транспорт' if re.search(r'дорог|проезд|топлив',line,re.I) else 'Прочие расходы'
            expense(line,amount,category)
    # Existing structured entries always win; do not double-count a previously structured section.
    if payload.get('financial_entries'):fields['financial_entries']=deepcopy(payload['financial_entries'])
    if payload.get('equipment'):fields['equipment']=deepcopy(payload['equipment'])
    work_state='work' if fields['work_entries'] else 'no_work' if re.search(r'работ(?:ы|а)?\s+не\s*было|работ\s+нет|не работали|выходной',source_text,re.I) else 'not_stated'
    return {'version':VERSION,'payload_sha256':fingerprint(payload),'text_sha256':fingerprint(source_text),'work_state':work_state,
        'fields':fields,'facts':facts,'pending':pending,'shift_context':context}


def load_archive(path):
    raw=(Path(path)/'data.js').read_text(encoding='utf-8').strip();prefix='window.OWNER_DEMO_DATA = '
    if not raw.startswith(prefix):raise ValueError('Unsupported source format')
    return json.loads(raw[len(prefix):].rstrip(';'))


def prepare(db,archive):
    from app.main import Report,ReportSource
    from sqlalchemy import select
    data=load_archive(archive);projections={};report_links={};site_ids=set()
    if not data.get('reports'):raise ValueError('Corpus must have linked reports and an access scope')
    for row in data['reports']:
        client_id=str(uuid.uuid5(NAMESPACE,row['id']))
        report=db.scalar(select(Report).where(Report.client_report_id==client_id))
        if not report:raise ValueError('Source report missing from database')
        source=db.get(ReportSource,report.id)
        if not source or source.payload.get('text')!=row['body']:raise ValueError('Original text mismatch')
        projections[report.id]=normalize(report.payload,source.payload['text'])
        report_links[row['id']]=report.id;site_ids.add(report.site_id)
    corpus=deepcopy(data)
    corpus.pop('sources',None)  # Public-facing corpus has no external-service links.
    corpus['report_links']=report_links;corpus['site_ids']=sorted(site_ids)
    return corpus,projections


def apply(db,archive,storage):
    from app.main import ReportSource,ImportedCorpus
    corpus,projections=prepare(db,archive)
    corpus_id=str(uuid.uuid5(NAMESPACE,'complete-corpus:'+fingerprint(corpus)))
    storage=Path(storage).resolve();storage.mkdir(parents=True,exist_ok=True)
    archive=Path(archive).resolve()
    for media in corpus['media']:
        if not media.get('file'):continue
        source=archive/media['file']
        if source.is_symlink() or archive not in source.resolve().parents or not source.is_file():raise ValueError('Missing or unsafe original media')
        sha=hashlib.sha256(source.read_bytes()).hexdigest()
        if sha!=media['sha256']:raise ValueError('Original media checksum mismatch')
        name='corpus-'+sha+'.jpg';target=storage/name
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()!=sha:raise ValueError('Stored corpus media is corrupt')
        if not target.exists():shutil.copyfile(source,target)
        media['storage_file']=name;media.pop('file',None)
    existing=db.get(ImportedCorpus,corpus_id)
    if not existing:db.add(ImportedCorpus(id=corpus_id,payload=corpus))
    for report_id,projection in projections.items():
        source=db.get(ReportSource,report_id);value=deepcopy(source.payload)
        previous=value.get('_normalization')
        if previous and fingerprint(previous)!=fingerprint(projection):
            value.setdefault('_normalization_history',[]).append(previous)
        value['_normalization']=projection;source.payload=value
    return {'corpus_id':corpus_id,'messages':len(corpus['messages']),'reports':len(projections),
        'media':len(corpus['media']),'documents':len(corpus['documents']),
        'documents_available':sum(bool(x.get('available')) for x in corpus['documents']),
        'work_records':sum(len(p['fields']['work_entries']) for p in projections.values()),
        'measured_work_records':sum(w['quantity'] is not None for p in projections.values() for w in p['fields']['work_entries']),
        'equipment_records':sum(len(p['fields']['equipment']) for p in projections.values()),
        'financial_records':sum(len(p['fields']['financial_entries']) for p in projections.values()),
        'pending':sum(len(p['pending']) for p in projections.values())}


if __name__=='__main__':
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from app.main import ImportedCorpus
    from app.backup import backup
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--archive',type=Path,required=True);p.add_argument('--storage',type=Path,required=True)
    p.add_argument('--backup-dir',type=Path);p.add_argument('--service-stopped',action='store_true');p.add_argument('--apply',action='store_true')
    args=p.parse_args();url=os.environ['DATABASE_URL'];engine=create_engine(url)
    if args.apply:
        if not args.backup_dir or not args.service_stopped:p.error('Apply requires backup-dir and stopped service')
        backup(url,args.storage,args.backup_dir,service_stopped=True)
        ImportedCorpus.__table__.create(engine,checkfirst=True)
    with Session(engine) as db:
        if args.apply:result=apply(db,args.archive,args.storage);db.commit()
        else:
            corpus,projections=prepare(db,args.archive)
            result={'reports':len(projections),'pending':sum(len(x['pending']) for x in projections.values()),'apply':False}
    print(json.dumps(result));engine.dispose()
