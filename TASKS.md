# TASKS — контроль работ

Статусы: TODO / IN_PROGRESS / BLOCKED / DONE. Нельзя менять TODO→DONE без проверки.
**Текущая фаза: технический MVP в PR #2; SPEC-00 OPEN блокирует спорные бизнес-правила, не технические исправления.**

| ID | Когда | Задача | Статус | Критерий |
|---|---|---|---|---|
| SPEC-00 | до дня 1 | Согласовать вопросы из docs/SPEC-00.md | BLOCKED | Отмечено APPROVED, подтверждены поля, регламент и финансы |
| SPEC-01 | до дня 1 | Финальная форма, каталоги, типы работ | TODO | Форма согласована, есть синтетические примеры |
| SPEC-02 | до дня 1 | Финальная OpenAPI v1 + mock-сервер | TODO | Схемы валидны и взаимно согласованы |
| ENV-00 | до дня 1 | Проверить Windows, HTTPS-доступ, backup и тестовые устройства | BLOCKED | Протокол обследования / доступы |
| DEV-01 | 1 | Android: Compose, локальные формы и Room | IN_PROGRESS | APK собирается, сохраняет офлайн |
| DEV-02 | 2 | Android: очередь, вложения, конфликты, статусы | IN_PROGRESS | Mock API, повтор без дублирования |
| DEV-03 | 3 | FastAPI + PostgreSQL + роли + финансы + вложения | IN_PROGRESS | Миграции, тесты API, совместимость с mock |
| DEV-04 | 4 | Web UI + отчётность + фильтры + графики | IN_PROGRESS | Синтетические цифры сверяются с БД |
| DEV-05 | 5 | Интеграция Android/API/Web, минимальная AI-аналитика, test deploy | IN_PROGRESS | E2E на реальном API |
| QA-06 | 6 | Сквозные сценарии | TODO | Отчёт → БД → Web |
| QA-07 | 7 | Обрывы, повторы, фото, ревизии | TODO | Нет потерь и ложной доставки |
| QA-08 | 8 | ACL, доступ с VPN/без, backup/restore | TODO | Протокол испытаний |
| QA-09 | 9 | Полевые сценарии сотрудников | TODO | Замечания с приоритетами |
| QA-10 | 10 | Цифры, периодизация, ИИ, отчётность | TODO | Точные расчёты с источниками |
| QA-11 | 11 | Корректировки формы и UX | TODO | Нет критических UX-блокеров |
| QA-12 | 12 | Регрессия | TODO | Повторно пройдены P0/P1 |
| QA-13 | 13 | Windows deploy, документация, обновления | TODO | Воспроизводимая установка и откат |
| QA-14 | 14 | Заказчик: приёмка MVP | TODO | Протокол, незакрытые дефекты |

Изменения scope и решения фиксировать в `docs/DECISIONS.md`. С дня 6 — только испытания и исправления; новые функции в backlog.

## Проверенные технические подзадачи PR #2

| ID | Результат | Статус | Доказательство |
|---|---|---|---|
| TECH-01 | API-конкурентность, идемпотентность и история | DONE | pytest: одновременные create/edit/submit, receipts, ACL |
| TECH-02 | Фото: валидация, повтор, конфликт UUID без порчи файла | DONE | Pillow + SHA + race regression |
| TECH-03 | Alembic 0001–0003 и сохранение старой строки | DONE | SQLite upgrade/downgrade/upgrade; PostgreSQL CI |
| TECH-04 | Фильтрованные Decimal-сводки и whitelist аналитик | DONE | API-тесты периода/ACL/prompt injection |
| TECH-05 | Web review/источники/история/фото и защита от старой сессии | DONE | build PASS; Playwright 2/2 на реальном API |
| TECH-06 | Android owner isolation, recovery receipt, revisions | IN_PROGRESS | CI unit/APK; полевой прогон NOT_TESTED |
| TECH-09 | Web/API: пользователи, объекты, доступы, аудит | IN_PROGRESS | Admin ACL, session revoke, real API E2E |
| TECH-12 | Ручной импорт исторических структурированных пакетов | IN_PROGRESS | Preflight, dates/photos, ACL, идемпотентность |
| TECH-13 | Локальный аналитик: ограниченные вопросы/причины/хронология | IN_PROGRESS | Нет выдуманных метрик/скрытых текстовых фильтров |
| TECH-11 | Android: HTTPS endpoint и реальный API/Worker E2E | IN_PROGRESS | TLS, origin binding, receipt/revision через FastAPI |
| TECH-10 | Windows runtime package/startup/readiness | IN_PROGRESS | PowerShell install/run/lock + Windows CI |
| TECH-08 | Android: автосохранение частичной формы и emulator Room/recreation | DONE | Room 4; 11 JVM + 8 Android 35 tests PASS; raw input, nonce/rollback, migration 1/2/3→4, recreation |
| TECH-07 | Offline backup+restore и контроль целостности | DONE | SQLite drill PASS; PostgreSQL pg_dump/restore PASS |

DEV-01…05 остаются IN_PROGRESS: полная форма, расписания, бизнес-каталоги и эксплуатационная приёмка не завершены. SPEC/ENV/QA не отмечены DONE заочно. [Точный статус](docs/IMPLEMENTATION_STATUS.md), [проверки](docs/QA_2026-10-25.md).
