export const waitDOMContentLoaded = (callback: () => void): void => {
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', callback)
  else callback()
}

// run-at document-start 时 document.head 可能尚未出生（跨站点实测：head/html/body
// 全 null），此时直接 appendChild 会让整个脚本崩在启动阶段。head 已存在则立即执行，
// 否则等它在 DOM 里出现（head 出生远早于 DOMContentLoaded）
export const waitHead = (callback: () => void): void => {
  if (document.head) {
    callback()
    return
  }
  const observer = new MutationObserver(() => {
    if (document.head) {
      observer.disconnect()
      callback()
    }
  })
  observer.observe(document, { childList: true, subtree: true })
}
