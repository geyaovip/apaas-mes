import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { z } from 'zod';
import { Actor, AppError, parse, requireRole } from './common';
import { PrismaService } from './prisma.service';
import { AiConnection, testAiConnection } from './ai-model';

const modelSchema = z.string().trim().min(1).max(120);
const baseUrlSchema = z.string().trim().max(500).refine(value => {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.protocol === 'https:') return !['localhost', 'host.docker.internal'].includes(url.hostname) && !isIP(url.hostname);
    return url.protocol === 'http:' && process.env.AI_ALLOW_INSECURE_BASE_URL === 'true';
  } catch { return false; }
}, '请填写 HTTPS 的模型 API 根地址；本地 HTTP 地址需由部署者显式启用');
const inputSchema = z.object({ model: modelSchema, base_url: baseUrlSchema, api_key: z.string().trim().min(1).max(512).optional() });

function encryptionKey() {
  const secret = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new AppError('AI_SETTINGS_KEY_MISSING', '服务器尚未配置 AI 设置加密密钥', 503);
  return createHash('sha256').update(secret).digest();
}
function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}
function decrypt(value: string) {
  try {
    const [iv, tag, data] = value.split('.').map(part => Buffer.from(part, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch { throw new AppError('AI_SETTINGS_UNREADABLE', '模型密钥无法读取，请检查服务器加密密钥', 503); }
}

export async function resolveAiConnection(db: PrismaService, tenantId: string): Promise<AiConnection | null> {
  const saved = await db.aiProviderSettings.findUnique({ where: { tenantId } });
  if (saved) return { apiKey: decrypt(saved.keyCiphertext), model: saved.model, baseUrl: saved.baseUrl };
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) return { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL, baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1' };
  return null;
}

export async function aiStatus(db: PrismaService, tenantId: string) {
  const saved = await db.aiProviderSettings.findUnique({ where: { tenantId }, select: { model: true, baseUrl: true } });
  const configured = Boolean(saved || (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL));
  return { configured, provider: configured ? 'OpenAI-compatible' : null, model: saved?.model || (configured ? process.env.OPENAI_MODEL : null), source: saved ? 'workspace' : configured ? 'environment' : 'none' };
}

export async function publicAiSettings(db: PrismaService, actor: Actor) {
  requireRole(actor, 'admin');
  const saved = await db.aiProviderSettings.findUnique({ where: { tenantId: actor.tenantId }, select: { model: true, baseUrl: true, updatedAt: true } });
  const status = await aiStatus(db, actor.tenantId);
  return { ...status, model: saved?.model || process.env.OPENAI_MODEL || '', base_url: saved?.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', has_key: Boolean(saved || process.env.OPENAI_API_KEY), can_edit: Boolean(process.env.AI_CONFIG_ENCRYPTION_KEY && process.env.AI_CONFIG_ENCRYPTION_KEY.length >= 32), updated_at: saved?.updatedAt || null };
}

export async function saveAiSettings(db: PrismaService, actor: Actor, body: unknown) {
  requireRole(actor, 'admin');
  const input = parse(inputSchema, body);
  encryptionKey();
  const existing = await resolveAiConnection(db, actor.tenantId);
  const apiKey = input.api_key || (existing?.baseUrl === input.base_url ? existing.apiKey : null);
  if (!apiKey) throw new AppError('AI_KEY_REQUIRED', '首次接入或更换 API 地址时请填写 API Key', 400);
  await db.$transaction(async tx => {
    await tx.aiProviderSettings.upsert({ where: { tenantId: actor.tenantId }, create: { tenantId: actor.tenantId, model: input.model, baseUrl: input.base_url, keyCiphertext: encrypt(apiKey), updatedBy: actor.id }, update: { model: input.model, baseUrl: input.base_url, keyCiphertext: encrypt(apiKey), updatedBy: actor.id } });
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'ai.settings.updated', resourceType: 'ai_settings', resourceId: actor.tenantId, detail: { model: input.model, baseUrl: input.base_url, keyChanged: Boolean(input.api_key) } } });
  });
  return publicAiSettings(db, actor);
}

export async function testAiSettings(db: PrismaService, actor: Actor, body: unknown) {
  requireRole(actor, 'admin');
  const input = parse(inputSchema, body);
  const existing = input.api_key ? null : await resolveAiConnection(db, actor.tenantId);
  const apiKey = input.api_key || (existing?.baseUrl === input.base_url ? existing.apiKey : null);
  if (!apiKey) throw new AppError('AI_KEY_REQUIRED', '请填写此 API 地址的 API Key 后测试连接', 400);
  await testAiConnection({ apiKey, model: input.model, baseUrl: input.base_url });
  return { ok: true, model: input.model };
}

export async function clearAiSettings(db: PrismaService, actor: Actor) {
  requireRole(actor, 'admin');
  await db.$transaction(async tx => {
    await tx.aiProviderSettings.deleteMany({ where: { tenantId: actor.tenantId } });
    await tx.auditLog.create({ data: { tenantId: actor.tenantId, actorId: actor.id, action: 'ai.settings.cleared', resourceType: 'ai_settings', resourceId: actor.tenantId } });
  });
  return publicAiSettings(db, actor);
}
