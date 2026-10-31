import type { Report } from '../api';
import { CrStatus } from '../ui/CrStatus';

export function ReportStatus({
  status,
  label,
  archive = false,
}: {
  status: Report['status'];
  label: string;
  archive?: boolean;
}) {
  return <CrStatus tone={archive ? 'archive' : status}>{label}</CrStatus>;
}
