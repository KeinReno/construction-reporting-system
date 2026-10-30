import type { Report, Site } from '../api';
import { reportStatusLabels } from '../api';
import { ReportStatus } from '../reports/ReportStatus';
import { buildReportView } from '../reports/reportView';

export function SiteList({
  sites,
  latestReport,
  authorName,
  onOpen,
}: {
  sites: Site[];
  latestReport: (siteId: string) => Report | undefined;
  authorName: (login?: string | null) => string;
  onOpen: (siteId: string) => void;
}) {
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <span className="crs-eyebrow">Объекты</span>
          <h2>Список объектов</h2>
        </div>
      </div>
      <p className="muted">Последняя смена показана внутри выбранного фильтра периода и автора.</p>
      <div className="site-list-grid site-grid">
        {sites.map(site => {
          const latest = latestReport(site.id);
          const view = latest
            ? buildReportView(latest, site.name, authorName(latest.author_login))
            : null;
          return (
            <button
              type="button"
              className="site-list-card site-tile"
              key={site.id}
              onClick={() => onOpen(site.id)}
            >
              <strong>{site.name}</strong>
              {view ? (
                <>
                  <p>
                    {view.workDateLabel} · {view.workSummary}
                    {view.quantityHint ? ` · ${view.quantityHint}` : ''}
                  </p>
                  <ReportStatus status={view.status} label={reportStatusLabels[view.status]} />
                </>
              ) : (
                <p className="muted">В выбранном периоде сведений нет</p>
              )}
              <span className="muted">Открыть карточку</span>
            </button>
          );
        })}
        {!sites.length && <p className="empty">Нет назначенных объектов.</p>}
      </div>
    </section>
  );
}
