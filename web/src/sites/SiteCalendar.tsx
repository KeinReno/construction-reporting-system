import { useMemo, useState } from 'react';
import { reportViewData, reportWorkState, type Report } from '../api';
import { formatDate } from '../date';
import { primaryWorks } from '../reports/reportView';
import '../design/production-analytics.css';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

function monthOf(iso: string) {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 };
}

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function shift(cursor: { year: number; month: number }, delta: number) {
  const date = new Date(cursor.year, cursor.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function SiteCalendar({ reports, onOpen }: { reports: Report[]; onOpen: (report: Report) => void }) {
  const latest = [...reports].sort((a, b) => b.data.work_date.localeCompare(a.data.work_date))[0];
  const today = new Date();
  const initial = latest ? monthOf(latest.data.work_date) : { year: today.getFullYear(), month: today.getMonth() };
  const [cursor, setCursor] = useState(initial);
  const [choice, setChoice] = useState<string | null>(null);
  const byDate = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const report of reports) {
      const list = map.get(report.data.work_date) ?? [];
      list.push(report);
      map.set(report.data.work_date, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.revision - a.revision);
    return map;
  }, [reports]);
  const days = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const offset = (new Date(cursor.year, cursor.month, 1).getDay() + 6) % 7;
  const chosen = choice ? byDate.get(choice) ?? [] : [];

  function openDay(date: string, dayReports: Report[]) {
    if (dayReports.length === 1) onOpen(dayReports[0]);
    else setChoice(date);
  }

  return <section className="site-calendar" aria-label="Календарь объекта">
    <div className="production-head">
      <div>
        <h3>Календарь работ</h3>
        <p className="muted">Отмечены дни с работами и выходные. Нажмите день с отчётом, чтобы открыть его.</p>
      </div>
      <div className="production-month-nav">
        <button type="button" className="quiet" aria-label="Предыдущий месяц" onClick={() => { setCursor(shift(cursor, -1)); setChoice(null); }}>←</button>
        <strong>{MONTHS[cursor.month]} {cursor.year}</strong>
        <button type="button" className="quiet" aria-label="Следующий месяц" onClick={() => { setCursor(shift(cursor, 1)); setChoice(null); }}>→</button>
      </div>
    </div>
    <div className="production-legend" aria-label="Обозначения календаря">
      <span className="production-legend-work"><i className="is-work" />Работы</span>
      <span className="production-legend-rest"><i className="is-rest" />Выходной</span>
      <span className="production-legend-empty"><i className="is-empty" />Нет отчёта</span>
    </div>
    <div className="production-calendar">
      <div className="production-calendar-week">{WEEKDAYS.map((label, index) => <span key={label} className={index >= 5 ? 'is-weekend' : ''}>{label}</span>)}</div>
      <div className="production-calendar-grid">
        {Array.from({ length: offset }, (_, index) => <span className="production-calendar-blank" key={`blank-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const date = iso(cursor.year, cursor.month, index + 1);
          const dayReports = byDate.get(date) ?? [];
          const weekend = new Date(cursor.year, cursor.month, index + 1).getDay() % 6 === 0;
          const worked = dayReports.some(report => reportWorkState(report) === 'work');
          const rested = dayReports.some(report => reportWorkState(report) === 'no_work');
          const state = worked ? 'work' : rested || weekend ? 'rest' : 'no_report';
          const reason = dayReports.map(report => reportViewData(report).no_work_reason).find(Boolean);
          const label = [formatDate(date), state === 'work' ? 'были работы' : state === 'rest' && rested ? `выходной: ${reason || 'работ не было'}` : state === 'rest' ? 'выходной' : 'отчёта нет', dayReports.length ? 'открыть отчёт' : ''].filter(Boolean).join('. ');
          return <button type="button" key={date} disabled={!dayReports.length}
            className={`production-day is-${state === 'no_report' ? 'no_report' : state}${weekend ? ' is-weekend' : ''}`}
            aria-label={label}
            onClick={() => openDay(date, dayReports)}>
            <b>{index + 1}</b>
            <span className="production-day-marks">{worked ? <i className="is-work" /> : state === 'rest' ? <i className="is-rest" /> : <em>·</em>}</span>
          </button>;
        })}
      </div>
    </div>
    {!!chosen.length && <div className="production-day-detail" aria-live="polite">
      <div className="production-day-detail-head">
        <h3>{formatDate(choice || '')}</h3>
        <button type="button" className="link-button" onClick={() => setChoice(null)}>Закрыть</button>
      </div>
      <p>За этот день несколько отчётов. Откройте нужный.</p>
      <div className="production-day-reports">{chosen.map(report => {
        const works = primaryWorks(report);
        const data = reportViewData(report);
        const text = reportWorkState(report) === 'no_work' ? `Выходной: ${data.no_work_reason || 'причина не указана'}` : works.map(work => work.description || work.type).slice(0, 2).join('; ') || 'Работы не указаны';
        return <button type="button" className="quiet" key={report.id} onClick={() => onOpen(report)}>{text}</button>;
      })}</div>
    </div>}
  </section>;
}
