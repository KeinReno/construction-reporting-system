import { useEffect, useState } from 'react';
import { BASE } from '../api';

export function ReportPhoto({
  id,
  token,
  alt = 'Фотография из отчёта',
  className = 'report-photo',
}: {
  id: string;
  token: string;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void fetch(BASE + '/attachments/' + id, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(`Не удалось загрузить фото (код ${r.status}).`);
        objectUrl = URL.createObjectURL(await r.blob());
        if (active) {
          setUrl(objectUrl);
          setPhase('ready');
        } else URL.revokeObjectURL(objectUrl);
      })
      .catch(e => {
        if (active) {
          setPhase('error');
          setError(e instanceof TypeError ? 'Нет связи с сервером. Не удалось загрузить фото.' : e.message);
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, token]);
  if (phase === 'error') return <p role="alert">{error || 'Не удалось загрузить фото.'}</p>;
  if (phase === 'loading' || !url) return <p className="muted">Загрузка фото…</p>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className={className} src={url} alt={alt} />
    </a>
  );
}

export function useAttachmentPreview(id: string | undefined, token: string) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<'empty' | 'loading' | 'ready' | 'error'>(id ? 'loading' : 'empty');
  useEffect(() => {
    if (!id) {
      setPhase('empty');
      setUrl('');
      return;
    }
    let active = true;
    let objectUrl = '';
    setPhase('loading');
    void fetch(BASE + '/attachments/' + id, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error('photo');
        objectUrl = URL.createObjectURL(await r.blob());
        if (active) {
          setUrl(objectUrl);
          setPhase('ready');
        } else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => {
        if (active) setPhase('error');
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, token]);
  return { url, phase };
}

const thumbLabel = { empty: 'Фото не приложены', loading: 'Загрузка фото…', error: 'Фото не загрузилось' };

export function ReportThumb({
  id,
  token,
  count = 0,
}: {
  id?: string;
  token: string;
  count?: number;
}) {
  const { url, phase } = useAttachmentPreview(id, token);
  return (
    <div className={`report-row-thumb${url ? ' has-image' : ''}`}>
      {phase === 'ready' && url ? <img src={url} alt="" /> : <span>{thumbLabel[phase === 'ready' ? 'empty' : phase]}</span>}
      {count > 0 && <small className="photo-count">{count}</small>}
    </div>
  );
}

export function ReportGallery({
  ids,
  token,
}: {
  ids: string[];
  token: string;
}) {
  if (!ids.length) return <p className="muted">Фотографии не приложены.</p>;
  return (
    <div className="report-gallery photo-list">
      {ids.map(id => (
        <ReportPhoto key={id} id={id} token={token} />
      ))}
    </div>
  );
}
