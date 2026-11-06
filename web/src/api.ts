export type Site = { id: string; name: string }
export type WorkEntry = { type: string; quantity: string | null; unit: string | null; description?: string }
export type FinancialEntry = { id:string;kind:'expense'|'funding_received'|'advance_issued';operation_date:string;amount_kopecks:number;category:string;description?:string|null;receipt_photo_id?:string|null;date_basis?:'report_date';evidence_basis?:'declared_expense'|'declared_advance' }
export type Report = {
  normalization?: {version:number;work_state:'work'|'no_work'|'not_stated';fields:Partial<Report['data']>;pending:Array<{kind:string;text:string;reason:string}>;shift_context:Array<{text:string}>} | null;
  origin?: 'direct' | 'imported';
  evidence?: {photos:Array<{id:string;relation:'same_message'|'same_work_date';date:string}>;requires_site_confirmation?:boolean;decisions?:Array<{id:string;decision:string;reason:string;actor_id:string;revision:number;created_at:string}>} | null;
  id: string; site_id: string; client_report_id: string; revision: number;
  author_id?:string; author_login?:string|null;
  status: "draft" | "submitted" | "reviewed" | "needs_revision";
  receipt_id: string | null; submitted_at: string | null;
  data: { work_area?:'Т1'|'Т2'|'Т1/Т2'|null; weather?:'Ясно'|'Облачно'|'Дождь'|'Снег'|'Ветер'|'Мороз и гололёд'|'Жара'|null; work_date: string; kind: "work" | "no_work"; work_entries: WorkEntry[]; comment?: string | null; no_work_reason?: string | null; required_photo_ids?: string[]; crew?:string|null; materials?:Array<{name:string;quantity:string|null;unit:string|null;direction?:'mentioned'|'received'|'consumed'}>|null; incidents?:Array<{description:string}>|null; financial_entries?:FinancialEntry[]|null;equipment?:Array<{type:string;hours:string;hired:boolean|null}>|null;next_shift_plans?:string[]|null }
}
export function reportViewData(report:Report):Report['data'] {
  return report.normalization ? {...report.data,...report.normalization.fields} : report.data;
}
export function equipmentOwnership(hired:boolean|null):string {return hired===null?'Принадлежность не указана':hired?'Наёмная':'Своя';}
export function reportWorkState(report:Report):'work'|'no_work'|'not_stated' {return report.normalization?.work_state??report.data.kind;}
export const reportStatusLabels: Record<Report['status'], string> = {
  draft: 'Черновик', submitted: 'Доставлен', reviewed: 'Проверен', needs_revision: 'На уточнении'
};
export type Summary = {
  report_count: number; no_work_count: number;
  volumes: Array<{ site_id: string; work_type: string; unit: string; quantity: string; source_report_ids?: string[]; confirmed_zero?: boolean }>;
  qualitative_works:Array<{site_id:string;work_type:string;report_count:number;source_report_ids:string[]}>;qualitative_work_count:number;
  no_work_reasons: Array<{reason:string;report_count:number;source_report_ids:string[]}>; timeline:Array<{report_id:string;date:string;kind:string;work_state?:string;status:string}>; timeline_truncated:boolean;
  incident_count:number; incidents:Array<{report_id:string;date:string;description:string}>;
  material_count:number; materials:Array<{report_id:string;date:string;name:string;quantity:string|null;unit:string|null;direction:'mentioned'|'received'|'consumed'}>;
  material_movements:Array<{site_id:string;name:string;unit:string;direction:'received'|'consumed';quantity:string}>;
  financial_entries:Array<FinancialEntry & {report_id:string}>;financial_totals_kopecks:Partial<Record<FinancialEntry['kind'],number>>;
  equipment:Array<{report_id:string;date:string;type:string;hours:string;hired:boolean|null}>;equipment_hours:Array<{type:string;hours:string;hired:boolean|null}>;
  limitations: string[]; source_report_ids: string[]; daily: Array<{date:string; report_count:number; source_report_ids?: string[]}>; period: {from_date:string|null;to_date:string|null};
}
export type ProductionCalendarDay = {
  date: string; weekday: number; is_weekend: boolean;
  state: 'work' | 'rest' | 'no_report';
  kinds: string[]; kind_labels: string[]; aux: string[]; other: string[]; areas: string[];
  equipment: string[]; hours: string; weather: string[]; people: string[];
  report_ids: string[]; reason: string | null;
}
export type Production = {
  period: { from_date: string | null; to_date: string | null; calendar_truncated: boolean };
  workday_count: number; rest_day_count: number; calendar: ProductionCalendarDay[];
  work_kinds: Array<{ key: string; label: string; day_count: number; report_count: number;
    days_by_label: Array<{ label: string; day_count: number }>;
    areas: Array<{ area: string; label: string; day_count: number }>;
    sites: Array<{ site_id: string; day_count: number }>;
    aux: Array<{ label: string; day_count: number; report_count: number }>;
    source_report_ids: string[] }>;
  other_kinds: Array<{ key: string; label: string; day_count: number; report_count: number;
    works: Array<{ label: string; day_count: number }> }>;
  uncategorized: Array<{ text: string; day_count: number; report_count: number; samples: string[] }>;
  sites: Array<{ site_id: string; work_days: number; rest_days: number; equipment_hours: string }>;
  equipment: { day_count: number; total_hours: string; unassigned_hours: string;
    hours_by_type: Array<{ type: string; hours: string; day_count: number; report_count: number;
      hired_days: number; own_days: number; ownership_not_stated_days: number }>;
    avg_hours_per_equipment_day: string | null; avg_hours_per_workday: string | null };
  people: Array<{ person: string; name: string; day_count: number; hours: string | null; is_group: boolean; is_temporary: boolean;
    first_date: string; last_date: string; site_count: number; source_report_ids: string[] }>;
  people_requires_check: Array<{ names: string[]; days: number[] }>;
  weather: Array<{ condition: string; label: string; days: string[] }>;
  limitations: string[];
}
export type Profile = { is_owner?:boolean; id: string; login: string; role: string }
export type ReportAuthor = {id:string;login:string;imported_only?:boolean}

// During development Vite proxies /api to FastAPI; in deployment reverse proxy does the same.
// External server domains and secrets must not be hardcoded in web assets.
export const BASE = "/api/v1";
function apiMessage(status:number,detail:unknown):string {
  const messages:Record<string,string>={
    'Codex не подключён. Проверьте вход в Codex CLI на ноутбуке.':'Codex не подключён. Проверьте вход в Codex CLI на ноутбуке.',
    'Codex отвечает на другой запрос. Повторите через минуту.':'Codex отвечает на другой запрос. Повторите через минуту.',
    'Codex не завершил ответ. Повторите запрос.':'Codex не завершил ответ. Повторите запрос.',
    'Время ожидания Codex истекло. Данные не изменены.':'Время ожидания Codex истекло. Данные не изменены.',
    'Не удалось получить ответ Codex. Проверьте соединение ноутбука.':'Не удалось получить ответ Codex. Проверьте соединение ноутбука.',
    'Предложение устарело. Повторите запрос.':'Предложение устарело. Повторите запрос.',
    'Объект уже изменён. Повторите запрос.':'Объект уже изменён. Повторите запрос.',
    'Отчёт уже изменён. Повторите запрос.':'Отчёт уже изменён. Повторите запрос.',
    'Помощник отключён.':'Помощник отключён.',
    'Слишком много ожидающих действий. Повторите позже.':'Слишком много ожидающих действий. Повторите позже.',

    'Revision conflict':'Отчёт изменился. Обновите данные перед повтором.',
    'Owner role required':'Это действие доступно только назначенному владельцу.',
    'Active main parent required':'Выберите активный основной вид работы.',
    'Archive auxiliary work first':'Сначала уберите из выбора связанные вспомогательные работы.',
    'Work type name already used in history':'Это название уже используется или сохранено в истории другого вида работы.',
    'Active worker required':'Выберите действующего работника.',
    'History snapshot cannot be scoped':'Историю нельзя показать: не удалось проверить объект сохранённой версии.',
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
