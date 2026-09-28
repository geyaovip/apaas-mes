export type Role = 'admin'|'planner'|'supervisor'|'operator';
export interface Session { user: { id: string; tenantId: string; name: string; email?: string; role: Role }; tenant: { slug: string; name: string } }
export interface User { id: string; name: string; email?: string; role: Role; active?: boolean }
export interface CatalogMaterial { id: string; sku: string; name: string; kind: string; unit: string; description?: string; active: boolean; version: number }
export interface Material { id: string; materialId?: string; componentSku: string; componentName: string; unit: string; requiredQty: string }
export interface BomItem { id: string; materialId?: string; componentSku: string; componentName: string; unit: string; quantityPerUnit: string; scrapRate: string }
export interface Bom { id: string; productMaterialId?: string; productSku: string; productName: string; revision: number; status: string; version: number; note?: string; items?: BomItem[]; _count?: { items: number; plans: number } }
export interface Plan { id: string; code: string; product: string; productSku: string; productMaterialId?: string; bomId?: string; bom?: { id: string; revision: number; status: string }; materials?: Material[]; targetQty: number; dueAt: string; status: string; note?: string; version: number; orders?: Order[]; _count?: { orders: number } }
export interface Order { id: string; code: string; operation: string; targetQty: number; goodQty: number; defectQty: number; status: string; version: number; assigneeId: string; assignee?: { id: string; name: string }; planId: string; plan?: { id?: string; code: string; product: string; productSku?: string }; reports?: Report[] }
export interface Report { id: string; orderId: string; goodQty: number; defectQty: number; note?: string; status: string; reason?: string; createdAt: string; reporter?: { id?: string; name: string }; reviewer?: { id?: string; name: string }; order?: { id: string; code: string; operation: string } }
export interface Page<T> { items: T[]; total: number; page?: number; page_size?: number }
export interface Dashboard { active_plans: number; active_orders: number; pending_reports: number; target_qty: number; good_qty: number; defect_qty: number; definition: string }
export class ApiError extends Error { constructor(public code: string, message: string, public status: number) { super(message); } }
export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { method: method || (body === undefined ? 'GET' : 'POST'), credentials: 'include', headers: body === undefined ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error?.code || 'HTTP_ERROR', data.error?.message || `请求失败 (${response.status})`, response.status);
  return data as T;
}
export const date = (value?: string) => value ? new Date(value).toLocaleDateString('zh-CN') : '—';
export const planStatus: Record<string,string> = { draft:'草稿',released:'已发布',completed:'已完成' };
export const orderStatus: Record<string,string> = { released:'待报工',in_progress:'生产中',completed:'已完成' };
export const reportStatus: Record<string,string> = { pending:'待审核',approved:'已通过',rejected:'已拒绝' };
export const roleName: Record<string,string> = { admin:'管理员',planner:'计划员',supervisor:'主管',operator:'操作员' };
