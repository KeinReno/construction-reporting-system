# DATA_MODEL — логическая модель v0.2

**Контракт для будущей миграции, не готовая миграция БД.** Не утверждённые бизнес-вопросы — docs/SPEC-00.md. Все ID — UUID, время событий — timestamptz UTC, дата работ — date по TZ объекта, суммы в integer minor units (копейки), количества в NUMERIC/Decimal.

## Владение и учёт
- `users`: id, login, password_hash, role, active (авторизуемые 3–4+ аккаунта).
- `workers`: id, display_name, worker_kind (regular/contractor), active; не требовать login.
- `sites`: id, name, timezone, active, настройки формы и дедлайнов.
- `teams`: id, name; `team_memberships`: team_id, worker_id, valid_from/to; состав отчёта фиксировать отдельным snapshot.
- `assignments`: site_id, team_id или responsible_user_id, date/shift, expected flag; статус смены/отмены.
- `expected_reports`: id, site_id, team_id, date, shift, due_at UTC, state (expected/submitted/exempt/overdue), associated_report_ids. Правило формирования требует B01/B02.

## Отчёты
- `reports`: id, client_report_id UNIQUE (UUID), site_id, team_id nullable, author_user_id, work_date, shift_id nullable, kind=work/no_work, no_work_reason nullable, transport-independent business_status (draft/submitted/needs_revision/reviewed), revision INTEGER, created_at/submitted_at, comment nullable.
- `report_workers`: report_id, worker_id или contractor descriptor, participation / role (отдельно от авторства).
- `work_entries`: id, report_id, work_type_id, quantity NUMERIC nullable, unit_id nullable, qualitative_status nullable, zone nullable, note nullable.
- `material_entries`: id, report_id, material_id, movement received/consumed, quantity NUMERIC, unit_id.
- `financial_entries`: id, report_id, operation_kind, category_id nullable, amount_minor BIGINT, currency=RUB, operation_date, note nullable, source_operation_id nullable.
- `incidents`: id, report_id, type_id, occurred_at nullable, duration_minutes nullable, details nullable.
- `next_shift_plans`: id, report_id, text/category (не превращать в задачи автоматически).
- `attachments`: id UUID, report_id, work_entry_id/incident_id/financial_entry_id nullable (максимум одна привязка к детали), sha256, mime, size_bytes, storage_key, status, uploaded_at.
- `report_revision_history`: report_id, revision, snapshot/diff, reason, actor_id, occurred_at.
- `audit_events`: actor, operation, entity/ref, timestamp, безопасные метаданные (без секретов).
- Справочники: work_types (режим измерения), units, materials, incident_types, financial_categories.

## Инварианты
1. Автор и доступ — только серверная сессия. Object-level ACL по назначению и роли.
2. `work` имеет хотя бы одну валидную work_entry; `no_work` имеет формализованную причину и может иметь финоперации/инциденты/фото.
3. `quantity` и `unit` обязательны только для количественных типов; качественные операции не превращать в `0`.
4. Единицы должны совпадать по измерению; итог по разным единицам не суммировать.
5. `received` материального ресурса не равно `consumed`; покупка не равна расходу на объекте.
6. Денежные события типизированы, `financial_entries` — первичные движения; сводки — вычисления, а не новые проводки.
7. `client_report_id` идемпотентен; тот же UUID с иным содержимым — 409. Редактирование существующей записи через revision-контракт.
8. Для submit обязательные attachment_id должны существовать, иметь проверенный checksum и status=stored.
9. После submit любые исправления только в разрешённом состоянии и с новой revision; исходная история сохраняется.
10. Ожидаемость определяется assignment/сменой/due_at, а не просто отсутствием сообщения в календаре.
11. Исключить неявное удаление зависимых фотографий или историю аудита каскадом.

## Для будущего Orion
UUID, версионированный экспорт и стабильные ссылки на исходный отчёт. Не создавать общие пространства и межклиентскую синхронизацию в MVP.

## Реализованная локальная Android-модель (26.10.2026)
Room 4 хранит `drafts` (транспортная очередь/доставленные отчёты) и отдельно `report_forms(ownerId PRIMARY KEY,sessionId,payload)`. `payload` версии 1 — локальный FormSnapshot, не серверный ReportData: сырой невалидный/неоконченный ввод сохраняется без отправки. В него входят pending work inputs, массивы работ/приватных путей фото и исходный Draft исправления с owner/revision.
`open(owner)` восстанавливает единственную форму аккаунта; autosave делает UPDATE только при совпадении owner+session. `enqueue` в одной Room-транзакции consumes session и записывает очередь. Если запись очереди падает, удаление формы откатывается; поздний autosave старой session не создаёт строку заново. Исторические drafts без owner не присваиваются следующему аккаунту.

## Реализованная серверная схема 0.3
Текущий исполняемый контракт — app/contracts.py, модели app/main.py и Alembic0001–0006. Логическая модель выше описывает также OPEN-бизнес-разделы и не означает наличие этих таблиц в поставке.
`report_sources` хранит неизменяемый источник исторического отчёта отдельно от изменяемого payload; заявленные автор и дата сообщения не заменяют server author и work_date. Первичку можно прикрепить только до отправки, доступ как к отчёту; source может отсутствовать у старых записей. Необязательные сведения `crew`, `materials`, `incidents` включаются в JSON payload и сохраняются в истории при исправлении; Android Room 5 хранит их в `extrasJson`. Отсутствие не трактуется как подтверждённый ноль. Финансовый журнал и классификация движения материалов ещё не реализованы.
User.auth_version и Token.auth_version связывают token с поколением credentials; reset/deactivate выполняют атомарный SQL increment и отзыв. Assignment текущего ядра — уникальная пара user_id/site_id для ACL, не план смены/expected report. AdminEvent содержит actor/action/target/details/timestamp без пароля/токена. ReportData хранит структурированный JSON; история и receipt фиксируются отдельно по revision.
