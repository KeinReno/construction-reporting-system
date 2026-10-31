import { useId } from 'react';

export function CrSearchField({
  label, value, onChange, placeholder = 'Поиск', className = '',
}: {
  label: string; value: string; onChange: (value:string)=>void; placeholder?: string; className?: string;
}) {
  const id = useId();
  return <label className={`crs-search-field ${className}`.trim()} htmlFor={id}>
    <span>{label}</span>
    <span className="crs-search-control">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
      <input id={id} type="search" value={value} onChange={event=>onChange(event.target.value)} placeholder={placeholder} />
      {value && <button type="button" className="crs-search-clear" onClick={()=>onChange('')} aria-label={`Очистить: ${label}`}>×</button>}
    </span>
  </label>;
}
