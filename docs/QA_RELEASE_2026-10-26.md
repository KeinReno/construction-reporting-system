# QA технической поставки 0.3 — 26.10.2026

Синтетические данные, существующий PR #2. Численные результаты конкретного финального коммита фиксируются в PR после выполнения CI; открытые испытания не включаются в PASS.

## Закрытые дефекты
- **P1 credential race:** login, проверивший старый пароль до reset, мог выдать действительный token после reset. Теперь Token содержит observed auth_version, current сверяет актуальную версию User; reset/deactivate увеличивает её атомарно SQL. Детерминированный paused-login и два concurrent reset протестированы; независимый QA повторил: старый token401, новый пароль200.
- **P1 proxy availability:** все клиенты за Caddy могли попадать в один loopback bucket. Теперь Caddy заменяет XFF на remote_host; Uvicorn доверяет только127.0.0.1. Trusted/untrusted forwarded headers проверены; независимый клиент не блокируется 10 ошибками другого.
- **P1 import provenance:** manager GET-доступ позволял взять чужую receipt. Импорт теперь всегда выполняет серверный POST author/idempotency check; другой автор получает отказ, исходный повтор идемпотентен.
- **P1/P2 import source loss:** output мог совпасть с bundle/photo. CLI до network проверяет resolved paths, не перезаписывает источники/посторонние файлы; журнал сохраняет предыдущие receipts при повторе. Независимый QA подтвердил сохранность байтов и отказ до пароля/сети.
- **P2 local question routing:** substring «просто» мог означать no_work, текстовые даты/объекты игнорировались. Теперь конечные точные шаблоны; неподдерживаемые ограничения возвращают metrics=null, без подставленных нулей.
- **Windows compatibility:** Get-FileHash отсутствовал на runner; заменён потоковым .NET SHA256. Проверяется повреждение manifest-файла, UTF8 config/data path и запуск после восстановления исходных байтов.

- **Shared integration fixture:** Web mount перехватывал добавленный test/stats и давал404. Test-only route перенесён перед mount; отдельная регрессия одновременно проверяет Web root и stats при WEB_DIR.

## Наборы проверок
- Backend локально: **39 passed,2 skipped**, одна предупреждённая deprecation FastAPI/Starlette/httpx.
- PostgreSQL CI: **35 passed** — API/ACL/concurrency/admin/auth-generation/analytics/manual import + настоящий pg_dump/restore. Схема0001–0005.
- Web: build +3 Playwright (период/review/источники/unsupported question, stale session, admin user/site/access).
- Android:13 JVM;11 instrumented Android35 (Room, sessions/endpoints, Activity recreation, настоящий HTTPS Worker).
- HTTPS Worker: self-signed certificate отвергается platform trust; test-only CA принимается только в androidTest; redirects302 не следуются; фото/submit сохраняются, после injected503 AFTERcommit retry восстанавливает receipt без upload; revision2 даёт другую квитанцию, агрегат2.25m/один отчёт. CI извне сверяет реальные counters2photoPUT/2submit/1lost acknowledgement, поэтому skipped тест не выдаётся за PASS.
- Общий Android→API→DB→Web: Playwright открывает ту же запись/фото/историю, подтверждает revision2, review и аналитический источник. Это отдельный readback после Android на той же временной БД, не независимая симуляция цифр.
- Windows:2 tests — whitelist/manifest package; реальный PowerShell install/validate/tamper rejection/migrate/start/static/ready/mutex и Task Scheduler definition. Настоящий пользовательский startup/reboot и Windows PostgreSQL-сервер не считаются проверенными.

## Границы
Никаких реальных фото/переписок/ключей заказчика. Нет физического OPPO/iPhone, killed-process, физической сети/VPN/перезапуска Windows заказчика. Нет принятой SPEC-00/LLM-policy/production signing. [RELEASE_HANDOFF](RELEASE_HANDOFF.md) перечисляет необходимые решения и доступы.

## Подтверждённый прогон исполняемого кода
Commit `850635b53aed925efde9e53eb3b90fc0fc9d24fa`: все четыре направления PASS.
- [Android / HTTPS / тот же отчёт в Web](https://github.com/KeinReno/construction-reporting-system/actions/runs/40246445948)
- [Backend SQLite/PostgreSQL](https://github.com/KeinReno/construction-reporting-system/actions/runs/40246445928)
- [Web / 3 Playwright](https://github.com/KeinReno/construction-reporting-system/actions/runs/40246445894)
- [Windows runtime / 2 tests](https://github.com/KeinReno/construction-reporting-system/actions/runs/40246445926)
Финальный документационный коммит дополнительно запускает тот же CI; его исходы — в PR #2.
