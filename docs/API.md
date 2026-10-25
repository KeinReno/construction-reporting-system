# API v1 — предварительный REST-контракт

Base: /api/v1, HTTPS, аутентификация, проверка прав на объект для каждого запроса. Окончательная OpenAPI-спецификация генерируется FastAPI.

## Доступ и справочники
POST /auth/login — вход с защитой от перебора
GET /me — профиль/права
GET /sites — разрешённые объекты
GET /reference/work-types — виды работ и единицы
GET /reference/materials — материалы
GET /reference/incident-types — типы инцидентов
GET /reports/expected?date=YYYY-MM-DD — ожидаемая отчётность

## Отчёты
POST /reports — идемпотентно создать черновик по client_report_id
GET /reports/{id} — получить разрешённый отчёт
GET /reports?site_id=&from=&to= — список, фильтры, пагинация
POST /reports/{id}/attachments — загрузить вложение с attachment_id и sha256
POST /reports/{id}/submit — серверная проверка и полное подтверждение доставки
POST /reports/{id}/review — проверка/возврат руководителем
POST /reports/{id}/revisions — версия исправления с причиной
GET /attachments/{id} — безопасное получение фото

## Аналитика
GET /analytics/summary
GET /analytics/report-compliance
GET /analytics/work-volume
GET /analytics/materials
GET /analytics/incidents
POST /analytics/ask — только разрешённые вычисления и исходные ссылки

## Состояния
draft → uploading → submitted → reviewed или needs_revision. Клиентский queued — только локальный статус. «Принято сервером» не равно «проверено руководителем».

## Ошибки
400/422 — валидация с кодом поля; 401/403 — авторизация/права; 404 — нет доступа/не существует; 409 — конфликт UUID/версии; 413 — файл велик; 429 — лимит; 5xx — временный сбой, повтор с backoff.

Сервер определяет автора, время поступления и роли; нельзя доверять client employee_id. Повторные POST с тем же ID и идентичными данными возвращают одну серверную сущность.