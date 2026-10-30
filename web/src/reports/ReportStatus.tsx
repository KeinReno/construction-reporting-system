import type { Report } from '../api';

export function ReportStatus({
  status,
  label,
  archive = false,
}: {
  status: Report['status'];
  label: string;
  archive?: boolean;
}) {
  return (
    <span className={`report-status ${archive ? 'archive' : status}`}>
      {label}
    </span>
  );
}
