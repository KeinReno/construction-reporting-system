import { OwnerIcon } from '../ui/OwnerIcon';
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
      aria-label={`Открыть отчёт за ${view.workDateLabel} · ${view.siteName} · Автор: ${view.authorLabel} · ${view.statusLabel} · ${view.workSummary} · Работ: ${view.workCount}, фото: ${view.photoCount}, событий: ${view.incidentCount}${view.possiblePhotoCount ? `, фото по дате: ${view.possiblePhotoCount}` : ''}`}
    >
      {view.photoIds.length > 0 && <CardMedia id={view.photoIds[0]} token={token} count={view.photoCount} />}
      <div className="report-card-body">
        <div className="report-card-meta">
          <time dateTime={view.workDate}>{view.workDateLabel}</time>
          <ReportStatus status={view.status} label={view.statusLabel} archive={archive} />
        </div>
        <strong className="control-heading control-site-title"><OwnerIcon name="building"/>{view.siteName}</strong>
        <div className="control-card-works"><span className="control-label"><OwnerIcon name="work"/>Что выполнено</span>{view.isNoWork?<p>Работ не было: {view.noWorkReason||'причина не указана'}</p>:(view.works?.length?view.works.slice(0,3).map((w,i)=><div className="control-card-work" key={i}><span>{w.name}</span><b>{w.quantity===null?'Объём не указан':`${w.quantity} ${w.unit||'· единица не указана'}`}</b></div>):<p>Описание работ не указано.</p>)}{(view.works?.length??0)>3&&<small>Ещё {(view.works?.length??0)-3} вида работ в отчёте</small>}</div>
        {view.incidentHint && <div className="control-card-issue"><span className="control-label"><OwnerIcon name="event"/>Требует внимания</span><p>{view.incidentHint}</p><small>Действие, ответственный и срок не указаны. Состояние решения неизвестно.</small></div>}
        <p className="control-card-check"><OwnerIcon name="review"/>{!view.imported&&!archive&&view.status==='reviewed'?'Отчёт проверен':'Проверка не подтверждена'} · приёмка работ отдельно не подтверждена</p>
        {view.photoCount===0&&<p className="control-card-check"><OwnerIcon name="photo"/>Фото не приложены к отчёту</p>}
        <p className="control-card-check"><OwnerIcon name="calendar"/>Отправлен: {view.submittedLabel||'дата не указана'}</p>
        <ReportSignals works={view.workCount} photos={view.photoCount} events={view.incidentCount} />
        {view.possiblePhotoCount>0 && <small>Другие фото за дату: {view.possiblePhotoCount}</small>}
        <div className="report-card-footer">
          {view.authorLabel && <AuthorBadge id={view.authorId} label={view.authorLabel} />}
          <span className="control-open">Открыть отчёт <OwnerIcon name="arrow"/></span>
        </div>
      </div>
    </button>
  );
}
