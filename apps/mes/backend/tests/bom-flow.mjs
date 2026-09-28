import 'dotenv/config';
import assert from 'node:assert/strict';

const base = process.env.TEST_API_URL || 'http://127.0.0.1:4401/api/v1';
const tag = Date.now().toString(36);
const password = `Mes-Bom-${tag}-Strong!`;
let cookie = '';
async function request(path, body, method) {
  const response = await fetch(base + path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, value: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
}
async function ok(path, body) { const result = await request(path, body); assert.ok(result.status >= 200 && result.status < 300, `${path}: ${JSON.stringify(result.value)}`); return result.value; }
async function login(email, secret) { const result = await request('/auth/login', { workspace: 'default', email, password: secret }); assert.equal(result.status, 201); cookie = result.cookie; }

await login(process.env.MES_BOOTSTRAP_EMAIL, process.env.MES_BOOTSTRAP_PASSWORD);
const operator = await ok('/admin/users', { name: `BOM 操作员 ${tag}`, email: `bom-operator-${tag}@test.local`, password, role: 'operator' });
const moduleSku = `MOD-${tag}`;
const productSku = `DEVICE-${tag}`;
const moduleMaterial = await ok('/materials', { sku: moduleSku, name: '电子模块', kind: 'semi', unit: '件' });
const productMaterial = await ok('/materials', { sku: productSku, name: '电子设备', kind: 'finished', unit: '件' });
assert.equal((await request('/materials', { sku: `INVALID-UNIT-${tag}`, name: '整箱设备', kind: 'finished', unit: '箱' })).status, 422);
const chip = await ok('/materials', { sku: `CHIP-${tag}`, name: '控制芯片', kind: 'raw', unit: '件', description: '主控芯片' });
const speaker = await ok('/materials', { sku: `SPEAKER-${tag}`, name: '扬声器', kind: 'raw', unit: '件' });
const wrongProduct = await ok('/materials', { sku: `WRONG-${tag}`, name: '其他产品', kind: 'finished', unit: '件' });
assert.equal((await request('/materials', { sku: `CHIP-${tag}`, name: '重复芯片', kind: 'raw', unit: '件' })).status, 409);
assert.ok((await ok(`/materials?q=CHIP-${tag}&status=active`)).items.some(item => item.id === chip.id));
const moduleBom = await ok('/boms', { product_material_id: moduleMaterial.id, items: [{ material_id: chip.id, quantity_per_unit: '2', scrap_rate: '0' }] });
await ok(`/boms/${moduleBom.id}/release`, { version: moduleBom.version });
const root = await ok('/boms', { product_material_id: productMaterial.id, items: [
  { material_id: moduleMaterial.id, quantity_per_unit: '1', scrap_rate: '0' },
  { material_id: speaker.id, quantity_per_unit: '2', scrap_rate: '5' },
] });
await ok(`/boms/${root.id}/release`, { version: root.version });
const plan = await ok('/plans', { code: `BOM-PLAN-${tag}`, product_material_id: productMaterial.id, bom_id: root.id, target_qty: 10, due_at: new Date(Date.now() + 86400000).toISOString() });
assert.equal(plan.productMaterialId, productMaterial.id);
assert.equal((await request(`/materials/${productMaterial.id}`, { version: productMaterial.version, name: productMaterial.name, kind: 'raw', active: true }, 'PATCH')).status, 409, 'open plan product cannot change to raw material');
const requirements = Object.fromEntries(plan.materials.map(item => [item.componentSku, Number(item.requiredQty)]));
assert.equal(requirements[`CHIP-${tag}`], 20, 'nested BOM component should be expanded');
assert.equal(requirements[`SPEAKER-${tag}`], 21, 'scrap rate should be included');
assert.equal(plan.materials.find(item => item.componentSku === `CHIP-${tag}`).materialId, chip.id);
assert.equal((await request(`/materials/${speaker.id}`, { version: speaker.version, name: speaker.name, kind: 'raw', active: false }, 'PATCH')).status, 409, 'released BOM material cannot be deactivated');
assert.equal((await request('/plans', { code: `BAD-BOM-${tag}`, product_material_id: wrongProduct.id, bom_id: root.id, target_qty: 1, due_at: new Date(Date.now() + 86400000).toISOString() })).status, 409);
const cycle = await ok('/boms', { product_material_id: moduleMaterial.id, items: [{ material_id: productMaterial.id, quantity_per_unit: '1' }] });
assert.equal((await request(`/boms/${cycle.id}/release`, { version: cycle.version })).status, 409, 'cycle must be rejected');
const renamed = await request(`/materials/${speaker.id}`, { version: speaker.version, name: '新款扬声器', kind: 'raw', description: '', active: true }, 'PATCH');
assert.equal(renamed.status, 200);
assert.equal((await ok(`/boms/${root.id}`)).items.find(item => item.materialId === speaker.id).componentName, '扬声器', 'BOM snapshot must retain original name');
const revised = await ok('/boms', { product_material_id: productMaterial.id, items: [{ material_id: speaker.id, quantity_per_unit: '3' }] });
assert.equal(revised.revision, 2);
await ok(`/boms/${revised.id}/release`, { version: revised.version });
assert.equal((await ok(`/boms/${root.id}`)).status, 'archived');
assert.equal(Number((await ok(`/plans/${plan.id}`)).materials.find(item => item.componentSku === `SPEAKER-${tag}`).requiredQty), 21, 'existing plan snapshot must not drift');
const newPlan = await ok('/plans', { code: `BOM-PLAN2-${tag}`, product_material_id: productMaterial.id, bom_id: revised.id, target_qty: 10, due_at: new Date(Date.now() + 86400000).toISOString() });
assert.equal(Number(newPlan.materials[0].requiredQty), 30);
await login(operator.email, password);
assert.equal((await request('/boms')).status, 403, 'operator must not see BOM administration');
assert.equal((await request('/materials')).status, 403, 'operator must not see material administration');
console.log('MES BOM flow passed: material master, linked BOM versioning, nested explosion, plan snapshot, cycle and role protection.');
