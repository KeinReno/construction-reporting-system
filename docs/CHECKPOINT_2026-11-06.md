# Проверенный этап — 06.11.2026

Код: 2207fa1e3d2cfaf48da18a1fc1eefaadf286938b. Ветка codex/project-completion-20261106, PR7. Локальная папка совпадает с GitHub, дерево публикации проверено; main не изменён.

Все workflow этого коммита завершились успешно:

- [Backend: SQLite и PostgreSQL с настоящим backup/restore](https://github.com/KeinReno/construction-reporting-system/actions/runs/42135091975).
- [Web build и браузерные проверки](https://github.com/KeinReno/construction-reporting-system/actions/runs/42135091941).
- [Android debug/release/unit,20instrumentation, HTTPS Worker и Web readback](https://github.com/KeinReno/construction-reporting-system/actions/runs/42135091949).
- [Windows runtime](https://github.com/KeinReno/construction-reporting-system/actions/runs/42135091933).
- [Демонстрационные Android и Windows сборки](https://github.com/KeinReno/construction-reporting-system/actions/runs/42135092072).

Согласованный срез: производственная аналитика/календарь; Т1/Т2 и погода во всех клиентах; серверный справочник с архивированием и историей имён; отдельный owner-only табель5000 ₽/рабочий день, командировки, ручные доплаты/штрафы; сохранённая переписка с источниками ИИ. Исправления и ограничения перечислены в AUDIT_RELEASE_2026-11-06.md, независимая QA — QA_COMPLETION_2026-11-06.md.

Физическая установка, рабочая миграция, фактические часы людей и живая синхронизация MAX не объявляются выполненными. Перед рабочим обновлением нужны резервная копия, миграция0008, настройка UUID владельца и прежний ключ подписи Android.

По дополнительному указанию владельца работа продолжается после публикации этого проверенного этапа. Следующий срез — итоговая сводка табеля по людям/объектам/периоду; вопрос о смысле фактических часов вынесен отдельно, расчёт неподтверждённых часов не вводится.


## Повторная публикация и завершённое продолжение

Код приложения: **1d82d736465a32a468fdd1f2b670f9c21b7ecdb1**, дерево350e2ab8e5099467a60f6385e54fee122509bf43. Включены OWNER-SUMMARY-01 и OWNER-HISTORY-01: итоги одной выборкой, история ревизий начисления, нормативные часы и защита ввода при сохранении. Все5workflow завершились PASS:

- [Backend:154PASS/2SKIP на Linux; PostgreSQL49PASS](https://github.com/KeinReno/construction-reporting-system/actions/runs/42193886991).
- [Web](https://github.com/KeinReno/construction-reporting-system/actions/runs/42193886982).
- [Android: debug/release/unit,20instrumentation и настоящий Web-readback](https://github.com/KeinReno/construction-reporting-system/actions/runs/42193886989).
- [Windows runtime](https://github.com/KeinReno/construction-reporting-system/actions/runs/42193887029).
- [Демонстрационные сборки](https://github.com/KeinReno/construction-reporting-system/actions/runs/42193887132).

Локальный Web37PASS; owner API6PASS; TypeScript/VitePASS. Независимая QA: QA_OWNER_SUMMARY_2026-11-06.md и QA_OWNER_HISTORY_2026-11-06.md. В полном локальном Backend154PASS/1SKIP/1FAIL единственный сбой Windows-readiness вызван прокси Windows, который HTTPX подхватывает из registry даже без proxy environment. Сервер отдельно ответил200; тест исправлен на прямые loopback-запросы trust_env=False. Это изменение только теста, приложение не изменено. Регрессия и точный последующий commit фиксируются отдельно после завершения.


Независимая регрессия исправленного Windows lifecycle: **1PASS,89.25с**. Все проверки установки/миграции/ready/assets/401/запрета повторного запуска сохранены. Полный локальный прогон не запускался заново после этой правки одного теста: его прежний результат154PASS/1SKIP/1FAIL указан выше, отдельный повтор устранил единственный воспроизведённый сбой.
