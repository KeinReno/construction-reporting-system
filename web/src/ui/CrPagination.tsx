export function CrPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  const pages = Array.from({length: pageCount}, (_, index) => index + 1)
    .filter(number => number === 1 || number === pageCount || Math.abs(number - page) <= 1);
  return (
    <nav className="crs-pagination" aria-label="Страницы журнала">
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(page-1)}>Назад</button>
      {pages.map((number,index) => (
        <span key={number} className="crs-pagination-slot">
          {index > 0 && number - pages[index-1] > 1 && <span aria-hidden="true">…</span>}
          <button type="button" aria-current={number === page ? 'page' : undefined}
            onClick={() => onPageChange(number)}>{number}</button>
        </span>
      ))}
      <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page+1)}>Далее</button>
    </nav>
  );
}
