# 轻量 MES

独立前端、NestJS API、PostgreSQL 数据库。当前流程包括物料档案维护、BOM 选料与版本发布、多级展开、计划物料需求快照、工单下达、操作员报工、主管审核和进度统计。

## 推荐的本地部署

从仓库根目录运行 `node scripts/init-local.mjs` 和 `node scripts/start-local.mjs mes`。首次启动自动迁移、创建管理员；凭据在根目录 `.env`，登录只需邮箱和密码。详见[本地部署与运维](../../docs/08-开源本地部署.md)。

## 源码开发启动

在仓库根目录执行 `pnpm install`、`docker compose -f apps/mes/infra/compose.yaml up -d`，将 `apps/mes/backend/.env.example` 复制为 `.env` 并设置唯一的 `MES_BOOTSTRAP_PASSWORD`（至少 12 位）。在 `apps/mes/backend/` 执行 `pnpm db:deploy`、`pnpm admin:create`、`pnpm build`、`pnpm start`；在 `apps/mes/frontend/` 执行 `pnpm dev`。打开 http://127.0.0.1:4400，使用管理员邮箱和密码登录。

`pnpm test:mes` 在运行中的本地 API 和数据库上验证工单闭环，以及物料档案、BOM 版本、多级展开、损耗、循环拒绝和计划快照；`pnpm build:mes` 构建前后端。本地成员登录、修改密码和管理员建号可独立使用。BOM 的领料/库存、设备采集和计件工资不在当前业务范围。

AI 助手在登录后的右下角打开，BOM 与计划详情自动带入当前记录；BOM 详情还可执行结构化 AI 审查，输出只读建议并校验引用行 ID。管理员在左下角账号菜单的“模型接入”配置并测试后启用；后端 `.env` 的 `OPENAI_API_KEY`、`OPENAI_MODEL` 可作为默认值。未配置时明确报错；真实模型审查质量尚未验收，见工作区 `docs/06-AI能力实施规划.md`。

开发测试可在仓库根目录运行 `pnpm local:seed`，在未提交的 `review-access.txt` 获取角色验收账号；正式部署不需要执行该命令。
