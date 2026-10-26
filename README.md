# PathPilot AI

PathPilot 是面向计算机专业学生的职业成长平台：从目标岗位出发，整理招聘要求，生成成长路线，并把路线拆成可以持续完成的任务。

## 组成

- Web：Next.js
- Android：Expo / React Native
- 服务端：Fastify、SQLite、Drizzle、Pi Agent
- 共享层：TypeScript 类型、Zod 数据结构和业务枚举

## 本地启动

```bash
npm install
npm run dev:server
npm run dev:web
```

首次启动服务端会执行数据库迁移和基础数据初始化。服务端默认监听 `3000`，Web 默认监听 `3001`。

## 配置

将 `.env.example` 复制为 `apps/server/.env`，按部署环境填写认证、模型和搜索服务配置。模型配置页面位于 Web 的 `/admin`。

默认线上服务地址：`https://pathpilot.070320.xyz`。

## 主要功能

- 个人资料、技能、课程、项目和实践经历
- 多来源岗位搜索与岗位要求分析
- 技能归一化、频次统计和能力差距分析
- 分学期成长规划与版本历史
- 父任务、子任务、依赖和进度跟踪
- AI 职业顾问与任务执行工具
- Web 与 Android 共用数据
- 简历素材整理和成果记录

## 测试

```bash
npm run build
npm run test
cd apps/mobile && npx tsc --noEmit
```

## Android 构建

```bash
cd apps/mobile/android
./gradlew assembleRelease
```

发布 APK 位于 GitHub Releases，不写入仓库。当前版本发布页：

https://github.com/boooozhang2007/PathPilot/releases/tag/v1.3.0

## 文档

- [产品成熟度提升计划](./PRODUCT_MATURITY_PLAN.md)
- [架构说明](./ARCHITECTURE.md)
- [产品需求文档](./PRD.md)
