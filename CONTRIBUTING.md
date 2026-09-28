# 参与贡献

请先阅读 [应用文档路由](apps/mes/AGENTS.md) 和 [部署说明](docs/08-开源本地部署.md)。开发需 Node.js 22、pnpm 11 与 Docker。修改业务规则时同步更新对应文档及迁移；提交前运行 `pnpm build:mes`，并在独立测试数据库上运行 `pnpm test:mes`。测试会写入数据，不能连接生产库。

Pull Request 请说明变更范围、验证结果、迁移影响及不兼容改动。不要提交客户数据、密钥、`.env` 或数据库备份。安全问题请按 [SECURITY.md](SECURITY.md) 私密报告。贡献内容按本仓库 Apache-2.0 许可证提供。
