# 轻量 MES

面向电子行业车间的开源制造执行系统，以 **物料档案 → BOM 版本 → 生产计划 → 工单 → 报工审核 → 进度统计** 为主线。前端、API 和 PostgreSQL 数据库可独立部署；核心流程使用本地账号，不依赖办公平台授权。

[在线入口](https://apaas-mes.492746023.workers.dev) · [线上发布记录](docs/09-线上发布记录.md) · [业务规则](apps/mes/docs/01-产品需求.md)

## 业务能力

| 板块 | 当前能力 |
| --- | --- |
| 物料档案 | 按租户维护唯一 SKU、分类、名称与基础单位；BOM 的成品和组件从启用中的档案选择，保留创建时快照。 |
| BOM | 草稿、组件用量和损耗率、版本发布与旧版归档；支持多级展开，拒绝循环引用和超过限制的层级。 |
| 生产计划 | 从物料档案选择产品与已发布 BOM，生成多级物料需求快照；后续 BOM 改版不会回写旧计划。 |
| 工单与报工 | 计划下达工单，操作员提交合格数和不良数，主管审核；拒绝报工保留记录但不计入产量，超量报工被拒绝。 |
| 工作台与权限 | 查看计划和工单进度；管理员、计划员、主管、操作员按角色与记录归属访问数据。 |
| AI 助手 | 可在 BOM 和计划上下文中提问，对 BOM 生成引用真实组件行的只读审查建议；发布仍由人工完成。 |

生产进度按**已审核的合格数量**计算。BOM 物料需求是计划快照，当前系统未建立实物库存或领料流水；完整约束见[产品需求](apps/mes/docs/01-产品需求.md)。

## 本地部署

需要 **Node.js 22、Docker Engine/Desktop 与 Docker Compose**。从空数据库启动时自动生成随机凭据、执行迁移并创建管理员。

```bash
git clone https://github.com/geyaovip/apaas-mes.git
cd apaas-mes
node scripts/init-local.mjs
node scripts/start-local.mjs
```

打开 [http://localhost:4400](http://localhost:4400)，使用该应用的管理员凭据登录。管理员账号和密码位于根目录权限受限的 `.env`；首次登录后建议修改密码。重复初始化不会覆盖已有 `.env`。

```bash
docker compose --env-file .env -f deploy/compose.yaml ps
curl -fsS http://localhost:4400/api/v1/health
node scripts/backup-local.mjs
```

数据库保存在独立 Docker 卷。停机、备份恢复、密码恢复和生产部署详见[部署与运维](docs/08-开源本地部署.md)；保存业务数据后不要执行 `docker compose down -v`。

## 技术结构

| 层 | 实现 | 目录 |
| --- | --- | --- |
| Web | React、TypeScript、Vite，适配桌面与手机浏览器 | [`apps/mes/frontend/`](apps/mes/frontend/) |
| API | NestJS、BOM/计划/工单规则与服务端权限 | [`apps/mes/backend/`](apps/mes/backend/) |
| 数据 | PostgreSQL 17、Prisma 模型与迁移 | [`apps/mes/backend/prisma/`](apps/mes/backend/prisma/) |
| 本地运行 | Docker Compose 启动 Web、API 与独立数据库 | [`deploy/`](deploy/) |
| 公网部署 | Cloudflare Worker 托管前端并转发同源 `/api/*`；云服务器运行 API 与数据库 | [`cloudflare/`](cloudflare/)、[`wrangler.jsonc`](wrangler.jsonc) |

公开仓库不包含线上管理员凭据或生产数据。自行部署时请按[生产运维记录](docs/09-线上发布记录.md)配置镜像、HTTPS 网关和 Worker Secret。

## AI 配置与边界

管理员在左下角账号菜单进入“模型接入”，填写兼容 OpenAI Responses API 的 API 根地址、模型名称和 API Key，可先测试再保存。密钥在服务端加密保存，页面不回显；部署时必须设置并长期保管 `AI_CONFIG_ENCRYPTION_KEY`。也可在 API 服务端配置 `OPENAI_API_KEY`、`OPENAI_MODEL` 和可选的 `OPENAI_BASE_URL` 作为默认值。未接入兼容 OpenAI Responses API 的模型时，制造业务仍可使用，AI 入口会提示未启用。BOM 审查结果引用当前版本的组件行，作为人工复核建议；不会自动发布 BOM、修改计划或审核报工。参见[AI 能力与数据边界](docs/06-AI能力实施规划.md)。

## 开发与验证

先按上文启动本地环境，再安装开发依赖并运行构建和集成测试：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build:mes
corepack pnpm test:mes
```

集成测试覆盖物料档案、BOM 版本与多级展开、计划快照、工单报工和审核。测试**会写入所连接的数据库**，只能对独立测试环境运行。GitHub 的 [Build 工作流](.github/workflows/build.yml)负责构建检查；API 镜像工作流见[配置](.github/workflows/api-image.yml)。参与开发见[CONTRIBUTING.md](CONTRIBUTING.md)。

## 当前边界与文档

- 物料库存、领退料、工艺路线、设备采集、质量检验和计件工资尚未实现；BOM 需求不等于实际领料。
- 飞书、钉钉、企业微信接入尚未完成；模型建议的实际质量仍需使用者验证。
- [文档路由](apps/mes/AGENTS.md) · [技术设计](apps/mes/docs/02-技术设计.md) · [界面与验收](apps/mes/docs/03-界面与验收.md)
- 源码采用 [Apache-2.0](LICENSE)；安全问题请按 [SECURITY.md](SECURITY.md) 私密报告。
