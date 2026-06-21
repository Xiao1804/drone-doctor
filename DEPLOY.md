# DroneDoctor 部署入口

当前唯一推荐的生产部署方式是：

- 腾讯云单服务器
- Docker Compose
- Caddy HTTPS
- PostgreSQL 16 + pgvector
- 完整 Git 标签版本包

请使用 [TENCENT_DEPLOY.md](./TENCENT_DEPLOY.md)。

Render、Railway、Vercel 配置仅作为历史实验参考，不属于当前验证过的生产路径。重新启用这些平台前必须重新检查：

- PostgreSQL 迁移是否在启动前执行；
- `ALLOWED_ORIGINS` 是否为明确域名，禁止默认 `*`；
- `JWT_SECRET` 是否符合生产强度；
- 管理员登录和免注册体验通行证是否正常；
- `/health` 是否返回数据库状态与发布版本；
- 数据备份和恢复由谁负责。

不要使用逐文件下载覆盖服务器的方式部署，也不要关闭 Git SSL 校验。
