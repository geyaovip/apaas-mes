import 'dotenv/config';
import { hash } from 'bcryptjs';
import { PrismaClient } from './generated/client';

async function main() {
  const email = process.env.MES_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.MES_BOOTSTRAP_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error('Set MES_BOOTSTRAP_EMAIL and MES_BOOTSTRAP_PASSWORD (12+ characters)');
  const db = new PrismaClient();
  try {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: 'default' } });
    const user = await db.user.findUniqueOrThrow({ where: { tenantId_email: { tenantId: tenant.id, email } } });
    if (user.role !== 'admin') throw new Error('Configured account is not an administrator');
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { passwordHash: await hash(password, 12), active: true } }),
      db.session.deleteMany({ where: { userId: user.id, tenantId: tenant.id } }),
    ]);
    console.log(`Administrator password reset for ${email}; all sessions revoked.`);
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
