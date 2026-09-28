import 'dotenv/config';
import { hash as passwordHash } from 'bcryptjs';
import { PrismaClient } from './generated/client';

async function main() {
  const email = process.env.MES_BOOTSTRAP_EMAIL; const password = process.env.MES_BOOTSTRAP_PASSWORD;
  if (!email || !password || password.length < 12 || password === 'set-a-strong-local-password') throw new Error('Set a unique MES_BOOTSTRAP_EMAIL and MES_BOOTSTRAP_PASSWORD (12+ chars)');
  const db = new PrismaClient();
  try {
    const tenant = await db.tenant.upsert({ where: { slug: 'default' }, create: { slug: 'default', name: '默认工作区' }, update: {} });
    const user = await db.user.upsert({ where: { tenantId_email: { tenantId: tenant.id, email: email.toLowerCase() } }, create: { tenantId: tenant.id, email: email.toLowerCase(), name: '系统管理员', role: 'admin', passwordHash: await passwordHash(password, 12) }, update: {} });
    console.log(`MES administrator ready: ${user.email}`);
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exit(1); });
