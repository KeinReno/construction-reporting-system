# Web

React/TypeScript/Vite: объекты, журнал с пагинацией API, фильтры, точные серверные сводки, дневная динамика, фото/история, review/needs_revision, локальный аналитик с источниками. Сессия только в памяти вкладки. Просрочки, инциденты, финансы и внешняя LLM не симулируются.

```bash
cd web
npm ci
npm run dev
npm run build
# Backend dependencies must be installed for the temporary synthetic API:
npx playwright install --with-deps chromium
npm run test:e2e
```
Vite проксирует `/api` в `http://127.0.0.1:8000`. Production отдаёт `dist/` и `/api` с одного HTTPS-origin. Playwright сам запускает временную SQLite/API на 8000 и Vite на 4173, проверяет реальный вход, фильтры, review, источники, logout и поздний ответ предыдущего аккаунта. Не запускать E2E поверх рабочего сервера: порты должны быть свободны. Никакой БД клиента тест не использует.

Для использования на iPhone и производственного HTTPS нужна отдельная приёмка B11/B12.
