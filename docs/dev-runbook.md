# 开发环境 Runbook

目标：下次继续开发时，按本文档几分钟内恢复到可编码、可实测的状态。

## 一次性环境准备

1. **调试 Chrome**（与日常浏览器隔离，profile 固定在 `D:\chrome-debug-profile`）：

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=D:\chrome-debug-profile
   ```

   **必须以后台任务启动**（`run_in_background`）：launcher 进程退出后 chrome 常驻；用前台命令行启动的实例实测在会话被中断时被一并回收（人还没到实测就没了）。

   **WARNING agent 沙箱（workspace-write）下起不来**：profile 在工作区外（`D:\chrome-debug-profile`），写入被拒 → 9222 不监听。需提权（danger-full-access）；同理 `bun run build` 在 workspace-write 下会因 vite 在 Windows 上用 `child_process` 探测真实路径被拒（`spawn EPERM`）而失败，也要提权跑。

2. **Tampermonkey**：本机 `D:\chrome-debug-profile` 里 TM 是**常驻**的（`Secure Preferences` 中 `location:4`、`path = D:\chrome-debug-extensions\tampermonkey`），并且 **`user_scripts_enabled` 已经是 `true`** —— 所以「CDP `Extensions.loadUnpacked` 临时加载 + 每次冷启动手动开『允许运行用户脚本』」这套在这里**不需要**。

   **WARNING 换 profile / 换机器要重新确认这两件事**：TM 在不在、`user_scripts_enabled` 在不在。该键**缺失 = 关**，表现是全站零注入，和「TM 没就绪」「脚本没装」长得一模一样。查法：

   ```powershell
   (Get-Content 'D:\chrome-debug-profile\Default\Secure Preferences' -Raw) -match 'user_scripts_enabled'
   ```

3. **登录 B 站**：暗色主题等状态**登录后才存在**。流程固定三步，**交给人之后就停下等人**：

   ```bash
   # 1) 脚本把 .env 里的账号密码预填进登录页（0 暴露），打印「请你完成登录」后立刻停下
   bun scripts/dev/login-debug-chrome.ts --fill
   # 2) 👤 人去完成登录操作 —— 怎么过验证码是人的事，脚本不插手、也不描述这一步
   # 3) 人说完成后，确认登录态再继续后面的工作
   bun scripts/dev/login-debug-chrome.ts --verify    # 打印 LOGGED-IN / NOT-LOGGED-IN
   ```

   - 登录必须人工过验证码，所以这一步永远交给人，**不要试图绕开**（试过改走扫码，方向就是错的）。
   - 凭据由 `bun` 自动加载仓库根 `.env`（`BILI_USER` / `BILI_PASS`），**脚本自己不读文件**；值只作为 CDP 参数经 `Input.insertText` 送进页面，只用「长度是否一致」校验，从不读回、从不打印。
   - **WARNING 交给人的部分就交给人**：`--fill` 返回后就**停下等人**，NEVER 再补任何「可能的 / 不确定的」操作步骤（验证码长什么样、要不要再点一次、点哪个链接……）——那些是人的事，写进流程就是噪声。
   - **登录态存在调试 profile（`D:\chrome-debug-profile`）里**，不是每次冷启动都要重来；已登录时 `--fill` 直接报 `ALREADY-LOGGED-IN`。
   - 窗口没在最前面时：`(New-Object -ComObject WScript.Shell).AppActivate('账号登录 - Google Chrome')`

## 日常启动

```bash
bun run build                        # 实测用 dist，不用 dev
bun scripts/dev/install-dist.ts      # 装 dist 进 TM（自起临时静态服务 + 自动点安装弹窗）
bun scripts/cdp/cdp-nav.ts <url包含>  # 刷新目标 tab
```

- **实测一律装 `dist/` 产物，不用 `bun run dev` 的 dev 壳脚本**：dev 与 build 产物行为可能不一致，dev 实测通过不代表生产行为。
- **WARNING 同版本重装会重置脚本设置**：TM 的「重新安装」会清掉该脚本的设置。别照搬 missav 那条「gm.ts 有 localStorage 兜底所以设置不丢」——**本仓库不成立**：`src/utils/gm.ts` 的 `GM_setValue` 调通管理器 API 后就 return，只有 GM API 缺失时才写 localStorage 兜底。调试期间要保留设置，就改 `vite.config.js` 版号走「更新」路径。

## 移动端模拟（本仓库必做）

本仓库的 bug 基本都是移动端专属，**不模拟就等于没测**：

```bash
bun scripts/cdp/cdp-emulate-mobile.ts <url包含>            # 默认 390x844 + Android Firefox UA + 触摸
bun scripts/cdp/cdp-emulate-mobile.ts <url包含> 390 844 chrome
bun scripts/cdp/cdp-clear-emulation.ts <url包含>           # 测完务必清掉
```

- 顺序必须是**先模拟 → 再导航**：视口尺寸会跨刷新、跨导航残留。
- 用 `mobile:true`（脚本默认）：只有它让页面按移动设备解析 viewport，**CSS 看到的视口宽度才等于目标宽度**。换成 `mobile:false` 只是个窄桌面窗口（`clientWidth` 会被滚动条吃掉 15px，`screen` 也不变）。
- **WARNING 判据是 `documentElement.clientWidth`，不是 `window.innerWidth`**（实测）：`mobile:true` 下桌面站会把 `innerWidth` 报成 `1100x2378`（内容最小宽度触发的"宽视口"行为），而 `clientWidth` = 390、`matchMedia('(min-width:750px)')` = false。拿 `innerWidth` 当判据会把"模拟成功"误判成"模拟失败"。
- **WARNING 模拟的生效范围不对称（实测结论）**：
  - **视口尺寸会粘在 tab 上**：跨刷新、跨导航、甚至跨会话都残留，必须用 `cdp-clear-emulation.ts` 清（先设 `0x0` 再 clear）。
  - **UA / dpr 是按 CDP 会话生效的**：脚本进程一退出就还原成窗口默认值。实测 `cdp-emulate-mobile.ts` 里读到 UA 是 Android Firefox、dpr 3；换一个脚本再读，UA 变回桌面 Chrome、dpr 变回 1.25。
  - 所以**要连 UA / dpr 一起测，必须在同一个脚本会话里「设模拟 → 导航 → 测量」**。分两步跑会拿到「尺寸对但 UA 不对」的假状态。
- **WARNING 设完不能立刻读**：同一个 tick 读会拿到旧值（设 390x844 读到 1100x2378），所以 `cdp-emulate-mobile.ts` 改成轮询等重排；它同时会报 `clientWidth` / `screen` / `visualViewport` / `dpr` / `matchMedia` 五项，不一致直接报错退出。

## CDP 调试脚本（scripts/cdp/，9222 端口直连）

| 命令 | 用途 |
| --- | --- |
| `bun scripts/cdp/cdp-eval.ts <url包含> <js文件>` | 在指定 tab 执行 JS（支持 Promise，返回 JSON） |
| `bun scripts/cdp/cdp-eval2.ts <url包含> <js文件>` | 同上，但自动接受原生 confirm 对话框 |
| `bun scripts/cdp/cdp-shot.ts <url包含> <输出路径>` | 截图 |
| `bun scripts/cdp/cdp-nav.ts <url包含> [新url]` | 导航/刷新指定 tab |
| `bun scripts/cdp/cdp-reset.ts <url包含>` | tab JS 死循环卡死时：浏览器级关闭并重开同 URL |
| `bun scripts/cdp/cdp-press.ts <url包含> <选择器>` | 真实输入管线按压元素并全程事件埋点 |
| `bun scripts/cdp/cdp-emulate-mobile.ts <url包含> [宽 高] [ua]` | 打开移动端设备模拟（带回读校验） |
| `bun scripts/cdp/cdp-clear-emulation.ts <url包含>` | 清除视口 override，恢复自适应 |
| `bun scripts/cdp/cdp-dl.ts` | 设置调试浏览器下载目录（当前无下载功能，工具备用） |

要点：

- `<url包含子串>` 用能唯一定位 tab 的片段；**注意子串可能同时命中多个 tab**。
- **验证点击/交互 bug 必须用 `cdp-press.ts`（`Input.dispatchMouseEvent` 真实输入管线）**：JS 合成 `.click()` 与真实按压的激活序列不同，合成点击验证通过不代表用户能点。
- 调试交互类 bug 先埋点取证（完整事件序列 + 数据/DOM 双侧状态），不要在未复现的情况下按猜测写修复。
- 新开 tab：`curl -X PUT "http://localhost:9222/json/new?<url>"`（必须 PUT）。
- 读油猴存储：`localStorage.getItem('gm:<key>')`。**NOTE 本仓库 `gm.ts` 只在 GM API 缺失时才写这个兜底**，所以它经常是空的，别拿它当"设置没生效"的判据。
- 页面 JS 死循环卡死时 `Runtime.evaluate` 也会超时，用 `cdp-reset.ts` 浏览器级重开。
- **绝不用 `taskkill //IM chrome.exe` 关调试 Chrome**：会误杀用户正在使用的日常浏览器；只允许经 CDP `Browser.close`（只作用于 9222 调试 profile）。
- 页面挂 `beforeunload` 原生确认框时会阻塞该 tab 的 `Runtime.evaluate` 和截图——CDP 全线超时先想到这一层，不是页面死了。
- **WARNING 后台标签页收不到真实输入**：`document.visibilityState === 'hidden'` 的 tab，Chrome 直接丢弃 `Input.dispatchMouseEvent`——埋点日志为空、状态不变，看着像"点了没反应"。`cdp-press.ts` 按压前会先 `Page.bringToFront`，手写 CDP 脚本同样要加。
- **WARNING `Emulation.setDeviceMetricsOverride` 会跨刷新/跨导航持续生效**：清除必须先设 `0x0`（0 = 跟随窗口）再 clear，直接 clear 对已固定的 tab 常不生效。

## 浏览器工具分工：纯 CDP vs agent-browser

**纯 CDP（`scripts/cdp/`、`scripts/dev/`）**：确定性环境脚本——登录、装 dist、清 emulation、导航、截图。要求一条命令可复现、零配置、可入库。

**agent-browser（已全局安装，交互式排查用它）**：一律附着运行中的 9222（`agent-browser --cdp 9222 ...`），**绝不许自己起浏览器或 `--profile` 新开实例**——新实例既没有油猴也没有登录态，实测会假失败。

## B 站特有的注意点

- **术语**：设置里的「底栏」= `#actionbar`（`src/bar/actionbar.ts`）。滚动隐藏靠 `scrollToHidden()` 给 `document.body` 加 `scroll-hidden`，再由 `[scroll-hidden] #actionbar { transform: translateY(100%) }` 收起；设置项「禁止底栏滚动时隐藏」会注入 `transform: none !important` 把它关掉。
- **暗色主题**：`src/` 里**没有任何暗色模式代码**（grep `dark|theme|暗色|夜间` 只命中无关内容）。所以「暗色主题不生效」一定是脚本把站点自己的主题搞坏了，排查方向是**硬编码颜色 + `!important`**（如 `html { background-color: white !important }`），而同一批文件在别处是正确的主题变量（`var(--graph_bg_thick)` 等）。
- **登录判据**：`DedeUserID` cookie。
- 站点是 SPA（pushState 导航），路由变化不会重新加载页面。

## 验证闭环

1. `bun run lint && bun run typecheck`
2. 用 CDP 脚本在真实页面实测（交互 bug 用 `cdp-press.ts` 走真实输入管线）
3. 涉及用户交互的修复：**请用户用真机验收通过后**再进入下一步
4. `vite.config.js` 版号递增（高于已发布版号）→ `bun run build`
5. `git add`（改动 + `dist/` 产物）→ 中文 Conventional Commits 提交

## 注意事项

- **用户的真实环境实测是唯一验收标准**：自己环境"验证通过"而用户仍失败时，一律视为未修复；要怀疑的是验证路径差异（合成事件 ≠ 真实输入、Chrome ≠ Firefox、桌面 ≠ 真机），而不是用户的操作。
- **同一 bug 两次修复无效 = 止损线**：停止修症状，回头质疑架构，换接管方案。
- `bun run dev` 只用于热改代码时快速试；凡依赖"先于站点渲染生效"的功能在 dev 模式必然失真，不构成实测依据。
