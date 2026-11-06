import { useMemo, useState } from 'react';
import { type Production, type ProductionCalendarDay } from './api';
import { formatDate } from './date';
import { OwnerIcon } from './ui/OwnerIcon';
import './design/production-analytics.css';

// One colour per big indicator; the same key set is produced by the server classifier.
const KIND_COLORS: Record<string, string> = {
  concrete: '#7fb2c9', blocks: '#c9a27f', belt: '#e0c46a', metal: '#9aa7c9', welding: '#b695c9', mesh: '#85c79a', logistics: '#c98f8f',
};
const kindColor = (key:string) => KIND_COLORS[key] ?? `hsl(${Array.from(key).reduce((n,c)=>(n*31+c.charCodeAt(0))%360,0)} 45% 70%)`;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const STATE_LABEL: Record<ProductionCalendarDay['state'], string> = { work: 'Отработан', rest: 'Работ не было', no_report: 'Отчёта нет' };

const monthKey = (iso: string) => iso.slice(0, 7);
const monthTitle = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

function dayAria(day: ProductionCalendarDay): string {
  const parts = [formatDate(day.date), STATE_LABEL[day.state]];
  if (day.kind_labels.length) parts.push('Работы: ' + day.kind_labels.join(', '));
  if (Number(day.hours)) parts.push(`Техника ${day.hours} ч`);
  if (day.weather.length) parts.push('Погода: ' + day.weather.join(', '));
  if (day.areas.length) parts.push(day.areas.join(', '));
  if (day.reason) parts.push(day.reason);
  return parts.join('. ');
}

export function AnalyticsProduction({ production, ready, error, siteName, onOpen, onSources }: {
  production: Production | null; ready: boolean; error: boolean;
  siteName: (id: string) => string; onOpen: (id: string) => void; onSources: (title: string, ids: string[]) => void;
}) {
  const months = useMemo(() => Array.from(new Set((production?.calendar ?? []).map(day => monthKey(day.date)))).sort(), [production]);
  const lastWorked = useMemo(() => (production?.calendar ?? []).filter(day => day.state === 'work').at(-1), [production]);
  const [month, setMonth] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const activeMonth = month && months.includes(month) ? month : (lastWorked ? monthKey(lastWorked.date) : months.at(-1)) ?? '';
  const calendar = production?.calendar ?? [];
  const shown = calendar.filter(day => monthKey(day.date) === activeMonth);
  const index = months.indexOf(activeMonth);
  const step = (delta: number) => {
    const next = months[index + delta];
    if (next) { setMonth(next); setOpenDay(null); }
  };
  const detail = openDay ? calendar.find(day => day.date === openDay) ?? null : null;
  const firstOffset = shown.length ? (new Date(`${shown[0].date}T12:00:00`).getDay() + 6) % 7 : 0;

  if (!production) return <section className="card production-empty" role={error ? 'alert' : 'status'}>{error ? 'Данные производства не загружены. Повторите загрузку кнопкой «Обновить».' : !ready ? 'Загрузка данных производства…' : 'Данных производства нет.'}</section>;

  return <div className="production-analytics">
    <section className="card production-calendar-card" aria-label="Календарь смен">
      <div className="production-head">
        <div><h2>Календарь смен</h2><p className="muted">Отработанные дни, выходные и основные виды работ. Нажмите на день, чтобы открыть его аналитику.</p></div>
        <div className="production-month-nav">
          <button type="button" className="quiet" onClick={() => step(-1)} disabled={index <= 0} aria-label="Предыдущий месяц">←</button>
          <strong>{activeMonth ? monthTitle(activeMonth) : 'Нет дат'}</strong>
          <button type="button" className="quiet" onClick={() => step(1)} disabled={index < 0 || index >= months.length - 1} aria-label="Следующий месяц">→</button>
        </div>
      </div>
      <div className="production-legend" aria-label="Обозначения календаря">
        {production?.work_kinds.filter(kind => kind.day_count).map(kind => <span key={kind.key}><i style={{ background: kindColor(kind.key) }} />{kind.label} · {kind.day_count} дн.</span>)}
        <span className="production-legend-rest"><i className="is-rest" />Работ не было</span>
        <span className="production-legend-empty"><i className="is-empty" />Нет отчёта</span>
      </div>
      {shown.length ? <div className="production-calendar">
        <div className="production-calendar-week">{WEEKDAYS.map((label, i) => <span key={label} className={i >= 5 ? 'is-weekend' : ''}>{label}</span>)}</div>
        <div className="production-calendar-grid">
          {Array.from({ length: firstOffset }, (_, i) => <span className="production-calendar-blank" key={`blank-${i}`} />)}
          {shown.map(day => <button type="button" key={day.date}
            className={`production-day is-${day.state}${day.is_weekend ? ' is-weekend' : ''}${openDay === day.date ? ' is-open' : ''}`}
            aria-pressed={openDay === day.date} aria-label={dayAria(day)}
            onClick={() => setOpenDay(openDay === day.date ? null : day.date)}>
            <b>{Number(day.date.slice(8, 10))}</b>
            <span className="production-day-marks">
              {day.kinds.map(key => <i key={key} style={{ background: kindColor(key) }} />)}
              {!day.kinds.length && day.state !== 'rest' && <em>·</em>}
            </span>
            <span className="production-day-badges">
              {Number(day.hours) > 0 && <small>{day.hours}ч</small>}
              {day.weather.length > 0 && <small title="Погода">☂</small>}
              {day.people.length > 0 && <small>{day.people.length}</small>}
            </span>
          </button>)}
        </div>
      </div> : <p className="empty">В этом месяце отчётов нет.</p>}

      {detail && <div className="production-day-detail" aria-live="polite">
        <div className="production-day-detail-head">
          <h3>{formatDate(detail.date)}</h3>
          <span className={`production-state is-${detail.state}`}>{STATE_LABEL[detail.state]}</span>
          <button type="button" className="link-button" onClick={() => setOpenDay(null)}>Закрыть день</button>
        </div>
        {detail.reason && <p className="production-day-line">Причина: {detail.reason}</p>}
        {detail.kind_labels.length > 0 && <p className="production-day-line"><strong>Основные работы:</strong> {detail.kind_labels.join(', ')}</p>}
        {detail.aux.length > 0 && <p className="production-day-line"><strong>Вспомогательные:</strong> {detail.aux.join(', ')}</p>}
        {detail.other.length > 0 && <p className="production-day-line"><strong>Другие виды:</strong> {detail.other.join(', ')}</p>}
        {detail.areas.length > 0 && <p className="production-day-line"><strong>Трансформатор:</strong> {detail.areas.map(a => a === 'не указано' ? 'не указан' : a).join(', ')}</p>}
        {Number(detail.hours) > 0 && <p className="production-day-line"><strong>Спецтехника:</strong> {detail.equipment.join(', ')} — {detail.hours} ч</p>}
        {detail.weather.length > 0 && <p className="production-day-line"><strong>Погода:</strong> {detail.weather.join(', ')}</p>}
        {detail.people.length > 0 && <p className="production-day-line"><strong>Состав бригады:</strong> {detail.people.join(', ')}</p>}
        {detail.report_ids.length ? <div className="production-day-reports">
          {detail.report_ids.map((id, i) => <button type="button" className="quiet" key={id} onClick={() => onOpen(id)}>Отчёт {i + 1} <OwnerIcon name="arrow" /></button>)}
          {detail.report_ids.length > 1 && <button type="button" className="link-button" onClick={() => onSources(formatDate(detail.date), detail.report_ids)}>Показать все источники дня</button>}
        </div> : <p className="production-day-line muted">Отчётов за этот день нет: это отсутствие данных, а не подтверждённый выходной.</p>}
      </div>}
    </section>

    <section className="card production-kinds-card">
      <div className="production-head"><div><h2>Дни по основным видам работ</h2><p className="muted">Сколько смен дал каждый крупный показатель и что к нему относилось.</p></div></div>
      <div className="production-stats">
        <div><span className="control-label">Отработано дней</span><strong>{production?.workday_count ?? 0}</strong><small>По дням с отправленным отчётом о работах</small></div>
        <div><span className="control-label">Дней без работ</span><strong>{production?.rest_day_count ?? 0}</strong><small>Отчёт «работ не было» или явная запись</small></div>
        <div><span className="control-label">Дней без отчёта</span><strong>{calendar.filter(d => d.state === 'no_report').length}</strong><small>Не равно «не работали»</small></div>
      </div>
      <div className="production-table-scroll" tabIndex={0} role="region" aria-label="Таблица производства"><table className="production-table">
        <thead><tr><th>Вид работ</th><th>Дней</th><th>Отчётов</th><th>Т1</th><th>Т2</th><th>Не указан</th><th>Вспомогательные работы</th></tr></thead>
        <tbody>{production?.work_kinds.map(kind => {
          const area = (name: string) => kind.areas.find(item => item.area === name)?.day_count ?? 0;
          return <tr key={kind.key}>
            <th scope="row"><button type="button" className="production-kind" disabled={!kind.day_count}
              onClick={() => onSources(kind.label, kind.source_report_ids)}>
              <i style={{ background: kindColor(kind.key) }} /><span>{kind.label}</span></button></th>
            <td>{kind.day_count}</td><td>{kind.report_count}</td>
            <td>{area('Т1')}</td><td>{area('Т2')}</td><td>{area('не указано')}</td>
            <td className="production-aux">{kind.aux.length ? kind.aux.map(item => <span key={item.label}>{item.label} <b>{item.day_count}</b></span>) : '—'}</td>
          </tr>;
        })}</tbody>
      </table></div>
      <div className="production-table-scroll" tabIndex={0} role="region" aria-label="Таблица производства"><table className="production-table production-table-secondary">
        <thead><tr><th>Другие виды работ</th><th>Дней</th><th>Что входило</th></tr></thead>
        <tbody>{production?.other_kinds.map(kind => <tr key={kind.key}>
          <th scope="row">{kind.label}</th><td>{kind.day_count}</td>
          <td className="production-aux">{kind.works.map(item => <span key={item.label}>{item.label} <b>{item.day_count}</b></span>)}</td>
        </tr>)}</tbody>
      </table></div>
      {!!production?.uncategorized.length && <p className="muted production-note">Формулировок, которые классификатор не отнёс ни к одному виду, {production.uncategorized.length}: {production.uncategorized.slice(0, 5).map(item => item.samples[0]).join('; ')}{production.uncategorized.length > 5 ? '…' : ''}</p>}
    </section>

    <section className="card production-days-card">
      <div className="production-head"><div><h2>Дни на объектах</h2><p className="muted">Дни с работами и без работ по каждому объекту, часы заявленной техники.</p></div></div>
      <div className="production-table-scroll" tabIndex={0} role="region" aria-label="Таблица производства"><table className="production-table">
        <thead><tr><th>Объект</th><th>Отработано дней</th><th>Без работ</th><th>Часы техники</th></tr></thead>
        <tbody>{production?.sites.map(site => <tr key={site.site_id}>
          <th scope="row">{siteName(site.site_id)}</th><td>{site.work_days}</td><td>{site.rest_days}</td><td>{site.equipment_hours}</td>
        </tr>)}</tbody>
      </table></div>
      {production && !!production.calendar.length && <p className="muted production-note">Календарных дней показано: {production.calendar.length}{production.period.calendar_truncated ? ' (список обрезан лимитом; итоги рассчитаны по всей выборке)' : ''}.</p>}
    </section>

    <section className="card production-equipment-card">
      <div className="production-head"><div><h2>Спецтехника: дни и часы</h2><p className="muted">Часы заявлены отправителем и подняты из первичных текстов, в итоги объёмов не входят.</p></div></div>
      <div className="production-stats">
        <div><span className="control-label">Всего часов</span><strong>{production?.equipment.total_hours ?? '0'}</strong><small>По машинам с указанным видом</small></div>
        <div><span className="control-label">Среднее на день техники</span><strong>{production?.equipment.avg_hours_per_equipment_day ?? '—'}</strong><small>{production?.equipment.day_count ?? 0} дней с указанной техникой</small></div>
        <div><span className="control-label">Среднее на отработанный день</span><strong>{production?.equipment.avg_hours_per_workday ?? '—'}</strong><small>Часы делены на {production?.workday_count ?? 0} рабочих дней</small></div>
      </div>
      <div className="production-table-scroll" tabIndex={0} role="region" aria-label="Таблица производства"><table className="production-table">
        <thead><tr><th>Техника</th><th>Дней</th><th>Часы</th><th>Наёмная / своя / не указана</th></tr></thead>
        <tbody>{production?.equipment.hours_by_type.map(item => <tr key={item.type}>
          <th scope="row">{item.type}</th><td>{item.day_count}</td><td>{item.hours}</td>
          <td>{item.hired_days} / {item.own_days} / {item.ownership_not_stated_days}</td>
        </tr>)}</tbody>
      </table></div>
      {production && Number(production.equipment.unassigned_hours) > 0 && <p className="muted production-note">{production.equipment.unassigned_hours} ч заявлены строкой «Работа спецтехники» без вида техники и в строки по машинам не перенесены.</p>}
    </section>

    <section className="card production-people-card">
      <div className="production-head"><div><h2>Отработанные дни каждого человека</h2><p className="muted">Состав бригады в написании автора. Дни считаются как уникальные даты смен, а не как число отчётов.</p></div></div>
      <div className="production-table-scroll" tabIndex={0} role="region" aria-label="Таблица производства"><table className="production-table">
        <thead><tr><th>Человек</th><th>Дней</th><th>Часы, если указаны</th><th>Первый и последний день</th><th>Объектов</th></tr></thead>
        <tbody>{production?.people.map(person => <tr key={person.person}>
          <th scope="row"><button type="button" className="production-person" onClick={() => onSources(person.name + (person.is_group ? ' (группа)' : ''), person.source_report_ids)}>{person.name}{person.is_group && <em> группа, не человек</em>}{person.is_temporary && <em> временный сотрудник</em>}</button></th>
          <td>{person.day_count}</td><td>{person.hours ?? '—'}</td>
          <td>{formatDate(person.first_date)} — {formatDate(person.last_date)}</td><td>{person.site_count}</td>
        </tr>)}</tbody>
      </table></div>
      {!!production?.people_requires_check.length && <p className="muted production-note">Написать похоже, но не объединено автоматически: {production.people_requires_check.map(item => `${item.names.join(' и ')} (${item.days.join(' и ')} дн.)`).join('; ')}.</p>}
    </section>

    <section className="card production-weather-card">
      <div className="production-head"><div><h2>Погода в сменах</h2><p className="muted">Отмечено только там, где погода названа прямо. Отсутствие записи не означает ясную погоду.</p></div></div>
      {production?.weather.length ? <ul className="production-weather">{production.weather.map(item => <li key={item.condition}>
        <strong>{item.label}</strong><span>{item.days.map(date => formatDate(date)).join(', ')}</span><small>{item.days.length} дн.</small>
      </li>)}</ul> : <p className="empty">В выбранной выборке погода не упоминалась.</p>}
    </section>

    {!!production?.limitations.length && <details className="production-limits"><summary>Что учтено и чего здесь нет</summary><ul>{production.limitations.map(item => <li key={item}>{item}</li>)}</ul></details>}
  </div>;
}
