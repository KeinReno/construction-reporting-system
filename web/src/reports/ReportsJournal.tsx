import { useMemo, useState } from 'react';
import type { Report } from '../api';
import { ReportCard } from './ReportCard';
import { ReportRow } from './ReportRow';
import { buildReportView, searchableReportText } from './reportView';

type Density = 'list' | 'cards';

export function ReportsJournal({
  reports,
  token,
  siteName,
  authorName,
  title,
  intro,
  archive = false,
  compact = false,
  onOpen,
  onShowAll,
}: {
  reports: Report[];
  token: string;
  siteName: (id: string) => string;
  authorName: (login?: string | null) => string;
  title: string;
  intro: string;
  archive?: boolean;
  compact?: boolean;
  onOpen: (report: Report) => void;
  onShowAll?: () => void;
}) {
  const [density, setDensity] = useState<Density>('list');
  const [query, setQuery] = useState('');
  const views = useMemo(
    () =>
      reports.map(report =>
        buildReportView(report, siteName(report.site_id), authorName(report.author_login), {
          archiveLabel: archive ? 'Архив MAX' : undefined,
        })
      ),
    [reports, siteName, authorName, archive]
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    if (!needle) return views.map((view, index) => ({ view, report: reports[index] }));
    return views
      .map((view, index) => ({ view, report: reports[index] }))
      .filter(({ view, report }) => searchableReportText(view, report.data.comment).includes(needle));
  }, [views, reports, query]);
  const shown = compact ? filtered.slice(0, 6) : filtered;

  return (
    <section className="report-panel reports-journal" aria-label={title}>
      <div className="reports-journal-toolbar">
        <div>
          <h2>{title}</h2>
          <p className="muted report-intro">{intro}</p>
        </div>
        <div className="reports-journal-actions">
          {!compact && (
            <label className="reports-journal-search">
              Поиск
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Объект, работа, автор"
              />
            </label>
          )}
          <div className="density-toggle" role="group" aria-label="Плотность журнала">
            <button type="button" aria-pressed={density === 'list'} onClick={() => setDensity('list')}>
              Список
            </button>
            <button type="button" aria-pressed={density === 'cards'} onClick={() => setDensity('cards')}>
              Карточки
            </button>
          </div>
          {compact && onShowAll && (
            <button type="button" className="link-button" onClick={onShowAll}>
              Все отчёты →
            </button>
          )}
        </div>
      </div>

      {!shown.length ? (
        <p className="empty">
          {reports.length ? 'По запросу ничего не найдено.' : 'Отчёты по выбранным условиям отсутствуют.'}
        </p>
      ) : density === 'list' ? (
        <div className="report-rows">
          {/* Keep a semantic table for overview E2E selectors that look for tbody rows. */}
          {compact ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Объект</th>
                    <th>Содержание</th>
                    <th>Автор</th>
                    <th>Статус</th>
                    <th>Версия</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(({ view, report }) => (
                    <tr key={report.id} onClick={() => onOpen(report)}>
                      <td data-label="Дата">
                        <button
                          className="report-open"
                          onClick={() => onOpen(report)}
                          aria-label={`Открыть отчёт за ${view.workDateLabel} · ${view.siteName}`}
                        >
                          {view.workDateLabel}
                        </button>
                      </td>
                      <td data-label="Объект">{view.siteName}</td>
                      <td data-label="Содержание">{view.workSummary}{view.quantityHint ? ` · ${view.quantityHint}` : ''}</td>
                      <td data-label="Автор">{view.authorLabel}</td>
                      <td data-label="Статус">
                        <span className={`badge ${archive ? '' : view.status}`}>{view.statusLabel}</span>
                      </td>
                      <td data-label="Версия">№{view.revision}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            shown.map(({ view, report }) => (
              <ReportRow
                key={report.id}
                view={view}
                token={token}
                archive={archive}
                onOpen={() => onOpen(report)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="report-cards">
          {shown.map(({ view, report }) => (
            <ReportCard
              key={report.id}
              view={view}
              token={token}
              archive={archive}
              onOpen={() => onOpen(report)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
