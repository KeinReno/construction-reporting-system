export type Site = { id: string; name: string }
export type WorkEntry = { type: string; quantity: string | null; unit: string | null; description?: string }
export type Report = {
  id: string; site_id: string; client_report_id: string; revision: number;
  status: "draft" | "submitted" | "reviewed" | "needs_revision";
  receipt_id: string | null;
  data: { work_date: string; kind: "work" | "no_work"; work_entries: WorkEntry[]; comment?: string | null; no_work_reason?: string | null }
}
export type Summary = {
  report_count: number; no_work_count: number;
  volumes: Array<{ site_id: string; work_type: string; unit: string; quantity: string }>;
  limitations: string[];
}
export type Profile = { id: string; login: string; role: string }

// During development Vite proxies /api to FastAPI; in deployment reverse proxy does the same.
// External server domains and secrets must not be hardcoded in web assets.
const BASE = "/api/v1";
export async function http<T>(url: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(BASE + url, { ...options, headers: { ...options?.headers, Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    let reason = `HTTP ${response.status}`;
    try { const data = await response.json(); reason = typeof data.detail === 'string' ? data.detail : reason; } catch { /* non-JSON */ }
    throw new Error(reason);
  }
  return response.json() as Promise<T>;
}
export async function login(login: string, password: string): Promise<string> {
  const response = await fetch(BASE + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login, password }) });
  if (!response.ok) throw new Error("Неверные учётные данные или сервер недоступен");
  const data: { access_token: string } = await response.json();
  return data.access_token;
}
