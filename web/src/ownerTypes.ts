export type WorkType = {
  id: string;
  name: string;
  kind: 'main' | 'auxiliary' | 'special';
  parent_id: string | null;
  active: boolean;
  revision: number;
};
export type Worker = {id: string; name: string; active: boolean};
export type LaborDayForm = {
  id: string;
  worker_id: string;
  site_id: string;
  work_date: string;
  worked: boolean;
  business_trip: boolean;
  allowance_kopecks: number;
  fine_kopecks: number;
  reason: string;
  revision?: number;
};
export type LaborDay = LaborDayForm & {
  revision: number;
  base_kopecks: number;
  total_kopecks: number;
  day_rate_kopecks: number;
  standard_hours: number;
};
export type LaborTotals = {
  record_count: number;
  worker_count: number;
  worked_days: number;
  worked_calendar_days: number;
  business_trip_days: number;
  base_kopecks: number;
  allowance_kopecks: number;
  fine_kopecks: number;
  total_kopecks: number;
  source_day_ids: string[];
};
export type LaborSummaryData = {
  period: {from_date: string | null; to_date: string | null};
  totals: LaborTotals;
  by_worker: Array<LaborTotals & {worker_id: string; name: string}>;
  by_site: Array<LaborTotals & {site_id: string}>;
  days: LaborDay[];
};
