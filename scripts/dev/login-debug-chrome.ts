// 调试 Chrome 登录 B 站的**人机交互流程**（不是自动化登录）。
//
// 为什么不能全自动：B 站密码登录会出图片验证码，风控再高一点直接上 geetest 点选验证
// （实测点「登录」后网络里出现 api.geetest.com/...&type=click）。这类验证码**只能由人过**，
// 属于人机交互的固有环节，不要试图绕开（试过改走扫码，方向就是错的）。
//
// 另一个必踩的坑：验证码没过时，页面显示的是
// 「网络超时请点击此处重试」——文案极具误导性。实测点「登录」后按钮确实收到了完整的
// 可信事件序列（pointerdown→mousedown→pointerup→mouseup→click），请求也确实发出去了，
// 只是被风控拦下。所以看到「网络超时」先怀疑验证码，别去查网络。
//
// 固化的三步流程（详见 docs/dev-runbook.md）：
//   1) bun scripts/dev/login-debug-chrome.ts --fill     脚本填账号密码（0 暴露）+ 聚焦验证码框
//   2) 👤 人在调试窗口完成登录：点「登录」→ 验证码出现 → 按页面提示操作
//   3) bun scripts/dev/login-debug-chrome.ts --verify   确认登录态（DedeUserID cookie）
// 登录态存在调试 profile 里，不是每次冷启动都要重来；已登录时 --fill 会直接报 ALREADY-LOGGED-IN。
//
// CRITICAL 凭据全程 0 暴露（约束见 AGENTS.md「Secrets」）：
//   - 本脚本**不自己读 .env**，靠 bun 自动加载到 process.env
//   - NEVER 打印凭据（连长度以外的信息都不打）、NEVER 放进命令行参数
//   - 凭据只作为 CDP 参数走 Input.insertText 真实输入管线，NEVER 拼进 Runtime.evaluate
//     的表达式字符串（表达式一旦抛错会把内容随异常回显出来）
//   - 填完只用「长度是否一致」校验，不读回值
const MODES = ['--fill', '--verify'] as const
const mode = MODES.find((m) => process.argv.includes(m))

if (!mode) {
  console.log(`调试 Chrome 登录 B 站（人机交互流程）

用法：
  bun scripts/dev/login-debug-chrome.ts --fill      # 步骤 1：填账号密码，然后交给人
  bun scripts/dev/login-debug-chrome.ts --verify    # 步骤 3：确认登录态

完整流程：
  1) --fill          从 .env 读凭据填表（全程 0 暴露），并聚焦验证码框
  2) 人              在调试窗口完成登录：点「登录」→ 验证码出现 → 按页面提示操作
  3) --verify        确认拿到 DedeUserID cookie

注：登录态存在调试 profile（D:\\chrome-debug-profile）里，不用每次冷启动重来。
    看到「网络超时请点击此处重试」先怀疑验证码没过，那不是网络问题。`)
  process.exit(0)
}

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
const tab = targets.find((t) => t.type === 'page' && t.url.includes('bilibili'))
if (!tab) {
  console.error('tab not found（调试 Chrome 需带 --remote-debugging-port=9222 启动）')
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
    // NOTE 绝不回显表达式本身：凭据可能在里面（本脚本已避免，双保险）
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

// 聚焦并全选（insertText 会替换选区）；表达式里只有选择器，没有任何凭据
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

  // ── 步骤 3：确认登录态 ──────────────────────────────────────────────
  if (mode === '--verify') {
    const ok = (await evalJs(LOGGED_IN)) === true
    console.log(ok ? 'LOGGED-IN' : 'NOT-LOGGED-IN')
    process.exit(ok ? 0 : 1)
  }

  // ── 步骤 1：填表，然后交给人 ────────────────────────────────────────
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

  // 值只作为 CDP 参数传给 Input.insertText，绝不进 JS 表达式
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
  console.log('账号密码已填入（长度校验通过）')

  if (capSel) await focusAndSelect(capSel)

  console.log('')
  console.log('')
  console.log('👉 现在轮到你：在调试窗口点「登录」，验证码出现后按页面提示完成登录。')
  console.log('   实测：验证码没过时页面会显示「网络超时请点击此处重试」，那不是网络问题。')
  console.log('')
  console.log('   完成后跑：bun scripts/dev/login-debug-chrome.ts --verify')
  process.exit(0)
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 60_000)
