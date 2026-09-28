import { ArgumentsHost, Catch, CanActivate, ExecutionContext, HttpException, Injectable, ExceptionFilter } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { PrismaService } from './prisma.service';

export type Role = 'admin' | 'planner' | 'supervisor' | 'operator';
export interface Actor { id: string; tenantId: string; name: string; role: Role }
export interface AuthRequest extends Request { actor: Actor; requestId: string }
export class AppError extends HttpException { constructor(public code: string, message: string, status = 422, public details: Record<string, unknown> = {}) { super(message, status); } }
export function fail(code: string, message: string, status = 422): never { throw new AppError(code, message, status); }
export function parse<T>(schema: z.ZodSchema<T>, value: unknown): T { const result = schema.safeParse(value); if (!result.success) throw new AppError('VALIDATION_ERROR', '提交内容有误，请检查表单', 400, { fields: result.error.flatten().fieldErrors }); return result.data; }
export function requireRole(actor: Actor, ...roles: Role[]) { if (!roles.includes(actor.role)) fail('FORBIDDEN', '没有执行此操作的权限', 403); }
export const id = z.string().uuid();
export const label = (max = 200) => z.string().trim().min(1).max(max);
export function hash(value: string) { return createHash('sha256').update(value).digest('hex'); }

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const token = req.cookies?.mes_session;
    if (!token || typeof token !== 'string') fail('UNAUTHENTICATED', '请先登录', 401);
    const session = await this.db.session.findUnique({ where: { tokenHash: hash(token) }, include: { user: true } });
    if (!session || session.expiresAt <= new Date() || !session.user.active) fail('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
    req.actor = { id: session.user.id, tenantId: session.tenantId, name: session.user.name, role: session.user.role as Role };
    return true;
  }
}

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>(); const req = host.switchToHttp().getRequest<AuthRequest>(); const requestId = req.requestId || randomUUID();
    if (error instanceof AppError) return res.status(error.getStatus()).json({ error: { code: error.code, message: error.message, request_id: requestId, details: error.details } });
    if (error instanceof HttpException) return res.status(error.getStatus()).json({ error: { code: 'HTTP_ERROR', message: error.message, request_id: requestId } });
    const code = (error as { code?: string })?.code;
    if (code === 'P2002') return res.status(409).json({ error: { code: 'DUPLICATE', message: '编号或邮箱已存在', request_id: requestId } });
    if (code === 'P2025') return res.status(404).json({ error: { code: 'NOT_FOUND', message: '记录不存在', request_id: requestId } });
    console.error(`[${requestId}]`, error instanceof Error ? error.stack : 'Unknown error');
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: '服务暂时不可用', request_id: requestId } });
  }
}
