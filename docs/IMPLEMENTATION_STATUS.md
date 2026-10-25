# IMPLEMENTATION_STATUS — 26.10.2026, техническая поставка 0.3

Работа ведётся в существующем draft PR #2 / feat/mvp-core-bootstrap. Независимая техническая часть реализована; **весь согласуемый продукт и реальная площадка заказчика ещё не приняты**. SPEC-00 OPEN, решения B01–B14 не записывались как одобренные задним числом. Конкретные оставшиеся входные данные: [RELEASE_HANDOFF](RELEASE_HANDOFF.md).

## Что работает
- **Android 0.3.0 / versionCode 3:** формы work/no_work, несколько работ/фото, сырой незавершённый ввод отдельно в Room4, owner-scoped восстановление, атомарный enqueue/consume и защита от позднего autosave. WorkManager/Room, retry/permanent errors, квитанции, payload/revision checks, исправление возвращённых/отклонённых отчётов. Ввод HTTPS-адреса до первого успешного входа; endpoint сохраняется в encrypted session и в immutable API client Worker. После входа сервер установки закреплён; перенаправления с credentials не следуются. TLS production использует обычную платформенную проверку.
- **Backend:** FastAPI/SQLAlchemy, PostgreSQL/SQLite, Alembic 0001–0005. Roles/ACL, idempotent UUID/submit, optimistic locking, фотографии с SHA и безопасным именем UUID+hash, полный журнал ревизий/квитанций. Reset/deactivate отзывают сессии через auth_version, включая гонку старого входа. `/ready` проверяет доступность полной схемы, `/health` — только процесс.
- **Web:** адаптивный журнал/фильтры/графики, защищённые фото и история, review/needs_revision. Admin UI создаёт пользователей/объекты, выдаёт/отзывает доступы, меняет пароль и активность обычных аккаунтов; аудит без секретов. HTTP не отключает admin и не меняет роли, нет удаления исторических записей. Старые async-ответы не восстанавливают данные другой сессии.
- **Локальный аналитик:** summary/work_volume/no_work/site_timeline, точные Decimal, период/источники, причины простоев и хронология. Auto принимает только конечный набор шаблонов; объект/период выбираются фильтрами, ограничения из свободного текста не игнорируются молча. Неподдерживаемое → supported=false, metrics=null. SQL/запись/внешняя LLM не предоставляются.
- **История:** ручной структурированный импорт с dry-run, проверкой дат/фото/всех доступов, серверным авторством, идемпотентным POST/receipt и защищённым атомарным журналом результата. Не скрейпер MAX и не автоматическое угадывание связей. [MANUAL_IMPORT](MANUAL_IMPORT.md).
- **Windows ZIP:** собранный Web, API/миграции, pinned dependencies, PowerShell install/run/AtStartup-definition, private config/data guards, SHA manifest, mutex, localhost/one worker, HTTPS proxy template. Первая учётная запись — локальный CLI. Это Scheduled Task, не реализация Windows Service. [WINDOWS_INSTALL](WINDOWS_INSTALL.md).
- **Обслуживание:** offline backup/verify/restore БД и зарегистрированных фото, контроль SHA, восстановление в новый контур. PostgreSQL pg_dump/restore проверяется в CI.

## Проверки и артефакты
Локальный Backend: 39 passed, 2 skipped (Windows и PostgreSQL выполняются в своих CI-прогонах). Web production build PASS. GitHub Actions дополнительно проверяет PostgreSQL, настоящий Windows runtime, Android35 Room/Compose/HTTPS и браузерный readback того же отчёта. Точные коммиты/итоги/ссылки — в PR #2 и [QA_RELEASE_2026-10-26](QA_RELEASE_2026-10-26.md), исторические QA-отчёты сохранены.

Артефакты: debug APK 0.3.0, release-unsigned APK для подписи владельцем, Windows runtime ZIP, Android/Playwright XML/HTML. Ни клиентские ключи, ни реальные данные не попадают в Git/артефакты CI. Все CI fixtures синтетические.

## Что действительно BLOCKED
1. **B01–B10:** полная форма/состав/смены, каталоги/материалы/финансы/инциденты/планы, обязательность фото, ожидаемые отчёты/просрочки и KPI. Эти бизнес-разделы не заменены фиктивными цифрами или домыслами.
2. **B11/B12:** сведения о Windows клиента, роли/права оператора, PostgreSQL, реальный домен/сертификат/шлюз и доступ. Не проверены реальная сеть Wi-Fi/мобильная и VPN/без, reboot площадки, RPO/RTO.
3. **B13:** провайдер/ключ или локальная модель, бюджет и разрешённая передача данных. Свободный LLM-диалог не подключён. Локальные сценарии работают без него.
4. **B14:** приёмщик, сопровождение, права/лицензия и постоянный Android keystore. Release APK пока unsigned; debug не выдаётся за производственную подпись.
5. **Полевые испытания:** OPPO Reno8 5G/iPhone, killed-process/relaunch/обесточивание, физические обрывы связи и platform WorkManager scheduling. Activity recreation/direct Worker/DB reopen — другие проверяемые сценарии, не подмена этих испытаний.

## Совместимость и сохранность
- Bootstrap-БД: остановить API, проверенный backup, сверить schema0001; только при совпадении stamp0001 и upgrade head. Новая БД сразу upgrade head. Legacy timestamps не выдумываются.
- Android Room1→4 сохраняет строки; записи без ownerId не присваиваются новому пользователю. Сессии старого формата без endpoint не используются для отправки; если остались данные без подтверждённой привязки сервера, новый endpoint блокируется до ручного переноса. Ничего не удаляется автоматически.
- Неизвестные API/импорт-поля отвергаются 422, не исчезают молча. Import receipt output не может затирать исходный bundle/фото или посторонний файл. Пакет не перезаписывает чужое авторство/историю.
