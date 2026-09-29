// 调试 Chrome 登录 B 站：脚本只做一件事 —— 把 .env 里的账号密码预填进登录页，然后停下等人。
//
// 登录必须人工过验证码，所以这一步永远交给人，脚本不代劳、也不描述这一步怎么做。
//
// 固化的三步流程（详见 docs/dev-runbook.md）：
//   1) bun scripts/dev/login-debug-chrome.ts --fill   预填账号密码（0 暴露），打印一句
//                                                     「请你完成登录」后**立刻返回**
//   2) 👤 人去完成登录操作 —— 怎么过验证码是人的事，脚本不插手、也不描述
//   3) 人说完成后跑 --verify 确认登录态，再继续后面的工作
//
// WARNING 第 1 步返回后就**停下等人**，NEVER 再补任何「可能的 / 不确定的」操作步骤。
//   教训：曾经往流程里塞过验证码形态、「要不要再点一次登录」之类的猜测，纯属噪声。
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
  console.log(`调试 Chrome 登录 B 站

用法：
  bun scripts/dev/login-debug-chrome.ts --fill      # 1) 预填账号密码，然后停下等人
  bun scripts/dev/login-debug-chrome.ts --verify    # 3) 人说完成后，确认登录态

完整流程：
  1) --fill     把 .env 里的账号密码预填进登录页（0 暴露），然后停下
  2) 人         去完成登录操作（验证码只能由人过）
  3) --verify   确认拿到 DedeUserID cookie，再继续后面的工作

注：登录态存在调试 profile（D:\\chrome-debug-profile）里，不用每次冷启动重来。`)
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

// 登录态唯一可靠判据是 DedeUserID cookie
const LOGGED_IN = `document.cookie.includes('DedeUserID=')`

const ACC_CANDIDATES = ['input[placeholder="请输入账号"]', 'input[type="text"]']
const PWD_CANDIDATES = ['input[placeholder="请输入密码"]', 'input[type="password"]']

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

  // ── 步骤 1：预填账号密码，然后停下等人 ──────────────────────────────
  if ((await evalJs(LOGGED_IN)) === true) {
    console.log('ALREADY-LOGGED-IN')
    process.exit(0)
  }

  await send('Page.bringToFront')
  await send('Page.navigate', { url: 'https://passport.bilibili.com/login' })
  await sleep(6000)

  const accSel = await firstExisting(ACC_CANDIDATES)
  const pwdSel = await firstExisting(PWD_CANDIDATES)
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

  console.log('账号密码已预填。')
  console.log('')
  console.log('👉 请你完成登录操作，完成后告诉我，我再继续。')
  process.exit(0)
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 60_000)
