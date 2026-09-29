// 给指定 tab 打开移动端设备模拟（本仓库的 bug 基本都是移动端专属，不模拟就等于没测）：
//   bun scripts/cdp/cdp-emulate-mobile.ts <url包含> [宽] [高] [ua]
//   ua 省略 = Android Firefox（issue #36 的复现环境）；可传 chrome / desktop / 任意字面 UA
//
// 为什么用 mobile:true：只有它让页面按「移动设备」解析 viewport，CSS 看到的视口宽度等于目标宽度
//   （实测 390x844 → documentElement.clientWidth = 390、matchMedia('(min-width:750px)') = false）。
//   换成 mobile:false 只是个"窄桌面窗口"：clientWidth 会被滚动条吃掉 15px（375），screen 也不变。
//
// WARNING 三个实测陷阱，写在这里省得下次再踩：
// 1) **判据是 documentElement.clientWidth，不是 window.innerWidth**。mobile:true 下桌面站会把
//    innerWidth 报成 1100x2378（内容最小宽度触发的"宽视口"行为），但 clientWidth / 媒体查询 /
//    百分比布局看到的确实是 390x844。拿 innerWidth 当判据会把"模拟成功"误判成"模拟失败"。
// 2) **UA / dpr 是按 CDP 会话生效的**：本脚本一退出就还原成窗口默认值；反而**视口尺寸会粘住**。
//    要连 UA / dpr 一起测，必须在同一个脚本会话里「设模拟 → 导航 → 测量」。
// 3) **设完不能立刻读**：同一 tick 读会拿到旧值（设 390x844 读到 1100x2378），所以要轮询等重排。
//
// 测完用 cdp-clear-emulation.ts 清掉，否则后面所有测量都被固定视口污染。
const [, , urlPart, w = '390', h = '844', ua = 'firefox'] = process.argv

const KNOWN_UA: Record<string, string> = {
  firefox:
    'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
  chrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
}
const uaValue = KNOWN_UA[ua as string] ?? ua

const targets = (await (await fetch('http://localhost:9222/json')).json()) as {
  url: string
  webSocketDebuggerUrl: string
  type: string
}[]
const tab = targets.find((t) => t.type === 'page' && t.url.includes(urlPart as string))
if (!tab) {
  console.error('tab not found')
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
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)!(msg.result ?? msg.error ?? {})
    pending.delete(msg.id)
  }
}

interface Probe {
  clientW: number
  inner: string
  screen: string
  visual: string | null
  dpr: number
  mq750: boolean
  ua: string
}

ws.onopen = async () => {
  const width = Number(w)
  const height = Number(h)
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 3,
    mobile: true,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  if (ua !== 'desktop') {
    await send('Emulation.setUserAgentOverride', {
      userAgent: uaValue,
      platform: 'Linux armv8l',
    })
  }

  const probe = `JSON.stringify({
    clientW: document.documentElement.clientWidth,
    inner: innerWidth + 'x' + innerHeight,
    screen: screen.width + 'x' + screen.height,
    visual: visualViewport ? Math.round(visualViewport.width) + 'x' + Math.round(visualViewport.height) : null,
    dpr: devicePixelRatio,
    mq750: matchMedia('(min-width: 750px)').matches,
    ua: navigator.userAgent,
  })`
  let got: Probe | null = null
  for (let i = 0; i < 16; i++) {
    await sleep(250)
    const r = await send('Runtime.evaluate', { expression: probe, returnByValue: true })
    if (!r?.result?.value) continue
    got = JSON.parse(r.result.value) as Probe
    if (Math.abs(got.clientW - width) <= 2) break
  }

  console.log('requested:', `${width}x${height}`, 'ua =', ua === 'desktop' ? '(不覆盖)' : ua)
  console.log(
    'CSS 视口 :',
    `clientWidth=${got?.clientW}`,
    ` matchMedia('(min-width:750px)')=${got?.mq750}`,
  )
  console.log('设备     :', `screen=${got?.screen}`, `visualViewport=${got?.visual}`, `dpr=${got?.dpr}`)
  console.log(
    'innerWidth:',
    got?.inner,
    '(mobile:true 下通常 != 目标宽度，属正常，别拿它当判据 —— 见文件头 WARNING 1)',
  )
  console.log('ua actual:', got?.ua)

  if (!got || Math.abs(got.clientW - width) > 20) {
    console.error(
      `MISMATCH: CSS 视口没生效（期望 clientWidth≈${width}，实际 ${got?.clientW}）。` +
        '先 bun scripts/cdp/cdp-clear-emulation.ts 清掉再重试，别拿这个状态测。',
    )
    process.exit(1)
  }
  console.log('emulated OK')
  console.log(
    'NOTE UA / dpr 只在本会话有效，脚本退出即还原（视口尺寸反而会粘住）。' +
      '要连 UA / dpr 一起测，就在同一个脚本会话里「设模拟 → 导航 → 测量」。',
  )
  process.exit(0)
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 15000)
