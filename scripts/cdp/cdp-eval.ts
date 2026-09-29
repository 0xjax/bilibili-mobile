// 直连 CDP 在指定 tab 执行 JS：bun scripts/cdp/cdp-eval.ts <url包含> <js文件>
const [, , urlPart, jsFile] = process.argv
const js = await Bun.file(jsFile as string).text()

const targets = (await (await fetch('http://localhost:9222/json')).json()) as {
  url: string
  webSocketDebuggerUrl: string
  type: string
}[]
const tab = targets.find((t) => t.type === 'page' && t.url.includes(urlPart as string))
if (!tab) {
  console.error('tab not found for:', urlPart)
  process.exit(1)
}

const ws = new WebSocket(tab.webSocketDebuggerUrl)
ws.onopen = () => {
  ws.send(
    JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: { expression: js, returnByValue: true, awaitPromise: true },
    }),
  )
}
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data as string)
  if (msg.id === 1) {
    const r = msg.result
    if (r.exceptionDetails)
      console.error('EX:', JSON.stringify(r.exceptionDetails).slice(0, 500))
    else console.log(JSON.stringify(r.result.value ?? r.result))
    process.exit(0)
  }
}
setTimeout(() => {
  console.error('timeout')
  process.exit(1)
}, 30000)
