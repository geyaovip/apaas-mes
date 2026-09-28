import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
const root = resolve(import.meta.dirname, '..');
if (!existsSync(resolve(root, '.env'))) throw new Error('先运行 node scripts/init-local.mjs');
const result = spawnSync('docker', ['compose', '--env-file', '.env', '-f', 'deploy/compose.yaml', 'up', '--build', '-d'], { cwd: root, stdio: 'inherit' });
process.exit(result.status ?? 1);
