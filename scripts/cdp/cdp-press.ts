// 真实输入管线按压指定元素并全程埋点：bun scripts/cdp/cdp-press.ts <url包含> <css选择器>
// 步骤：装埋点 → 取坐标 → Input.dispatchMouseEvent 按压 → 导出事件日志与最终状态
//
// NOTE 验证点击/交互 bug **必须**走真实输入管线：JS 合成 .click() 与真实按压的激活序列不同，
// 合成点击验证通过不代表用户能点。本脚本按选择器取元素（用选择器而不是 id，页面里 id 常常不稳定）。
const [, , urlPart, selector] = process.argv

const targets = await (await fetch('http://localhost:9222/json')).json()
const tab = targets.find(
  (t: { type: string; url: string }) =>
    t.type === 'page' && t.url.includes(urlPart as string),
)
if (!tab) {
  console.error('tab not found')
  process.exit(1)
}

const ws = new WebSocket(tab.webSocketDebuggerUrl)
let id = 0
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
function send(method: string, params: unknown = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, { resolve, reject })
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id)!
    pending.delete(msg.id)
    if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
    else p.resolve(msg.result)
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function evalJs(expression: string) {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails)
    throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600))
  return r.result.value
}

ws.onopen = async () => {
  try {
    await send('Runtime.enable')
    // 后台标签页 visibilityState=hidden 时 Chrome 直接丢弃输入事件（埋点日志为空、
    // 状态不变，看起来像"点了没反应"），按压前必须把 tab 置前
    await send('Page.bringToFront')
    // 1) 装埋点并取目标坐标
    const setup = await evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      if (!el) return { ok: false, reason: 'element not found: ' + ${JSON.stringify(selector)} }
      el.scrollIntoView({ block: 'center' })
      window.__pressLog = []
      const rec = (e) => {
        window.__pressLog.push({
          t: e.type, target: e.target.tagName + '#' + (e.target.id || ''),
          trusted: e.isTrusted, defaultPrevented: e.defaultPrevented, ts: performance.now() | 0,
        })
      }
      for (const type of ['pointerdown','mousedown','pointerup','mouseup','click','change','input']) {
        window.addEventListener(type, rec, true)
      }
      // 记录按压前后的位置，排查元素位移导致 click 丢失
      const r = el.getBoundingClientRect()
      window.__pressRect0 = { x: r.x, y: r.y }
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return {
        ok: true, x: r.x + r.width / 2, y: r.y + r.height / 2,
        hit: hit ? hit.tagName + '#' + (hit.id || '') + '.' + (hit.className || '').toString().slice(0, 40) : null,
      }
    })()`)
    if (!setup.ok) {
      console.log(JSON.stringify(setup))
      process.exit(1)
    }

    // 2) 真实按压
    const base = { x: setup.x, y: setup.y, button: 'left', clickCount: 1 }
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base })
    await sleep(80)
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base })
    await sleep(2500) // 等请求与 effect 落地

    // 3) 导出日志与最终状态
    const out = await evalJs(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)})
      const r = el.getBoundingClientRect()
      const log = window.__pressLog
      for (const type of ['pointerdown','mousedown','pointerup','mouseup','click','change','input']) {
        window.removeEventListener(type, undefined, true)
      }
      return {
        log,
        rectBefore: window.__pressRect0,
        rectAfter: { x: r.x, y: r.y },
        final: {
          value: el.value ?? null,
          checked: el.checked ?? null,
          className: (el.className || '').toString().slice(0, 120),
          attrs: [...el.attributes].map(a => a.name + '=' + a.value).slice(0, 20),
        },
      }
    })()`)
    console.log(JSON.stringify(out, null, 1))
    process.exit(0)
  } catch (err) {
    console.error('ERR', (err as Error).message)
    process.exit(1)
  }
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 30000)
