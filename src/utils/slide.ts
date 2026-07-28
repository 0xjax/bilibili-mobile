/**
 * 设置滑动事件监听器
 * @param container - 容器元素
 * @param touchXThreshold - 触发滑动的阈值
 * @param onSlideLeft - 向左滑动时的回调函数
 * @param onSlideRight - 向右滑动时的回调函数
 */
export function setupSlide(
  container: HTMLElement,
  touchXThreshold: number,
  onSlideLeft: () => void,
  onSlideRight: () => void,
) {
  let startX = 0
  let startY = 0

  const handleTouchStart = (event: TouchEvent) => {
    startX = event.changedTouches[0].clientX
    startY = event.changedTouches[0].clientY
  }

  const handleTouchEnd = (event: TouchEvent) => {
    const offsetX = event.changedTouches[0].clientX - startX
    const offsetY = event.changedTouches[0].clientY - startY

    if (
      Math.abs(offsetX) > touchXThreshold &&
      Math.abs(offsetY / offsetX) < 1 / 2
    ) {
      if (offsetX > 0) {
        onSlideRight()
      } else {
        onSlideLeft()
      }
    }
  }

  container.addEventListener('touchstart', handleTouchStart)
  container.addEventListener('touchend', handleTouchEnd)
}
