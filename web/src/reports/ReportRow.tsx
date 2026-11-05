import { OwnerIcon } from '../ui/OwnerIcon';
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
      className={`report-row${view.photoIds.length===0?' report-row-no-photo':''}`}
      onClick={onOpen}
      aria-label={`Открыть отчёт за ${view.workDateLabel} · ${view.siteName} · Автор: ${view.authorLabel} · ${view.statusLabel} · ${view.workSummary} · Работ: ${view.workCount}, фото: ${view.photoCount}, событий: ${view.incidentCount}${view.possiblePhotoCount ? `, фото по дате: ${view.possiblePhotoCount}` : ''}`}
    >
      {view.photoIds.length>0 && <ReportThumb id={view.photoIds[0]} token={token} count={view.photoCount} />}
      <time dateTime={view.workDate}><span className="control-label"><OwnerIcon name="calendar"/>{view.workDateLabel}</span></time>
      <span className="report-row-main">
        <strong className="control-heading control-site-title"><OwnerIcon name="building"/>{view.siteName}</strong>
        {view.authorLabel && <AuthorBadge id={view.authorId} label={view.authorLabel} />}
        {view.crew && <small>{view.crew}</small>}
      </span>
      <span className="report-row-work">
        <span className="crs-truncate-2">{view.workSummary}</span>
        {view.quantityHint && <b>{view.quantityHint}</b>}
        {view.incidentHint&&<small className="control-label"><OwnerIcon name="event"/>{view.incidentHint}</small>}
        <ReportSignals works={view.workCount} photos={view.photoCount} events={view.incidentCount} />
        {view.possiblePhotoCount>0 && <small>Другие фото за дату: {view.possiblePhotoCount}</small>}
      </span>
      <ReportStatus status={view.status} label={view.statusLabel} archive={archive} />
      <span className="report-row-flags">
        {view.hasIncident && <span className="report-flag alert">Событие</span>}
        {view.isNoWork && <span className="report-flag">Без работ</span>}
      </span>
    </button>
  );
}
