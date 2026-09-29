// 设置调试浏览器的下载目录：bun scripts/cdp/cdp-dl.ts
// （本仓库当前没有下载类功能，保留它是为了和别的仓库同一套工具箱；改目录只改这里）
const ver = await (await fetch('http://localhost:9222/json/version')).json()
const ws = new WebSocket(ver.webSocketDebuggerUrl)
ws.onopen = () => {
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Browser.setDownloadBehavior',
      params: {
        behavior: 'allow',
        downloadPath: 'D:/chrome-debug-downloads',
        eventsEnabled: true,
      },
    }),
  )
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id === 1) {
    console.log('set:', JSON.stringify(msg.result ?? msg.error))
    process.exit(0)
  }
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 15000)
