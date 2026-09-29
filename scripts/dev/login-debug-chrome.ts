// 调试 Chrome 登录 B 站：从仓库根 .env 读 BILI_USER / BILI_PASS，已登录则跳过。
// .env 在 .gitignore，凭据不进仓库；新设备按 .env.example 说明复制创建。
//
// CRITICAL B 站密码登录**有图片验证码**（还可能叠加 geetest 风控），无法无人值守自动登录。
// 本脚本的定位是「把剩下的活干完」：
//   打开登录页 → 填账号密码 → 然后**停下来等你手动输入图片验证码** → 检测到验证码填够位数就自动点「登录」
//   → 轮询登录态（DedeUserID cookie）直到成功或超时。
// 你也可以完全不跑这个脚本，直接手动在调试窗口登录一次：登录态存在调试 profile 里，
// 不是每次冷启动都要重来（这点和 TM 的「允许运行用户脚本」开关不一样）。
//
// 用法：bun scripts/dev/login-debug-chrome.ts [tab url 包含子串，默认 bilibili]
const [, , urlPart = 'bilibili'] = process.argv

// bun 自动加载 .env（bunfig 无需配置）；再兜底手动解析一次
if (!process.env.BILI_USER || !process.env.BILI_PASS) {
  try {
    const envFile = await Bun.file('.env').text()
    for (const line of envFile.split('\n')) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/)
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2]
    }
  } catch {
    // 无 .env，跳过登录
  }
}

const USER = process.env.BILI_USER
const PASS = process.env.BILI_PASS
if (!USER || !PASS) {
  console.log('SKIP: 仓库根无 .env（参考 .env.example 创建；已登录则无需创建）')
  process.exit(0)
}

interface Target {
  url: string
  webSocketDebuggerUrl: string
  type: string
}
const targets = (await (await fetch('http://localhost:9222/json')).json()) as Target[]
const tab = targets.find((t) => t.type === 'page' && t.url.includes(urlPart))
if (!tab) {
  console.error(`tab not found for: ${urlPart}`)
  process.exit(1)
}

const ws = new WebSocket(tab.webSocketDebuggerUrl)
let seq = 0
function send(method: string, params?: unknown): Promise<any> {
  return new Promise((resolve) => {
    const id = ++seq
    const onMsg = (ev: MessageEvent) => {
      const msg = JSON.parse(ev.data as string)
      if (msg.id === id) {
        ws.removeEventListener('message', onMsg)
        resolve(msg.result ?? msg.error ?? {})
      }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const evalJs = async (expression: string) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails)
    console.error('EX:', JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result?.value
}

// NOTE 登录态唯一可靠判据是 DedeUserID cookie（未登录时 passport 页也会渲染出
// 一堆长得像登录按钮的东西，按按钮文案探测会误判）
const LOGGED_IN = `document.cookie.includes('DedeUserID=')`

ws.onopen = async () => {
  await send('Page.enable')
  if ((await evalJs(LOGGED_IN)) === true) {
    console.log('ALREADY-LOGGED-IN')
    process.exit(0)
  }

  await send('Page.bringToFront')
  await send('Page.navigate', { url: 'https://passport.bilibili.com/login' })
  await sleep(6000)

  // 填账号密码 + 聚焦验证码输入框。passport 是 Vue 受控输入，必须走原生 value setter
  // 再派发 input/change，直接赋值 .value 不会被框架读走
  const filled = await evalJs(`(() => {
    const setVal = (el, v) => {
      const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value')
      d.set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const acc = document.querySelector('input[placeholder="请输入账号"]')
      || document.querySelector('input[type="text"]')
    const pwd = document.querySelector('input[placeholder="请输入密码"]')
      || document.querySelector('input[type="password"]')
    if (!acc || !pwd) return 'NO-INPUTS'
    setVal(acc, ${JSON.stringify(USER)})
    setVal(pwd, ${JSON.stringify(PASS)})
    const cap = document.querySelector('input.body__captcha-input')
      || document.querySelector('input[placeholder="输入图片中的内容"]')
    if (cap) cap.focus()
    return cap ? 'FILLED-WITH-CAPTCHA' : 'FILLED-NO-CAPTCHA'
  })()`)
  console.log('填表:', filled)
  if (filled === 'NO-INPUTS') process.exit(1)

  if (filled === 'FILLED-WITH-CAPTCHA') {
    console.log('')
    console.log('👉 请在调试窗口里输入图片验证码（看不清就点「换一张」）。')
    console.log('   账号密码我已经填好；你填够验证码后我会自动点「登录」，最多等 3 分钟。')
    console.log('')
  }

  // 轮询：验证码填够位数就点登录（多点几次，验证码错了会换一张，等下一轮）
  const deadline = Date.now() + 180_000
  let submits = 0
  let lastSubmit = 0
  while (Date.now() < deadline) {
    await sleep(1000)
    if ((await evalJs(LOGGED_IN)) === true) {
      console.log('LOGGED-IN')
      process.exit(0)
    }
    const st = await evalJs(`(() => {
      const cap = document.querySelector('input.body__captcha-input')
        || document.querySelector('input[placeholder="输入图片中的内容"]')
      const btn = document.querySelector('.btn_primary')
        || [...document.querySelectorAll('button,div,span')].find(e => (e.textContent || '').trim() === '登录')
      return JSON.stringify({
        capLen: cap ? cap.value.length : -1,
        btnDisabled: btn ? (btn.className || '').toString().includes('disabled') : null,
      })
    })()`)
    if (!st) continue
    const { capLen, btnDisabled } = JSON.parse(st) as {
      capLen: number
      btnDisabled: boolean | null
    }
    const ready = capLen >= 4 && btnDisabled === false
    if (ready && submits < 6 && Date.now() - lastSubmit > 6000) {
      await evalJs(
        `(() => { const b = document.querySelector('.btn_primary'); if (b) b.click(); return 'clicked' })()`,
      )
      submits++
      lastSubmit = Date.now()
      console.log(`已点「登录」（第 ${submits} 次）`)
    }
  }
  console.error('LOGIN-UNCONFIRMED: 超时未拿到 DedeUserID（验证码是否一直没填对？）')
  process.exit(1)
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 200_000)
