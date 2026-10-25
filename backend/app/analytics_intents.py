"""Finite local query templates. Filters are always explicit; this is not an LLM parser."""
import re

TEMPLATES={
    'summary':{'сводка','сводка отчетов','сводка по отчетам','покажи сводку отчетов','просто покажи сводку отчетов','сформировать анализ','анализ отчетов','сколько отчетов','сколько получено отчетов','сколько отправлено отчетов','summary','report summary'},
    'work_volume':{'объемы работ','какие объемы работ','покажи объемы работ','объемы по видам работ','work volume'},
    'no_work':{'простои','какие простои','какие простои повторяются','покажи простои','причины простоя','сколько отчетов без работ','отчеты без работ','no work reports'},
    'site_timeline':{'хронология','покажи хронологию','динамика отчетов','покажи динамику отчетов','история отчетов','timeline'},
}

def resolve(question):
    normalized=' '.join(re.findall(r'[\w-]+',question.casefold().replace('ё','е')))
    for intent,phrases in TEMPLATES.items():
        if normalized in phrases:return intent
    return None
