import { unsafeWindow } from '$'

type ShadowHandler = (root: ShadowRoot, host: Element) => void

const createdRoots: [ShadowRoot, Element][] = []
const handlers: { hostTag: string; handler: ShadowHandler }[] = []

/**
 * 拦截页面域的 attachShadow，在 shadow root 创建瞬间分发。
 * 必须在 document-start、页面脚本执行前调用。
 */
export function initShadowHook() {
  const original = unsafeWindow.Element.prototype.attachShadow
  unsafeWindow.Element.prototype.attachShadow = function (
    this: Element,
    init: ShadowRootInit,
  ): ShadowRoot {
    const root = original.call(this, init)
    createdRoots.push([root, this])
    dispatch(root, this)
    return root
  }
}

/**
 * 对指定标签的组件注册回调，已创建的 root 会立即回放。
 * 事件监听建议直接委托在 root 上，可覆盖后添加的子元素。
 */
export function onShadowRoot(hostTag: string, handler: ShadowHandler): void {
  handlers.push({ hostTag, handler })
  for (const [root, host] of createdRoots) {
    if (host.tagName.toLowerCase() === hostTag) {
      runHandler(handler, root, host)
    }
  }
}

// 为指定标签组件的 shadow root 注入样式
export function injectStyleIntoShadows(cssText: string, hostTag: string) {
  onShadowRoot(hostTag, (root) => {
    root.appendChild(
      Object.assign(document.createElement('style'), { textContent: cssText }),
    )
  })
}

function dispatch(root: ShadowRoot, host: Element) {
  for (const { hostTag, handler } of handlers) {
    if (host.tagName.toLowerCase() === hostTag) {
      runHandler(handler, root, host)
    }
  }
}

// 钩子绝不能影响页面自身逻辑
function runHandler(handler: ShadowHandler, root: ShadowRoot, host: Element) {
  try {
    handler(root, host)
  } catch {}
}
