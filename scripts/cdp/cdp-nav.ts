// 直接导航指定 tab（绕过卡死的 JS 主线程）：bun scripts/cdp/cdp-nav.ts <url包含> [新url]
const [, , urlPart, dest] = process.argv
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
ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }))
  ws.send(
    JSON.stringify({
      id: 2,
      method: 'Page.navigate',
      params: { url: dest || tab.url },
    }),
  )
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id === 2) {
    console.log(JSON.stringify(msg.result ?? msg))
    process.exit(0)
  }
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 15000)
