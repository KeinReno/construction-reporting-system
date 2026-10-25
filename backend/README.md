# Backend — первый реализованный модуль (development)

Функции: Bearer-сессии и PBKDF2 пароли, назначение доступа к объектам, проверка роли, черновик отчёта с client UUID, идемпотентность, изменение по revision, фиксация полного получения с receipt_id, фото с sha256, возврат на исправление, серверные объёмы по типу/единице, аудит и тесты. Не готово к публичному production deployment: требуется Alembic, rate limiting, review безопасности, бизнес-правила SPEC-00.

## Локальная проверка
```
cd backend
python -m venv .venv
# активировать окружение
pip install -r requirements.txt
python -m app.cli init-db
python -m app.cli create-admin admin
uvicorn app.main:app --host 127.0.0.1 --port 8000
PYTHONPATH=. pytest -q
```
По умолчанию SQLite — исключительно development. Для эксплуатации PostgreSQL задайте DATABASE_URL; установка и миграции будут добавлены следующим этапом. Никогда не публикуйте uvicorn наружу и не используйте реальные данные заказчика в открытом GitHub.

Создать объект: `python -m app.cli create-site "Объект 1"`; назначить пользователя: `python -m app.cli grant admin SITE_UUID`. Для тестирования рабочих аккаунтов создавайте их безопасным локальным скриптом/админ-инструментом. Справочники и финансовый журнал до подтверждения в SPEC-00 не реализованы.
