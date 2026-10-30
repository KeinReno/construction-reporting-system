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
      aria-label={`Открыть отчёт за ${view.workDateLabel} · ${view.siteName}`}
    >
      <ReportThumb id={view.photoIds[0]} token={token} count={view.photoCount} />
      <time dateTime={view.workDate}>{view.workDateLabel}</time>
      <span className="report-row-main">
        <strong>{view.siteName}</strong>
        <small>{view.authorLabel}{view.crew ? ` · ${view.crew}` : ''}</small>
      </span>
      <span className="report-row-work">
        <span className="crs-truncate-2">{view.workSummary}</span>
        {view.quantityHint && <b>{view.quantityHint}</b>}
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
