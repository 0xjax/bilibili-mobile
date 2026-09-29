// 调试 Chrome 登录 B 站。凭据来源：仓库根 .env（bun 自动加载）。
//
// CRITICAL 全程「0 暴露」（约束见 AGENTS.md「Secrets」）：
//   - 本脚本**不自己读 .env 文件**，靠 bun 自动加载到 process.env
//   - NEVER 打印凭据（连长度以外的信息都不打）、NEVER 放进命令行参数
//   - NEVER 把凭据拼进 Runtime.evaluate 的表达式字符串 —— 表达式一旦抛错，
//     内容会随异常回显出来。凭据只作为 CDP 参数走 Input.insertText 真实输入管线
//   - 填完只用「长度是否一致」校验，不读回值
//
// WARNING B 站密码登录有图片验证码（还可能叠加 geetest 风控），无法无人值守：
//   本脚本填完账号密码后会停下，等你手动输入图片验证码；检测到验证码填够位数就自动点
//   「登录」，再轮询 DedeUserID cookie 确认。也可以完全不跑本脚本，直接在调试窗口
//   手动登录一次（登录态存在调试 profile 里，不用每次重来）。
//
// 用法：bun scripts/dev/login-debug-chrome.ts [tab url 包含子串，默认 bilibili]
const [, , urlPart = 'bilibili'] = process.argv

const USER = process.env.BILI_USER
const PASS = process.env.BILI_PASS
if (!USER || !PASS) {
  console.log(
    'SKIP: 环境里没有 BILI_USER / BILI_PASS（复制 .env.example 为 .env 并填入；已登录则无需创建）',
  )
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
async function evalJs(expression: string) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails) {
    // NOTE 这里绝不回显表达式本身：凭据可能在里面（本脚本已避免这种情况，双保险）
    console.error('EX:', String(r.exceptionDetails.text ?? '').slice(0, 200))
  }
  return r.result?.value
}

// 登录态唯一可靠判据是 DedeUserID cookie（未登录时 passport 页也会渲染出一堆
// 长得像登录入口的东西，按按钮文案探测会误判）
const LOGGED_IN = `document.cookie.includes('DedeUserID=')`

const ACC_CANDIDATES = ['input[placeholder="请输入账号"]', 'input[type="text"]']
const PWD_CANDIDATES = ['input[placeholder="请输入密码"]', 'input[type="password"]']
const CAPTCHA_CANDIDATES = [
  'input.body__captcha-input',
  'input[placeholder="输入图片中的内容"]',
]

const firstExisting = async (candidates: string[]) => {
  for (const sel of candidates) {
    if ((await evalJs(`!!document.querySelector(${JSON.stringify(sel)})`)) === true)
      return sel
  }
  return null
}

// 聚焦并全选（insertText 会替换选区），表达式里只有选择器，没有任何凭据
const focusAndSelect = (selector: string) =>
  evalJs(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    if (!el) return false
    el.focus()
    if (el.select) el.select()
    return true
  })()`)

ws.onopen = async () => {
  await send('Page.enable')
  if ((await evalJs(LOGGED_IN)) === true) {
    console.log('ALREADY-LOGGED-IN')
    process.exit(0)
  }

  await send('Page.bringToFront')
  await send('Page.navigate', { url: 'https://passport.bilibili.com/login' })
  await sleep(6000)

  const accSel = await firstExisting(ACC_CANDIDATES)
  const pwdSel = await firstExisting(PWD_CANDIDATES)
  const capSel = await firstExisting(CAPTCHA_CANDIDATES)
  if (!accSel || !pwdSel) {
    console.error('NO-INPUTS: 找不到账号/密码输入框（passport 页面结构可能已变）')
    process.exit(1)
  }

  // 填充：值只作为 CDP 参数传给 Input.insertText，绝不进 JS 表达式
  for (const [sel, value] of [
    [accSel, USER],
    [pwdSel, PASS],
  ] as const) {
    if (!(await focusAndSelect(sel))) {
      console.error('NO-FOCUS: 聚焦失败')
      process.exit(1)
    }
    await send('Input.insertText', { text: value })
    await sleep(150)
  }

  // 只校验长度，不读回值
  const lens = JSON.parse(
    (await evalJs(`JSON.stringify({
      acc: (document.querySelector(${JSON.stringify(accSel)}) || {}).value?.length ?? -1,
      pwd: (document.querySelector(${JSON.stringify(pwdSel)}) || {}).value?.length ?? -1,
    })`)) ?? '{}',
  ) as { acc: number; pwd: number }
  if (lens.acc !== USER.length || lens.pwd !== PASS.length) {
    console.error('FILL-MISMATCH: 值没进输入框（检查选择器/焦点），未打印任何凭据内容')
    process.exit(1)
  }
  console.log('填表: 账号密码已填入（长度校验通过）')

  if (capSel) {
    await focusAndSelect(capSel)
    console.log('')
    console.log('👉 请在调试窗口里输入图片验证码（看不清就点「换一张」）。')
    console.log('   账号密码我已经填好；你填够验证码后我会自动点「登录」，最多等 3 分钟。')
    console.log('')
  }

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
      const cap = document.querySelector(${JSON.stringify(capSel ?? 'input[placeholder="输入图片中的内容"]')})
      const btn = document.querySelector('.btn_primary')
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
    if (capLen >= 4 && btnDisabled === false && submits < 6 && Date.now() - lastSubmit > 6000) {
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
