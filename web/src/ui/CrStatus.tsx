import type { ReactNode } from 'react';

export type CrStatusTone = 'draft' | 'submitted' | 'reviewed' | 'needs_revision' | 'archive';

export function CrStatus({ tone, children }: { tone: CrStatusTone; children: ReactNode }) {
  return <span className={`report-status crs-status ${tone}`}>{children}</span>;
}
