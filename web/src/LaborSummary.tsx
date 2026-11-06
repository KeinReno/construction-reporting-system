import type {LaborSummaryData, LaborTotals} from './ownerTypes';

const money = (value:number) => new Intl.NumberFormat('ru-RU', {style:'currency', currency:'RUB'}).format(value / 100);

function AmountCells({row}:{row:LaborTotals}) {
  return <><td>{money(row.base_kopecks)}</td><td>{money(row.allowance_kopecks)}</td><td>{money(row.fine_kopecks)}</td><td>{money(row.total_kopecks)}</td></>;
}

export function LaborSummary({data,loading,siteName,onSources}:{
  data:LaborSummaryData|null;
  loading:boolean;
  siteName:(id:string)=>string;
  onSources:(title:string,ids:string[])=>void;
}) {
  if (!data) return <section className="card" aria-label="Итоги табеля"><p role="status">{loading?'Загрузка итогов табеля…':'Итоги табеля не загружены.'}</p></section>;
  const totals=data.totals;
  return <section className="card labor-summary" aria-label="Итоги табеля">
    <h2>Итоги по внесённым дням</h2>
    <p>Рабочих человеко-дней: <strong>{totals.worked_days}</strong> · Людей: <strong>{totals.worker_count}</strong> · Дней с работой: <strong>{totals.worked_calendar_days}</strong> · Командировочных дней: <strong>{totals.business_trip_days}</strong></p>
    <p className="muted">Нормативные человеко-часы: <strong>{totals.standard_hours}</strong>. Рассчитаны по стандарту сохранённых рабочих дней, фактическое время не подставляется.</p>
    <div className="labor-summary-stats">
      {[
        ['По нормативу',totals.base_kopecks],
        ['Доплаты',totals.allowance_kopecks],
        ['Штрафы',totals.fine_kopecks],
        ['Итог начислений',totals.total_kopecks],
      ].map(([label,value])=><div key={label}><span>{label}</span><strong>{money(value as number)}</strong></div>)}
    </div>
    <p className="muted">Это начисления табеля, не выплаты и не расходный журнал. Рабочий и командировочный день могут совпадать.</p>
    {!totals.record_count?<p>В выбранном периоде нет внесённых дней.</p>:<>
      <h3>По людям</h3>
      <div className="production-table-scroll" tabIndex={0} role="region" aria-label="Итоги по людям">
        <table className="production-table" aria-label="Итоги по людям">
          <thead><tr><th>Человек</th><th>Рабочих дней</th><th>Командировочных</th><th>Норматив, ч</th><th>По нормативу</th><th>Доплаты</th><th>Штрафы</th><th>Итог</th></tr></thead>
          <tbody>{data.by_worker.map(row=><tr key={row.worker_id}>
            <th scope="row"><button type="button" className="production-person" onClick={()=>onSources(row.name,row.source_day_ids)}>{row.name}</button></th>
            <td>{row.worked_days}</td><td>{row.business_trip_days}</td><td>{row.standard_hours}</td><AmountCells row={row}/>
          </tr>)}</tbody>
        </table>
      </div>
      <h3>По объектам</h3>
      <div className="production-table-scroll" tabIndex={0} role="region" aria-label="Итоги по объектам">
        <table className="production-table" aria-label="Итоги по объектам">
          <thead><tr><th>Объект</th><th>Человеко-дней</th><th>Дней с работой</th><th>Норматив, чел.-ч</th><th>Норматив / день, чел.-ч</th><th>По нормативу</th><th>Доплаты</th><th>Штрафы</th><th>Итог</th></tr></thead>
          <tbody>{data.by_site.map(row=><tr key={row.site_id}>
            <th scope="row"><button type="button" className="production-person" onClick={()=>onSources(siteName(row.site_id),row.source_day_ids)}>{siteName(row.site_id)}</button></th>
            <td>{row.worked_days}</td><td>{row.worked_calendar_days}</td><td>{row.standard_hours}</td><td>{row.avg_standard_hours_per_workday?.replace('.',',')??'—'}</td><AmountCells row={row}/>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
