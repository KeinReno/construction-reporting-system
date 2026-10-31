import { useEffect, useId, useRef, useState } from 'react';

export type CrOption = { value: string; label: string };

export function CrCombobox({
  label,
  value,
  options,
  onChange,
  placeholder = 'Выберите значение',
}: {
  label: string;
  value: string;
  options: CrOption[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find(option => option.value === value);
  const visible = options.filter(option => option.label.toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU')));
  useEffect(() => {
    function closeOnOutside(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('pointerdown', closeOnOutside);
    return () => document.removeEventListener('pointerdown', closeOnOutside);
  }, []);
  function select(option: CrOption) {
    onChange(option.value);
    setSearch('');
    setOpen(false);
    setActive(0);
    input.current?.blur();
  }
  return (
    <div ref={root} className="crs-combobox-field">
      <label htmlFor={id}>{label}</label>
      <div className="crs-combobox">
        <input
          id={id}
          ref={input}
          type="search"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={`${id}-list`}
          aria-activedescendant={open && visible[active] ? `${id}-option-${active}` : undefined}
          placeholder={selected?.label || placeholder}
          value={open ? search : (selected?.label || '')}
          onFocus={() => {setOpen(true);setSearch('');setActive(0);}}
          onChange={event => {setSearch(event.target.value);setOpen(true);setActive(0);}}
          onKeyDown={event => {
            if (event.key === 'Escape') {setOpen(false);setSearch('');input.current?.blur();}
            if (event.key === 'ArrowDown') {event.preventDefault();setOpen(true);setActive(index => Math.min(visible.length-1, index+1));}
            if (event.key === 'ArrowUp') {event.preventDefault();setActive(index => Math.max(0,index-1));}
            if (event.key === 'Enter' && open && visible[active]) {event.preventDefault();select(visible[active]);}
          }}
        />
        <button type="button" className="crs-combobox-arrow"
          aria-label={`Показать варианты: ${label}`}
          aria-expanded={open} onClick={() => {setOpen(!open);setSearch('');setActive(0);if (!open) input.current?.focus();}}>
          <span aria-hidden="true">⌄</span>
        </button>
        {open && <div className="crs-combobox-popover">
          <div id={`${id}-list`} role="listbox" aria-label={label} className="crs-combobox-list">
            {visible.length ? visible.map((option,index) => (
              <div
                id={`${id}-option-${index}`}
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={`crs-combobox-option${index === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => select(option)}
              >
                <span>{option.label}</span>
                {option.value === value && <span aria-hidden="true">✓</span>}
              </div>
            )) : <span className="crs-combobox-empty">Ничего не найдено</span>}
          </div>
        </div>}
      </div>
    </div>
  );
}
