# API v1 — единый контракт (draft, требует SPEC-00)

**Это целевой расширенный контракт. Фактически реализованное подмножество описано ниже и в `/openapi.json`; поля, ещё не реализованные, возвращают 422.**

**JSON:** snake_case, UUID строкой, даты `YYYY-MM-DD`, timestamps ISO-8601 UTC, Decimal как строка (`"12.50"`), суммы integer minor units. Автор берётся из сессии. Все endpoints проверяют роль/доступ к объекту. Входная модель должна совпадать с генерацией OpenAPI FastAPI и client-DTO Android/Web.

## Аутентификация и справочники
- `POST /api/v1/auth/login` {login,password} → сессия/токен с ограниченным сроком; refresh/logout реализовать в выбранной auth-схеме, запретить попадание токена в логи.
- `GET /api/v1/me` → id, role, разрешённые объекты.
- `GET /api/v1/sites`, `GET /api/v1/assignments`, `GET /api/v1/reference/{work-types|materials|units|incident-types|financial-categories}`.
- `GET /api/v1/reports/expected?date=2026-10-25` → expected slots: объект, бригада, смена, дедлайн, статус.

## Формат создания отчёта
`POST /api/v1/reports` → 201 создан или 200 идемпотентно существующий (полезная нагрузка должна совпадать); одинаковый client_report_id с другим содержимым → 409.
Синтетический пример (не реальные данные клиента):

```json
{
  "client_report_id":"10000000-0000-4000-8000-000000000001",
  "site_id":"20000000-0000-4000-8000-000000000002",
  "team_id":"30000000-0000-4000-8000-000000000003",
  "work_date":"2026-10-25",
  "kind":"work",
  "work_entries":[{"id":"40000000-0000-4000-8000-000000000004","work_type_id":"50000000-0000-4000-8000-000000000005","quantity":"12.5","unit_id":"60000000-0000-4000-8000-000000000006"}],
  "material_entries":[],
  "financial_entries":[],
  "incidents":[],
  "worker_ids":[],
  "comment":null
}
```
Ответ: `{ "id":"<server uuid>", "client_report_id":"<uuid>", "revision":1, "business_status":"draft", "submitted_at":null, "server_received_at":"<UTC>" }`. В ответе не обещать «delivered» до успешного submit.

## Изменение, фото, отправка
- `PATCH /api/v1/reports/{id}` c `expected_revision` и изменениями → новый revision; 409 при устаревшей версии/запрете изменения. Разрешён для draft и needs_revision.
- `PUT /api/v1/reports/{id}/attachments/{attachment_id}` — бинарный файл с SHA-256 и Content-Type; повтор одинакового id+sha даёт тот же результат, конфликт id/sha → 409. Сервер проверяет файл и атомарно фиксирует `stored`.
- `POST /api/v1/reports/{id}/submit` {expected_revision} — в транзакции валидирует документ, обязательные вложения и права; возвращает `{id, revision, business_status:"submitted", submitted_at, receipt_id}`. Повтор того же успешного submit идемпотентен.
- `POST /api/v1/reports/{id}/review` {expected_revision, decision:"reviewed"|"needs_revision",reason?} — только manager. При needs_revision reason обязателен.
- `GET /api/v1/reports/{id}`, `GET /api/v1/reports?site_id&from&to&page`, `GET /api/v1/attachments/{id}` — доступ по ACL.
- `GET /api/v1/reports/{id}/history` — журнал ревизий и проверки.

## Аналитика
- `GET /api/v1/analytics/summary?site_id&from&to`
- `GET /api/v1/analytics/compliance?date&site_id`
- `GET /api/v1/analytics/work-volume?from&to&site_id&work_type_id`
- `GET /api/v1/analytics/materials`, `.../incidents`, `.../finance`
- `POST /api/v1/analytics/ask` {question,filters} → {answer,period,metrics,source_report_ids,limitations}; доступ только к разрешённым аналитическим функциям.

## Состояния
Серверный `business_status`: `draft → submitted → reviewed` либо `submitted → needs_revision → submitted` с новой revision. Доставка `queued/uploading/retrying/delivered` — локальное состояние Android. `delivered` только после подтверждённого submit, не после создания черновика.

## Ошибки
`400/422` — `{code,message,field_errors}`, `401/403` — auth/ACL, `404` — not found, `409` — UUID/revision/status conflict, `413` — превышен размер фото, `429` — лимит, `5xx` — временно, retry с backoff. `If-Match`/revision — выбрать один механизм (рекомендация expected_revision) и реализовать одинаково в клиентах.

## Зафиксировать после SPEC-00
Наличие финансовых полей (B05), обязательные фото (B06), расписания (B02), единицу отчёта (B01). Затем генерировать OpenAPI, типизированные DTO и контрактные тесты; этот файл — draft, не официальный OpenAPI JSON.

## Фактический wire-контракт PR #2 (25.10.2026)
- `ReportData`: `client_report_id,site_id,work_date,kind,no_work_reason?,work_entries[],comment?,required_photo_ids[]`. `work_entries`: `type,quantity?` (Decimal string, максимум 20 цифр/6 десятичных мест, целая часть до 14), `unit?,description?`. `no_work` не содержит выполненных работ. Верхние лимиты: 100 операций, 30 фото, фото 8 MiB, комментарий 5000, причина 2000 знаков. Это технические лимиты, не утверждение B03/B06.
- Неизвестные поля и неподдерживаемые секции отвергаются 422: они не должны молча теряться. Дополнительно поддержаны необязательные `crew` (текст), `materials` (название, опциональные Decimal-количество и единица) и `incidents` (описание). Отсутствие секций не означает нулевой расход или отсутствие событий. Это не денежный журнал и не классификация движений материалов.
- Ответ отчёта: `id,client_report_id,site_id,author_id,author_login,revision,status,receipt_id,created_at,submitted_at,data`. `author_id` и `author_login` определяются серверной сессией, а не пользовательским вводом; в историческом импорте это импортёр, отдельно от заявленного автора источника. Эти поля доступны по ACL отчёта. Поле называется `status`, не `business_status`; Android/Web используют это имя. Время UTC, legacy timestamp может быть null.
- Повтор идентичного create: 200; новый: 201; другое содержимое/владелец: 409. Одновременный идентичный create также возвращает один id.
- PATCH: `{expected_revision,data:<полный ReportData>,reason}`; сохраняет исходный payload в истории. Новая revision сбрасывает старую квитанцию; следующий submit выдаёт квитанцию именно этой версии; квитанции предыдущих версий остаются в журнале событий (migration 0003, legacy значения могут быть null). Конкурирующий edit/submit → 409; перечитать состояние и повторить при необходимости.
- Повтор ранее сохранённого фото допустим после submit/review. Новые фото только для draft. Содержимое проверяется Pillow и SHA256; пути UUID+SHA исключают порчу файла проигравшим конкурентным запросом.
- `GET reports`: `site_id?,author_id?,from_date?,to_date?,page=1,page_size=100` (1…200), массив в стабильном порядке date desc/id. Клиент перебирает страницы до неполной. `GET reports/authors` возвращает только авторов доступных отчётов (foreman — только самого себя).
- `GET analytics/summary`: те же site/author/from_date/to_date; подтверждённые отчёты, точные объёмы отдельно по объекту/типу/единице, `daily`, `source_report_ids`, `period`, `limitations`. `POST analytics/ask` принимает author_id в явных фильтрах, применяет тот же ACL; чужой или отсутствующий автор не расширяет доступ.
- `POST analytics/ask`: явный intent либо auto с конечными шаблонами + фильтры, режим local_analytics, без внешней LLM. См. AI_ANALYTICS.
- `GET reports/{id}/history`: события, revision, actor_id, occurred_at, reason, payload_before, receipt_id. Снимки истории защищены тем же ACL.
- Для отчётов с `crew/materials/incidents` клиент при чтении по client UUID и submit передаёт `X-Report-Capabilities: report-extras-v1`; иначе 409 с требованием обновить клиент. PATCH без уже сохранённых новых секций возвращает 409, чтобы старый клиент не затёр их. Явный null очищает секцию при допустимой ревизии. Старые отчёты без этих полей сохраняют прежний контракт.
- Порядок обновления: сначала backend с расширенным контрактом, затем Android. Новый клиент передаёт эти поля в том числе как null; прежний backend с `extra=forbid` отклонит такой отчёт с 422. До обновления сервера такие записи остаются на устройстве и требуют повторной отправки после обновления.
- `POST auth/logout` отзывает текущий токен. Login выдаёт сессию на 8 часов; refresh отсутствует. Token привязан к auth_version пользователя: reset/deactivate отзывают в том числе гонку уже проверенного старого входа. Технические ошибки используют FastAPI `detail`; единая целевая схема field_errors ещё не реализована.
- Пока отсутствуют: expected reports/compliance, бизнес-справочники работ/материалов, аналитика движений материалов, финансовый API. Реализованный подсчёт событий учитывает только явно внесённые события и не трактует отсутствие записи как доказательство их отсутствия.

## Администрирование и runtime 0.3
`GET reports/{id}/source` возвращает сохранённый первичный текст или null при отсутствии; `PUT` сохраняет источник только автором отчёта до submit, повтор одинакового содержимого допускается, замена запрещена (409). Доступ к чтению ограничен ACL отчёта. Заявленные автор и дата источника не подменяют серверного автора или рабочую дату.
`GET/POST admin/users`, `PATCH admin/users/{id}` (active/password; role immutable), `POST admin/sites`, `GET/POST admin/assignments`, `DELETE admin/assignments/{id}`, `GET admin/audit` — только admin. Пароли/hash/token digest не возвращаются и не пишутся в audit. Отключение admin через HTTP запрещено; assignment unique(user,site), повтор grant идемпотентен. Физическое удаление users/sites/reports не реализовано.
`GET /ready` проверяет доступность полной схемы;503 без раскрытия DSN. `/health` — liveness. `WEB_DIR` отдаёт только built index/assets отдельно от private uploads/БД. Auto ask — конечные шаблоны, supported=false/metrics=null для неподдерживаемого.

## Добавление 28.10.2026: поля из текущей практики

`ReportData` принимает необязательные `financial_entries` (до 100), `equipment` (до 50) и `next_shift_plans` (до 30). Денежная запись: `id` UUID, `kind` = `expense | funding_received | advance_issued`, `operation_date` YYYY-MM-DD, `amount_kopecks` положительное целое до 10 млрд, `category` до 100 знаков, необязательные `description` и `receipt_photo_id`. ID операции уникален в отчёте; ID чека должен входить в `required_photo_ids`. Техника: `type`, положительные `hours` Decimal до двух знаков после запятой, `hired`. План: непустые пункты до 500 знаков. `no_work` также допускает эти секции без фиктивных работ.

Клиент с такими данными передаёт `X-Report-Capabilities: report-extras-v2` при чтении по client ID и submit. Старый клиент с v1 получает 409 для содержащего v2 полей отчёта; PATCH без прежних секций также получает 409. Аналитика `/summary` и `/ask` (`finance`, `equipment`) считает только текущие отправленные/проверенные версии. Деньги сгруппированы по виду операции; фильтр периода относится к дате отчёта, а дата операции показывается отдельно. Итоги не являются балансом. Проверять отчёт может роль `manager`; `admin` отвечает за настройку.
