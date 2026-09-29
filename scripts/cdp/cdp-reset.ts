// 浏览器级 CDP：关闭卡死 tab 并重开同 URL：bun scripts/cdp/cdp-reset.ts <url包含>
// 页面 JS 死循环时 Runtime.evaluate 也会超时，这时只能走浏览器级重开
const [, , urlPart] = process.argv
const ver = (await (
  await fetch('http://localhost:9222/json/version')
).json()) as { webSocketDebuggerUrl: string }
const targets = (await (await fetch('http://localhost:9222/json')).json()) as {
  targetId?: string
  id?: string
  url: string
  type: string
}[]
const tab = targets.find((t) => t.type === 'page' && t.url.includes(urlPart as string))
if (!tab) {
  console.error('tab not found')
  process.exit(1)
}
const id = tab.targetId || tab.id
const ws = new WebSocket(ver.webSocketDebuggerUrl)
ws.onopen = () => {
  ws.send(
    JSON.stringify({ id: 1, method: 'Target.closeTarget', params: { targetId: id } }),
  )
}
ws.onmessage = async (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id === 1) {
    console.log('closed:', JSON.stringify(msg.result))
    const res = await fetch(
      'http://localhost:9222/json/new?' + encodeURIComponent(tab.url),
      { method: 'PUT' },
    )
    console.log('reopened:', (await res.json()).url)
    process.exit(0)
  }
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 15000)
