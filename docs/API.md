# API v1 — единый контракт (draft, требует SPEC-00)

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