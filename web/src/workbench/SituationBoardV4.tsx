import type { Report, Site } from '../api';
import { reportStatusLabels } from '../api';
import { formatDate } from '../date';
import { ReportStatus } from '../reports/ReportStatus';
import { CrSkeleton } from '../ui/CrSkeleton';
import { buildReportView } from '../reports/reportView';

export function SituationBoardV4({
  sites, ready, error, latestReport, attentionReports, statedProblems,
  siteName, authorName, onOpenSite, onOpenReport,
}: {
  sites: Site[];
  ready: boolean;
  error: string;
  latestReport: (siteId: string) => Report | undefined;
  attentionReports: Report[];
  statedProblems: Array<{site: Site; report: Report; incident: {description: string}}>;
  siteName: (id: string) => string;
  authorName: (login?: string | null) => string;
  onOpenSite: (siteId: string) => void;
  onOpenReport: (report: Report) => void;
}) {
  return (
    <section className="situation-board wb-situation" aria-label="Ситуация на объектах">
      <div className="wb-situation-main">
        <header className="wb-panel-heading">
          <div>
            <span className="wb-overline">ПОРТФЕЛЬ / ОБЪЕКТЫ</span>
            <h2>Состояние площадок</h2>
          </div>
          <span className="wb-panel-count">{sites.length.toString().padStart(2, '0')}<small>ОБЪЕКТ.</small></span>
        </header>
        <div className="wb-situation-list situation-list">
          {ready ? sites.map((site, index) => {
            const latest = latestReport(site.id);
            const view = latest ? buildReportView(latest, site.name, authorName(latest.author_login)) : null;
            const problem = latest?.data.incidents?.[0];
            return (
              <button type="button" key={site.id} onClick={() => onOpenSite(site.id)}
                className="situation-site situation-row wb-situation-row">
                <span className="wb-situation-row-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                <span className="situation-site-main">
                  <strong>{site.name}</strong>
                  <span>{latest
                    ? `Последний отчёт ${formatDate(latest.data.work_date)} · ${authorName(latest.author_login)}`
                    : 'В выбранном периоде сведений нет'}</span>
                </span>
                <span className="situation-site-work">
                  <span className="wb-work-caption">ПОСЛЕДНЯЯ СМЕНА</span>
                  <span>{view
                    ? `${view.workSummary}${view.quantityHint ? ` · ${view.quantityHint}` : ''}`
                    : 'Последняя смена не попала в фильтр'}</span>
                  {problem && <span>Заявлено {formatDate(latest!.data.work_date)}: {problem.description}</span>}
                </span>
                <span className="situation-site-side wb-site-side">
                  {latest ? <ReportStatus status={latest.status} label={view!.statusLabel} /> : <span className="badge">Нет данных</span>}
                  <span className="wb-row-arrow" aria-hidden="true">↗</span>
                </span>
              </button>
            );
          }) : error ? <p className="empty">Данные не загружены.</p>
            : <CrSkeleton rows={4} label="Загрузка сведений об объектах" />}
          {ready && !sites.length && <p className="empty">Нет назначенных объектов.</p>}
        </div>
        <footer className="wb-situation-foot">Строки показывают последний отчёт в фильтре. Отсутствие записи не является просрочкой: график смен не задан.</footer>
      </div>
      <aside className="attention-panel wb-review">
        <header className="wb-panel-heading wb-review-heading">
          <div><span className="wb-overline">КОНТРОЛЬ / ОЧЕРЕДЬ</span><h2>Требует внимания</h2></div>
          <em aria-label="Количество отчётов, требующих внимания">{ready ? attentionReports.length : '—'}</em>
        </header>
        <div className="attention-queue wb-review-queue">
          {ready && attentionReports.map((report, index) => {
            const view = buildReportView(report, siteName(report.site_id), authorName(report.author_login));
            return (
              <button type="button" key={report.id} onClick={() => onOpenReport(report)}
                className="attention-queue-item attention-item wb-review-item">
                <span className="wb-review-index">{String(index + 1).padStart(2,'0')}</span>
                <strong>{view.siteName}</strong>
                <span>{view.workDateLabel} · {view.workSummary}</span>
                <ReportStatus status={report.status} label={reportStatusLabels[report.status]} />
              </button>
            );
          })}
          {ready && !attentionReports.length && (
            <div className="wb-review-empty">
              <span className="wb-review-empty-glyph" aria-hidden="true">✓</span>
              <strong>Очередь пуста</strong>
              <p>Новых и возвращённых отчётов в выбранном периоде нет.</p>
            </div>
          )}
          {ready && statedProblems.map(item => (
            <div className="attention-note attention-item wb-review-note" key={item.report.id}>
              <strong>Событие · {formatDate(item.report.data.work_date)}</strong>
              <span>{item.incident.description}</span>
              <span>{item.site.name}. Это запись отчёта, не признак продолжающейся аварии.</span>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
