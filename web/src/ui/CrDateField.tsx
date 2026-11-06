import { useId } from 'react';
import { formatDate, parseDisplayDate } from '../date';

export function CrDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const errorId = useId();
  const invalid = value.startsWith('!');
  const display = invalid ? value.slice(1) : formatDate(value);
  return (
    <label className="crs-date-field">
      <span>{label}</span>
      <span className="crs-date-control">
        <input
          type="text"
          inputMode="numeric"
          placeholder="дд/мм/гггг"
          aria-label={label}
          aria-describedby={invalid ? errorId : undefined}
          aria-invalid={invalid}
          value={display}
          onChange={event => {
            const text = event.target.value;
            onChange(!text ? '' : parseDisplayDate(text) ?? '!' + text);
          }}
        />
        <input
          type="date"
          aria-label={`Выбрать дату: ${label}`}
          className="crs-date-native"
          value={invalid ? '' : value}
          onChange={event => onChange(event.target.value)}
          max="9999-12-31"
        />
      </span>
      {invalid && <small id={errorId} className="date-error">Введите дату дд/мм/гггг</small>}
    </label>
  );
}
