import { useEffect, useState } from 'react';
import { BASE } from '../api';
import { ReportStatus } from './ReportStatus';
import type { ReportView } from './reportView';

function CardMedia({ id, token, count }: { id?: string; token: string; count: number }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!id) return;
    let active = true;
    let objectUrl = '';
    void fetch(BASE + '/attachments/' + id, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error('photo');
        objectUrl = URL.createObjectURL(await r.blob());
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setUrl('');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, token]);
  return (
    <div className="report-card-media">
      {url ? <img src={url} alt="" /> : <span className="placeholder">Фото не приложены</span>}
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
      className="report-card crs-fade-in"
      onClick={onOpen}
      aria-label={`Открыть отчёт за ${view.workDateLabel} · ${view.siteName}`}
    >
      <CardMedia id={view.photoIds[0]} token={token} count={view.photoCount} />
      <div className="report-card-body">
        <div className="report-card-meta">
          <time dateTime={view.workDate}>{view.workDateLabel}</time>
          <ReportStatus status={view.status} label={view.statusLabel} archive={archive} />
        </div>
        <strong>{view.siteName}</strong>
        <p className="report-card-summary crs-truncate-2">{view.headline}{view.quantityHint ? ` · ${view.quantityHint}` : ''}</p>
        {view.incidentHint && <p className="report-card-summary crs-truncate-2">Событие: {view.incidentHint}</p>}
        <div className="report-card-footer">
          <span>{view.authorLabel}</span>
          <span>Версия {view.revision}</span>
        </div>
      </div>
    </button>
  );
}
