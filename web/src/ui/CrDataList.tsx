import type { ReactNode } from 'react';

export function CrDataList({items, className=''}: {
  items: Array<{label: string; value: ReactNode}>;
  className?: string;
}) {
  return <dl className={`crs-data-list ${className}`.trim()}>
    {items.map((item,index) => (
      <div className="crs-data-list-item" key={index}>
        <dt>{item.label}</dt><dd>{item.value}</dd>
      </div>
    ))}
  </dl>;
}
