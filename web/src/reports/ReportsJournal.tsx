import { AuthorBadge } from './ReportSignals';
import { useEffect, useMemo, useState } from 'react';
import type { Report } from '../api';
import { ReportCard } from './ReportCard';
import { ReportRow } from './ReportRow';
import { buildReportView, searchableReportText } from './reportView';
import { ReportStatus } from './ReportStatus';
import { CrSegmentGroup } from '../ui/CrSegmentGroup';
import { CrPagination } from '../ui/CrPagination';
import { CrSearchField } from '../ui/CrSearchField';

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
  const [page, setPage] = useState(1);
  const [authorFilter, setAuthorFilter] = useState<string | null>(null);
  const views = useMemo(
    () =>
      reports.map(report =>
        buildReportView(report, siteName(report.site_id), authorName(report.author_login), {
          archiveLabel: archive ? 'Архив MAX' : undefined,
        })
      ),
    [reports, siteName, authorName, archive]
  );
  const authorGroups = useMemo(() => {
    const groups = new Map<string,{id:string|null;label:string;count:number}>();
    for (const view of views) {
      const key=view.authorId || '__unknown__';
      const group=groups.get(key) || {id:view.authorId,label:view.authorLabel,count:0};
      group.count++; groups.set(key,group);
    }
    return [...groups.entries()].sort((a,b)=>b[1].count-a[1].count || a[1].label.localeCompare(b[1].label,'ru'));
  },[views]);
  const activeAuthor = authorGroups.some(([key])=>key===authorFilter) ? authorFilter : null;
  useEffect(()=>{
    if(authorFilter && !authorGroups.some(([key])=>key===authorFilter)) setAuthorFilter(null);
  },[authorFilter,authorGroups]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('ru-RU');
    return views
      .map((view, index) => ({ view, report: reports[index] }))
      .filter(({ view, report }) => (!activeAuthor || (view.authorId || '__unknown__')===activeAuthor) && (!needle || searchableReportText(view, report.data.comment).includes(needle)));
  }, [views, reports, query, activeAuthor]);
  const perPage=24;
  const pageCount=Math.max(1,Math.ceil(filtered.length/perPage));
  useEffect(()=>setPage(1),[query,reports.length,compact,archive,activeAuthor]);
  const boundedPage=Math.min(page,pageCount);
  const shown=compact?filtered.slice(0,6):filtered.slice((boundedPage-1)*perPage,boundedPage*perPage);

  return (
    <section className="report-panel reports-journal" aria-label={title}>
      <div className="reports-journal-toolbar">
        <div>
          <h2>{title}</h2>
          <p className="muted report-intro">{intro}</p>
        </div>
        <div className="reports-journal-actions">
          {!compact && (
            <CrSearchField label="Поиск" value={query} onChange={setQuery} placeholder="Объект, работа, автор" className="reports-journal-search" />
          )}
          <CrSegmentGroup<Density> value={density} onChange={setDensity} ariaLabel="Плотность журнала" options={[{value:'list',label:'Список'},{value:'cards',label:'Карточки'}]} />
          {compact && onShowAll && (
            <button type="button" className="link-button" onClick={onShowAll}>
              Все отчёты →
            </button>
          )}
        </div>
      </div>

      {!compact && !archive && authorGroups.length > 0 && <details className="journal-authors" aria-label="Отчёты по авторам"><summary>Отчёты по авторам</summary>
        <div className="journal-authors-heading"><h3>Отчёты по авторам</h3><span>Все записи по выбранным фильтрам, включая черновики</span></div>
        <div className="journal-author-chart">{authorGroups.map(([key,group])=><button type="button" className="journal-author-bar" key={key} aria-pressed={activeAuthor===key} onClick={()=>setAuthorFilter(activeAuthor===key?null:key)}>
          <AuthorBadge id={group.id} label={group.label}/><span className="journal-author-track" aria-hidden="true"><span style={{width:`${group.count / authorGroups[0][1].count * 100}%`}}/></span><strong>{group.count}</strong>
        </button>)}</div>
        {activeAuthor && <button type="button" className="link-button journal-author-reset" onClick={()=>setAuthorFilter(null)}>Все авторы</button>}
      </details>}
      {!shown.length ? (
        <p className="empty">
          {reports.length ? 'По выбранному автору и запросу ничего не найдено.' : 'Отчёты по выбранным условиям отсутствуют.'}
        </p>
      ) : density === 'list' ? (
        <div className="report-rows">
          {/* Keep a semantic table for overview E2E selectors that look for tbody rows. */}
          {compact ? (
            <div className="table-wrap">
              <table className="crs-data-table">
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
                          onClick={event => { event.stopPropagation(); onOpen(report); }}
                          aria-label={`Открыть отчёт за ${view.workDateLabel} · ${view.siteName}`}
                        >
                          {view.workDateLabel}
                        </button>
                      </td>
                      <td data-label="Объект">{view.siteName}</td>
                      <td data-label="Содержание">{view.workSummary}{view.quantityHint ? ` · ${view.quantityHint}` : ''}</td>
                      <td data-label="Автор"><AuthorBadge id={view.authorId} label={view.authorLabel} /></td>
                      <td data-label="Статус">
                        <ReportStatus status={report.status} label={view.statusLabel} archive={archive} />
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
      {!compact && <CrPagination page={boundedPage} pageCount={pageCount} onPageChange={setPage}/>}
    </section>
  );
}
