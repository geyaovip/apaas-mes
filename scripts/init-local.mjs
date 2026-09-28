import { randomBytes } from 'node:crypto';
import { openSync, writeFileSync, closeSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const file = resolve(import.meta.dirname, '..', '.env');
if (existsSync(file)) { console.log('已有 .env，未覆盖。'); process.exit(0); }
const secret = () => randomBytes(24).toString('hex');
const body = ['WEB_PORT=4400', 'DB_PASSWORD='+secret(), 'ADMIN_EMAIL=admin@local.invalid', 'ADMIN_PASSWORD='+secret(), 'FRONTEND_ORIGIN=http://localhost:4400', 'COOKIE_SECURE=false', 'OPENAI_API_KEY=', 'OPENAI_MODEL=', 'OPENAI_BASE_URL=', 'AI_CONFIG_ENCRYPTION_KEY='+secret(), 'AI_ALLOW_INSECURE_BASE_URL=false'].join('\n')+'\n';
const fd = openSync(file, 'wx', 0o600); try { writeFileSync(fd, body); } finally { closeSync(fd); }
console.log('已生成仅当前用户可读的 .env；登录只需邮箱和密码。');
