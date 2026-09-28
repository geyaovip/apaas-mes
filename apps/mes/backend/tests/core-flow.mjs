import 'dotenv/config';
import assert from 'node:assert/strict';

const base = process.env.TEST_API_URL || 'http://127.0.0.1:4401/api/v1';
const tag = Date.now().toString(36);
const password = `Mes-Test-${tag}-Strong!`;
let cookie = '';
async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(base + path, { method, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const value = await res.json();
  return { status: res.status, value, cookie: res.headers.get('set-cookie')?.split(';')[0] || '' };
}
async function ok(path, body) { const result = await request(path, body); assert.ok(result.status >= 200 && result.status < 300, `${path}: ${JSON.stringify(result.value)}`); return result.value; }
async function login(email, secret) { const result = await request('/auth/login', { workspace: 'default', email, password: secret }); assert.equal(result.status, 201, JSON.stringify(result.value)); cookie = result.cookie; }

await login(process.env.MES_BOOTSTRAP_EMAIL, process.env.MES_BOOTSTRAP_PASSWORD);
const operator = await ok('/admin/users', { name: `操作员${tag}`, email: `mes-operator-${tag}@test.local`, password, role: 'operator' });
const other = await ok('/admin/users', { name: `其他操作员${tag}`, email: `mes-other-${tag}@test.local`, password, role: 'operator' });
await ok('/admin/users', { name: `主管${tag}`, email: `mes-supervisor-${tag}@test.local`, password, role: 'supervisor' });
const product = await ok('/materials', { sku: `BT-100-${tag}`, name: '蓝牙耳机', kind: 'finished', unit: '件' });
const plan = await ok('/plans', { code: `PLAN-${tag}`, product_material_id: product.id, target_qty: 10, due_at: new Date(Date.now() + 86400000).toISOString(), note: '测试批次' });
assert.equal(plan.status, 'draft');
await ok(`/plans/${plan.id}/release`, { version: plan.version });
const order = await ok(`/plans/${plan.id}/orders`, { code: `WO-${tag}`, operation: '总装', target_qty: 10, assignee_id: operator.id });
assert.equal(order.goodQty, 0);
await login(other.email, password);
assert.equal((await request(`/orders/${order.id}`)).status, 404, 'other operator cannot inspect assigned order');
assert.equal((await request(`/orders/${order.id}/reports`, { good_qty: 1, defect_qty: 0 })).status, 404, 'other operator cannot report');
await login(operator.email, password);
const report = await ok(`/orders/${order.id}/reports`, { good_qty: 8, defect_qty: 1, note: '首批报工' });
assert.equal(report.status, 'pending');
assert.equal((await request(`/reports/${report.id}/review`, { decision: 'approve' })).status, 403, 'operator cannot approve own work');
await login(`mes-supervisor-${tag}@test.local`, password);
await ok(`/reports/${report.id}/review`, { decision: 'approve' });
let detail = await ok(`/orders/${order.id}`);
assert.equal(detail.goodQty, 8); assert.equal(detail.defectQty, 1); assert.equal(detail.status, 'in_progress');
await login(operator.email, password);
const excess = await ok(`/orders/${order.id}/reports`, { good_qty: 2, defect_qty: 0 });
const final = await ok(`/orders/${order.id}/reports`, { good_qty: 1, defect_qty: 0 });
await login(`mes-supervisor-${tag}@test.local`, password);
assert.equal((await request(`/reports/${excess.id}/review`, { decision: 'approve' })).status, 409, 'overreported batch must not be approved');
await ok(`/reports/${excess.id}/review`, { decision: 'reject', reason: '超过工单计划量' });
await ok(`/reports/${final.id}/review`, { decision: 'approve' });
detail = await ok(`/orders/${order.id}`);
assert.equal(detail.goodQty, 9); assert.equal(detail.defectQty, 1); assert.equal(detail.status, 'completed');
assert.equal((await ok(`/plans/${plan.id}`)).status, 'completed');
assert.equal((await ok('/dashboard')).pending_reports, 0);
console.log('MES core flow passed: plan → order → operator report → supervisor review → progress; role isolation and overreport blocked.');
