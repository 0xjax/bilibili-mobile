// CDP 截图：bun scripts/cdp/cdp-shot.ts <url包含> <输出路径>
const [, , urlPart, outPath] = process.argv
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
ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: 'Page.enable' }))
  ws.send(
    JSON.stringify({
      id: 2,
      method: 'Page.captureScreenshot',
      params: { format: 'png' },
    }),
  )
}
ws.onmessage = async (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id === 2) {
    await Bun.write(outPath as string, Buffer.from(msg.result.data, 'base64'))
    console.log('saved', outPath)
    process.exit(0)
  }
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 20000)
