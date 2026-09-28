# 轻量 MES

轻量 MES 是可独立部署的前后端业务系统。源码位于 [apps/mes](apps/mes/)，包含 NestJS API、React 前端、Prisma 迁移和业务文档。核心业务使用本地账号，不依赖办公平台登录。具体功能范围见[应用说明](apps/mes/README.md)。

公网入口：[https://apaas-mes.492746023.workers.dev](https://apaas-mes.492746023.workers.dev)。该入口使用本仓库的 Cloudflare Worker 前端和独立部署在云服务器上的 API、PostgreSQL。线上管理员凭据保存在服务器的 `/opt/apaas/apaas-mes/.env`；首次登录工作区为 `default`。本仓库不会包含线上凭据或业务数据。

## 本地安装

需要 Node.js 22、Docker Engine/Desktop 和 Compose。克隆本仓库后运行：

```bash
node scripts/init-local.mjs
node scripts/start-local.mjs
```

打开 http://localhost:4400，工作区填 `default`。管理员账号和随机密码写在仅当前用户可读的 `.env`。API 与 PostgreSQL 数据保存在独立容器及数据卷中。部署、备份、密码恢复及 Cloudflare 发布见[部署与运维](docs/08-开源本地部署.md)。

## 开发

```bash
pnpm install --frozen-lockfile
pnpm build:mes
```

集成测试 `pnpm test:mes` 会写入测试数据库，不能对生产库运行。AI 功能通过后端环境变量自行接入模型；不配置时核心业务可用。飞书、钉钉、企微集成尚未接通。源码采用 [Apache-2.0](LICENSE)，安全问题见 [SECURITY.md](SECURITY.md)。
