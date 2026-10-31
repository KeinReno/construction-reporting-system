import type { ReactNode } from 'react';
import { CrProgress } from '../ui/CrProgress';

export function WorkbenchTopbar({
  user,
  onLogout,
  pageTitle,
}: {
  user: string;
  onLogout: () => void;
  pageTitle: string;
}) {
  return (
    <header className="topbar wb-topbar">
      <div className="wb-topbar-location">
        <span className="wb-topbar-monogram" aria-hidden="true">C<span>R</span>S</span>
        <span className="wb-topbar-divider" aria-hidden="true" />
        <span className="wb-topbar-module">OPERATIONS <span aria-hidden="true">/</span> {pageTitle}</span>
      </div>
      <div className="wb-topbar-account topbar-right">
        <span className="wb-topbar-environment"><span aria-hidden="true" className="wb-live-dot" />WEB CONSOLE</span>
        <span className="wb-topbar-user">{user}</span>
        <button type="button" className="quiet wb-logout" onClick={onLogout}>Выйти <span aria-hidden="true">↗</span></button>
      </div>
    </header>
  );
}

export function WorkbenchMasthead({
  title,
  subtitle,
  index,
  onRefresh,
  refreshing,
}: {
  title: string;
  subtitle: string;
  index: string;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="heading wb-masthead">
      <div className="wb-masthead-copy">
        <span className="wb-overline"><span className="wb-overline-index">{index}</span> / CONSTRUCTION REPORTING SYSTEM</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="wb-masthead-actions">
        <button type="button" className="secondary wb-refresh" aria-label={refreshing ? "Обновление…" : "↻ Обновить"} onClick={onRefresh} disabled={refreshing}>
          <span aria-hidden="true">↻</span><span>{refreshing ? 'Обновление…' : 'Обновить'}</span>
        </button>
      </div>
    </div>
  );
}

export function WorkbenchSection({
  number,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail?: string;
}) {
  return (
    <div className="wb-section-rule" aria-hidden="true">
      <span className="wb-section-number">{number}</span>
      <strong>{title}</strong>
      {detail && <span className="wb-section-detail">{detail}</span>}
      <span className="wb-section-line" />
    </div>
  );
}

export function WorkbenchCommandHero({
  reports,
  visibleReports,
  pending,
  siteCount,
  incidents,
  expenseKopecks,
  ready,
  onShowReports,
}: {
  reports: number;
  visibleReports: number;
  pending: number;
  siteCount: number;
  incidents: number | null;
  expenseKopecks: number | null | undefined;
  ready: boolean;
  onShowReports: () => void;
}) {
  const moneyText = expenseKopecks == null ? 'Нет данных' :
    new Intl.NumberFormat('ru-RU', {style: 'currency', currency: 'RUB', maximumFractionDigits: 0})
      .format(expenseKopecks / 100);

  return (
    <section className="wb-command" aria-label="Оперативные показатели">
      <div className="wb-command-hero metric">
        <div className="wb-command-head">
          <span>01 / СВОДКА ЗА ПЕРИОД</span>
          <span className="wb-command-pulse"><i aria-hidden="true" />ДАННЫЕ CRS</span>
        </div>
        <div className="wb-command-main">
          <strong className="wb-command-number">{ready ? reports : '—'}</strong>
          <div className="wb-command-description">
            <span className="wb-command-title">Полученных отчётов</span>
            <p>С квитанцией о доставке по выбранным фильтрам. Возвращённые на уточнение также учитываются.</p>
          </div>
        </div>
        <div className="wb-command-bottom">
          <div className="wb-command-progress">
            {ready && visibleReports > 0
              ? <CrProgress label="Доля отчётов с квитанцией" value={reports} max={visibleReports} />
              : <span className="wb-command-note">Показатель доступен после загрузки отчётов</span>}
          </div>
          <button type="button" className="wb-command-action" onClick={onShowReports}>
            Открыть журнал <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <div className="wb-command-brief">
        <div className="wb-brief-title"><span className="wb-overline">СОСТОЯНИЕ СИСТЕМЫ</span><strong>Рабочая картина</strong></div>
        <div className="wb-brief-list">
          <div className="wb-brief-item metric">
            <span className="wb-brief-index">01</span>
            <span className="wb-brief-label">Объектов в выборке</span>
            <strong>{siteCount}</strong>
          </div>
          <div className="wb-brief-item metric wb-brief-item-alert">
            <span className="wb-brief-index">02</span>
            <span className="wb-brief-label">Ожидают проверки</span>
            <strong>{ready ? pending : '—'}</strong>
          </div>
          <div className="wb-brief-item">
            <span className="wb-brief-index">03</span>
            <span className="wb-brief-label">Указано событий</span>
            <strong>{ready ? incidents ?? '—' : '—'}</strong>
          </div>
        </div>
        <div className="wb-brief-finance metric">
          <span>ЗАЯВЛЕННЫЕ РАСХОДЫ</span>
          <strong>{ready ? moneyText : '—'}</strong>
          <small>Только расходы. Поступления и авансы в сумму не включены.</small>
        </div>
      </div>
    </section>
  );
}

export function WorkbenchDataPanel({children, index, title}: {children: ReactNode; index: string; title: string}) {
  return <section className="wb-data-panel">
    <div className="wb-data-panel-head"><span>{index}</span><strong>{title}</strong></div>
    {children}
  </section>;
}
