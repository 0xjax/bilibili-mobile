// 清除指定 tab 的 CDP 视口 override：bun scripts/cdp/cdp-clear-emulation.ts <url包含>
// NOTE 直接 clear 对已固定的 tab 常不生效：必须先设 0×0（0 = 跟随窗口尺寸）再 clear
const [, , urlPart] = process.argv
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
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Emulation.setDeviceMetricsOverride',
      params: { width: 0, height: 0, deviceScaleFactor: 0, mobile: false },
    }),
  )
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id === 1) {
    ws.send(
      JSON.stringify({ id: 2, method: 'Emulation.clearDeviceMetricsOverride', params: {} }),
    )
  }
  if (msg.id === 2) {
    console.log('cleared')
    process.exit(0)
  }
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 10000)
