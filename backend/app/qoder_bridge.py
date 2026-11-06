"""File bridge to the Qoder Desktop assistant. Runs asynchronously: CRS only drops a request envelope
and later reads the answer envelope. Proposals stay unapplied until the server revalidates them."""
from __future__ import annotations
import json, os, re, secrets, threading, time
from pathlib import Path
from app.ai_provider import AIUnavailable, compact_aggregates, _reserve

_REQUEST_ID = re.compile(r'^[0-9a-f]{32}$')
_owner_lock = threading.Lock()
_owner_quota: dict[str, list[float]] = {}
_inflight: dict[str, float] = {}
DAILY_LIMIT = 20
KINDS = ('rename_site', 'review_report', 'return_report', 'set_comment')
PENDING, ANSWERED, FAILED = 'pending', 'answered', 'failed'


def root():
    directory = os.getenv('CRS_QODER_BRIDGE')
    if not directory:
        return None
    path = Path(directory)
    for state in (PENDING, ANSWERED, FAILED):
        (path / state).mkdir(parents=True, exist_ok=True)
    return path


def status():
    return {'enabled': root() is not None, 'mode': 'qoder_bridge',
            'model': 'Qoder' if root() is not None else None,
            'requires_external_data_approval': False}


def _atomic(path: Path, payload: dict):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(temporary, path)


def _read(path: Path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _quota(owner_id: str):
    with _owner_lock:
        _reserve(owner_id)
        now = time.monotonic()
        hits = [x for x in _owner_quota.get(owner_id, []) if now - x < 86400]
        if len(hits) >= DAILY_LIMIT:
            raise AIUnavailable('Дневной лимит помощника исчерпан. Данные не изменены.')
        hits.append(now)
        _owner_quota[owner_id] = hits


def enqueue(question, summary, catalog, history, owner_id):
    directory = root()
    if directory is None:
        raise AIUnavailable('Мост помощника не настроен.')
    _quota(owner_id)
    request_id = secrets.token_hex(16)
    payload = {'v': 1, 'request_id': request_id, 'created_at': time.time(), 'owner_id': owner_id,
               'question': question[:4000], 'history': history[-8:],
               'aggregates': compact_aggregates(summary),
               'sites': catalog.get('sites', []), 'reports': catalog.get('reports', []),
               'truncated': bool(catalog.get('truncated'))}
    _atomic(directory / PENDING / (request_id + '.json'), payload)
    with _owner_lock:
        _inflight[request_id] = time.time()
    return request_id


def _drop(request_id: str):
    directory = root()
    if directory is None:
        return
    for state in (PENDING, ANSWERED, FAILED):
        (directory / state / (request_id + '.json')).unlink(missing_ok=True)
    with _owner_lock:
        _inflight.pop(request_id, None)


def poll(request_id: str):
    directory = root()
    if directory is None:
        raise AIUnavailable('Мост помощника не настроен.')
    if not _REQUEST_ID.match(request_id):
        raise AIUnavailable('Запрос помощника не найден.')
    request_path = directory / PENDING / (request_id + '.json')
    answer = _read(directory / ANSWERED / (request_id + '.json'))
    failure = _read(directory / FAILED / (request_id + '.json'))
    if answer is None and failure is None:
        with _owner_lock:
            started = _inflight.get(request_id)
        if started is None and not request_path.is_file():
            raise AIUnavailable('Запрос помощника устарел. Повторите вопрос.')
        if time.time() - (started or request_path.stat().st_mtime) > 900:
            _drop(request_id)
            raise AIUnavailable('Помощник не ответил вовремя. Данные не изменены.')
        return {'state': 'pending', 'request_id': request_id}
    payload = failure if failure is not None else answer
    _drop(request_id)
    if failure is not None:
        detail = failure.get('error')
        raise AIUnavailable(detail if isinstance(detail, str) and 0 < len(detail) <= 300 else 'Помощник отклонил запрос. Данные не изменены.')
    text = payload.get('answer')
    sources = answer.get('sources')
    actions = answer.get('actions')
    if not isinstance(text, str) or len(text) > 12000:
        raise AIUnavailable('Ответ помощника не прошёл проверку. Данные не изменены.')
    if not isinstance(sources, list) or len(sources) > 200 or not all(isinstance(x, str) and len(x) <= 32 for x in sources):
        sources = []
    if not isinstance(actions, list) or len(actions) > 3:
        actions = []
    clean = []
    for action in actions:
        if not isinstance(action, dict) or set(action) != {'kind', 'target', 'value', 'reason'}:
            continue
        if not all(isinstance(v, str) for v in action.values()):
            continue
        if action['kind'] not in KINDS or len(action['target']) > 32 or len(action['value']) > 2000 or len(action['reason']) > 500:
            continue
        clean.append(action)
    return {'state': 'answered', 'request_id': request_id, 'answer': text,
            'sources': sources, 'actions': clean}


def run(question, summary, catalog, history, owner_id, wait_seconds=120):
    """Same call shape as codex_provider.run, but the answer arrives from the desktop worker."""
    request_id = enqueue(question, summary, catalog, history, owner_id)
    deadline = time.monotonic() + wait_seconds
    while True:
        result = poll(request_id)
        if result['state'] == 'answered':
            return result
        if time.monotonic() > deadline:
            _drop(request_id)
            raise AIUnavailable('Помощник не ответил вовремя. Данные не изменены.')
        time.sleep(2)
