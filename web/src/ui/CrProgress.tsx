import type { CSSProperties } from 'react';

/** Represents an observed part of a known whole. No invented plan/fact values. */
export function CrProgress({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return null;
  const boundedValue = Math.min(max, Math.max(0, value));
  const percent = Math.round((boundedValue / max) * 100);
  return (
    <div className="crs-progress-block">
      <div className="crs-progress-caption">
        <span>{label}</span>
        <span className="crs-progress-percent">{percent}%</span>
      </div>
      <div
        className="crs-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={boundedValue}
        aria-valuetext={`${boundedValue} из ${max} (${percent}%)`}
      >
        <span className="crs-progress-indicator" style={{ width: `${percent}%` } as CSSProperties} />
      </div>
    </div>
  );
}
