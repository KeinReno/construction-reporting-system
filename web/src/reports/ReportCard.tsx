import { AuthorBadge, ReportSignals } from './ReportSignals';
import { ReportStatus } from './ReportStatus';
import { useAttachmentPreview } from './ReportGallery';
import type { ReportView } from './reportView';

function CardMedia({ id, token, count }: { id?: string; token: string; count: number }) {
  const { url, phase } = useAttachmentPreview(id, token);
  const label = phase === 'loading' ? 'Загрузка фото…' : phase === 'error' ? 'Фото не загрузилось' : 'Фото не приложены';
  return (
    <div className="report-card-media">
      {phase === 'ready' && url ? <img src={url} alt="" /> : <span className="placeholder">{label}</span>}
      {count > 0 && <small className="photo-count" style={{ position: 'absolute', right: 8, bottom: 8, padding: '4px 7px', borderRadius: 3, background: 'rgba(11,20,20,.86)', color: '#fff', fontSize: 10 }}>{count} фото</small>}
    </div>
  );
}

export function ReportCard({
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
      className={`report-card crs-fade-in${view.photoIds.length === 0 ? ' report-card-no-media' : ''}`}
      onClick={onOpen}
      aria-label={`Открыть отчёт за ${view.workDateLabel} · ${view.siteName} · Автор: ${view.authorLabel} · ${view.statusLabel} · ${view.workSummary} · Работ: ${view.workCount}, фото: ${view.photoCount}, событий: ${view.incidentCount}`}
    >
      {view.photoIds.length > 0 && <CardMedia id={view.photoIds[0]} token={token} count={view.photoCount} />}
      <div className="report-card-body">
        <div className="report-card-meta">
          <time dateTime={view.workDate}>{view.workDateLabel}</time>
          <ReportStatus status={view.status} label={view.statusLabel} archive={archive} />
        </div>
        <strong>{view.siteName}</strong>
        <p className="report-card-summary crs-truncate-2">{view.headline}{view.quantityHint ? ` · ${view.quantityHint}` : ''}</p>
        {view.incidentHint && <p className="report-card-summary crs-truncate-2">Событие: {view.incidentHint}</p>}
        <ReportSignals works={view.workCount} photos={view.photoCount} events={view.incidentCount} />
        <div className="report-card-footer">
          <AuthorBadge id={view.authorId} label={view.authorLabel} />
          <span>Версия {view.revision}</span>
        </div>
      </div>
    </button>
  );
}
