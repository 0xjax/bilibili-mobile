import {
  GM_getValue as importedGetValue,
  GM_setValue as importedSetValue,
  GM_registerMenuCommand as importedRegisterMenuCommand,
} from '$'

/**
 * GM API 兜底层。
 *
 * 管理器注入 GM_* 的方式各不相同：脚本作用域（闭包）、globalThis、
 * unsafeWindow，且注入时机可能晚于 document-start（插件客户端在模块
 * 初始化时缓存的绑定可能是 undefined）。有的实现还会对未设置的键抛异常。
 *
 * 因此在【调用时】按 插件绑定（作用域查找）→ globalThis → unsafeWindow
 * 顺序动态解析，全部缺失时用 localStorage 兜底，保证脚本不崩。
 */

declare const unsafeWindow: (Window & typeof globalThis) | undefined

function rawFn(name: string, imported: unknown): Function | undefined {
  // 插件绑定经由作用域查找，能覆盖闭包注入的管理器
  if (typeof imported === 'function') return imported
  const g = globalThis as Record<string, unknown>
  if (typeof g[name] === 'function') return g[name] as Function
  const w = (typeof unsafeWindow !== 'undefined' ? unsafeWindow : undefined) as
    | Record<string, unknown>
    | undefined
  if (w && typeof w[name] === 'function') return w[name] as Function
  return undefined
}

export function GM_getValue<T = any>(key: string, defaultValue?: T): T {
  const fn = rawFn('GM_getValue', importedGetValue) as
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
  const fn = rawFn('GM_setValue', importedSetValue) as
    | ((key: string, value: unknown) => void)
    | undefined
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
  const fn = rawFn('GM_registerMenuCommand', importedRegisterMenuCommand) as
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
