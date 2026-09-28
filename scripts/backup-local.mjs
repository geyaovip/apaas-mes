import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const dir = resolve(root, process.argv[2] || 'backups'); mkdirSync(dir, { recursive: true });
const file = resolve(dir, new Date().toISOString().replaceAll(':', '-') + '.dump');
const output = createWriteStream(file, { mode: 0o600 });
const child = spawn('docker', ['compose', '--env-file', '.env', '-f', 'deploy/compose.yaml', 'exec', '-T', 'db', 'pg_dump', '-U', 'mes', '-Fc', 'mes'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
const exit = new Promise(resolve => child.on('close', resolve));
try {
  await pipeline(child.stdout, output);
  if (await exit !== 0) throw new Error('pg_dump failed');
  console.log(file);
} catch (error) { rmSync(file, { force: true }); throw error; }
