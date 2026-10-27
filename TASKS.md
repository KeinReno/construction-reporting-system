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
| QA-06 | 6 | Технический сквозной сценарий | DONE | Android HTTPS Worker → API → БД → настоящий Web; CI 850635b |
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
| TECH-03 | Alembic 0001–0005 и сохранение старой строки | DONE | SQLite upgrade/downgrade/upgrade; PostgreSQL CI |
| TECH-04 | Фильтрованные Decimal-сводки и whitelist аналитик | DONE | API-тесты периода/ACL/prompt injection |
| TECH-05 | Web review/источники/история/фото и защита от старой сессии | DONE | build PASS; Playwright 3/3 на реальном API |
| TECH-06 | Android owner isolation, recovery receipt, revisions | DONE | 13 JVM + 11 Android35; физический полевой прогон NOT_TESTED |
| TECH-09 | Web/API: пользователи, объекты, доступы, аудит | DONE | Admin ACL, session revoke, real API E2E |
| TECH-12 | Ручной импорт исторических структурированных пакетов | DONE | Preflight, dates/photos, ACL, идемпотентность |
| TECH-13 | Локальный аналитик: ограниченные вопросы/причины/хронология | DONE | Нет выдуманных метрик/скрытых текстовых фильтров |
| TECH-11 | Android: HTTPS endpoint и реальный API/Worker E2E | DONE | TLS, origin binding, receipt/revision через FastAPI |
| TECH-10 | Windows runtime package/startup/readiness | DONE | PowerShell install/run/lock + Windows CI |
| TECH-08 | Android: автосохранение частичной формы и emulator Room/recreation | DONE | Room 4; 11 JVM + 8 Android 35 tests PASS; raw input, nonce/rollback, migration 1/2/3→4, recreation |
| TECH-07 | Offline backup+restore и контроль целостности | DONE | SQLite drill PASS; PostgreSQL pg_dump/restore PASS |

DEV-01…05 остаются IN_PROGRESS: полная форма, расписания, бизнес-каталоги и эксплуатационная приёмка не завершены. SPEC/ENV и полевые QA не отмечены DONE заочно. [Точный статус](docs/IMPLEMENTATION_STATUS.md), [проверки](docs/QA_RELEASE_2026-10-26.md).

## Демо-комплект 0.3.1
| ID | Результат | Статус | Проверка |
|---|---|---|---|
| DEMO-01 | Отдельный Android APK с локальным транспортом и шестью примерами | DONE | Native Android35 PASS, offline submit, applicationId .demo; artifact12632566301 |
| DEMO-02 | Windows EXE со встроенным Python/API/Web и демо SQLite | DONE | CI40288177400 Windows: frozen EXE + JS/CSS + browser + single instance PASS |
| DEMO-03 | Обезличенные адаптации образцов, схемы и инструкция | DONE | 40 pytest/2 environment skips; шесть примеров, START_HERE, файлы подготовлены |

## Возврат к исходному концепту
| ID | Задача | Статус | Критерий |
|---|---|---|---|
| CONCEPT-01 | Понятная карточка отчёта руководителя и русские статусы | IN_PROGRESS | Web build и проверка просмотра/проверки отчёта на реальном API |
| CONCEPT-02 | Удобная компактная форма Android по согласованному макету | TODO | Проверка формы, автосохранения и очереди на устройстве |
| CONCEPT-03 | Приём предоставленной истории с проверяемыми источниками | IN_PROGRESS | Приватный процесс, сохранение происхождения и неопределённостей; без выдумывания данных |
| CONCEPT-04 | Материалы, инциденты и бригада в сквозном отчёте | TODO | Согласованный контракт, миграции, совместимость и проверки Android/API/Web |
| CONCEPT-05 | Аналитика руководителя и свободные вопросы с источниками | TODO | Проверенные серверные расчёты; политика данных и провайдер B13 согласованы |

CONCEPT-01, локальная проверка: `npm run build` — PASS; `pytest -q tests/test_api.py tests/test_import.py` — 10 PASS. Playwright: тесты обнаружены, запуск NOT_TESTED (Chromium отсутствует в окружении). Проверка в CI необходима до DONE.

CONCEPT-03, частичный результат: подготовленный оператором текст и сведения источника хранятся отдельно, защищены ACL и доступны в карточке отчёта; автоматизированная обработка истории и все виды сведений ещё не готовы. Локально: backend 44 PASS / 2 SKIP; после исправления повторного импорта — набор import/reliability/migrations/backup 28 PASS. Web build PASS. PostgreSQL и браузерные проверки — CI.
