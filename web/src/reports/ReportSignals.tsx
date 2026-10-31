import {createContext, useContext, useMemo, type CSSProperties, type ReactNode} from 'react';
import type {ReportAuthor} from '../api';

const colors = ['#8cc8ed','#d2a9ed','#83d1b0','#efb18d','#dfc87e','#e59fac','#aab7f4','#a5cf82'];
const AuthorColors = createContext<Record<string,string>>({});
function colorHash(id:string){let hash=2166136261;for(const char of id)hash=Math.imul(hash ^ char.charCodeAt(0),16777619);return hash >>> 0;}
export function AuthorColorsProvider({authors,children}:{authors:ReportAuthor[];children:ReactNode}) {
  const mapping=useMemo(()=>{const used=new Set<number>();const result:Record<string,string>={};for(const {id} of [...authors].sort((a,b)=>a.id.localeCompare(b.id))){let index=colorHash(id)%colors.length;if(used.size<colors.length){while(used.has(index))index=(index+1)%colors.length;used.add(index);}result[id]=colors[index];}return result;},[authors]);
  return <AuthorColors.Provider value={mapping}>{children}</AuthorColors.Provider>;
}
export function AuthorBadge({id, label, prefix}: {id?: string | null; label: string; prefix?: string}) {
  const mapping = useContext(AuthorColors);
  const color = id ? (mapping[id] || colors[colorHash(id) % colors.length]) : '#aebec0';
  const initial = label.trim().charAt(0).toLocaleUpperCase('ru-RU') || '?';
  return <span className="author-badge" style={{'--author-color': color} as CSSProperties}><span className="author-avatar" aria-hidden="true">{initial}</span><span>{prefix}{label}</span></span>;
}
export function SignalIcon({kind}: {kind:'work'|'photo'|'event'}) {
  const shapes = {work:<><path d="M4 7h16v13H4zM9 7V4h6v3M4 12h16"/></>,photo:<><rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="3"/><path d="M7 6l1-2h4l1 2"/></>,event:<><path d="M12 3 2.8 20h18.4L12 3zM12 9v5M12 17h.01"/></>};
  return <svg className="signal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[kind]}</svg>;
}
export function ReportSignals({works,photos,events}: {works:number;photos:number;events:number}) {
  return <span className="report-signals" aria-label="Состав отчёта"><span><SignalIcon kind="work"/>Работы: {works}</span><span><SignalIcon kind="photo"/>Фото: {photos}</span>{events>0&&<span className="signal-event"><SignalIcon kind="event"/>События: {events}</span>}</span>;
}
