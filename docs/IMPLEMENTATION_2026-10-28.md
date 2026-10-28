# Состояние локального MVP — 28.10.2026

Основание: [рабочие решения владельца](PRODUCT_DECISIONS_2026-10-28.md), [SPEC-00](SPEC-00.md) со статусом PARTIAL. Это технический срез PR #2, а не акт полевой приёмки.

## Реализовано в текущей ветке

- Администратор создаёт и назначает пользователей на объекты; пять отправителей настраиваются, имена не зашиты. Проверка отчёта доступна роли заказчика `manager`, возврат требует причины и сохраняет ревизии.
- Android сохраняет черновик локально, отправляет через очередь с устойчивым UUID и повторяемым submit. Сотрудник вводит работы, отсутствие работ с причиной, бригаду, материалы с явным направлением, события, денежные операции, часы техники, план следующей смены и фото.
- API принимает эти структурированные записи, сверяет ожидаемую ревизию, контролирует доступ к объектам и вложениям. Суммы хранятся в копейках; материалы и часы не переводятся в стоимость автоматически.
- Web показывает журнал, карточку, исправления и источники; сводки и локальный аналитик разделяют расход, финансирование и аванс, а материалы — по направлению и единице.
- Изолированное демо содержит только синтетические примеры. Windows runtime и demo EXE собираются отдельно от Android debug/demo APK.

## Проверка и границы

Проверки CI: `.github/workflows/backend.yml`, `web.yml`, `android.yml`, `windows.yml`, `demo.yml`. Сохранять SHA коммита и ссылку на конкретный run при передаче сборки; CI проходит на временной БД и эмуляторе Android 35, а не на телефоне сотрудников или Windows 10 заказчика. Локальные команды: `..\.venv\Scripts\python.exe -m pytest -q` из `backend`; `npm run build` и `npm run test:e2e` из `web`.

Остаются задачами: каталог и состав бригады как отдельные записи, настройки обязательных фото и выбор чека в мобильной форме, график ожидаемых отчётов и дедлайны, резервное расписание, права/ресурсы/HTTPS/VPN на Windows 10, постоянная подпись APK, проверка на устройствах и приёмка заказчиком. До графика интерфейс не объявляет сотрудников «не отчитавшимися»; до начального остатка не считает баланс.

Отдельная QA проверка исходного кода нашла три дефекта формы: скрытые количество материала и тип денежной операции в строках просмотра, а также потерю выбранной без типа и часов отметки наёмной техники при отправке. Исправления и нативная проверка строк просмотра включены в коммит `e91cb6b`; отметка наёмной техники без обязательных полей блокирует отправку и остаётся в форме.

## Проверенные сборки коммита `e91cb6b`

- [Backend CI](https://github.com/KeinReno/construction-reporting-system/actions/runs/40646658467) PASS; локальный полный pytest: 54 PASS / 1 SKIP.
- [Web CI](https://github.com/KeinReno/construction-reporting-system/actions/runs/40646658366) PASS; локальный Playwright на синтетическом API: 7 PASS.
- [Android CI](https://github.com/KeinReno/construction-reporting-system/actions/runs/40646658469) PASS: JVM, Android 35, HTTPS Worker и Web readback. Установочный debug APK: `dist/2026-10-28-e91cb6b/construction-android-debug/app-debug.apk`, SHA-256 `EA5F882F38752024BC435C3F275F902258FD840980BD66042617CBD909AE3935`. Release APK пока без подписи, SHA-256 `22D0EDBC5AFCC8832D874C18DFE0F9367BEC5DB453818BDCD711444275C77183`.
- [Demo CI](https://github.com/KeinReno/construction-reporting-system/actions/runs/40646658345) PASS: Android 35 офлайн-отчёт, Windows frozen EXE и браузерный демо-сценарий. Demo APK: `dist/2026-10-28-e91cb6b/construction-android-demo/app-demo.apk`, SHA-256 `AEC5E35BDDDCD242D5CDD7A577A04291082F3DD9E5FE2CC2737CB208737868A8`. Windows demo: `dist/2026-10-28-e91cb6b/construction-windows-demo/construction-windows-demo.zip`, SHA-256 `4D45CAB9D5D7157183F35C1C96EFFA485F91474852B67F16CE28A916E78EFCF5`.
- [Windows runtime CI](https://github.com/KeinReno/construction-reporting-system/actions/runs/40646658359) PASS: `dist/2026-10-28-e91cb6b/windows-runtime/construction-windows-runtime.zip`, SHA-256 `5DF1A338DCFFA8B062869877F7FF4E4E2E635231268EE655F45385EE22B15F7D`.

Пути в `dist` локальные и игнорируются Git. CI артефакты имеют ограниченный срок хранения; скачанные копии остаются в этой рабочей папке. Успех на эмуляторе и CI не заменяет полевое испытание и постоянную подпись.

Локально на Windows демо-архив распакован в `dist/2026-10-28-e91cb6b/windows-demo-runnable/`; `ConstructionReportingDemo.exe` имеет SHA-256 `80613F78812E18F60167895C090C6492E700C245F6855A47B7B68839BE29FD43`. Команда `.\.venv\Scripts\python.exe scripts/demo/test_frozen_demo.py dist/2026-10-28-e91cb6b/windows-demo-runnable/ConstructionReportingDemo.exe` прошла: loopback, Web, вход, шесть отчётов, PNG, точный объём и запрет второго экземпляра.
