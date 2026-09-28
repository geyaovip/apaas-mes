#!/bin/sh
set -eu
cd /workspace/apps/mes/backend
./node_modules/.bin/prisma migrate deploy
node dist/bootstrap-admin.js
exec node dist/main.js
