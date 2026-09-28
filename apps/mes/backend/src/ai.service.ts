import { Injectable } from '@nestjs/common';
import { Prisma } from './generated/client';
import { z } from 'zod';
import { Actor, AppError, parse } from './common';
import { PrismaService } from './prisma.service';
import { BomService } from './bom.service';
import { MesService } from './mes.service';
import { AiTurn, aiConfigured, generateAiAnswer } from './ai-model';

const chatInput = z.object({ conversation_id: z.string().uuid().optional(), context_type: z.enum(['dashboard', 'bom', 'plan']), context_id: z.string().uuid().optional(), message: z.string().trim().min(2).max(2000) });
type ContextType = z.infer<typeof chatInput>['context_type'];
const reviewSchema = z.object({
  summary: z.string().min(1).max(2000),
  issues: z.array(z.object({ severity: z.enum(['high', 'medium', 'low']), bom_item_id: z.string().uuid(), evidence: z.string().min(1).max(1000), suggestion: z.string().min(1).max(1000), confidence: z.number().min(0).max(1) })).max(20),
});
const reviewFormat = { name: 'bom_review', schema: { type: 'object', additionalProperties: false, required: ['summary', 'issues'], properties: { summary: { type: 'string' }, issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['severity', 'bom_item_id', 'evidence', 'suggestion', 'confidence'], properties: { severity: { type: 'string', enum: ['high', 'medium', 'low'] }, bom_item_id: { type: 'string' }, evidence: { type: 'string' }, suggestion: { type: 'string' }, confidence: { type: 'number' } } } } } } };

@Injectable()
export class AiService {
  constructor(private db: PrismaService, private boms: BomService, private mes: MesService) {}
  status() { return { configured: aiConfigured(), provider: aiConfigured() ? 'OpenAI' : null }; }

  private async context(actor: Actor, type: ContextType, id?: string) {
    if (type !== 'dashboard' && !id) throw new AppError('VALIDATION_ERROR', '请选择业务记录后再提问', 400);
    if (type === 'bom') {
      const bom = await this.boms.get(actor, id!);
      const previous = await this.db.bom.findFirst({ where: { tenantId: actor.tenantId, productSku: bom.productSku, revision: { lt: bom.revision }, status: { in: ['released', 'archived'] } }, include: { items: true }, orderBy: { revision: 'desc' } });
      const ids = bom.items.map(item => item.materialId).filter((value): value is string => Boolean(value));
      const materials = await this.db.material.findMany({ where: { tenantId: actor.tenantId, id: { in: ids } }, select: { id: true, sku: true, name: true, unit: true, kind: true, active: true } });
      const data = { current: { productSku: bom.productSku, revision: bom.revision, status: bom.status, note: bom.note, items: bom.items.map(item => ({ id: item.id, materialId: item.materialId, sku: item.componentSku, name: item.componentName, unit: item.unit, quantityPerUnit: item.quantityPerUnit, scrapRate: item.scrapRate })) }, previous: previous ? { revision: previous.revision, items: previous.items.map(item => ({ id: item.id, sku: item.componentSku, quantityPerUnit: item.quantityPerUnit, scrapRate: item.scrapRate })) } : null, materials };
      return { title: `BOM · ${bom.productSku} · V${bom.revision}`, href: `/boms/${id}`, data };
    }
    if (type === 'plan') {
      const plan = await this.mes.getPlan(actor, id!);
      return { title: `生产计划 · ${plan.code}`, href: `/plans/${id}`, data: { code: plan.code, productSku: plan.productSku, targetQty: plan.targetQty, dueAt: plan.dueAt, status: plan.status, materials: plan.materials, orders: plan.orders } };
    }
    return { title: '车间工作台', href: '/', data: await this.mes.dashboard(actor) };
  }

  async list(actor: Actor) {
    const rows = await this.db.aiConversation.findMany({ where: { tenantId: actor.tenantId, userId: actor.id }, orderBy: { updatedAt: 'desc' }, take: 20, select: { id: true, contextType: true, contextId: true, title: true, updatedAt: true } });
    const checked = await Promise.allSettled(rows.map(async row => { await this.context(actor, row.contextType as ContextType, row.contextId || undefined); return row; }));
    return checked.filter((item): item is PromiseFulfilledResult<typeof rows[number]> => item.status === 'fulfilled').map(item => item.value);
  }
  async get(actor: Actor, id: string) {
    const row = await this.db.aiConversation.findFirst({ where: { id, tenantId: actor.tenantId, userId: actor.id } });
    if (!row) throw new AppError('NOT_FOUND', '对话不存在', 404);
    await this.context(actor, row.contextType as ContextType, row.contextId || undefined);
    return row;
  }
  async remove(actor: Actor, id: string) {
    const row = await this.db.aiConversation.findFirst({ where: { id, tenantId: actor.tenantId, userId: actor.id }, select: { id: true } });
    if (!row) throw new AppError('NOT_FOUND', '对话不存在', 404);
    await this.db.aiConversation.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async latestBomReview(actor: Actor, id: string) {
    const bom = await this.boms.get(actor, id);
    const row = await this.db.auditLog.findFirst({ where: { tenantId: actor.tenantId, resourceType: 'bom', resourceId: id, action: 'ai.bom_review' }, orderBy: { createdAt: 'desc' } });
    const detail = row?.detail as { version?: number; review?: z.infer<typeof reviewSchema> } | null;
    return { review: detail?.version === bom.version ? detail.review || null : null, reviewed_at: detail?.version === bom.version ? row?.createdAt : null };
  }

  async reviewBom(actor: Actor, id: string, body: unknown) {
    const input = parse(z.object({ version: z.number().int().positive() }), body);
    const bom = await this.boms.get(actor, id);
    if (bom.version !== input.version) throw new AppError('VERSION_CONFLICT', 'BOM 已更新，请刷新后重试', 409);
    const source = await this.context(actor, 'bom', id);
    const raw = await generateAiAnswer('你是电子制造 BOM 审查助手。对照当前版、上一已发布版和物料档案，指出有依据的变更风险；没有证据时 issues 返回空数组。每条 issue 的 bom_item_id 必须是输入中当前或上一版的真实行 ID。不得声称已修改或发布 BOM。', source.data, [{ role: 'user', content: '请审查这个 BOM 版本。' }], reviewFormat);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new AppError('AI_INVALID_OUTPUT', 'AI 审查结果格式无效，请重试', 502); }
    const result = reviewSchema.safeParse(parsed);
    if (!result.success) throw new AppError('AI_INVALID_OUTPUT', 'AI 审查结果格式无效，请重试', 502);
    const data = source.data as { current: { items: { id: string }[] }; previous: { items: { id: string }[] } | null };
    const allowed = new Set([...data.current.items, ...(data.previous?.items || [])].map(item => item.id));
    if (result.data.issues.some(issue => !allowed.has(issue.bom_item_id))) throw new AppError('AI_INVALID_OUTPUT', 'AI 审查引用了不存在的 BOM 行，请重试', 502);
    const current = await this.boms.get(actor, id);
    if (current.version !== input.version) throw new AppError('VERSION_CONFLICT', 'BOM 审查期间已更新，请重新审查', 409);
    await this.db.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'ai.bom_review', resourceType: 'bom', resourceId: id, detail: { version: bom.version, revision: bom.revision, model: process.env.OPENAI_MODEL, review: result.data } as Prisma.InputJsonValue } });
    return { review: result.data, reviewed_at: new Date().toISOString() };
  }
  async chat(actor: Actor, body: unknown) {
    const input = parse(chatInput, body);
    const source = await this.context(actor, input.context_type, input.context_id);
    const old = input.conversation_id ? await this.get(actor, input.conversation_id) : null;
    if (old && (old.contextType !== input.context_type || old.contextId !== (input.context_id || null))) throw new AppError('AI_CONTEXT_CHANGED', '业务对象已切换，请新建对话', 409);
    const history = (old?.messages || []) as AiTurn[];
    const prompt = [...history, { role: 'user' as const, content: input.message }];
    const answer = await generateAiAnswer('你是电子制造 MES 助手。重点支持 BOM 版本复核。比较新旧组件、用量、损耗率和物料主数据状态；指出可核实的问题、对应组件 SKU 与建议。没有库存与领退料数据，不能推断缺料。所有发布和生产操作须人工完成。', { source: source.title, data: source.data }, prompt);
    const messages = [...prompt, { role: 'assistant' as const, content: answer }].slice(-20);
    let conversation;
    if (old) {
      const changed = await this.db.aiConversation.updateMany({ where: { id: old.id, tenantId: actor.tenantId, userId: actor.id, version: old.version }, data: { messages: messages as Prisma.InputJsonValue, version: { increment: 1 } } });
      if (!changed.count) throw new AppError('VERSION_CONFLICT', '对话已更新，请刷新后重试', 409);
      conversation = await this.db.aiConversation.findUniqueOrThrow({ where: { id: old.id } });
    } else conversation = await this.db.aiConversation.create({ data: { tenantId: actor.tenantId, userId: actor.id, contextType: input.context_type, contextId: input.context_id, title: source.title, messages: messages as Prisma.InputJsonValue } });
    await this.db.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'ai.chat', resourceType: 'ai_conversation', resourceId: conversation.id, detail: { contextType: input.context_type, contextId: input.context_id || null, model: process.env.OPENAI_MODEL } } });
    return { conversation_id: conversation.id, answer, messages, sources: [{ title: source.title, href: source.href }] };
  }
}
