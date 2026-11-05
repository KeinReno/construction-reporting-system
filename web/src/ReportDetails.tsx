import { OwnerIcon } from './ui/OwnerIcon';
import { formatDate, formatTimestamp } from './date';
import { useEffect, useRef, useState } from 'react';
import { http, reportStatusLabels, reportViewData, reportWorkState, equipmentOwnership, type Report } from './api';
import { ReportGallery } from './reports/ReportGallery';
import { ReportStatus } from './reports/ReportStatus';
import { CrDataList } from './ui/CrDataList';
import { primaryWorks } from './reports/reportView';

type Event = { id: string; revision: number; event: string; reason: string | null; occurred_at: string | null };
type HistoricalSource = { source_ref: string; text: string; reported_author: string | null; message_date: string | null };

const eventLabels: Record<string, string> = {
  created: 'Создан',
  edited: 'Изменён',
  submitted: 'Доставлен',
  reviewed: 'Проверен',
  needs_revision: 'Возвращён на уточнение',
};
const moneyKindLabels = { expense: 'Расход', funding_received: 'Поступление', advance_issued: 'Выдача аванса' };
const isShiftContext = (text: string) => /^(допуск на площад|дождь$)/i.test(text.trim());
function money(kopecks: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(kopecks / 100);
}

export function ReportDetails({
  report: original,
  token,
  role,
  siteName,
  authorName,
  onClose,
  onChange,
}: {
  report: Report;
  token: string;
  role: string;
  siteName: string;
  authorName: string;
  onClose: () => void;
  onChange: (r: Report) => void;
}) {
  const r={...original,data:reportViewData(original)};
  const active = useRef(true);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    active.current = true;
    title.current?.focus();
    return () => {
      active.current = false;
    };
  }, []);
  const [history, setHistory] = useState<Event[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState<HistoricalSource | null>(null);

  useEffect(() => {
    let alive = true;
    void http<Event[]>(`/reports/${r.id}/history`, token)
      .then(events => {
        if (alive) setHistory(events);
      })
      .catch(e => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [r.id, r.status, r.revision, token]);
  useEffect(() => {
    let alive = true;
    void http<HistoricalSource | null>(`/reports/${r.id}/source`, token)
      .then(value => {
        if (alive) setSource(value);
      })
      .catch(e => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [r.id, token]);

  async function review(decision: string) {
    setBusy(true);
    setError('');
    try {
      const updated = await http<Report>(`/reports/${r.id}/review`, token, {
        method: 'POST',
        body: JSON.stringify({ expected_revision: r.revision, decision, reason: reason || null }),
      });
      if (active.current) onChange(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка проверки');
    } finally {
      setBusy(false);
    }
  }

  const imported = r.origin === 'imported';
  const directPhotos = [...new Set([...(r.data.required_photo_ids || []), ...(r.evidence?.photos || []).filter(p => p.relation === 'same_message').map(p => p.id)])];
  const datePhotos = (r.evidence?.photos || []).filter(p => p.relation === 'same_work_date');
  const describedWorks = primaryWorks(r);
  const shiftContext = r.data.work_entries.filter(work => isShiftContext(work.type));
  const statusLabel = imported ? 'Сохранён' : reportStatusLabels[r.status] ?? 'Неизвестный статус';

  return (
    <section className="report-detail report-dialog" aria-label="Просмотр отчёта">
      <div className="report-page">
        <div className="report-page-header report-dialog-header section-heading">
          <div>
            <h1 ref={title} tabIndex={-1}>Отчёт за {formatDate(r.data.work_date)}</h1>
          </div>
          <button className="quiet" onClick={onClose}>
            ← Назад
          </button>
        </div>

        <div className="report-page-body">
          <div className="report-page-main">
            <CrDataList className="report-meta report-page-meta" items={[
              {label:'Объект',value:<span className="control-heading"><OwnerIcon name="building"/>{siteName}</span>},
              ...(!imported?[{label:'Автор',value:authorName}]:[]),
              {label:'Дата работ',value:formatDate(r.data.work_date)},
              {label:'Отправлен',value:r.submitted_at?formatTimestamp(r.submitted_at):'Дата не указана'},
              {label:'Статус',value:`${statusLabel} · ревизия ${r.revision}`},
            ]}/>

              {!imported && role === 'manager' && r.status === 'submitted' && (
                <section>
                  <h3>Проверка</h3>
                  <label>
                    Причина возврата
                    <input maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
                  </label>
                  <div className="review-actions">
                    <button disabled={busy} className="primary" onClick={() => void review('reviewed')}>
                      Проверен
                    </button>
                    <button
                      disabled={busy || !reason.trim()}
                      className="secondary"
                      onClick={() => void review('needs_revision')}
                    >
                      Вернуть на уточнение
                    </button>
                  </div>
                </section>
              )}

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}

            <div className="control-detail-check"><OwnerIcon name="review"/>{!imported&&r.status==='reviewed'?'Отчёт проверен':'Проверка отчёта не подтверждена'}. Приёмка работ отдельно не подтверждена.</div>
            {!!r.data.incidents?.length&&<section className="control-detail-attention"><h3 className="control-heading"><OwnerIcon name="event"/>Требует внимания</h3>{r.data.incidents.map((e,i)=><p className="report-comment" key={i}>{e.description}</p>)}<div className="control-action"><span>Действие, ответственный и срок: не указаны</span><span>Состояние решения: неизвестно</span></div></section>}
            <section>
              <h3 className="control-heading"><OwnerIcon name="work"/>Выполненные работы</h3>
              {reportWorkState(r) === 'no_work' ? (
                <p>Работ не было: {r.data.no_work_reason}</p>
              ) : describedWorks.length ? (
                describedWorks.map((w, i) => (
                  <div className="report-work" key={i}>
                    <strong>{w.type}</strong>
                    {w.quantity !== null && (
                      <span>
                        {w.quantity} {w.unit || ''}
                      </span>
                    )}
                    {(w.quantity===null||!w.unit)&&<small className="muted">{w.quantity===null?'Объём не указан':'Единица не указана'}</small>}
                    {w.description && w.description !== w.type && <p>{w.description}</p>}
                  </div>
                ))
              ) : (
                <p className="muted">В записи нет описания выполненных работ.</p>
              )}
            </section>

            {r.data.crew && (
              <section>
                <h3>Бригада</h3>
                <p className="report-comment">{r.data.crew}</p>
              </section>
            )}
            <section>
              <h3 className="control-heading"><OwnerIcon name="photo"/>Фотографии ({directPhotos.length})</h3>{directPhotos.length>0&&<p className="muted">Связаны с отчётом. Привязка к отдельным работам не указана.</p>}
              {directPhotos.length ? <ReportGallery ids={directPhotos} token={token} /> : <p className="muted">Фотографии не приложены.</p>}
              {!!datePhotos.length && <details className="owner-date-photos">
                <summary>Другие фото за ту же дату · {datePhotos.length}</summary>
                <ReportGallery ids={datePhotos.map(photo => photo.id)} token={token} />
              </details>}
            </section>

            {!!shiftContext.length && (
              <section>
                <h3>Сведения о смене</h3>
                {shiftContext.map((work, i) => (
                  <p className="report-comment" key={i}>
                    {work.type}
                  </p>
                ))}
              </section>
            )}
            {!!r.data.materials?.length && (
              <section>
                <h3>Материалы</h3>
                {r.data.materials.map((m, i) => (
                  <div className="report-work" key={i}>
                    <strong>{m.name}</strong>
                    <span>
                      {
                        ({ mentioned: 'Упоминание', received: 'Поступило', consumed: 'Израсходовано' } as const)[
                          m.direction || 'mentioned'
                        ]
                      }
                      {(m.quantity !== null || m.unit) &&
                        ` · ${m.quantity !== null ? `${m.quantity} ${m.unit || ''}` : m.unit}`}
                    </span>
                  </div>
                ))}
              </section>
            )}
            {!!r.data.financial_entries?.length && (
              <section>
                <h3>Денежные операции</h3>
                
                {r.data.financial_entries.map(entry => (
                  <div className="report-work" key={entry.id}>
                    <strong>
                      {moneyKindLabels[entry.kind]} · {entry.category}
                    </strong>
                    <span>
                      {money(entry.amount_kopecks)} · {formatDate(entry.operation_date)}
                      {entry.date_basis==='report_date'?' · дата отчёта; дата оплаты отдельно не указана':''}
                    </span>
                    {entry.description && <p>{entry.description}</p>}
                  </div>
                ))}
              </section>
            )}
            {!!r.data.equipment?.length && (
              <section>
                <h3>Спецтехника</h3>
                {r.data.equipment.map((entry, i) => (
                  <div className="report-work" key={i}>
                    <strong>{entry.type}</strong>
                    <span>
                      {entry.hours} ч · {equipmentOwnership(entry.hired)}
                    </span>
                  </div>
                ))}
              </section>
            )}
            {!!r.data.next_shift_plans?.length && (
              <section>
                <h3>План следующей смены</h3>
                <ul>
                  {r.data.next_shift_plans.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
            {!!r.normalization?.pending.length && <section><h3>Дополнительно</h3>{r.normalization.pending.map((item,i)=><div key={i} className="report-work"><p>{item.text}</p></div>)}</section>}
            {!!r.normalization?.shift_context.length && <section><h3>Время и условия смены</h3>{r.normalization.shift_context.map((item,i)=><p key={i}>{item.text}</p>)}</section>}
            {r.data.comment && (
              <section>
                <h3>Комментарий</h3>
                <p className="report-comment">{r.data.comment}</p>
              </section>
            )}

            {source && (
              <details className="owner-report-source">
                <summary><span className="control-label"><OwnerIcon name="reports"/>Текст отчёта</span></summary>
                <p className="muted">
                  {source.message_date && `Дата записи: ${formatDate(source.message_date)}`}
                  {source.reported_author && ` · Автор: ${source.reported_author}`}
                </p>
                <p className="report-comment owner-source-text">{source.text}</p>
              </details>
            )}
            
            




          </div>

          <aside className="report-page-aside">
            <details className="review-panel owner-technical"><summary>История и сведения о доставке</summary>
              <div className="status-block">
                <h3>Состояние</h3>
                <ReportStatus status={r.status} label={statusLabel} archive={imported} />
                <p className="muted" style={{ marginTop: 10 }}>
                  Ревизия {r.revision}
                  {r.receipt_id ? ' · доставлено на сервер' : ' · без квитанции доставки'}
                </p>
              </div>



              {!!r.evidence?.decisions?.length && <section>
                <h3>История объекта</h3>
                <ol>{r.evidence.decisions.map(decision=><li key={decision.id}>
                  Версия {decision.revision}: {({fakel:'Объект принят',not_fakel:'Другой объект',insufficient:'Объект не указан'} as Record<string,string>)[decision.decision] || 'Решение сохранено'} — {decision.reason}
                  <small>{formatTimestamp(decision.created_at)}</small>
                </li>)}</ol>
              </section>}
              <section>
                <h3>История</h3>
                <ol>
                  {history.map(e => (
                    <li key={e.id}>
                      Ревизия {e.revision}: {eventLabels[e.event] ?? 'Неизвестное событие'}{' '}
                      {e.reason && `— ${e.reason}`}{' '}
                      {e.occurred_at && <small>{formatTimestamp(e.occurred_at)}</small>}
                    </li>
                  ))}
                </ol>
              </section>
              {r.receipt_id && <p className="footnote">Квитанция: {r.receipt_id}</p>}
            </details>
          </aside>
        </div>
      </div>
    </section>
  );
}
