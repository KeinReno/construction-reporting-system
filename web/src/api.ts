export type Site = { id: string; name: string }
export type WorkEntry = { type: string; quantity: string | null; unit: string | null; description?: string }
export type Report = {
  id: string; site_id: string; client_report_id: string; revision: number;
  status: "draft" | "submitted" | "reviewed" | "needs_revision";
  receipt_id: string | null; submitted_at: string | null;
  data: { work_date: string; kind: "work" | "no_work"; work_entries: WorkEntry[]; comment?: string | null; no_work_reason?: string | null; required_photo_ids?: string[] }
}
export type Summary = {
  report_count: number; no_work_count: number;
  volumes: Array<{ site_id: string; work_type: string; unit: string; quantity: string }>;
  limitations: string[]; source_report_ids: string[]; daily: Array<{date:string; report_count:number}>; period: {from_date:string|null;to_date:string|null};
}
export type Profile = { id: string; login: string; role: string }

// During development Vite proxies /api to FastAPI; in deployment reverse proxy does the same.
// External server domains and secrets must not be hardcoded in web assets.
export const BASE = "/api/v1";
export class ApiError extends Error { constructor(public status:number, message:string) { super(message); } }
export async function http<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(BASE + url, { ...options, headers: { "Content-Type":"application/json", ...options?.headers, Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    let reason = `HTTP ${response.status}`;
    try { const data = await response.json(); reason = typeof data.detail === 'string' ? data.detail : reason; } catch { /* non-JSON */ }
    throw new ApiError(response.status,reason);
  }
  return response.json() as Promise<T>;
}
export async function login(login: string, password: string): Promise<string> {
  const response = await fetch(BASE + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password }) });
  if (!response.ok) throw new Error("Неверные учётные данные или сервер недоступен");
  const data: { access_token: string } = await response.json();
  return data.access_token;
}

export function filterQuery(siteId:string, fromDate:string, toDate:string):string {
  const params=new URLSearchParams();
  if(siteId!=='all')params.set('site_id',siteId);
  if(fromDate)params.set('from_date',fromDate);
  if(toDate)params.set('to_date',toDate);
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
