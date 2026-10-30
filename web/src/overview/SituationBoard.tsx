import type { Report, Site } from '../api';
import { reportStatusLabels } from '../api';
import { formatDate } from '../date';
import { ReportStatus } from '../reports/ReportStatus';
import { buildReportView } from '../reports/reportView';

export function SituationBoard({
  sites,
  ready,
  error,
  latestReport,
  attentionReports,
  statedProblems,
  siteName,
  authorName,
  onOpenSite,
  onOpenReport,
}: {
  sites: Site[];
  ready: boolean;
  error: string;
  latestReport: (siteId: string) => Report | undefined;
  attentionReports: Report[];
  statedProblems: Array<{ site: Site; report: Report; incident: { description: string } }>;
  siteName: (id: string) => string;
  authorName: (login?: string | null) => string;
  onOpenSite: (siteId: string) => void;
  onOpenReport: (report: Report) => void;
}) {
  return (
    <section className="situation-board situation" aria-label="Ситуация на объектах">
      <div>
        <div className="section-heading">
          <div>
            <span className="crs-eyebrow">Оперативная сводка</span>
            <h2>Объекты</h2>
          </div>
        </div>
        <div className="situation-list">
          {ready ? (
            sites.map(site => {
              const latest = latestReport(site.id);
              const view = latest
                ? buildReportView(latest, site.name, authorName(latest.author_login))
                : null;
              const problem = latest?.data.incidents?.[0];
              return (
                <button
                  type="button"
                  className="situation-site situation-row"
                  key={site.id}
                  onClick={() => onOpenSite(site.id)}
                >
                  <span className="situation-site-main">
                    <strong>{site.name}</strong>
                    <span>
                      {latest
                        ? `Последний отчёт ${formatDate(latest.data.work_date)} · ${authorName(latest.author_login)}`
                        : 'В выбранном периоде сведений нет'}
                    </span>
                  </span>
                  <span className="situation-site-work">
                    <span>
                      {view
                        ? `${view.workSummary}${view.quantityHint ? ` · ${view.quantityHint}` : ''}`
                        : 'Последняя смена не попала в фильтр'}
                    </span>
                    {problem && (
                      <span>
                        Заявлено в отчёте {formatDate(latest!.data.work_date)}: {problem.description}
                      </span>
                    )}
                  </span>
                  <span className="situation-site-side">
                    {latest ? (
                      <ReportStatus status={latest.status} label={reportStatusLabels[latest.status]} />
                    ) : (
                      <span className="badge">Нет данных</span>
                    )}
                  </span>
                </button>
              );
            })
          ) : (
            <p className="empty">{error ? 'Данные не загружены.' : 'Загрузка…'}</p>
          )}
          {ready && !sites.length && <p className="empty">Нет назначенных объектов.</p>}
        </div>
        <p className="footnote">
          Ожидания по сменам не настроены. Отсутствие записи не считается просрочкой. Строка показывает последний
          отчёт внутри выбранного периода.
        </p>
      </div>

      <aside className="attention-panel">
        <h2>
          Требует внимания <em>{ready ? attentionReports.length : '—'}</em>
        </h2>
        <div className="attention-queue">
          {ready &&
            attentionReports.map(report => {
              const view = buildReportView(report, siteName(report.site_id), authorName(report.author_login));
              return (
                <button
                  type="button"
                  className="attention-queue-item attention-item"
                  key={report.id}
                  onClick={() => onOpenReport(report)}
                >
                  <strong>{view.siteName}</strong>
                  <span>
                    {view.workDateLabel} · {view.workSummary}
                  </span>
                  <ReportStatus status={report.status} label={reportStatusLabels[report.status]} />
                </button>
              );
            })}
          {ready && !attentionReports.length && (
            <p className="empty">Новых и возвращённых отчётов в периоде нет.</p>
          )}
          {ready &&
            statedProblems.map(item => (
              <p className="attention-note attention-item" key={item.report.id}>
                <strong>Заявлено в отчёте {formatDate(item.report.data.work_date)}</strong>
                <span>{item.incident.description}</span>
                <span>{item.site.name}. Это запись отчёта, не признак продолжающейся аварии.</span>
              </p>
            ))}
        </div>
      </aside>
    </section>
  );
}
