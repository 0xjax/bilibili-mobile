/**
 * 处理评论区图片的触摸事件
 *
 * @param zoomWrap - 缩放元素
 * @param photoShadow - 包含操作按钮的外框元素
 */
export function touchZoomWrap(zoomWrap: HTMLElement, photoShadow: ShadowRoot) {
  if (zoomWrap) {
    let initialDistance = 0
    let initialScale = 1
    let transformOrigin = { x: 0, y: 0 }
    let startX = 0
    let startY = 0
    let initialTransformX = 0
    let initialTransformY = 0
    let lastTouchCount = 0

    const calculateDistance = (touches: TouchList): number => {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const calculateCenter = (touches: TouchList): number[] => {
      const dx = (touches[0].clientX + touches[1].clientX) / 2
      const dy = (touches[0].clientY + touches[1].clientY) / 2
      return [dx, dy]
    }

    const calcInitialTranslate = (changedTouches: TouchList) => {
      startX = changedTouches[0].clientX
      startY = changedTouches[0].clientY

      initialTransformX = +zoomWrap.style.transform.match(
        /translate\((-?[0-9.]+)px, -?[0-9.]+px\)/,
      )![1]
      initialTransformY = +zoomWrap.style.transform.match(
        /translate\(-?[0-9.]+px, (-?[0-9.]+)px\)/,
      )![1] // 解析当前偏移
    }

    const handleTouchStart = (event: TouchEvent) => {
      if (zoomWrap.style.cssText.match(/scale3d\(1, 1, 1\)/)) {
        zoomWrap.style.cssText = `transform: scale(1) translate(0px, 0px) !important;
transform-origin: 50% 50%;
`
      }

      if (event.touches.length === 2) {
        initialDistance = calculateDistance(event.touches)
        const center = calculateCenter(event.touches)
        transformOrigin = { x: center[0], y: center[1] }
        updateTransformOrigin()
      } else if (event.touches.length === 1) {
        calcInitialTranslate(event.changedTouches)
      }

      lastTouchCount = event.touches.length
      initialScale = getCurrentScale()
      zoomWrap.addEventListener('touchmove', handleTouchMove, {
        passive: false,
      })
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        const currentDistance = calculateDistance(event.touches)
        const scale = Math.max(
          1,
          initialScale * (currentDistance / initialDistance),
        )

        const center = calculateCenter(event.touches)
        transformOrigin = { x: center[0], y: center[1] }

        updateTransform(scale)
        updateTransformOrigin()

        event.preventDefault()
      } else if (event.touches.length === 1 && lastTouchCount === 2) {
        // 处理从双指变为单指的情况
        calcInitialTranslate(event.touches)
        initialScale = getCurrentScale()
      } else if (event.touches.length === 1 && initialScale > 1.05) {
        // 防止未还原到位
        const deltaX = (event.changedTouches[0].clientX - startX) / initialScale
        const deltaY = (event.changedTouches[0].clientY - startY) / initialScale

        zoomWrap.style.cssText = zoomWrap.style.cssText.replace(
          /translate\(-?[0-9.]+px, -?[0-9.]+px\)/,
          `translate(${initialTransformX + deltaX}px, ${initialTransformY + deltaY}px)`,
        )
      }

      lastTouchCount = event.touches.length
    }

    const handleTouchEnd = (event: TouchEvent) => {
      zoomWrap.removeEventListener('touchmove', handleTouchMove)
      if (event.touches.length === 0) {
        if (initialScale < 1.05) {
          const offsetX = event.changedTouches[0].clientX - startX
          const offsetY = event.changedTouches[0].clientY - startY

          if (Math.abs(offsetX) > 55 && Math.abs(offsetY / offsetX) < 1 / 2) {
            if (offsetX > 0) {
              ;(photoShadow.querySelector('#prev') as HTMLElement)?.click()
            } else {
              ;(photoShadow.querySelector('#next') as HTMLElement)?.click()
            }
          }
        }
      }
      if (event.touches.length === 1) {
        calcInitialTranslate(event.changedTouches)
      }
    }

    const getCurrentScale = (): number => {
      const match = zoomWrap.style.transform.match(/scale\(([0-9.]+)\)/)
      return match ? parseFloat(match[1]) : 1
    }

    const updateTransform = (scale: number) => {
      const currentTransform = zoomWrap.style.transform
      const newTransform = currentTransform.replace(
        /scale\([0-9.]+\)/,
        `scale(${scale})`,
      )
      zoomWrap.style.transform = newTransform
    }

    const updateTransformOrigin = () => {
      zoomWrap.style.transformOrigin = `${transformOrigin.x}px ${transformOrigin.y}px`
    }

    zoomWrap.addEventListener('touchstart', handleTouchStart)
    zoomWrap.addEventListener('touchend', handleTouchEnd)
  }
}
