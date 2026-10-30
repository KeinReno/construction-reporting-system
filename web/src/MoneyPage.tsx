import { useEffect, useState } from 'react';
import { allReports, filterQuery, type FinancialEntry, type Report, type Site } from './api';
import { formatDate } from './date';

const kinds = ['expense', 'funding_received', 'advance_issued'] as const;
const kindLabel: Record<(typeof kinds)[number], string> = {
  expense: 'Расход',
  funding_received: 'Поступление',
  advance_issued: 'Аванс',
};

function money(kopecks: number) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(kopecks / 100);
}

export function MoneyPage({
  token,
  siteId,
  authorId,
  fromDate,
  toDate,
  sites,
  siteName,
  onOpen,
}: {
  token: string;
  siteId: string;
  authorId: string;
  fromDate: string;
  toDate: string;
  sites: Site[];
  siteName: (id: string) => string;
  onOpen: (report: Report) => void;
}) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState<'' | FinancialEntry['kind']>('');
  const [category, setCategory] = useState('');
  useEffect(() => {
    let active = true;
    setReports(null);
    setError('');
    void allReports(token, filterQuery(siteId, '', '', authorId))
      .then(list => {
        if (active) setReports(list);
      })
      .catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : 'Не удалось загрузить операции');
      });
    return () => {
      active = false;
    };
  }, [token, siteId, authorId]);
  const invalid = fromDate.startsWith('!') || toDate.startsWith('!');
  const delivered = (reports ?? []).filter(
    report => !!report.receipt_id && ['submitted', 'reviewed', 'needs_revision'].includes(report.status)
  );
  const operations = delivered
    .flatMap(report => (report.data.financial_entries ?? []).map(entry => ({ ...entry, report })))
    .filter(
      entry =>
        !invalid &&
        (!fromDate || entry.operation_date >= fromDate) &&
        (!toDate || entry.operation_date <= toDate)
    )
    .sort((a, b) => b.operation_date.localeCompare(a.operation_date) || b.id.localeCompare(a.id));
  const totals = { expense: 0, funding_received: 0, advance_issued: 0 };
  const counts = { expense: 0, funding_received: 0, advance_issued: 0 };
  for (const entry of operations) {
    totals[entry.kind] += entry.amount_kopecks;
    counts[entry.kind] += 1;
  }
  const categories = [...new Set(operations.map(entry => entry.category))].sort();
  const list = operations.filter(
    entry => (!kind || entry.kind === kind) && (!category || entry.category === category)
  );

  return (
    <section className="money-page" aria-label="Журнал денежных операций">
      <div>
        <span className="crs-eyebrow">Финансовый журнал</span>
        <p className="muted">
          Фильтр дат на этом экране относится к дате операции. Работы в остальных разделах считаются по дате смены.
          Суммы трёх видов не складываются и не образуют остаток.
        </p>
      </div>
      <div className="filters money-filters">
        <label>
          Вид операции
          <select value={kind} onChange={event => setKind(event.target.value as typeof kind)}>
            <option value="">Все виды</option>
            {kinds.map(item => (
              <option value={item} key={item}>
                {kindLabel[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Категория
          <select value={category} onChange={event => setCategory(event.target.value)}>
            <option value="">Все категории</option>
            {categories.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!reports && !error && <p className="empty">Загрузка операций…</p>}
      {reports && (
        <div className="metric-grid">
          {kinds.map(item => (
            <div className="metric" key={item}>
              <span>{kindLabel[item]}</span>
              <strong>{counts[item] ? money(totals[item]) : 'Нет'}</strong>
              <small>
                {counts[item]
                  ? 'Сумма операций по дате операции'
                  : 'Нет операций этого вида. Это не ноль и не остаток.'}
              </small>
            </div>
          ))}
        </div>
      )}
      {reports && (
        <p className="footnote">
          Начальный остаток не задан, поэтому баланс не показывается. Текстовые упоминания сумм из переписки сюда не
          попадают.
        </p>
      )}
      {reports && !list.length && (
        <p className="empty">
          {invalid
            ? 'Исправьте даты фильтра.'
            : 'Нет операций по выбранным условиям. Это не подтверждённый ноль.'}
        </p>
      )}
      {!!list.length && (
        <div className="money-entries">
          <div className="money-entries-head" aria-hidden="true">
            <span>Дата операции</span>
            <span>Объект</span>
            <span>Вид</span>
            <span>Категория</span>
            <span>Сумма</span>
            <span>Пояснение</span>
            <span>Чек</span>
          </div>
          {list.map(entry => (
            <button type="button" className="money-entry" key={entry.id} onClick={() => onOpen(entry.report)}>
              <span>
                <i>Дата операции</i>
                {formatDate(entry.operation_date)}
              </span>
              <span>
                <i>Объект</i>
                {siteName(entry.report.site_id)}
              </span>
              <span>
                <i>Вид</i>
                <span className={`money-kind-chip kind-${entry.kind}`}>{kindLabel[entry.kind]}</span>
              </span>
              <span>
                <i>Категория</i>
                {entry.category}
              </span>
              <span className="num">
                <i>Сумма</i>
                {money(entry.amount_kopecks)}
              </span>
              <span>
                <i>Пояснение</i>
                {entry.description || 'Без пояснения'}
                {entry.operation_date !== entry.report.data.work_date
                  ? ` · дата операции ${formatDate(entry.operation_date)}, отчёт ${formatDate(entry.report.data.work_date)}`
                  : ''}
              </span>
              <span>
                <i>Чек</i>
                {entry.receipt_photo_id ? 'Есть' : 'Нет'}
              </span>
            </button>
          ))}
        </div>
      )}
      {!sites.length && <p className="empty">Нет назначенных объектов.</p>}
    </section>
  );
}
