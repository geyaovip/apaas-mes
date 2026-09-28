import { Injectable } from '@nestjs/common';
import { Prisma } from './generated/client';
import { z } from 'zod';
import { Actor, fail, label, parse, requireRole } from './common';
import { PrismaService } from './prisma.service';

const kind = z.enum(['raw', 'semi', 'finished', 'packaging', 'consumable']);
const createInput = z.object({ sku: label(80), name: label(200), kind, unit: label(20), description: z.string().trim().max(2000).optional() });
const updateInput = z.object({ version: z.number().int().positive(), name: label(200), kind, description: z.string().trim().max(2000).optional(), active: z.boolean() });
const listInput = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.union([kind, z.literal('manufactured')]).optional(),
  status: z.enum(['active', 'inactive', 'all']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});

@Injectable()
export class MaterialService {
  constructor(private db: PrismaService) {}

  async list(actor: Actor, query: Record<string, unknown>) {
    requireRole(actor, 'admin', 'planner', 'supervisor');
    const q = parse(listInput, query);
    const page = q.page ?? 1;
    const pageSize = q.page_size ?? 20;
    const where: Prisma.MaterialWhereInput = {
      tenantId: actor.tenantId,
      ...(q.status === 'all' ? {} : { active: q.status === 'active' }),
      ...(q.kind ? { kind: q.kind === 'manufactured' ? { in: ['semi', 'finished'] } : q.kind } : {}),
      ...(q.q ? { OR: [{ sku: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await this.db.$transaction([
      this.db.material.findMany({ where, orderBy: [{ sku: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.db.material.count({ where }),
    ]);
    return { items, total, page, page_size: pageSize };
  }

  async get(actor: Actor, materialId: string) {
    requireRole(actor, 'admin', 'planner', 'supervisor');
    const item = await this.db.material.findFirst({ where: { id: materialId, tenantId: actor.tenantId } });
    if (!item) fail('NOT_FOUND', '物料不存在', 404);
    return item;
  }

  async create(actor: Actor, body: unknown) {
    requireRole(actor, 'admin', 'planner');
    const input = parse(createInput, body);
    if (['semi', 'finished'].includes(input.kind) && input.unit !== '件') fail('UNIT_UNSUPPORTED', '当前生产计划按件管理，半成品和成品的基础单位须为“件”');
    return this.db.$transaction(async tx => {
      const item = await tx.material.create({ data: { tenantId: actor.tenantId, ...input } });
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'material.created', resourceType: 'material', resourceId: item.id, detail: { sku: item.sku, kind: item.kind } } });
      return item;
    });
  }

  async update(actor: Actor, materialId: string, body: unknown) {
    requireRole(actor, 'admin', 'planner');
    const input = parse(updateInput, body);
    return this.db.$transaction(async tx => {
      const current = await tx.material.findFirst({ where: { id: materialId, tenantId: actor.tenantId } });
      if (!current) fail('NOT_FOUND', '物料不存在', 404);
      if (['semi', 'finished'].includes(input.kind) && current.unit !== '件') fail('UNIT_UNSUPPORTED', '当前生产计划按件管理，半成品和成品的基础单位须为“件”');
      if (!input.active && current.active) {
        const activeBom = await tx.bom.findFirst({ where: { tenantId: actor.tenantId, status: 'released', OR: [{ productMaterialId: materialId }, { items: { some: { materialId } } }] }, select: { id: true } });
        if (activeBom) fail('MATERIAL_IN_USE', '该物料被已发布 BOM 使用，请先发布不含该物料的新版本', 409);
        const openPlan = await tx.productionPlan.findFirst({ where: { tenantId: actor.tenantId, status: { in: ['draft', 'released'] }, OR: [{ productSku: current.sku }, { materials: { some: { materialId } } }] }, select: { id: true } });
        if (openPlan) fail('MATERIAL_IN_USE', '该物料被未完结的生产计划使用，不能停用', 409);
      }
      if (['raw', 'packaging', 'consumable'].includes(input.kind)) {
        const productBom = await tx.bom.findFirst({ where: { tenantId: actor.tenantId, productMaterialId: materialId, status: { in: ['draft', 'released'] } }, select: { id: true } });
        if (productBom) fail('MATERIAL_KIND', '已有 BOM 的成品只能设为半成品或成品', 409);
        const productPlan = await tx.productionPlan.findFirst({ where: { tenantId: actor.tenantId, productMaterialId: materialId, status: { in: ['draft', 'released'] } }, select: { id: true } });
        if (productPlan) fail('MATERIAL_KIND', '未完结计划使用的产品只能设为半成品或成品', 409);
      }
      const changed = await tx.material.updateMany({ where: { id: materialId, tenantId: actor.tenantId, version: input.version }, data: { name: input.name, kind: input.kind, description: input.description, active: input.active, version: { increment: 1 } } });
      if (!changed.count) fail('VERSION_CONFLICT', '物料已变化，请刷新后重试', 409);
      await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'material.updated', resourceType: 'material', resourceId: materialId, detail: { name: input.name, kind: input.kind, active: input.active } } });
      return tx.material.findUniqueOrThrow({ where: { id: materialId } });
    });
  }
}
