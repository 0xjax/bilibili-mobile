// 转为协议相对 URL，适配 http/https 页面
export function formatUrl(url: string) {
  return url.slice(url.indexOf(':') + 1)
}
