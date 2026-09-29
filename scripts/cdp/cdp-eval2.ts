// 带自动接受原生对话框的 CDP eval：bun scripts/cdp/cdp-eval2.ts <url包含> <js文件>
const [, , urlPart, jsFile] = process.argv
const js = await Bun.file(jsFile as string).text()

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
      method: 'Runtime.evaluate',
      params: { expression: js, returnByValue: true, awaitPromise: true },
    }),
  )
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.method === 'Page.javascriptDialogOpening') {
    console.error('DIALOG:', msg.message)
    ws.send(
      JSON.stringify({
        id: 99,
        method: 'Page.handleJavaScriptDialog',
        params: { accept: true },
      }),
    )
  }
  if (msg.id === 2) {
    const r = msg.result
    if (r.exceptionDetails)
      console.error('EX:', JSON.stringify(r.exceptionDetails).slice(0, 400))
    else console.log(JSON.stringify(r.result.value ?? r.result))
    process.exit(0)
  }
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 30000)
