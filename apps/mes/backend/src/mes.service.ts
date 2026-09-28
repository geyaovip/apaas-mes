import { Injectable } from '@nestjs/common';
import { Prisma } from './generated/client';
import { z } from 'zod';
import { Actor, fail, id, label, parse, requireRole } from './common';
import { PrismaService } from './prisma.service';
import { BomService } from './bom.service';

const page = z.object({ page: z.coerce.number().int().min(1).default(1), page_size: z.coerce.number().int().min(1).max(100).default(20) });
const planInput = z.object({ code: label(60), product_material_id: id, target_qty: z.number().int().positive().max(10000000), due_at: z.string().datetime(), note: z.string().max(2000).optional(), bom_id: id.optional() });
const orderInput = z.object({ code: label(60), operation: label(120), target_qty: z.number().int().positive(), assignee_id: id });
const reportInput = z.object({ good_qty: z.number().int().min(0), defect_qty: z.number().int().min(0), note: z.string().max(2000).optional() });

@Injectable()
export class MesService {
  constructor(private db: PrismaService, private boms: BomService) {}
  private audit(tx: Prisma.TransactionClient, actor: Actor, action: string, resourceType: string, resourceId: string, detail: Record<string, unknown> = {}) { return tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action, resourceType, resourceId, detail: detail as Prisma.InputJsonObject } }); }
  private async plan(actor: Actor, planId: string) {
    const where: Prisma.ProductionPlanWhereInput = { id: planId, tenantId: actor.tenantId, ...(actor.role === 'operator' ? { orders: { some: { assigneeId: actor.id } } } : {}) };
    const result = await this.db.productionPlan.findFirst({ where, include: { bom: { select: { id: true, productSku: true, revision: true, status: true } }, materials: { orderBy: { componentSku: 'asc' } }, orders: { where: actor.role === 'operator' ? { assigneeId: actor.id } : {}, orderBy: { createdAt: 'asc' }, include: { assignee: { select: { id: true, name: true } } } } } });
    if (!result) fail('NOT_FOUND', '生产计划不存在或无权查看', 404);
    return result;
  }
  private async order(actor: Actor, orderId: string) {
    const result = await this.db.workOrder.findFirst({ where: { id: orderId, tenantId: actor.tenantId, ...(actor.role === 'operator' ? { assigneeId: actor.id } : {}) }, include: { plan: { select: { id: true, code: true, product: true, productSku: true } }, assignee: { select: { id: true, name: true } }, reports: { orderBy: { createdAt: 'desc' }, include: { reporter: { select: { id: true, name: true } }, reviewer: { select: { id: true, name: true } } } } } });
    if (!result) fail('NOT_FOUND', '工单不存在或无权查看', 404);
    return result;
  }
  async listPlans(actor: Actor, query: Record<string, unknown>) {
    const q = parse(page.extend({ status: z.enum(['draft', 'released', 'completed']).optional() }), query);
    const where: Prisma.ProductionPlanWhereInput = { tenantId: actor.tenantId, ...(q.status ? { status: q.status } : {}), ...(actor.role === 'operator' ? { orders: { some: { assigneeId: actor.id } } } : {}) };
    const [items, total] = await this.db.$transaction([this.db.productionPlan.findMany({ where, orderBy: { createdAt: 'desc' }, skip: ((q.page ?? 1) - 1) * (q.page_size ?? 20), take: q.page_size ?? 20, include: { _count: { select: { orders: true } } } }), this.db.productionPlan.count({ where })]);
    return { items, total, page: q.page, page_size: q.page_size };
  }
  async createPlan(actor: Actor, body: unknown) {
    requireRole(actor, 'admin', 'planner'); const input = parse(planInput, body);
    if (new Date(input.due_at) <= new Date()) fail('DUE_DATE', '计划截止时间必须晚于当前时间');
    const productMaterial = await this.db.material.findFirst({ where: { id: input.product_material_id, tenantId: actor.tenantId, active: true, kind: { in: ['semi', 'finished'] } } });
    if (!productMaterial) fail('MATERIAL_INVALID', '请选择有效的半成品或成品', 409);
    const product = productMaterial.name;
    const productSku = productMaterial.sku;
    const materials = input.bom_id ? await this.boms.materialsForPlan(actor, input.bom_id, productSku, input.target_qty) : [];
    return this.db.$transaction(async tx => { const item = await tx.productionPlan.create({ data: { tenantId: actor.tenantId, code: input.code, product, productSku, productMaterialId: productMaterial.id, bomId: input.bom_id, targetQty: input.target_qty, dueAt: new Date(input.due_at), note: input.note, createdBy: actor.id, materials: { create: materials.map(material => ({ tenantId: actor.tenantId, ...material })) } }, include: { materials: true } }); await this.audit(tx, actor, 'plan.created', 'plan', item.id, { bomId: input.bom_id, materialCount: materials.length }); return item; });
  }
  getPlan(actor: Actor, planId: string) { return this.plan(actor, planId); }
  async releasePlan(actor: Actor, planId: string, body: unknown) {
    requireRole(actor, 'admin', 'planner'); const input = parse(z.object({ version: z.number().int().positive() }), body); const plan = await this.plan(actor, planId);
    if (plan.status !== 'draft') fail('PLAN_STATE', '只能发布草稿计划', 409);
    return this.db.$transaction(async tx => { const changed = await tx.productionPlan.updateMany({ where: { id: planId, tenantId: actor.tenantId, version: input.version, status: 'draft' }, data: { status: 'released', version: { increment: 1 } } }); if (!changed.count) fail('VERSION_CONFLICT', '记录已被修改，请刷新后重试', 409); await this.audit(tx, actor, 'plan.released', 'plan', planId); return tx.productionPlan.findUniqueOrThrow({ where: { id: planId } }); });
  }
  async createOrder(actor: Actor, planId: string, body: unknown) {
    requireRole(actor, 'admin', 'planner'); const input = parse(orderInput, body); const plan = await this.plan(actor, planId);
    if (plan.status !== 'released') fail('PLAN_STATE', '计划未发布或已完成', 409);
    const assignee = await this.db.user.findFirst({ where: { id: input.assignee_id, tenantId: actor.tenantId, active: true, role: 'operator' } });
    if (!assignee) fail('ASSIGNEE_INVALID', '请选择有效操作员');
    return this.db.$transaction(async tx => {
      const reserved = await tx.workOrder.aggregate({ where: { tenantId: actor.tenantId, planId }, _sum: { targetQty: true } });
      if ((reserved._sum.targetQty || 0) + input.target_qty > plan.targetQty) fail('PLAN_OVERALLOCATED', '工单计划量超过生产计划总量', 409);
      const changed = await tx.productionPlan.updateMany({ where: { id: planId, tenantId: actor.tenantId, version: plan.version, status: 'released' }, data: { version: { increment: 1 } } });
      if (!changed.count) fail('VERSION_CONFLICT', '计划已被其他人修改，请刷新后重试', 409);
      const order = await tx.workOrder.create({ data: { tenantId: actor.tenantId, planId, code: input.code, operation: input.operation, targetQty: input.target_qty, assigneeId: assignee.id } });
      await this.audit(tx, actor, 'order.created', 'order', order.id, { planId }); return order;
    });
  }
  async listOrders(actor: Actor, query: Record<string, unknown>) {
    const q = parse(page.extend({ status: z.enum(['released', 'in_progress', 'completed']).optional(), plan_id: id.optional() }), query);
    const where: Prisma.WorkOrderWhereInput = { tenantId: actor.tenantId, ...(actor.role === 'operator' ? { assigneeId: actor.id } : {}), ...(q.status ? { status: q.status } : {}), ...(q.plan_id ? { planId: q.plan_id } : {}) };
    const [items, total] = await this.db.$transaction([this.db.workOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: ((q.page ?? 1) - 1) * (q.page_size ?? 20), take: q.page_size ?? 20, include: { plan: { select: { code: true, product: true } }, assignee: { select: { name: true } } } }), this.db.workOrder.count({ where })]);
    return { items, total, page: q.page, page_size: q.page_size };
  }
  getOrder(actor: Actor, orderId: string) { return this.order(actor, orderId); }
  async createReport(actor: Actor, orderId: string, body: unknown) {
    requireRole(actor, 'operator'); const input = parse(reportInput, body); const order = await this.order(actor, orderId);
    if (input.good_qty + input.defect_qty <= 0) fail('QUANTITY', '报工数量必须大于零');
    if (order.status === 'completed') fail('ORDER_CLOSED', '工单已完成', 409);
    return this.db.$transaction(async tx => { const report = await tx.workReport.create({ data: { tenantId: actor.tenantId, orderId, reporterId: actor.id, goodQty: input.good_qty, defectQty: input.defect_qty, note: input.note } }); await this.audit(tx, actor, 'report.submitted', 'report', report.id, { orderId }); return report; });
  }
  async listPendingReports(actor: Actor) { requireRole(actor, 'admin', 'supervisor'); return this.db.workReport.findMany({ where: { tenantId: actor.tenantId, status: 'pending' }, orderBy: { createdAt: 'asc' }, include: { order: { select: { id: true, code: true, operation: true } }, reporter: { select: { name: true } } } }); }
  async reviewReport(actor: Actor, reportId: string, body: unknown) {
    requireRole(actor, 'admin', 'supervisor'); const input = parse(z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(1000).optional() }), body);
    if (input.decision === 'reject' && !input.reason) fail('REASON_REQUIRED', '拒绝时必须填写原因');
    const report = await this.db.workReport.findFirst({ where: { id: reportId, tenantId: actor.tenantId } });
    if (!report) fail('NOT_FOUND', '报工记录不存在', 404);
    if (report.status !== 'pending') fail('REPORT_STATE', '报工记录已审核', 409);
    if (report.reporterId === actor.id) fail('SELF_REVIEW', '不能审核自己的报工', 403);
    return this.db.$transaction(async tx => {
      const order = await tx.workOrder.findFirst({ where: { id: report.orderId, tenantId: actor.tenantId } });
      if (!order) fail('NOT_FOUND', '工单不存在', 404);
      if (input.decision === 'approve') {
        if (order.goodQty + order.defectQty + report.goodQty + report.defectQty > order.targetQty) fail('ORDER_OVERREPORTED', '审核后累计报工数将超过工单计划量', 409);
        const changed = await tx.workOrder.updateMany({ where: { id: order.id, tenantId: actor.tenantId, version: order.version, status: { not: 'completed' } }, data: { goodQty: { increment: report.goodQty }, defectQty: { increment: report.defectQty }, status: order.goodQty + order.defectQty + report.goodQty + report.defectQty === order.targetQty ? 'completed' : 'in_progress', version: { increment: 1 } } });
        if (!changed.count) fail('VERSION_CONFLICT', '工单已变化，请刷新后重试', 409);
      }
      const changedReport = await tx.workReport.updateMany({ where: { id: reportId, tenantId: actor.tenantId, status: 'pending' }, data: { status: input.decision === 'approve' ? 'approved' : 'rejected', reviewerId: actor.id, reviewedAt: new Date(), reason: input.reason } });
      if (!changedReport.count) fail('REPORT_STATE', '报工记录已审核', 409);
      await this.audit(tx, actor, `report.${input.decision}`, 'report', reportId, { orderId: order.id, goodQty: report.goodQty, defectQty: report.defectQty, reason: input.reason });
      const remaining = await tx.workOrder.count({ where: { tenantId: actor.tenantId, planId: order.planId, status: { not: 'completed' } } });
      const all = await tx.workOrder.aggregate({ where: { tenantId: actor.tenantId, planId: order.planId }, _sum: { targetQty: true } });
      const plan = await tx.productionPlan.findUniqueOrThrow({ where: { id: order.planId } });
      if (input.decision === 'approve' && remaining === 0 && all._sum.targetQty === plan.targetQty) await tx.productionPlan.updateMany({ where: { id: plan.id, tenantId: actor.tenantId, status: 'released' }, data: { status: 'completed', version: { increment: 1 } } });
      return tx.workReport.findUniqueOrThrow({ where: { id: reportId } });
    });
  }
  async dashboard(actor: Actor) {
    const orderWhere: Prisma.WorkOrderWhereInput = { tenantId: actor.tenantId, ...(actor.role === 'operator' ? { assigneeId: actor.id } : {}) };
    const [activePlans, activeOrders, pendingReports, totals] = await Promise.all([
      this.db.productionPlan.count({ where: { tenantId: actor.tenantId, status: 'released', ...(actor.role === 'operator' ? { orders: { some: { assigneeId: actor.id } } } : {}) } }),
      this.db.workOrder.count({ where: { ...orderWhere, status: { not: 'completed' } } }),
      actor.role === 'operator' ? this.db.workReport.count({ where: { tenantId: actor.tenantId, reporterId: actor.id, status: 'pending' } }) : this.db.workReport.count({ where: { tenantId: actor.tenantId, status: 'pending' } }),
      this.db.workOrder.aggregate({ where: orderWhere, _sum: { targetQty: true, goodQty: true, defectQty: true } }),
    ]);
    return { active_plans: activePlans, active_orders: activeOrders, pending_reports: pendingReports, target_qty: totals._sum.targetQty || 0, good_qty: totals._sum.goodQty || 0, defect_qty: totals._sum.defectQty || 0, definition: '仅已审核报工计入合格数和不良数' };
  }
  async listUsers(actor: Actor) { requireRole(actor, 'admin'); return this.db.user.findMany({ where: { tenantId: actor.tenantId }, select: { id: true, name: true, email: true, role: true, active: true }, orderBy: { createdAt: 'asc' } }); }
  async createUser(actor: Actor, body: unknown) {
    requireRole(actor, 'admin'); const input = parse(z.object({ name: label(100), email: z.string().email(), password: z.string().min(12).max(200), role: z.enum(['admin', 'planner', 'supervisor', 'operator']) }), body);
    const { hash } = await import('bcryptjs'); const passwordHash = await hash(input.password, 12);
    const user = await this.db.user.create({ data: { tenantId: actor.tenantId, name: input.name, email: input.email.toLowerCase(), passwordHash, role: input.role } });
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
