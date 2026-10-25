# DATA_MODEL — логическая модель данных

## Базовые сущности
- users: id, login, password_hash, active, role.
- sites: id, name, active, timezone.
- teams: id, name.
- assignments: user_id/team_id, site_id, work_date/period, shift, expected_report flag.
- expected_reports: site_id, assignment_id, date, status, deadline.
- reports: id, client_report_id UNIQUE, author_id, site_id, work_date, kind, status, revision, created_at, submitted_at.
- report_workers: report_id, worker_id или обезличенное внешнее обозначение/роль (по согласованию).
- work_entries: id, report_id, work_type_id, quantity Decimal nullable, unit_id, zone, completion_flag.
- material_entries: id, report_id, material_id, amount Decimal, unit_id, movement_kind.
- incidents: id, report_id, incident_type_id, occurred_at nullable, duration_minutes nullable, details.
- expenses: id, report_id, expense_type_id, amount Decimal, currency, expense_date; включать только после утверждения правил.
- attachments: id, report_id, work_entry_id nullable, incident_id nullable, storage_key, sha256, size, uploaded_at, optional taken_at.
- report_revisions: actor, report_id, version, reason, change_diff, occurred_at.
- audit_events: actor, action, entity_id, time, metadata без секретов.

## Инварианты
- Автор отчёта определяется сервером; объект проверяется по назначениям и правам.
- Для kind=work требуются валидные записи работ; для kind=no_work — причина.
- Единица измерения совместима с работой или материалом. Нельзя складывать м³ и м².
- submit допускается только после успешной загрузки обязательных вложений.
- Повторный client_report_id не создаёт дубликат; конфликт содержимого возвращает 409.
- Разделены полученные отчёты и ожидаемые отчёты. Пропуск возможен лишь при действительном ожидании.
- Данные, расходы и материалы не смешиваются: сумма покупки ≠ количество израсходованного.
- Исправления версионируются, исходная запись и журнал доступны для аудита.

Физическая схема, индексы и миграции создаются в backend; этот документ — утверждаемый контракт, а не готовый SQL DDL.