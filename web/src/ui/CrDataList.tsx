import type { ReactNode } from 'react';

export function CrDataList({items, className=''}: {
  items: Array<{label: string; value: ReactNode}>;
  className?: string;
}) {
  return <dl className={`crs-data-list ${className}`.trim()}>
    {items.map((item,index) => (
      <div className="crs-data-list-item" key={index}>
        <dt>{item.label}</dt><dd>{typeof item.value === "string" || typeof item.value === "number" ? `${item.label}: ${item.value}` : item.value}</dd>
      </div>
    ))}
  </dl>;
}
