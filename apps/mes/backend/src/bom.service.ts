import { Injectable } from '@nestjs/common';
import { Prisma } from './generated/client';
import { z } from 'zod';
import { Actor, fail, id, parse, requireRole } from './common';
import { PrismaService } from './prisma.service';

const decimal = z.string().regex(/^\d+(?:\.\d{1,3})?$/);
const bomInput = z.object({
  product_material_id: id,
  note: z.string().max(2000).optional(),
  items: z.array(z.object({
    material_id: id,
    quantity_per_unit: decimal.refine(value => new Prisma.Decimal(value).gt(0)),
    scrap_rate: z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine(value => new Prisma.Decimal(value).lt(100)).default('0'),
  })).min(1).max(50),
}).refine(value => new Set(value.items.map(item => item.material_id)).size === value.items.length, '同一物料只能出现一次');

type BomWithItems = Prisma.BomGetPayload<{ include: { items: true } }>;
type Material = { componentSku: string; componentName: string; materialId: string | null; unit: string; requiredQty: Prisma.Decimal };

@Injectable()
export class BomService {
  constructor(private db: PrismaService) {}

  list(actor: Actor) {
    requireRole(actor, 'admin', 'planner', 'supervisor');
    return this.db.bom.findMany({ where: { tenantId: actor.tenantId }, include: { _count: { select: { items: true, plans: true } } }, orderBy: [{ productSku: 'asc' }, { revision: 'desc' }] });
  }

  async listPage(actor: Actor, query: Record<string, unknown>) {
    requireRole(actor, 'admin', 'planner', 'supervisor');
    const q = parse(z.object({ page: z.coerce.number().int().min(1).default(1), page_size: z.coerce.number().int().min(1).max(100).default(20), q: z.string().trim().max(100).optional(), status: z.enum(['draft','released','archived']).optional() }), query);
    const where: Prisma.BomWhereInput = { tenantId: actor.tenantId, ...(q.status ? { status: q.status } : {}), ...(q.q ? { OR: [{ productSku: { contains: q.q, mode: 'insensitive' } }, { productName: { contains: q.q, mode: 'insensitive' } }] } : {}) };
    const [items,total] = await this.db.$transaction([this.db.bom.findMany({ where, include: { _count: { select: { items: true, plans: true } } }, orderBy: [{ productSku: 'asc' }, { revision: 'desc' }], skip: ((q.page ?? 1) - 1) * (q.page_size ?? 20), take: q.page_size ?? 20 }), this.db.bom.count({ where })]);
    return { items,total,page:q.page,page_size:q.page_size };
  }

  async get(actor: Actor, bomId: string) {
    requireRole(actor, 'admin', 'planner', 'supervisor');
    const bom = await this.db.bom.findFirst({ where: { id: bomId, tenantId: actor.tenantId }, include: { items: { orderBy: { componentSku: 'asc' } } } });
    if (!bom) fail('NOT_FOUND', 'BOM 不存在', 404);
    return bom;
  }

  async create(actor: Actor, body: unknown) {
    requireRole(actor, 'admin', 'planner');
    const input = parse(bomInput, body);
    if (input.items.some(item => item.material_id === input.product_material_id)) fail('BOM_CYCLE', '成品不能直接引用自身');
    return this.db.$transaction(async tx => {
      const materials = await tx.material.findMany({ where: { tenantId: actor.tenantId, id: { in: [input.product_material_id, ...input.items.map(item => item.material_id)] }, active: true } });
      if (materials.length !== input.items.length + 1) fail('MATERIAL_INVALID', '请选择当前工作区的有效物料', 409);
      const product = materials.find(material => material.id === input.product_material_id)!;
      if (!['semi', 'finished'].includes(product.kind)) fail('MATERIAL_KIND', 'BOM 成品只能选择半成品或成品', 409);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.tenantId}), hashtext(${product.sku}))::text`;
      const previous = await tx.bom.findFirst({ where: { tenantId: actor.tenantId, productSku: product.sku }, orderBy: { revision: 'desc' }, select: { revision: true } });
      const bom = await tx.bom.create({ data: {
        tenantId: actor.tenantId, productSku: product.sku, productName: product.name, productMaterialId: product.id,
        revision: (previous?.revision ?? 0) + 1, note: input.note, createdBy: actor.id,
        items: { create: input.items.map(item => { const material = materials.find(value => value.id === item.material_id)!; return { materialId: material.id, componentSku: material.sku, componentName: material.name, unit: material.unit, quantityPerUnit: new Prisma.Decimal(item.quantity_per_unit), scrapRate: new Prisma.Decimal(item.scrap_rate ?? '0') }; }) },
      }, include: { items: true } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'bom.created', resourceType: 'bom', resourceId: bom.id, detail: { revision: bom.revision, productSku: bom.productSku } } });
      return bom;
    });
  }

  async release(actor: Actor, bomId: string, body: unknown) {
    requireRole(actor, 'admin', 'planner');
    const input = parse(z.object({ version: z.number().int().positive() }), body);
    const bom = await this.get(actor, bomId);
    if (bom.status !== 'draft') fail('BOM_STATE', '只能发布草稿 BOM', 409);
    const allIds = [bom.productMaterialId, ...bom.items.map(item => item.materialId)].filter((value): value is string => Boolean(value));
    const activeCount = await this.db.material.count({ where: { tenantId: actor.tenantId, id: { in: allIds }, active: true } });
    if (activeCount !== allIds.length) fail('MATERIAL_INACTIVE', 'BOM 含已停用的物料，请先修订', 409);
    await this.explode(actor, bom, new Prisma.Decimal(1));
    return this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${actor.tenantId}), hashtext(${bom.productSku}))::text`;
      const changed = await tx.bom.updateMany({ where: { id: bomId, tenantId: actor.tenantId, status: 'draft', version: input.version }, data: { status: 'released', releasedAt: new Date(), version: { increment: 1 } } });
      if (!changed.count) fail('VERSION_CONFLICT', 'BOM 已被修改，请刷新后重试', 409);
      await tx.bom.updateMany({ where: { tenantId: actor.tenantId, productSku: bom.productSku, status: 'released', id: { not: bomId } }, data: { status: 'archived', version: { increment: 1 } } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'bom.released', resourceType: 'bom', resourceId: bomId, detail: { revision: bom.revision, productSku: bom.productSku } } });
      return tx.bom.findUniqueOrThrow({ where: { id: bomId }, include: { items: true } });
    });
  }

  async materialsForPlan(actor: Actor, bomId: string, productSku: string, targetQty: number): Promise<Material[]> {
    const bom = await this.db.bom.findFirst({ where: { id: bomId, tenantId: actor.tenantId, status: 'released' }, include: { items: true } });
    if (!bom || bom.productSku !== productSku) fail('BOM_INVALID', '请选择与计划产品 SKU 一致的已发布 BOM', 409);
    return this.explode(actor, bom, new Prisma.Decimal(targetQty));
  }

  private async explode(actor: Actor, root: BomWithItems, quantity: Prisma.Decimal): Promise<Material[]> {
    const totals = new Map<string, Material>();
    const visit = async (bom: BomWithItems, count: Prisma.Decimal, path: Set<string>, depth: number): Promise<void> => {
      if (depth > 10 || path.has(bom.productSku)) fail('BOM_CYCLE', 'BOM 存在循环引用或层级超过 10 级', 409);
      const nextPath = new Set(path); nextPath.add(bom.productSku);
      for (const item of bom.items) {
        const required = count.mul(item.quantityPerUnit).mul(new Prisma.Decimal(1).plus(item.scrapRate.div(100)));
        const child = await this.db.bom.findFirst({ where: { tenantId: actor.tenantId, productSku: item.componentSku, status: 'released' }, include: { items: true }, orderBy: { revision: 'desc' } });
        if (child) { await visit(child, required, nextPath, depth + 1); continue; }
        if (nextPath.has(item.componentSku)) fail('BOM_CYCLE', 'BOM 存在循环引用', 409);
        const existing = totals.get(item.componentSku);
        if (existing && existing.unit !== item.unit) fail('BOM_UNIT_CONFLICT', '同一物料在 BOM 中使用了不同单位', 409);
        totals.set(item.componentSku, { componentSku: item.componentSku, componentName: item.componentName, materialId: item.materialId, unit: item.unit, requiredQty: (existing?.requiredQty ?? new Prisma.Decimal(0)).plus(required) });
        if (totals.size > 1000) fail('BOM_TOO_LARGE', '展开后的物料超过 1000 种', 409);
      }
    };
    await visit(root, quantity, new Set(), 0);
    return [...totals.values()].map(item => ({ ...item, requiredQty: item.requiredQty.toDecimalPlaces(3, Prisma.Decimal.ROUND_UP) }));
  }
}
