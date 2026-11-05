import { useEffect, useId, useRef, useState } from 'react';

export type CrOption = { value: string; label: string };

/** Native-select contract with an optional searchable popover.
 * Keeping the select means browser automation, keyboard navigation and forms remain reliable.
 */
export function CrCombobox({
  label, value, options, onChange, placeholder = 'Выберите значение',
}: {
  label: string;
  value: string;
  options: CrOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const visible = options.filter(option => option.label.toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU')));

  useEffect(() => {
    function onOutside(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false); setSearch(''); setActive(0);
      }
    }
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, []);
  function choose(option: CrOption) {
    onChange(option.value);
    setOpen(false); setSearch(''); setActive(0);
  }
  return (
    <div ref={root} className="crs-combobox-field">
      <label htmlFor={id}>{label}</label>
      <div className="crs-combobox">
        <select id={id} value={value} onChange={event => onChange(event.target.value)} aria-label={label}>
          {options.length ? options.map(option => <option value={option.value} key={option.value}>{option.label}</option>) : <option value="">{placeholder}</option>}
        </select>
        <button type="button" className="crs-combobox-arrow"
          aria-label="Поиск по списку" aria-expanded={open}
          aria-controls={`${id}-search`} title={`Поиск: ${label}`}
          onClick={() => {setOpen(!open);setSearch('');setActive(0);if(!open) requestAnimationFrame(()=>searchInput.current?.focus());}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
        </button>
        {open && <div className="crs-combobox-popover" id={`${id}-search`}>
          <input ref={searchInput} type="search" placeholder="Найти…" aria-label={`Найти: ${label}`}
            value={search}
            onChange={event=>{setSearch(event.target.value);setActive(0);}}
            onKeyDown={event=>{
              if(event.key==='Escape'){event.preventDefault();setOpen(false);}
              if(event.key==='ArrowDown'){event.preventDefault();setActive(index=>Math.min(Math.max(0,visible.length-1),index+1));}
              if(event.key==='ArrowUp'){event.preventDefault();setActive(index=>Math.max(0,index-1));}
              if(event.key==='Enter' && visible[active]){event.preventDefault();choose(visible[active]);}
            }}/>
          <div className="crs-combobox-list" role="listbox" aria-label={`Результаты: ${label}`}>
            {visible.length ? visible.map((option,index)=>(
              <button type="button" role="option" key={option.value}
                className={`crs-combobox-option${index===active?' active':''}`}
                aria-selected={value===option.value}
                onMouseEnter={()=>setActive(index)}
                onClick={()=>choose(option)}>
                <span>{option.label}</span>{value===option.value && <span aria-hidden="true">✓</span>}
              </button>
            )) : <p className="crs-combobox-empty">Ничего не найдено</p>}
          </div>
        </div>}
      </div>
    </div>
  );
}
