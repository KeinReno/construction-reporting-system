export type CrReportPeriod = {key: string; label: string; count: number; ids: string[]};

export function CrReportChart({
  periods,
  ready,
  total,
  onOpen,
}: {
  periods: CrReportPeriod[];
  ready: boolean;
  total?: number | null;
  onOpen: (period: CrReportPeriod) => void;
}) {
  const max = Math.max(...periods.map(period => period.count), 1);
  return (
    <div className="crs-report-chart" aria-label="Количество отчётов по периодам">
      <div className="crs-report-chart-head">
        <span className="crs-eyebrow">Отчётность</span>
        <div className="crs-report-chart-total big-number"><strong>{total ?? '—'}</strong><span>в графике</span></div>
      </div>
      {periods.length ? <ul className="crs-report-chart-bars">
        {periods.map(period => (
          <li key={period.key}>
            <button type="button" className="crs-report-chart-bar" onClick={() => onOpen(period)}
              aria-label={`${period.label}: ${period.count} отчётов. Открыть источники`}>
              <span className="crs-report-chart-label">{period.label}</span>
              <span className="crs-report-chart-track">
                <span className="crs-report-chart-fill" style={{width: `${period.count/max*100}%`}} />
              </span>
              <b>{period.count}</b>
            </button>
          </li>
        ))}
      </ul> : <p className="empty">{ready ? 'За выбранный период данных для графика нет. Это не подтверждённый ноль работ.' : 'Загрузка показателей…'}</p>}
    </div>
  );
}
