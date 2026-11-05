export function CrSkeleton({rows = 3, label = 'Загрузка данных'}: {rows?: number; label?: string}) {
  return (
    <div className="crs-skeleton" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({length: rows}, (_, index) => <span key={index} className="crs-skeleton-row" style={{width: `${96-index*9}%`}} />)}
    </div>
  );
}
