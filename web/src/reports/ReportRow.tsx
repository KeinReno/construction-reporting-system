import { AuthorBadge, ReportSignals } from './ReportSignals';
import { ReportStatus } from './ReportStatus';
import { ReportThumb } from './ReportGallery';
import type { ReportView } from './reportView';

export function ReportRow({
  view,
  token,
  archive = false,
  onOpen,
}: {
  view: ReportView;
  token: string;
  archive?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="report-row"
      onClick={onOpen}
      aria-label={`Открыть отчёт за ${view.workDateLabel} · ${view.siteName} · Автор: ${view.authorLabel} · ${view.statusLabel} · ${view.workSummary} · Работ: ${view.workCount}, фото: ${view.photoCount}, событий: ${view.incidentCount}`}
    >
      <ReportThumb id={view.photoIds[0]} token={token} count={view.photoCount} />
      <time dateTime={view.workDate}>{view.workDateLabel}</time>
      <span className="report-row-main">
        <strong>{view.siteName}</strong>
        <AuthorBadge id={view.authorId} label={view.authorLabel} />
        {view.crew && <small>{view.crew}</small>}
      </span>
      <span className="report-row-work">
        <span className="crs-truncate-2">{view.workSummary}</span>
        {view.quantityHint && <b>{view.quantityHint}</b>}
        <ReportSignals works={view.workCount} photos={view.photoCount} events={view.incidentCount} />
      </span>
      <ReportStatus status={view.status} label={view.statusLabel} archive={archive} />
      <span className="report-row-flags">
        <span className="report-flag">v{view.revision}</span>
        {view.hasIncident && <span className="report-flag alert">Событие</span>}
        {view.isNoWork && <span className="report-flag">Без работ</span>}
      </span>
    </button>
  );
}
