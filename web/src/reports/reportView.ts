import { type Report, reportStatusLabels } from '../api';
import { formatDate } from '../date';

export type ReportView = {
  id: string;
  workDate: string;
  workDateLabel: string;
  siteName: string;
  authorLabel: string;
  status: Report['status'];
  statusLabel: string;
  revision: number;
  headline: string;
  workSummary: string;
  quantityHint: string | null;
  photoIds: string[];
  photoCount: number;
  hasIncident: boolean;
  incidentHint: string | null;
  isNoWork: boolean;
  crew: string | null;
};

const isShiftContext = (text: string) => /^(допуск на площад|дождь$)/i.test(text.trim());

export function primaryWorks(report: Report) {
  if (report.data.kind === 'no_work') return [];
  return report.data.work_entries.filter(work => !isShiftContext(work.type));
}

export function buildReportView(
  report: Report,
  siteName: string,
  authorLabel: string,
  options?: { archiveLabel?: string }
): ReportView {
  const works = primaryWorks(report);
  const first = works[0];
  const isNoWork = report.data.kind === 'no_work';
  const headline = isNoWork
    ? 'Работ не было'
    : first?.type || 'Работы не указаны';
  const workSummary = isNoWork
    ? (report.data.no_work_reason || 'Причина не указана')
    : works.length
      ? works.map(work => work.type).join('; ') + (works.length > 2 ? '' : '')
      : 'В записи нет описания выполненных работ.';
  const quantityHint = first && first.quantity !== null
    ? `${first.quantity}${first.unit ? ` ${first.unit}` : ''}`
    : works.length > 1
      ? `ещё ${works.length - 1}`
      : null;
  const incident = report.data.incidents?.[0] || null;
  const photoIds = report.data.required_photo_ids || [];
  return {
    id: report.id,
    workDate: report.data.work_date,
    workDateLabel: formatDate(report.data.work_date),
    siteName,
    authorLabel,
    status: report.status,
    statusLabel: options?.archiveLabel || reportStatusLabels[report.status] || 'Неизвестный статус',
    revision: report.revision,
    headline,
    workSummary: works.length > 1 && !isNoWork
      ? `${first?.type || 'Работа'}${works.length > 1 ? ` и ещё ${works.length - 1}` : ''}`
      : workSummary,
    quantityHint,
    photoIds,
    photoCount: photoIds.length,
    hasIncident: !!incident,
    incidentHint: incident?.description || null,
    isNoWork,
    crew: report.data.crew || null,
  };
}

export function searchableReportText(view: ReportView, comment?: string | null) {
  return `${view.workDateLabel} ${view.siteName} ${view.authorLabel} ${view.headline} ${view.workSummary} ${comment || ''}`.toLocaleLowerCase('ru-RU');
}
