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
