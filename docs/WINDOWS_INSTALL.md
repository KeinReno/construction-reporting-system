# Установка технического MVP на Windows

Это пакет для проверки и установки согласованной части системы, не подписанная приёмка заказчика. SPEC-00 OPEN: финансы, материалы, составы и регламент ожидаемых отчётов не включены. Реальная Windows/сеть заказчика ещё должны пройти обследование B11/B12.

## Что нужно
- Windows с PowerShell 5.1+, Python 3.12 x64 и PostgreSQL; отдельная обычная учётная запись запуска.
- Согласованный домен/HTTPS-шлюз, DNS и firewall. API и БД не публикуются напрямую.
- Каталог приложения из ZIP и отдельный приватный каталог данных (например C:\ProgramData\ConstructionReporting), права NTFS на данные и конфигурацию только для оператора/учётной записи запуска и администраторов.
- Для PostgreSQL backup/restore — совместимые pg_dump/pg_restore в PATH.

## Установка
1. Скачайте artifact `construction-windows-runtime` из проверенного GitHub Actions и распакуйте ZIP, например в C:\Apps\ConstructionReporting. Manifest SHA256 проверяет целостность файлов, не заменяет проверку источника загрузки.
2. Из PowerShell запустите `scripts\windows\Install-Runtime.ps1`. Создаётся локальная .venv, зависимости берутся из requirements.lock.txt. Node/Gradle на сервере не нужны: Web уже собран.
3. Создайте отдельные PostgreSQL роль и БД. Пароль задайте интерактивно через psql `\password`, не в командной строке. БД должна принадлежать роли приложения, порт PostgreSQL — только в разрешённом локальном контуре.
4. Скопируйте `scripts\windows\config.example.json` в приватный каталог как config.local.json. Укажите DATABASE URL с URL-encoded паролем и абсолютный data_dir. Не храните конфигурацию внутри public Web или Git.
5. Пример команд (пути заменить своими):

```powershell
.\scripts\windows\Run.ps1 -ConfigPath C:\ProgramData\ConstructionReporting\config.local.json -ValidateOnly
.\scripts\windows\Run.ps1 -ConfigPath C:\ProgramData\ConstructionReporting\config.local.json -MigrateOnly
$env:DATABASE_URL = (Get-Content C:\ProgramData\ConstructionReporting\config.local.json -Raw -Encoding UTF8 | ConvertFrom-Json).database_url
Set-Location .\backend
..\.venv\Scripts\python.exe -m app.cli create-admin admin
Remove-Item Env:DATABASE_URL
Set-Location ..
.\scripts\windows\Run.ps1 -ConfigPath C:\ProgramData\ConstructionReporting\config.local.json
```

Первичный пароль запрашивается через getpass. Первый admin создаётся локально, публичного bootstrap endpoint нет. Остальные пользователи, объекты и назначения создаются в Web → Управление. Смена пароля и отключение отзывают сессии. Роли HTTP-аккаунтов неизменяемы; отключение admin через HTTP запрещено, чтобы не потерять последнего оператора.

6. Проверьте `http://127.0.0.1:8000/ready` (200 только при доступной полной схеме) и Web на localhost. `/health` показывает только живой процесс.
7. Настройте HTTPS reverse proxy по Caddyfile.example. Шаблон рассчитан на прямой публичный Caddy: он заменяет X-Forwarded-For адресом соединения; Uvicorn доверяет заголовку только от 127.0.0.1. Если перед Caddy есть CDN/туннель — отдельно согласовать модель доверия. Не доверять произвольным forwarded headers.
8. Выдайте учётной записи запуска read/execute на приложение, read на приватный config и modify на data_dir; проверьте права «Log on as batch job». Запуск без административных прав.
9. Настройте автозапуск:

```powershell
.\scripts\windows\Register-Startup.ps1 -ConfigPath C:\ProgramData\ConstructionReporting\config.local.json -ValidateOnly
.\scripts\windows\Register-Startup.ps1 -ConfigPath C:\ProgramData\ConstructionReporting\config.local.json -Credential (Get-Credential)
Start-ScheduledTask -TaskName 'Construction Reporting System'
```

Регистрация требует прав оператора Task Scheduler. Задача запускается AtStartup, допускает один экземпляр и 3 повтора при сбое; процесс дополнительно защищён mutex по data_dir. Это Scheduled Task, не Windows Service. Windows reboot/task registration на клиенте — отдельная приёмка; CI проверяет install/migrate/run, mutex и создание определения задачи без её регистрации.

10. В Android 0.3.0 перед первым входом введите согласованный HTTPS-адрес. После первого успешного входа сервер закрепляется за установкой; локальные данные нельзя незаметно перенаправить. Старые сессии без сохранённого endpoint требуют повторного входа; если остались несвязанные старые данные, нужен ручной перенос с подтверждением исходного сервера/владельца. Ничего не удаляется автоматически.

## Обновление и откат
Остановить Scheduled Task и убедиться, что API завершён. Выполнить offline backup БД+фото через app.backup, проверить manifest и восстановление на отдельном контуре. Распаковать новый пакет в отдельный каталог, установить его runtime, проверить миграции/ready/вход/фото и переключить задачу. Не удалять старый пакет и backup до приёмки. Откат приложения не равен downgrade БД: при несовместимости восстанавливать согласованный backup в новый контур. Никогда не применять downgrade без плана сохранения новых данных.

## Приёмка на клиенте
Проверить HTTPS с Wi-Fi/мобильной сети, с VPN и без; отчёт/фото/receipt и возврат исправления; OPPO и iPhone; остановку/перезапуск процесса и Windows; восстановление backup; свободное место; согласованные RPO/RTO и поддержку. Зафиксировать результаты, а не считать CI приёмкой серверной площадки.
