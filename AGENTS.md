# bilibili-mobile

B 站移动端优化油猴脚本，vite + vite-plugin-monkey 构建。

## Commands

- 包管理用 **bun**，NEVER npm/npx/pnpm
- `bun run dev` / `build` / `lint`（oxlint）/ `typecheck`（tsc --noEmit）

## Conventions

- 用户通过仓库里的 `dist/` 产物接收更新：改动 `src/` 或版号后必须 `bun run build`，产物一并提交，否则用户收不到更新
- userscript 元数据（含版本号）在 `vite.config.js`，改版本号去那里；新版号必须高于已发布版号，用户才能收到更新提示
- GM API 从 `'$'` 导入（`GM_getValue` 等），NEVER 直接访问全局 GM_* 或 window 挂载
- 新增设置项 → `src/setting.ts` 的 `keyValues` 加键；功能代码用 `GM_getValue(key, default)` 读取
- 样式在 `src/style/*.css`，在 `main.ts` 以副作用导入，由插件内联进产物并经 GM_addStyle 注入
- 代码注释与提交信息用中文；提交信息遵循 Conventional Commits
