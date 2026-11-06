import { useCallback, useEffect, useState } from 'react';
import { ApiError, http } from './api';

type Status = {
  accepting: boolean;
  services: { postgres: boolean; api: boolean; https: boolean };
  release: string | null;
  lan: string[];
  vpn_active: boolean;
  router_address: string | null;
  router_public: boolean;
  local_https: string;
  disks: { label: string; free_gb: number; low: boolean }[];
  control_ready: boolean;
};

const services = [
  ['postgres', 'База'],
  ['api', 'Сервер приложений'],
  ['https', 'HTTPS'],
] as const;

export function ServerConsole({ token, onExpired }: { token: string; onExpired: () => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await http<Status>('/server/status', token);
      setStatus(next);
      setError('');
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) onExpired();
      else setError(reason instanceof Error ? reason.message : 'Не удалось прочитать состояние сервера');
    }
  }, [token, onExpired]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function toggle() {
    if (!status) return;
    const next = !status.accepting;
    if (!next && !window.confirm('Выключить приём отчётов? Страница управления останется открытой, чтобы включить CRS обратно.')) return;
    setBusy(true);
    try {
      setStatus(await http<Status>('/server/power', token, { method: 'POST', body: JSON.stringify({ running: next }) }));
      setError('');
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) onExpired();
      else setError(reason instanceof Error ? reason.message : 'Не удалось переключить CRS');
    } finally {
      setBusy(false);
    }
  }

  const address = status?.router_address
    ? (status.router_public
      ? `${status.router_address} — адрес роутера. После выключения VPN и проброса порта 443 CRS будет открываться по нему.`
      : `${status.router_address} — роутер сообщил адрес без прямого входа из интернета.`)
    : 'Роутер пока не сообщил внешний адрес. Пока включён VPN, наружу виден адрес туннеля, и он не является адресом CRS.';

  return <section className="card server-console" aria-label="Сервер">
    <div className="section-heading"><h2>Сервер</h2>{status && <button type="button" className="primary" disabled={busy || !status.control_ready} onClick={() => void toggle()}>{status.accepting ? 'Выключить CRS' : 'Включить CRS'}</button>}</div>
    {error && <p className="error" role="alert">{error}</p>}
    {!status && !error && <p>Читаем состояние сервера…</p>}
    {status && <>
      <p className={status.accepting ? 'crs-toast crs-toast-success' : 'error'} role="status">{status.accepting ? 'CRS принимает отчёты.' : 'CRS выключен для сотрудников. Эта консоль остаётся доступной.'}</p>
      {!status.control_ready && <p className="muted">Переключатель появится после запуска этой сборки штатным контуром.</p>}
      <dl className="server-facts">
        <div><dt>Адрес после выключения VPN</dt><dd>{address}</dd></div>
        <div><dt>Адреса этого компьютера</dt><dd>{status.lan.length ? status.lan.join(', ') : 'не определены'}</dd></div>
        <div><dt>VPN</dt><dd>{status.vpn_active ? 'Включён. Текущий выход в интернет — туннель, не адрес CRS.' : 'Не перехватывает маршрут по умолчанию.'}</dd></div>
        <div><dt>Локальный HTTPS</dt><dd>{status.local_https}</dd></div>
        <div><dt>Сборка</dt><dd>{status.release || 'не записана'}</dd></div>
      </dl>
      <ul className="server-services">{services.map(([key, label]) => <li key={key}><span className={`crs-admin-state ${status.services[key] ? 'is-active' : 'is-disabled'}`}>{status.services[key] ? 'Работает' : 'Не запущен'}</span>{label}</li>)}</ul>
      {!!status.disks.length && <ul className="server-services">{status.disks.map(disk => <li key={disk.label}><span className={`crs-admin-state ${disk.low ? 'is-disabled' : 'is-active'}`}>{disk.free_gb} ГБ</span>{disk.label}{disk.low ? ' — мало места' : ''}</li>)}</ul>}
    </>}
  </section>;
}
