import { handleTransitionEndOnce } from '../utils/transition.ts'

/* 使用 sessionStorage + heade style 绕过 DOM 依赖以解决刷新缓加载导致的内容跳动。
   head 中的 style 也会暂缓。最后确定是元素在样式表加载前的初始样式问题。 */

/**
 * 处理侧边栏事件的函数
 */
export function setSidebarBtn(type: 'video' | 'list' | 'message'): void {
  const videoMap: Record<string, string[]> = {
    video: ['.right-container', '.rec-footer'],
    list: ['.playlist-container--right', '.recommend-list-container'],
  }

  if (['video', 'list'].includes(type)) {
    handleVideoSidebar()
    showMoreRecommend()
  } else if (type === 'message') {
    handleMessageSidebar()
  }

  /**
   * 处理视频侧边栏
   */
  function handleVideoSidebar() {
    const sidebarFab = document.getElementById('sidebar-fab') as HTMLElement
    const videoContainer = document.querySelector(
      '#mirror-vdcon',
    ) as HTMLElement

    sidebarFab.addEventListener('click', () =>
      videoContainer.toggleAttribute('sidebar'),
    )

    function closeSidebar() {
      videoContainer.removeAttribute('sidebar')
    }

    const rightContainer = videoContainer.querySelector(
      videoMap[type][0],
    ) as HTMLElement
    const recommendLiist = rightContainer.querySelector(
      videoMap[type][1],
    ) as HTMLElement

    recommendLiist.addEventListener('click', (event) => {
      const nextPlay = document.querySelector('.rec-title')
      const recommendFooter = document.querySelector('.rec-footer') // 自动收起侧边栏
      if (
        !nextPlay?.contains(event.target as Node) &&
        !recommendFooter?.contains(event.target as Node)
      ) {
        closeSidebar()
        handleTransitionEndOnce(rightContainer, 'transform', () => {
          rightContainer.scrollTop = 0
        })
        // 评论区样式由 attachShadow 钩子自动应用，无需手动重刷
      }
    })
  }

  // 侧边栏自动展开更多
  function showMoreRecommend() {
    const recommendFooter = document.querySelector('.rec-footer') as HTMLElement
    setTimeout(() => {
      recommendFooter?.click()
    }, 2000) // 直接传递 recommendFooter?.click: 可选链操作符前的 recommendFooter 条件判断将会立即执行

    document
      .querySelector('video')
      ?.addEventListener('canplay', showMoreRecommend, { once: true })
  }

  // 处理消息侧边栏
  function handleMessageSidebar() {
    const sidebarFab = document.getElementById('sidebar-fab') as HTMLElement
    const messageContainer = document.querySelector(
      'body>.container',
    ) as HTMLElement

    sidebarFab.addEventListener('click', () => {
      messageContainer.toggleAttribute('sidebar')
      sidebarOverlay.classList.toggle('show')
      sidebarFab.classList.toggle('active')
    })

    const sidebarOverlay = document.createElement('div')
    sidebarOverlay.id = 'sidebar-overlay'
    sidebarFab.appendChild(sidebarOverlay)
  }
}
