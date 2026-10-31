type SegmentOption<Value extends string> = { value: Value; label: string };

export function CrSegmentGroup<Value extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: {
  value: Value;
  options: readonly SegmentOption<Value>[];
  onChange: (value: Value) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div className={`density-toggle crs-segment-group ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
