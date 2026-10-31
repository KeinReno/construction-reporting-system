import { useEffect, useState, type ReactNode } from 'react';

type NavigationEntry<Page extends string> = { key: Page; label: string };

export function CrSidebar<Page extends string>({
  entries,
  current,
  onSelect,
  renderIcon,
  archiveUrl,
}: {
  entries: NavigationEntry<Page>[];
  current: Page;
  onSelect: (page: Page) => void;
  renderIcon: (page: Page) => ReactNode;
  archiveUrl?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement &&
          (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setCollapsed(value => !value);
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  return (
    <aside className={`sidebar crs-sidebar${collapsed ? ' is-collapsed' : ''}`} data-collapsed={collapsed}>
      <div className="crs-sidebar-head">
        <div className="brand crs-brand" aria-label="СтройКонтроль">
          <span className="brand-mark">C</span>
          <span className="crs-brand-copy">CRS<small className="brand-caption">СТРОЙКОНТРОЛЬ</small></span>
        </div>
        <button
          type="button"
          className="crs-sidebar-trigger"
          aria-label={collapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'}
          aria-expanded={!collapsed}
          aria-controls="crs-sidebar-navigation"
          title={collapsed ? 'Развернуть меню (Ctrl+B)' : 'Свернуть меню (Ctrl+B)'}
          onClick={() => setCollapsed(value => !value)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path d={collapsed ? 'm14 9 3 3-3 3' : 'm17 9-3 3 3 3'} />
          </svg>
        </button>
      </div>
      <nav id="crs-sidebar-navigation" className="crs-sidebar-navigation" aria-label="Основная навигация">
        <span className="crs-sidebar-group-label" aria-hidden="true">РАБОЧЕЕ ПРОСТРАНСТВО</span>
        {entries.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`nav-item crs-nav-item${current === key ? ' active' : ''}`}
            aria-current={current === key ? 'page' : undefined}
            title={collapsed ? label : undefined}
            onClick={() => onSelect(key)}
          >
            {renderIcon(key)}<span className="crs-nav-label">{label}</span>
          </button>
        ))}
        {archiveUrl && (
          <a
            className="nav-item crs-nav-item owner-archive-link"
            href={archiveUrl}
            target="_blank"
            rel="noreferrer"
            title={collapsed ? 'Архив MAX' : undefined}
          >
            <span className="crs-nav-archive-icon" aria-hidden="true">↗</span>
            <span className="crs-nav-label">Архив MAX</span>
          </a>
        )}
      </nav>
      <div className="sidebar-foot crs-sidebar-foot" title={collapsed ? 'Серверные данные' : undefined}>
        <span className="online-dot" aria-hidden="true" />
        <span className="crs-nav-label">Серверные данные</span>
      </div>
    </aside>
  );
}
