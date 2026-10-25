# Backend

FastAPI + SQLAlchemy; SQLite для разработки, PostgreSQL для рабочего контура. Полный статус и ограничения: [IMPLEMENTATION_STATUS](../docs/IMPLEMENTATION_STATUS.md).

## Запуск
```bash
cd backend
python -m venv .venv
# активировать .venv
pip install -r requirements.lock.txt
# DATABASE_URL и UPLOAD_DIR задать вне Git
python -m alembic upgrade head
python -m app.cli create-admin admin
python -m app.cli create-user employee foreman
python -m app.cli create-user supervisor manager
python -m app.cli create-site "Синтетический объект"
python -m app.cli grant employee SITE_UUID
python -m app.cli grant supervisor SITE_UUID
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --workers 1
python -m pytest -q
```
CLI запрашивает пароль через getpass; пароли не передаются аргументами. Администратор видит все объекты, manager/foreman получают назначения явно. Foreman видит только собственные отчёты. API слушает localhost за HTTPS reverse proxy. Ограничитель входа in-memory рассчитан на один процесс; перед несколькими workers нужен общий limiter. При истечении восьмичасовой сессии требуется новый вход; refresh не реализован.

Схема OpenAPI: `/openapi.json`, интерактивный контракт `/docs`. Неизвестные входные поля запрещены. Поля финансов/материалов/инцидентов не включены до SPEC-00. Admin API защищён отдельной ролью; session auth_version закрывает гонку reset/login. Web обслуживается с WEB_DIR только как public index/assets, uploads/БД/config туда не помещаются. /ready проверяет полную схему.

## Проверки
- `python -m pytest -q` — SQLite API, конкурентность, миграции, backup/restore.
- CI задаёт `TEST_DATABASE_URL` **отдельной одноразовой БД** и запускает API/гонки/pg_dump-restore. Fixture удаляет тестовые таблицы; никогда не указывать рабочую БД.
- Обновление исходной bootstrap-БД: [DEPLOY](../docs/DEPLOY.md).
- Резервные копии: `python -m app.backup --help`; API должен быть остановлен. Копии содержат БД/токены/фото и хранятся приватно вне репозитория.

Ручной импорт: `python -m app.import_reports --help`, сначала dry-run. Инструкции: [MANUAL_IMPORT](../docs/MANUAL_IMPORT.md). Windows-пакет: [WINDOWS_INSTALL](../docs/WINDOWS_INSTALL.md).
