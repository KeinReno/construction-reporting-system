import { useState } from 'react';
import type { Report } from './api';
import { formatDate } from './date';
import { OwnerIcon } from './ui/OwnerIcon';

export function OwnerActivity({ reports, siteName, onOpen }: { reports: Report[]; siteName: (id:string)=>string; onOpen: (report:Report)=>void }) {
  const [selected, setSelected] = useState<string|null>(null);
  const months = new Map<string,Report[]>();
  for (const report of reports) {
    const month=report.data.work_date.slice(0,7);
    const bucket=months.get(month) ?? [];
    bucket.push(report);
    months.set(month,bucket);
  }
  // Six consecutive calendar months, including explicit gaps with no reports.
  const now=new Date();
  const entries: Array<[string,Report[]]> = Array.from({length:6},(_,index)=>{
    const first=new Date(Date.UTC(now.getFullYear(),now.getMonth()-5+index,1));
    const key=first.toISOString().slice(0,7);
    return [key,months.get(key)??[]];
  });
  const max=Math.max(1,...entries.map(([,items])=>items.length));
  const current=selected && entries.some(([key])=>key===selected) ? months.get(selected) : undefined;
  const label=(key:string)=>new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${key}-01T12:00:00Z`));
  const shortMonth=(key:string)=>new Intl.DateTimeFormat('ru-RU',{month:'short',timeZone:'UTC'}).format(new Date(`${key}-01T12:00:00Z`)).replace(/\.$/,'');
  return <section className="owner-activity" aria-label="Отчёты по месяцам">
    <div className="owner-widget-heading"><span className="owner-widget-icon"><OwnerIcon name="chart"/></span><div><h2>Отчёты по месяцам</h2><p>Последние 6 месяцев</p></div></div>
    {entries.some(([,items])=>items.length) ? <>
      <div className="owner-activity-chart" aria-label="Количество полученных отчётов">
        {entries.map(([key,items])=><button type="button" key={key} className="owner-activity-column" disabled={!items.length} aria-pressed={selected===key} aria-label={`${label(key)}: полученных отчётов ${items.length}`} onClick={()=>setSelected(selected===key?null:key)}>
          <span className="owner-activity-value">{items.length}</span><span className="owner-activity-track"><span className="owner-activity-fill" style={{height:`${Math.max(4,items.length/max*100)}%`}}/></span><span className="owner-activity-label"><span>{shortMonth(key)}</span><span>{key.slice(2,4)}</span></span>
        </button>)}
      </div>

      {current && <div className="owner-activity-sources" aria-label="Отчёты выбранного месяца"><div className="owner-activity-source-head"><strong>{label(selected!)}</strong><button type="button" className="link-button" onClick={()=>setSelected(null)}>Закрыть</button></div>{[...current].sort((a,b)=>b.data.work_date.localeCompare(a.data.work_date)).map(report=><button type="button" key={report.id} onClick={()=>onOpen(report)}><span>{formatDate(report.data.work_date)} · {siteName(report.site_id)}</span><OwnerIcon name="arrow"/></button>)}</div>}
    </> : <p className="owner-activity-empty">Нет отчётов за последние шесть месяцев.</p>}
  </section>;
}
