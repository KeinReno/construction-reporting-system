# CRS Web — внедрение компонентов по Shark UI

**Дата:** 31.10.2026. **Источник:** https://shark-ui.com/docs/components/

Реализация в ветке `feat/crs-shark-ui-component-plan`; НЕ содержит изменений Android или Backend.

## Итоговый охват Web

| Паттерны Shark UI | CRS Web |
|---|---|
| Sidebar | `ui/CrSidebar.tsx`, `App.tsx`, свертывание, Ctrl+B, доступность |
| Progress | `ui/CrProgress.tsx`, метрика доли отчётов с квитанцией |
| Status / Badge | `ui/CrStatus.tsx`, `reports/ReportStatus.tsx`, все представления статусов |
| Table | `reports/ReportsJournal.tsx`, `AdminPanel.tsx`, семантические таблицы |
| Combobox | `ui/CrCombobox.tsx`, выбор объекта/автора/финансовых фильтров. Нативный select сохраняет клавиатуру и тестовые контракты, поиск — отдельный поповер |
| Date Picker / Calendar | `ui/CrDateField.tsx`, текстовая дата и браузерный календарь |
| Chart | `ui/CrReportChart.tsx`, динамика отчётности с переходом к источникам |
| Segment Group | `ui/CrSegmentGroup.tsx`, режимы журнала |
| Search / Input Group | `ui/CrSearchField.tsx`, журнал отчётов и архив |
| Pagination | `ui/CrPagination.tsx`, журнал отчётов по 24 записи |
| Data List | `ui/CrDataList.tsx`, реквизиты отчёта |
| Skeleton | `ui/CrSkeleton.tsx`, ожидание в аналитике, финансах и сводке |
| Breadcrumb | `ui/CrBreadcrumbs.tsx`, иерархия разделов и карточки объекта |
| Bottom Navigation / Menu | `App.tsx`, 4 основных раздела плюс «Ещё» на мобильном Web |
| Dialog | Сохранён нативный `<dialog>` в `ReportDetails.tsx` для надёжного focus/escape |
| Toast | Понятное подтверждение сохранения в `AdminPanel.tsx` |
| Buttons, Field, Cards | Единая токенизированная система в `design/shark-ports.css` и `design/shark-finish.css` |

Не добавляли визуально лишние и неприменимые к текущим сценариям QR, Signature Pad, Tour, Rating, Carousel, Marquee, Color Picker, Tree View, Floating Panel, File Upload без загрузки в Web, массовые Action Bar без массовых действий. Не вводили новые API-поля и не подменяли KPI вымышленными плановыми показателями.

## Техническая оговорка

Это **реальные React-компоненты-порты по UX-паттернам Shark UI**, а не буквальная установка пакетов `@shark/*`: Shark UI требует Tailwind v4, а текущий Vite/Web поддерживает собственный CSS. Такое решение сохраняет проверяемость и существующую архитектуру. Для точной реализации оригинального Shark UI потребуется отдельно согласовать миграцию Tailwind/registry и зависимости.

## Применение в локальном Grok

Не перезаписывать существующие локальные изменения. Рекомендуется отдельный worktree:

```bash
git fetch origin feat/crs-shark-ui-component-plan
git worktree add ../CRS-shark-review origin/feat/crs-shark-ui-component-plan
cd ../CRS-shark-review/web
npm ci
npm run build
npx playwright test
```

Playwright требует запуск тестового backend, уже настроенный в `web/playwright.config.ts`. Обязательно проверить 390/768/1440 px, desktop collapse, DatePicker, фильтр автора и объект, отчёт/ревизии/статусы, финансы/архив, мобильный «Ещё».

В GitHub PR #3 — review changes, а не готовый production релиз. Состояние CI проверять на соответствующем head SHA, а не на ранних красных коммитах.
