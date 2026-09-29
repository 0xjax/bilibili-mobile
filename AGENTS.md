# bilibili-mobile

B 站移动端优化油猴脚本，vite + vite-plugin-monkey 构建。

## Commands

- 包管理用 **bun**，NEVER npm/npx/pnpm
- `bun run dev` / `build` / `lint`（oxlint）/ `typecheck`（tsc --noEmit）
- 开发环境搭建与实测流程（调试 Chrome、装 dist 进 TM、CDP 脚本、移动端模拟）：[docs/dev-runbook.md](docs/dev-runbook.md)
- 调试脚本在 `scripts/dev/`（装 dist、登录）与 `scripts/cdp/`（9222 端口直连）

## Conventions

- 用户通过仓库里的 `dist/` 产物接收更新：改动 `src/` 或版号后必须 `bun run build`，产物一并提交，否则用户收不到更新
- userscript 元数据（含版本号）在 `vite.config.js`，改版本号去那里；新版号必须高于已发布版号，用户才能收到更新提示
- GM API 从 `src/utils/gm.ts` 导入（调用时解析 + localStorage 兜底，兼容注入晚/缺 API 的管理器），NEVER 直接访问全局 GM_* 或 window 挂载
- 新增设置项 → `src/setting.ts` 的 `keyValues` 加键；功能代码用 `GM_getValue(key, default)` 读取
- 样式在 `src/style/*.css`，在 `main.ts` 以副作用导入，由插件内联进产物并经 GM_addStyle 注入
- 代码注释与提交信息用中文；提交信息遵循 Conventional Commits

## Secrets

移植自 ink 同名段落，并按本仓库的落地方式标注边界：

- **MUST NOT** read `.env`, `.env.*`, or any secrets file —— 指 agent 自己去读/去翻
- **MUST NOT** expose secrets in logs, comments, commits, PR 描述, or tool output
- **MUST NOT** put secrets in command arguments
- When env var values are needed, ask the user to provide them directly
- 边界（关键区别）：**脚本可以加载并程序化使用凭据**——`bun` 会自动加载 `.env`，脚本只把凭据当普通变量用；
  唯一红线是**凭据值不得进入 agent 的可见输出**。即「可程序化使用，但 agent 不得读取与暴露」。
  - 具体做法：凭据只作为 CDP 参数 / 请求体传输，NEVER 拼进 `Runtime.evaluate` 的表达式字符串
    （表达式一旦抛错会连同内容回显进异常；用 `Input.insertText` 走真实输入管线）
  - NEVER 打印凭据（连长度之外的信息也别打）、NEVER 放进命令行参数
  - 参考实现：`scripts/dev/login-debug-chrome.ts`（全程 0 暴露）
