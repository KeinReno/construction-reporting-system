import { type Report, reportStatusLabels,reportViewData,reportWorkState } from '../api';
import { formatDate } from '../date';

export type ReportView = {
  id: string;
  workDate: string;
  workDateLabel: string;
  siteName: string;
  authorLabel: string;
  authorId: string | null;
  workCount: number;
  incidentCount: number;
  status: Report['status'];
  statusLabel: string;
  revision: number;
  headline: string;
  workSummary: string;
  quantityHint: string | null;
  photoIds: string[];
  photoCount: number;
  possiblePhotoCount: number;
  hasIncident: boolean;
  incidentHint: string | null;
  isNoWork: boolean;
  crew: string | null;
  searchDetails?: string;
};

const isShiftContext = (text: string) => /^(допуск на площад|дождь$)/i.test(text.trim());

export function primaryWorks(report: Report) {
  if (reportWorkState(report) !== 'work') return [];
  return reportViewData(report).work_entries.filter(work => !isShiftContext(work.type));
}

export function buildReportView(
  report: Report,
  siteName: string,
  authorLabel: string,
  options?: { archiveLabel?: string }
): ReportView {
  const works = primaryWorks(report);
  const first = works[0];
  const isNoWork = reportWorkState(report) === 'no_work';
  const headline = isNoWork
    ? 'Работ не было'
    : first?.description || first?.type || 'Работы не указаны';
  const workSummary = isNoWork
    ? (report.data.no_work_reason || 'Причина не указана')
    : works.length
      ? works.map(work => work.description || work.type).join('; ')
      : 'В записи нет описания выполненных работ.';
  const quantityHint = first && first.quantity !== null
    ? `${first.quantity}${first.unit ? ` ${first.unit}` : ''}`
    : null;
  const data=reportViewData(report);
  const incident = data.incidents?.[0] || null;
  const photoIds = [...new Set([...(report.data.required_photo_ids || []), ...(report.evidence?.photos || []).filter(p=>p.relation==='same_message').map(p=>p.id)])];
  return {
    id: report.id,
    workDate: report.data.work_date,
    workDateLabel: formatDate(report.data.work_date),
    siteName,
    authorLabel,
    authorId: report.author_id || null,
    workCount: works.length,
    incidentCount: data.incidents?.length || 0,
    status: report.status,
    statusLabel: options?.archiveLabel || (report.origin==='imported'?'Сохранён':reportStatusLabels[report.status]) || 'Неизвестный статус',
    revision: report.revision,
    headline,
    workSummary: works.length > 1 && !isNoWork
      ? `${first?.description || first?.type || 'Работа'}${works.length > 1 ? ` и ещё ${works.length - 1}` : ''}`
      : workSummary,
    quantityHint,
    photoIds,
    photoCount: photoIds.length,
    possiblePhotoCount: new Set((report.evidence?.photos || []).filter(p=>p.relation==='same_work_date').map(p=>p.id)).size,
    hasIncident: !!incident,
    incidentHint: incident?.description || null,
    isNoWork,
    crew: report.data.crew || null,
    searchDetails:works.map(w=>w.description||'').join(' '),
  };
}

export function searchableReportText(view: ReportView, comment?: string | null) {
  return `${view.workDateLabel} ${view.siteName} ${view.authorLabel} ${view.headline} ${view.workSummary} ${view.searchDetails||''} ${comment || ''}`.toLocaleLowerCase('ru-RU');
}
