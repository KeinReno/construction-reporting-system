import { useEffect, useState } from 'react';
import { allReports, filterQuery, reportViewData, type FinancialEntry, type Report, type Site } from './api';
import { formatDate } from './date';
import { CrCombobox } from './ui/CrCombobox';
import { CrSkeleton } from './ui/CrSkeleton';

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
  const invalid = fromDate.startsWith('!') || toDate.startsWith('!') || (!!fromDate && !!toDate && fromDate > toDate);
  const delivered = (reports ?? []).filter(
    report => !!report.receipt_id && ['submitted', 'reviewed', 'needs_revision'].includes(report.status)
  );
  const operations = delivered
    .flatMap(report => (reportViewData(report).financial_entries ?? []).map(entry => ({ ...entry, report })))
    .filter(
      entry =>
        !invalid &&
        (!fromDate || entry.operation_date >= fromDate) &&
        (!toDate || entry.operation_date <= toDate)
    )
    .sort((a, b) => b.operation_date.localeCompare(a.operation_date) || b.id.localeCompare(a.id));
  const categories = [...new Set(operations.map(entry => entry.category))].sort();
  const list = operations.filter(entry => (!kind || entry.kind === kind) && (!category || entry.category === category));
  const totals = { expense: 0, funding_received: 0, advance_issued: 0 };
  const counts = { expense: 0, funding_received: 0, advance_issued: 0 };
  for (const entry of list) {
    totals[entry.kind] += entry.amount_kopecks;
    counts[entry.kind] += 1;
  }

  // Integers remain kopecks throughout aggregation; the bar width is a display-only ratio.
  const expenseByCategory = new Map<string,bigint>();
  for (const entry of operations) if (entry.kind === 'expense' && (!kind || kind === 'expense')) {
    expenseByCategory.set(entry.category,(expenseByCategory.get(entry.category) ?? 0n) + BigInt(entry.amount_kopecks));
  }
  const expenseBars = [...expenseByCategory].sort((a,b)=>a[1]===b[1] ? a[0].localeCompare(b[0],'ru') : a[1]>b[1] ? -1 : 1);
  const maximumExpense = expenseBars[0]?.[1] ?? 1n;
  const formatKopecks = (value:bigint) => `${new Intl.NumberFormat('ru-RU').format(value/100n)},${String(value%100n).padStart(2,'0')} ₽`;

  return (
    <section className="money-page" aria-label="Журнал денежных операций">
      <div className="owner-money-heading"><h2>Денежные операции</h2><p className="muted">Период по дате операции · {fromDate && !fromDate.startsWith('!') ? formatDate(fromDate) : 'начало'} — {toDate && !toDate.startsWith('!') ? formatDate(toDate) : 'без ограничения'}</p></div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!reports && !error && <CrSkeleton rows={5} label="Загрузка денежных операций" />}
      {reports && !invalid && (
        <div className="metric-grid crs-money-kpis">
          {kinds.map(item => (
            <div className="metric" key={item}>
              <span>{kindLabel[item]}</span>
              <strong>{counts[item] ? money(totals[item]) : 'Нет'}</strong>
              <small>
                {counts[item]
                  ? `${counts[item]} записей · по выбранным условиям`
                  : 'Нет операций'}
              </small>
            </div>
          ))}
        </div>
      )}
      {reports && !invalid && expenseBars.length>0 && <section className="owner-expense-breakdown" aria-label="Расходы по категориям">
        <div className="owner-section-heading"><h3>Расходы по категориям</h3><span>Нажмите на категорию, чтобы отфильтровать операции</span></div>
        {expenseBars.map(([name,amount])=><button key={name} type="button" className="owner-expense-row" aria-pressed={category===name} onClick={()=>setCategory(category===name?'':name)}><span>{name}</span><span className="owner-expense-track" aria-hidden="true"><span style={{width:`${Number(amount*100n/maximumExpense)}%`}}/></span><strong>{formatKopecks(amount)}</strong></button>)}

      </section>}
      <div className="filters money-filters">
        <CrCombobox label="Вид операции" value={kind} onChange={value=>setKind(value as typeof kind)} options={[{value:'',label:'Все виды'},...kinds.map(item=>({value:item,label:kindLabel[item]}))]}/>
        <CrCombobox label="Категория" value={category} onChange={setCategory} options={[{value:'',label:'Все категории'},...categories.map(item=>({value:item,label:item}))]}/>
      </div>


      {reports && !list.length && (
        <div className="crs-money-empty" role="status">
          <span className="crs-money-empty-icon" aria-hidden="true">∅</span>
          <div>
            <strong>{invalid ? 'Проверьте период' : 'Нет зарегистрированных операций'}</strong>
            <p className="empty">{invalid
              ? 'Исправьте даты фильтра.'
              : 'Нет операций по выбранным условиям.'}</p>
          </div>
        </div>
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
                {entry.date_basis==='report_date'&&<small>Дата отчёта; дата оплаты не указана</small>}
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
