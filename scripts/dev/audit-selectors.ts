// 审计**脚本自己注入的样式表**里，选择器在当前站点上还有没有命中。
// 目的：把「B 站改版 → 脚本选择器静默失效」变成一条命令能查出来的事。
//
// 用法：
//   bun scripts/dev/audit-selectors.ts                          # 默认 5 个页面 × 2 个视口
//   bun scripts/dev/audit-selectors.ts --pages all              # 连空间页子路由一起跑（慢）
//   bun scripts/dev/audit-selectors.ts --pages space-upload-video      # 只跑指定页面
//   bun scripts/dev/audit-selectors.ts --extra "名字=url|probe"  # 临时把任意页面加进审计
//   bun scripts/dev/audit-selectors.ts --viewports mobile --wait 12000
//   bun scripts/dev/audit-selectors.ts --include "--actionbar-height"
//
// 判据：一条选择器只有在**所有已审计的（页面 × 视口）组合**里命中数都为 0 才算候选「失效」。
//   单页 0 命中往往正常（页面专属选择器在别的页面本来就不存在），别只看一页下结论。
//   然后按能不能静态判定分三档输出（见下），**只有第一档是可直接下手的**。
//
// 三档含义：
//   ✗ 失效        —— 所有组合 0 命中，且选择器本身不含状态标记/伪元素 → 静态可判定，最可能是真的失效
//   △ 状态相关    —— 含属性选择器或伪类（`[show]` `.active:hover` …），只在瞬时状态命中 → 本工具判不了，
//                    要看代码里谁给它加属性/类
//   ◇ 伪元素      —— `::before/::after` 等，`querySelectorAll` 本身就匹配不到 → 已按宿主元素测过，
//                    宿主也 0 命中才列在这里
//
// WARNING 只在脚本菜单里打开对应设置后才会注入的预设样式（`setting.ts` 的 css1..css11 等）
//   **不在审计范围** —— 默认不注入，页面上根本没有。
// WARNING 未纳入 `--pages` 的页面类型/子路由，其专属选择器会被误报。输出末尾会列出「已知但本次未审计」
//   的页面；空间页子路由尤其多，改 `space.css` 时请 `--pages all`。
// WARNING 会操纵调试 Chrome 里那个 bilibili tab 反复导航，跑完停在最后一个页面上。
import { readdirSync } from 'node:fs'

const CDP_PORT = process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : '9222'
const CDP = `http://127.0.0.1:${CDP_PORT}`

const argOf = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

interface PageCfg {
  name: string
  url: string
  probe: string
  /** 默认不跑：页面多、耗时长，改对应 CSS 时按需加 */
  optIn?: boolean
}
const ALL_PAGES: PageCfg[] = [
  { name: 'home', url: 'https://www.bilibili.com/', probe: '.bili-header' },
  {
    name: 'video',
    url: 'https://www.bilibili.com/video/BV1GJ411x7h7/',
    probe: '.bpx-player-container',
  },
  {
    name: 'search',
    url: 'https://search.bilibili.com/all?keyword=bilibili',
    probe: '#app',
  },
  { name: 'space', url: 'https://space.bilibili.com/2', probe: '.nav-tab, #app' },
  {
    name: 'message',
    url: 'https://message.bilibili.com/',
    probe: '.message-layout',
  },
  // 搜索页各 tab 也是 SPA 路由（URL 由点击 tab 实测得到），search.css 大量规则属于它们
  { name: 'search-video', url: 'https://search.bilibili.com/video?keyword=bilibili', probe: '.search-page-video', optIn: true },
  { name: 'search-bangumi', url: 'https://search.bilibili.com/bangumi?keyword=bilibili', probe: '.search-page-bangumi', optIn: true },
  { name: 'search-pgc', url: 'https://search.bilibili.com/pgc?keyword=bilibili', probe: '.search-page-pgc', optIn: true },
  { name: 'search-live', url: 'https://search.bilibili.com/live?keyword=bilibili', probe: '.search-page-live', optIn: true },
  { name: 'search-article', url: 'https://search.bilibili.com/article?keyword=bilibili', probe: '.search-page-article', optIn: true },
  { name: 'search-upuser', url: 'https://search.bilibili.com/upuser?keyword=bilibili', probe: '.search-page-upuser', optIn: true },  // 消息页是 hash 路由 SPA：这几个 tab 的标记与「私信」不同，message.css 大量规则属于它们
  { name: 'message-reply', url: 'https://message.bilibili.com/#/reply', probe: '.message-layout', optIn: true },
  { name: 'message-at', url: 'https://message.bilibili.com/#/at', probe: '.message-layout', optIn: true },
  { name: 'message-like', url: 'https://message.bilibili.com/#/like', probe: '.message-layout', optIn: true },
  { name: 'message-system', url: 'https://message.bilibili.com/#/system', probe: '.message-layout', optIn: true },  // 空间页子路由：space.css 里大量选择器属于这些页面
  {
    name: 'space-dynamic',
    url: 'https://space.bilibili.com/2/dynamic',
    probe: '#page-dynamic, .bili-dyn-item, .space-dynamic',
    optIn: true,
  },
  {
    // 实测 /2/video 会 302 到 /2/upload/video，且旧的 #page-video / .cube-list 标记已不存在
    name: 'space-upload-video',
    url: 'https://space.bilibili.com/2/upload/video',
    probe: '.nav-tab, #app',
    optIn: true,
  },
  // NOTE /2/favlist 与 /2/follows 实测都 302 回 /2（路由已不存在），所以不内置。
  // 收藏夹/关注页的专属选择器（.favlist-aside / #page-follows …）会被算进失效清单 ——
  // 找到正确路由后用 --extra 临时加，别写死猜测的地址。
]
const VIEWPORTS = [
  { name: 'desktop', metrics: null as null | Record<string, unknown> },
  {
    name: 'mobile',
    metrics: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  },
]

const wantPages = argOf('--pages', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// --extra "名字=url|probe"（可逗号分隔多个）：临时把任意页面加进审计，避免把猜的地址写死进配置
const extras: PageCfg[] = argOf('--extra', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((spec) => {
    const [name, rest = ''] = spec.split('=')
    const [url, probe] = rest.split('|')
    return { name: name?.trim(), url: url?.trim(), probe: probe?.trim() || '#app', optIn: true }
  })
  .filter((p) => p.name && p.url)
const POOL = [...ALL_PAGES, ...extras]

const pages =
  wantPages.length === 0
    ? ALL_PAGES.filter((p) => !p.optIn)
    : wantPages.includes('all')
      ? POOL
      : POOL.filter((p) => wantPages.includes(p.name))
const skippedPages = POOL.filter((p) => !pages.includes(p))
const wantViewports = argOf('--viewports', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const viewports = wantViewports.length
  ? VIEWPORTS.filter((v) => wantViewports.includes(v.name))
  : VIEWPORTS
const INCLUDE = new RegExp(argOf('--include', '--actionbar-height|^script-'), 'i')
const WAIT = Number(argOf('--wait', '9000'))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ── 选择器 → 源码文件 归因（把失效清单按文件分组，便于判断"这堆是不是同一个功能的"）──
const norm = (s: string) => s.replace(/\s+/g, '')
const sourceFiles: { file: string; text: string }[] = []
try {
  for (const f of readdirSync('src/style')) {
    if (!f.endsWith('.css')) continue
    sourceFiles.push({ file: `src/style/${f}`, text: norm(await Bun.file(`src/style/${f}`).text()) })
  }
} catch {
  console.warn('WARNING 读不到 src/style（请在仓库根运行），失效清单将不做文件归因')
}
const attribute = (sel: string) => {
  const candidates = [norm(sel)]
  const chunks = sel.split(/\s+/)
  if (chunks.length > 1) candidates.push(norm(chunks[chunks.length - 1]))
  for (const c of candidates) {
    if (c.length < 3) continue
    // 子串匹配会误判（`.show-more` 会命中 `.show-more-text` 所在的文件）——要求匹配之后不是标识符字符
    const re = new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])')
    for (const sf of sourceFiles) if (re.test(sf.text)) return sf.file
  }
  return '(未归属)'
}

// 在页面里收集脚本样式表的所有选择器及其命中数
const COLLECT = `(() => {
  const include = new RegExp(${JSON.stringify(INCLUDE.source)}, 'i')
  const sheets = [...document.styleSheets].filter((sh) => {
    const n = sh.ownerNode
    if (!n || !n.textContent) return false
    return include.test(n.id || '') || include.test(n.textContent)
  })
  const skipped = document.querySelectorAll('style').length - sheets.length
  const rows = []
  const compose = (rule) => {
    const parts = []
    let media = null
    let p = rule.parentRule
    while (p) {
      if (p.media) media = p.conditionText || p.media.mediaText || media
      else if (p.selectorText) parts.unshift(p.selectorText)
      p = p.parentRule
    }
    return { prefix: parts.join(' '), media }
  }
  // 按顶层逗号切分：split(',') 会把 :has(a, b) / :is(a, b) / :not(a, b) 里的逗号也切断，
  // 产出非法片段（曾把 .floor-single-card:has(.skeleton, .skeleton-item) 切成两半）
  const splitSelectors = (s) => {
    const out = []
    let depth = 0
    let cur = ''
    for (const ch of s) {
      if (ch === '(' || ch === '[') depth++
      else if (ch === ')' || ch === ']') depth--
      if (ch === ',' && depth === 0) {
        out.push(cur)
        cur = ''
        continue
      }
      cur += ch
    }
    out.push(cur)
    return out.map((x) => x.trim()).filter(Boolean)
  }
  const walk = (list) => {
    for (const r of Array.from(list)) {
      if (r.selectorText) {
        const { prefix, media } = compose(r)
        for (const one of splitSelectors(r.selectorText)) {
          const sel = prefix ? prefix + ' ' + one : one
          // 伪元素 querySelectorAll 匹配不到，按宿主元素测
          const pe = sel.match(/::[a-zA-Z-]+(\\([^)]*\\))?\\s*$/)
          const testSel = pe ? sel.slice(0, pe.index).trim() : sel
          let n = -3
          if (testSel) {
            try {
              n = document.querySelectorAll(testSel).length
            } catch (e) {
              n = -3
            }
          }
          rows.push({ sel, n, media, pseudo: !!pe })
        }
      }
      if (r.cssRules && r.cssRules.length) walk(r.cssRules)
    }
  }
  for (const sh of sheets) {
    try {
      walk(sh.cssRules)
    } catch (e) {
      /* 跨域样式表读不到就跳过 */
    }
  }
  return JSON.stringify({
    sheetInfo: sheets.map((sh) => (sh.ownerNode.id || '(base)') + ':' + (sh.ownerNode.textContent || '').length),
    skipped,
    rows,
  })
})()`

interface Target {
  id: string
  type: string
  url: string
  webSocketDebuggerUrl: string
}
const targets = (await (await fetch(`${CDP}/json/list`)).json()) as Target[]
const tab = targets.find(
  (t) => t.type === 'page' && /bilibili\.com/.test(t.url) && !/ask\.html/.test(t.url),
)
if (!tab) {
  console.error(
    `找不到 bilibili tab（调试 Chrome 需带 --remote-debugging-port=${CDP_PORT} 启动，并先打开一个 B 站页面）`,
  )
  process.exit(1)
}

const ws = new WebSocket(tab.webSocketDebuggerUrl)
let seq = 0
const pending = new Map<number, (v: any) => void>()
const send = (method: string, params: unknown = {}) =>
  new Promise<any>((resolve) => {
    const id = ++seq
    pending.set(id, resolve)
    ws.send(JSON.stringify({ id, method, params }))
  })
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data as string)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)!(m.result ?? m.error)
    pending.delete(m.id)
  }
})
await new Promise((r) => ws.addEventListener('open', () => r()))
await send('Page.enable')

interface Row {
  sel: string
  media: string | null
  max: number
  pseudo: boolean
  untestable: boolean
}
const agg = new Map<string, Row>()
let sheetInfo: string[] = []
let skipped = 0
const pageValidity: string[] = []

for (const page of pages) {
  for (const vp of viewports) {
    if (vp.metrics) {
      await send('Emulation.setDeviceMetricsOverride', vp.metrics)
      await send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 5,
      })
    } else {
      await send('Emulation.setDeviceMetricsOverride', {
        width: 0,
        height: 0,
        deviceScaleFactor: 0,
        mobile: false,
      })
      await send('Emulation.clearDeviceMetricsOverride')
      await send('Emulation.setTouchEmulationEnabled', { enabled: false })
    }
    await send('Page.navigate', { url: page.url })
    await sleep(WAIT)

    const probeOk = (
      await send('Runtime.evaluate', {
        expression: `!!document.querySelector(${JSON.stringify(page.probe)})`,
        returnByValue: true,
      })
    ).result?.value
    if (!probeOk) {
      pageValidity.push(`${page.name}/${vp.name} ✗ 未加载成功（probe ${page.probe} 未命中）→ 不计入判据`)
      continue
    }

    const raw = (
      await send('Runtime.evaluate', {
        expression: COLLECT,
        returnByValue: true,
        awaitPromise: true,
      })
    ).result?.value
    if (!raw) {
      pageValidity.push(`${page.name}/${vp.name} ✗ 收集失败`)
      continue
    }
    const data = JSON.parse(raw) as {
      sheetInfo: string[]
      skipped: number
      rows: { sel: string; n: number; media: string | null; pseudo: boolean }[]
    }
    sheetInfo = data.sheetInfo
    skipped = data.skipped
    for (const row of data.rows) {
      const key = `${row.media ?? ''}||${row.sel}`
      const prev = agg.get(key)
      const untestable = row.n === -3
      const max = untestable ? 1 : row.n // 测不了的按"不算失效"处理
      if (prev) prev.max = Math.max(prev.max, max)
      else agg.set(key, { sel: row.sel, media: row.media, max, pseudo: row.pseudo, untestable })
    }
    pageValidity.push(`${page.name}/${vp.name} ✓`)
  }
}

ws.close()

const all = [...agg.values()]
const zero = all.filter((r) => r.max === 0)
const STATED = /\[|:(?!:)/
const stale = zero.filter((r) => !r.pseudo && !STATED.test(r.sel))
const stateful = zero.filter((r) => !r.pseudo && STATED.test(r.sel))
const pseudo = zero.filter((r) => r.pseudo)

const groupByFile = (rows: Row[]) => {
  const m = new Map<string, Row[]>()
  for (const r of rows) {
    const f = attribute(r.sel)
    if (!m.has(f)) m.set(f, [])
    m.get(f)!.push(r)
  }
  return [...m.entries()].sort((a, b) => b[1].length - a[1].length)
}

console.log(`审计范围：${pages.length} 页面 × ${viewports.length} 视口`)
console.log(`  页面：${pages.map((p) => p.name).join(' / ')}`)
console.log(`  视口：${viewports.map((v) => v.name).join(' / ')}`)
console.log(`脚本样式表：${sheetInfo.join(' · ') || '(未找到)'}`)
console.log(`  另有 ${skipped} 张 <style> 未纳入（站点自己的，或未开启的预设样式）—— 可用 --include 调整`)
console.log(`选择器总数：${all.length}`)
console.log('')
console.log(pageValidity.map((s) => '  ' + s).join('\n'))
console.log('')

const printGrouped = (rows: Row[], title: string) => {
  const inMedia = rows.filter((r) => r.media).length
  console.log(
    `${title}：${rows.length} 条${inMedia ? `（其中 ${inMedia} 条在 @media 内，多与横竖屏相关）` : ''}`,
  )
  for (const [file, items] of groupByFile(rows)) {
    console.log(`  [${file}] ${items.length}`)
    for (const r of items)
      console.log('      ' + r.sel + (r.media ? `    ← @media ${r.media}` : ''))
  }
  console.log('')
}

printGrouped(stale, '✗ 失效（所有组合 0 命中，且不含状态标记/伪元素 —— 可直接下手）')
printGrouped(stateful, '△ 状态相关（含 `[...]`/`:...`，只在瞬时状态命中 → 本工具判不了，去看谁加属性/类）')
printGrouped(pseudo, '◇ 伪元素（已按宿主元素测过，宿主也 0 命中）')
console.log(`· 有命中（正常，含页面专属）：${all.length - zero.length} 条（不列）`)

if (skippedPages.length) {
  console.log('')
  console.log(`未审计的已知页面（--pages 可加）：${skippedPages.map((p) => p.name).join(' / ')}`)
  console.log('  它们专属的选择器会被计入上面的清单 —— 判断前先确认覆盖范围。')
}
process.exit(stale.length ? 1 : 0)
