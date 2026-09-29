// 把 dist 产物装进调试 Chrome 的 Tampermonkey。
// 自起临时静态服务（不落 .user.js 临时文件、也不用手工起服务），打开 .user.js URL，
// TM 弹 ask.html 时自动点「安装/重新安装」；版本更高且 TM 自动更新时安装页会自行关闭，
// 按「已自动更新」正常返回。
//
// 用法：
//   bun scripts/dev/install-dist.ts             手动、严格：连不上 / 装不上就 exit 1
//   bun scripts/dev/install-dist.ts --soft      软失败：任何问题只打 WARNING 并 exit 0
//   bun scripts/dev/install-dist.ts [--soft] [端口，默认 9222]
//
// NOTE 已接进 package.json 的 `postbuild` —— **`bun run build` 会自动装**，不用再单独跑这步：
//   调试 Chrome 没开（9222 连不上）时 postbuild 只打一行 SKIP 就跳过，绝不让 build 失败。
//
// WARNING 同版本重装会走 TM 的「重新安装」弹窗，TM 会提示并**重置该脚本的设置**。
// NOTE 别照搬 missav 那条「gm.ts 有 localStorage 兜底所以设置不丢」——**本仓库不成立**：
// src/utils/gm.ts 的 GM_setValue 调通管理器的 API 后就 return，只有 GM API 缺失时才写
// localStorage 兜底，所以 GM 可用时设置只存在 TM 里，重装就是真丢。
// 要保留设置就走「更新」路径（改 vite.config.js 版号重新 build），或重装后重新设置一遍。
const argv = process.argv.slice(2)
const SOFT = argv.includes('--soft')
const CDP = `http://127.0.0.1:${argv.find((a) => !a.startsWith('--')) ?? '9222'}`
const DIST = 'dist/bilibili-mobile.js'
// 路径必须以 .user.js 结尾，TM 才会接管该响应
const INSTALL_PATH = '/bilibili-mobile.user.js'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// soft 模式：安装出问题不该把 `bun run build` 一起搞挂（发布构建时调试 Chrome 常常没开）
const fail = (msg: string): never => {
  if (SOFT) console.warn(`WARNING ${msg}（--soft：不影响构建结果）`)
  else console.error(msg)
  process.exit(SOFT ? 0 : 1)
}

const code = await Bun.file(DIST).text().catch(() => null)
if (!code) fail(`缺少 ${DIST}，先执行 bun run build`)
const version = code.match(/@version\s+(\S+)/)?.[1] ?? '?'

const server = Bun.serve({
  port: 0, // 0 = 随机空闲端口，避开与别的本地服务抢端口
  hostname: '127.0.0.1',
  fetch(req) {
    if (new URL(req.url).pathname !== INSTALL_PATH)
      return new Response('not found', { status: 404 })
    return new Response(code, {
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    })
  },
})
const installUrl = `http://127.0.0.1:${server.port}${INSTALL_PATH}`

interface Target {
  id: string
  type: string
  url: string
  webSocketDebuggerUrl: string
}

const list = async (): Promise<Target[]> => {
  const res = await fetch(`${CDP}/json/list`).catch(() => null)
  if (!res) fail(`连不上 CDP ${CDP}（调试 Chrome 需带 --remote-debugging-port 启动）`)
  return res.json() as Promise<Target[]>
}
const closeTab = (id: string) => fetch(`${CDP}/json/close/${id}`).catch(() => {})
const isInstallTab = (t: Target) =>
  t.type === 'page' && (t.url.includes('ask.html') || t.url.includes('script_installation'))
// NOTE 安装按钮只在 TM 自己的 ask.html 上；同时会开一个 tampermonkey.net 的
// script_installation 页（无按钮），选目标必须只认 ask.html，否则点在空页上
const isAskTab = (t: Target) => t.type === 'page' && t.url.includes('ask.html')

// 在指定 tab 执行 JS 并取值（单次，用于点安装按钮）
function evalOn(wsUrl: string, expression: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error('eval timeout'))
    }, 10000)
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true },
        }),
      )
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data as string)
      if (msg.id !== 1) return
      clearTimeout(timer)
      ws.close()
      if (msg.result?.exceptionDetails) reject(new Error('eval exception'))
      else resolve(msg.result?.result?.value)
    }
    ws.onerror = () => {
      clearTimeout(timer)
      reject(new Error('ws error'))
    }
  })
}

const cleanup = async (extra: string[] = []) => {
  for (const t of await list())
    if (isInstallTab(t) || extra.includes(t.id)) await closeTab(t.id)
  server.stop()
}

// 先清掉上次残留的安装页，否则可能点到旧弹窗
for (const t of await list()) if (isInstallTab(t)) await closeTab(t.id)

const created = (await (
  await fetch(`${CDP}/json/new?${encodeURIComponent(installUrl)}`, { method: 'PUT' })
).json()) as Target

// 等 TM 接管：同版本/更高版本都会弹 ask.html；版本更高且 TM 开了自动更新时安装页自行关闭。
// WARNING 窗口要给足：TM 会先跳 tampermonkey.net/script_installation.php 再拉起 ask.html，
// 该站点不通时要等它超时（实测本机约 12-15s），窗口太短会误判成"TM 未接管"
let ask: Target | undefined
for (let i = 0; i < 80; i++) {
  await sleep(500)
  const targets = await list()
  ask = targets.find(isAskTab)
  if (ask) break
  if (!targets.some((t) => t.id === created.id)) {
    await cleanup([created.id])
    console.log(`v${version} 已由 TM 自动更新（安装页自行关闭，无弹窗）`)
    process.exit(0)
  }
}
if (!ask) {
  await cleanup([created.id])
  fail(
    'TM 未接管：ask.html 未出现（TM 是否已安装/已启用？必要时确认「允许运行用户脚本」是开着的）',
  )
}

// 点安装按钮：target 出现早于页面渲染，需重试；安装/重新安装/更新按钮同 class，
// 且同页的「取消」也是该 class——TM 模板里安装按钮在 DOM 中靠前，取第一个
let label: unknown = null
for (let i = 0; i < 20 && !label; i++) {
  await sleep(500)
  label = await evalOn(
    ask.webSocketDebuggerUrl,
    `(() => {
      const b = document.querySelector('input.button.install')
      if (!b) return null
      b.click()
      return b.value
    })()`,
  ).catch(() => null)
}

await sleep(1500) // 等 TM 落盘再关页面
await cleanup([created.id])
if (!label) fail('未找到安装按钮（TM 安装页结构可能已变）')
console.log(`v${version} 已安装（按钮：${label}）`)
process.exit(0)
