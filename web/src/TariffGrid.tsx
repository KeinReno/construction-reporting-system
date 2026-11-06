import { useEffect, useState } from 'react';
import { http } from './api';

type Person = {
  id: string;
  name: string;
  active: boolean;
  rate_kopecks: number;
  travel_kopecks: number;
  bonus_kopecks: number;
  fine_kopecks: number;
  revision: number;
};

const MIN_RATE = 500_000;
const fields = ['rate_kopecks', 'travel_kopecks', 'bonus_kopecks', 'fine_kopecks'] as const;
type Field = (typeof fields)[number];
const labels: Record<Field, string> = {
  rate_kopecks: 'Ставка',
  travel_kopecks: 'Командировочные',
  bonus_kopecks: 'Премия',
  fine_kopecks: 'Штраф',
};

function rubles(kopecks: number) {
  const rub = kopecks / 100;
  return Number.isInteger(rub) ? String(rub) : rub.toFixed(2).replace('.', ',');
}

function kopecks(raw: string) {
  const text = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Укажите сумму в рублях, не больше двух знаков после запятой');
  const [r, k = ''] = text.split('.');
  const n = Number(r) * 100 + Number(k.padEnd(2, '0'));
  if (!Number.isSafeInteger(n) || n > 10_000_000_000) throw new Error('Сумма слишком велика');
  return n;
}

export function TariffGrid({ token, reloadKey = 0 }: { token: string; reloadKey?: number }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Record<Field, string>>>({});
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');

  function remember(list: Person[]) {
    setPeople(list);
    setDrafts(Object.fromEntries(list.map(person => [person.id, {
      rate_kopecks: rubles(person.rate_kopecks),
      travel_kopecks: rubles(person.travel_kopecks),
      bonus_kopecks: rubles(person.bonus_kopecks),
      fine_kopecks: rubles(person.fine_kopecks),
    }])));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void http<Person[]>('/owner/workers', token)
      .then(list => { if (active) remember(list); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Не удалось загрузить сотрудников'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, reloadKey]);

  async function addPerson() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving('new');
    setError('');
    try {
      const created = await http<Person>('/owner/workers', token, { method: 'POST', body: JSON.stringify({ name: trimmed }) });
      remember([...people, created].sort((a, b) => a.name.localeCompare(b.name, 'ru') || a.id.localeCompare(b.id)));
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось добавить сотрудника');
    } finally {
      setSaving('');
    }
  }

  async function save(person: Person) {
    const draft = drafts[person.id];
    setSaving(person.id);
    setError('');
    try {
      const body = {
        rate_kopecks: kopecks(draft.rate_kopecks),
        travel_kopecks: kopecks(draft.travel_kopecks),
        bonus_kopecks: kopecks(draft.bonus_kopecks),
        fine_kopecks: kopecks(draft.fine_kopecks),
        expected_revision: person.revision,
      };
      if (body.rate_kopecks < MIN_RATE) throw new Error('Ставка не может быть ниже 5 000 ₽');
      const updated = await http<Person>('/owner/workers/' + person.id + '/tariff', token, { method: 'PATCH', body: JSON.stringify(body) });
      remember(people.map(item => item.id === updated.id ? updated : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить тариф');
    } finally {
      setSaving('');
    }
  }

  return <section className="card tariff-grid" aria-label="Тарифная сетка">
    <h2>Тарифная сетка</h2>
    <p className="muted">Фамилии слева, суммы сверху. Ставка не ниже 5 000 ₽. Командировочные, премия и штраф задаются отдельно и не меняют уже сохранённые дни табеля. Ставка применяется, когда день табеля сохраняют или исправляют.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <form className="tariff-add" onSubmit={e => { e.preventDefault(); void addPerson(); }}>
      <label>Фамилия сотрудника<input value={name} maxLength={200} onChange={e => setName(e.target.value)} disabled={!!saving} /></label>
      <button className="primary" type="submit" disabled={!!saving || !name.trim()}>Добавить</button>
    </form>
    {loading ? <p role="status">Загрузка сотрудников…</p> : !people.length ? <p className="empty">Сотрудников пока нет. Добавьте фамилию, затем укажите суммы.</p> : <div className="production-table-scroll" tabIndex={0} role="region" aria-label="Ставки сотрудников">
      <table className="production-table tariff-table">
        <thead><tr><th>Сотрудник</th>{fields.map(field => <th key={field}>{labels[field]}, ₽</th>)}<th></th></tr></thead>
        <tbody>{people.map(person => {
          const draft = drafts[person.id];
          const dirty = draft && fields.some(field => draft[field] !== rubles(person[field]));
          return <tr key={person.id}>
            <th scope="row">{person.name}</th>
            {fields.map(field => <td key={field}><input aria-label={`${labels[field]} — ${person.name}`} inputMode="decimal" value={draft?.[field] ?? ''} disabled={saving === person.id} onChange={e => setDrafts(current => ({ ...current, [person.id]: { ...current[person.id], [field]: e.target.value } }))} /></td>)}
            <td><button type="button" className="secondary" disabled={!dirty || !!saving} onClick={() => void save(person)}>{saving === person.id ? 'Сохранение…' : 'Сохранить'}</button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
