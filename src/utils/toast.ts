import { handleTransitionEndOnce } from './transition.ts'

// 底部提示条（#toast，样式在 app.css）的统一驱动：填充文本 → 显示 → 过渡出现 →
// duration 后过渡消失并清理 inline style。存在多个 #toast（全屏播放时克隆进
// 播放器的那份，见 window.ts 的浏览时长提醒）时逐个驱动
export function showToast(message: string, duration = 3000): void {
  const toasts = document.querySelectorAll('#toast') as NodeListOf<HTMLElement>
  for (const toast of toasts) {
    toast.textContent = message
    toast.style.display = 'block'
    setTimeout(() => {
      toast.setAttribute('show', '')
    }, 10) // 修复搜索页show类优先块状显示

    setTimeout(() => {
      toast.removeAttribute('show')
      handleTransitionEndOnce(toast, 'opacity', () => {
        toast.style.cssText = ''
      })
    }, duration)
  }
}
