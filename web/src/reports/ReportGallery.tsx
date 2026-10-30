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
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void fetch(BASE + '/attachments/' + id, { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error(`Не удалось загрузить фото (код ${r.status}).`);
        objectUrl = URL.createObjectURL(await r.blob());
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(e => {
        if (active) setError(e instanceof TypeError ? 'Нет связи с сервером. Не удалось загрузить фото.' : e.message);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, token]);
  if (error) return <p role="alert">{error}</p>;
  if (!url) return <p className="muted">Загрузка фото…</p>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className={className} src={url} alt={alt} />
    </a>
  );
}

export function ReportThumb({
  id,
  token,
  count = 0,
}: {
  id?: string;
  token: string;
  count?: number;
}) {
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
    <div className={`report-row-thumb${url ? ' has-image' : ''}`}>
      {url ? <img src={url} alt="" /> : <span>Нет фото</span>}
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
