export type Site = { id: string; name: string }
export type WorkEntry = { type: string; quantity: string | null; unit: string | null; description?: string }
export type FinancialEntry = { id:string;kind:'expense'|'funding_received'|'advance_issued';operation_date:string;amount_kopecks:number;category:string;description?:string|null;receipt_photo_id?:string|null }
export type Report = {
  id: string; site_id: string; client_report_id: string; revision: number;
  author_id?:string; author_login?:string|null;
  status: "draft" | "submitted" | "reviewed" | "needs_revision";
  receipt_id: string | null; submitted_at: string | null;
  data: { work_date: string; kind: "work" | "no_work"; work_entries: WorkEntry[]; comment?: string | null; no_work_reason?: string | null; required_photo_ids?: string[]; crew?:string|null; materials?:Array<{name:string;quantity:string|null;unit:string|null;direction?:'mentioned'|'received'|'consumed'}>|null; incidents?:Array<{description:string}>|null; financial_entries?:FinancialEntry[]|null;equipment?:Array<{type:string;hours:string;hired:boolean}>|null;next_shift_plans?:string[]|null }
}
export const reportStatusLabels: Record<Report['status'], string> = {
  draft: 'Черновик', submitted: 'Доставлен', reviewed: 'Проверен', needs_revision: 'На уточнении'
};
export type Summary = {
  report_count: number; no_work_count: number;
  volumes: Array<{ site_id: string; work_type: string; unit: string; quantity: string; source_report_ids?: string[]; confirmed_zero?: boolean }>;
  qualitative_works:Array<{site_id:string;work_type:string;report_count:number;source_report_ids:string[]}>;qualitative_work_count:number;
  no_work_reasons: Array<{reason:string;report_count:number;source_report_ids:string[]}>; timeline:Array<{report_id:string;date:string;kind:string;status:string}>; timeline_truncated:boolean;
  incident_count:number; incidents:Array<{report_id:string;date:string;description:string}>;
  material_count:number; materials:Array<{report_id:string;date:string;name:string;quantity:string|null;unit:string|null;direction:'mentioned'|'received'|'consumed'}>;
  material_movements:Array<{site_id:string;name:string;unit:string;direction:'received'|'consumed';quantity:string}>;
  financial_entries:Array<FinancialEntry & {report_id:string}>;financial_totals_kopecks:Partial<Record<FinancialEntry['kind'],number>>;
  equipment:Array<{report_id:string;date:string;type:string;hours:string;hired:boolean}>;equipment_hours:Array<{type:string;hours:string;hired:boolean}>;
  limitations: string[]; source_report_ids: string[]; daily: Array<{date:string; report_count:number; source_report_ids?: string[]}>; period: {from_date:string|null;to_date:string|null};
}
export type Profile = { id: string; login: string; role: string }
export type ReportAuthor = {id:string;login:string}

// During development Vite proxies /api to FastAPI; in deployment reverse proxy does the same.
// External server domains and secrets must not be hardcoded in web assets.
export const BASE = "/api/v1";
function apiMessage(status:number,detail:unknown):string {
  const messages:Record<string,string>={
    'Revision conflict':'Отчёт изменился. Обновите данные перед повтором.',
    'Revision/status conflict':'Версия или статус отчёта изменились. Обновите данные.',
    'Reason required':'Укажите причину возврата.',
    'Object access denied':'Нет доступа к объекту.',
    'Author access denied':'Нет доступа к отчёту.',
    'Manager role required':'Для проверки отчёта нужна роль руководителя.',
    'Client update required for extended report':'Необходимо обновить приложение для работы с этим отчётом.',
    'Client update required for material movements':'Необходимо обновить приложение для работы с движением материалов.',
    'Client cannot preserve extended report fields':'Обновите приложение: текущая версия не может сохранить все поля отчёта.',
    'Assignment changed; retry':'Назначение изменилось. Обновите данные и повторите.',
    'Too many login attempts':'Слишком много попыток входа. Попробуйте позже.',
    'Photo missing from storage':'Фотография недоступна в хранилище.',
  };
  if(typeof detail==='string' && messages[detail])return messages[detail];
  return ({400:'Некорректный запрос.',401:'Сессия завершилась. Войдите снова.',403:'Недостаточно прав для этого действия.',404:'Запрошенные данные не найдены.',409:'Данные изменились или действие недоступно. Обновите страницу.',413:'Размер файла превышает допустимый.',422:'Проверьте введённые данные.',429:'Слишком много запросов. Попробуйте позже.'} as Record<number,string>)[status] || (status>=500?'Ошибка сервера. Попробуйте позже.':`Ошибка сервера (код ${status}).`);
}
export class ApiError extends Error { constructor(public status:number, message:string) { super(message); } }
export async function http<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  let response:Response;
  try {response = await fetch(BASE + url, { ...options, headers: { "Content-Type":"application/json", ...options?.headers, Authorization: `Bearer ${token}` } });}
  catch {throw new Error('Нет связи с сервером. Проверьте подключение и повторите.');}
  if (!response.ok) {
    let detail:unknown;
    try { detail = (await response.json()).detail; } catch { /* non-JSON */ }
    throw new ApiError(response.status,apiMessage(response.status,detail));
  }
  return response.json() as Promise<T>;
}
export async function login(login: string, password: string): Promise<string> {
  let response:Response;
  try {response = await fetch(BASE + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password }) });}
  catch {throw new Error('Нет связи с сервером. Проверьте подключение и повторите.');}
  if (!response.ok) throw new Error("Неверные учётные данные или сервер недоступен");
  const data: { access_token: string } = await response.json();
  return data.access_token;
}

export function filterQuery(siteId:string, fromDate:string, toDate:string,authorId:string='all'):string {
  const params=new URLSearchParams();
  if(siteId!=='all')params.set('site_id',siteId);
  if(fromDate)params.set('from_date',fromDate);
  if(toDate)params.set('to_date',toDate);
  if(authorId!=='all')params.set('author_id',authorId);
  return params.toString() ? '?'+params.toString() : '';
}
export async function allReports(token:string, query:string):Promise<Report[]> {
  const reports:Report[]=[];
  for(let page=1;;page++) {
    const batch=await http<Report[]>(`/reports${query}${query?'&':'?'}page=${page}&page_size=200`,token);
    reports.push(...batch);
    if(batch.length<200)return reports;
  }
}
