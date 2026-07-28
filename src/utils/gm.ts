/**
 * GM API 兜底层。
 *
 * 部分脚本管理器（如 iOS Safari 的 userscript 扩展）注入 GM_* API 的时机
 * 晚于 document-start，插件客户端在模块初始化时缓存的绑定可能是 undefined；
 * 有的实现还会对未设置的键抛异常。
 *
 * 因此这里在【调用时】动态解析 GM_*，仍未注入时用 localStorage 兜底，
 * 保证脚本在任何管理器、任何注入时序下都不崩。
 */

declare const unsafeWindow: (Window & typeof globalThis) | undefined

function rawFn(name: 'GM_getValue' | 'GM_setValue' | 'GM_registerMenuCommand') {
  const g = globalThis as Record<string, unknown>
  if (typeof g[name] === 'function') return g[name]
  const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : undefined) as
    | Record<string, unknown>
    | undefined
  if (w && typeof w[name] === 'function') return w[name]
  return undefined
}

export function GM_getValue<T = any>(key: string, defaultValue?: T): T {
  const fn = rawFn('GM_getValue') as
    | ((key: string, defaultValue?: T) => T)
    | undefined
  if (fn) {
    try {
      return fn(key, defaultValue)
    } catch {
      return defaultValue as T
    }
  }
  const stored = localStorage.getItem(`gm:${key}`)
  return stored === null ? (defaultValue as T) : JSON.parse(stored)
}

export function GM_setValue(key: string, value: unknown): void {
  const fn = rawFn('GM_setValue') as ((key: string, value: unknown) => void) | undefined
  if (fn) {
    try {
      fn(key, value)
      return
    } catch {
      // 落入 localStorage 兜底
    }
  }
  localStorage.setItem(`gm:${key}`, JSON.stringify(value))
}

export function GM_registerMenuCommand(
  name: string,
  callback: () => void,
): void {
  const fn = rawFn('GM_registerMenuCommand') as
    | ((name: string, callback: () => void) => void)
    | undefined
  if (fn) {
    try {
      fn(name, callback)
    } catch {
      // 无菜单命令能力时静默降级
    }
  }
}
