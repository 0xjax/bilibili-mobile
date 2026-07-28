import { GM_getValue, GM_setValue, unsafeWindow } from '$'
import { handleTransitionEndOnce } from './utils/transition.ts'
import { setupSlide } from './utils/slide.ts'

export function preventBeforeUnload() {
  const originalAddEventListener = window.addEventListener
  // 重写 addEventListener 方法，禁止网站刷新时的弹窗
  window.addEventListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) =>
    type === 'beforeunload' ||
    originalAddEventListener.call(window, type, listener, options)
}

/**
 * 增加视频加载数量
 */
export function increaseVideoLoadSize() {
  // 变量提升机制: 重新声明 window 会替代整个作用域内的 widow，但初始化前无法使用
  // typeof undefinedVariable 不会报错，而是返回 'undefined'

  const _unsafeWindow =
    typeof unsafeWindow !== 'undefined' ? unsafeWindow : window
  // 不使用 //@grant none 则沙盒运行; unsafeWindow: 重写 fetch, MouseEvent 对象的 view 属性

  const originalFetch = _unsafeWindow.fetch
  _unsafeWindow.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (
      typeof input === 'string' &&
      input.startsWith('https://api.bilibili.com') &&
      input.includes('feed/rcmd')
    ) {
      input = input.replace('&ps=12&', '&ps=30&')
    }
    return originalFetch(input, init)
  }
}

/**
 * 网页计时提醒
 */
export function countViewTime() {
  window.onload = function () {
    let storedTime = GM_getValue('view-time', 0) as number
    const storedTimestamp = GM_getValue('timestamp', Date.now()) as number

    const diff = Math.floor((Date.now() - storedTimestamp) / 1000 / 60)
    storedTime = diff < 3 ? storedTime + diff : 0

    function renewTime() {
      GM_setValue('view-time', storedTime)
      GM_setValue('timestamp', Date.now())
    }

    renewTime()

    setInterval(function () {
      storedTime++
      renewTime()
      if (storedTime % 120 === 0) {
        const fullscreenElem = document.fullscreenElement
        if (fullscreenElem && !fullscreenElem.querySelector(':scope>#toast')) {
          fullscreenElem.appendChild(
            document.querySelector('#toast')!.cloneNode(),
          )
        }
        const toasts = document.querySelectorAll(
          '#toast',
        ) as NodeListOf<HTMLElement>

        toasts.forEach((toast) => {
          toast.textContent = `您已连续浏览 ${storedTime / 60} 小时，请注意休息`
          toast.style.display = 'block'
          setTimeout(() => {
            toast.setAttribute('show', '')
          }, 10)

          setTimeout(() => {
            toast.removeAttribute('show')
            handleTransitionEndOnce(toast, 'opacity', () => {
              toast.style.cssText = ''
            })
          }, 5000)
        })
      }
    }, 60000)
  }
}

/**
 * 管理滚动和滑动事件的函数
 * @param {string} type - 页面类型
 */
export function handleScroll(type: string) {
  scrollToHidden(type)

  switch (type) {
    case 'search':
      slideSearchSort()
      break
    case 'video':
    case 'list':
      slideVideoSidebar()
      break
    case 'message':
      slideMessageSidebar()
      break
    case 'space':
      handleSpaceSwipe()
      break
    default:
      break
  }
}

// 滚动隐藏函数(弹幕行、评论行、操作栏)(主要布局块的class在初始化时会动态刷新，动态加载块子元素动态变动)(页面初始化使用了element的className方法设置class属性的值来同时添加多个class)
function scrollToHidden(type: string) {
  let lastScrollY = 0
  const scrollThreshold = 75
  const backup = document.getElementsByClassName(
    'back-to-top',
  )[0] as HTMLElement
  const videoMap = {
    video: '.left-container',
    list: '.playlist-container--left',
  }

  const isSidePage = ['video', 'list'].includes(type)

  let elem: HTMLElement | undefined
  if (isSidePage) {
    const container = document.querySelector(
      videoMap[type as keyof typeof videoMap],
    ) as HTMLElement | null
    if (container) elem = container
  }

  window.addEventListener('scroll', () => {
    const currentScrollY = window.scrollY
    const offsetY = currentScrollY - lastScrollY

    if (currentScrollY < scrollThreshold) {
      document.body.removeAttribute('scroll-hidden')
    }

    if (Math.abs(offsetY) > scrollThreshold) {
      if (offsetY > 0) {
        document.body.setAttribute('scroll-hidden', '')
      } else {
        document.body.removeAttribute('scroll-hidden')
      }
      lastScrollY = currentScrollY
    }

    if (isSidePage) {
      if (currentScrollY > window.innerHeight / 2) {
        backup?.setAttribute('show', '')
      } else {
        backup?.removeAttribute('show')
      }
    }
  }, { passive: true })

  if (isSidePage && backup) {
    backup.addEventListener('click', () => {
      elem?.scrollTo({ top: 0, behavior: 'smooth' })
      backup.setAttribute('touch-active', '')
      handleTransitionEndOnce(backup, 'transform', () =>
        backup.removeAttribute('touch-active'),
      )
    })
  }
}

/**
 * 设置视频侧边栏的滑动事件
 */
function slideVideoSidebar() {
  const videoContainer = document.querySelector('#mirror-vdcon') as HTMLElement

  setupSlide(
    videoContainer,
    55,
    () => {
      if (!videoContainer.hasAttribute('sidebar')) {
        videoContainer.setAttribute('sidebar', '')
      }
    },
    () => {
      if (videoContainer.hasAttribute('sidebar')) {
        videoContainer.removeAttribute('sidebar')
      }
    },
  )
}

/**
 * 设置搜索排序的滑动事件
 */
function slideSearchSort() {
  let clickIndex = 3
  const navItems = [4, 3, 2, 1, 7, 6, 5]

  const container = document.querySelector('#i_cecream') as HTMLElement

  function clickSortTab() {
    ; (
      document.querySelector(
        `.vui_tabs--nav-item:nth-child(${navItems[clickIndex]})`,
      ) as HTMLElement
    ).click()
  }

  setupSlide(
    container,
    55,
    () => {
      clickIndex++
      clickSortTab()
    },
    () => {
      clickIndex--
      clickSortTab()
    },
  )
}

/**
 * 设置消息侧边栏的滑动事件
 */
function slideMessageSidebar() {
  const messageContainer = document.querySelector(
    'body>.container',
  ) as HTMLElement
  const sidebarOverlay = document.querySelector(
    '#sidebar-overlay',
  ) as HTMLElement
  const sidebarFab = document.querySelector('#sidebar-fab') as HTMLElement

  function show() {
    messageContainer.setAttribute('sidebar', '')
    sidebarOverlay.classList.add('show')
    sidebarFab.classList.add('active')
  }

  function hide() {
    messageContainer.removeAttribute('sidebar')
    sidebarOverlay.classList.remove('show')
    sidebarFab.classList.remove('active')
  }

  function slideLeft() {
    const isSidebarRight = GM_getValue('message-sidebar-change-right', false)
    if (isSidebarRight && !messageContainer.hasAttribute('sidebar')) show()
    if (!isSidebarRight && messageContainer.hasAttribute('sidebar')) hide()
  }

  function slideRight() {
    const isSidebarRight = GM_getValue('message-sidebar-change-right', false)
    if (isSidebarRight && messageContainer.hasAttribute('sidebar')) hide()
    if (!isSidebarRight && !messageContainer.hasAttribute('sidebar')) show()
  }

  setupSlide(messageContainer, 55, slideLeft, slideRight)
  setupSlide(sidebarOverlay, 55, slideLeft, slideRight)
}

// 处理space滚动和滑动事件
function handleSpaceSwipe() {
  const observer = new MutationObserver((mutationsList) => {
    mutationsList.forEach((mutation) => {
      mutation.addedNodes.forEach((addedNode) => {
        if (
          addedNode.nodeType === Node.ELEMENT_NODE &&
          (addedNode as HTMLElement).id === 'app'
        ) {
          slideSpaceNavigator()
          observer.disconnect()
        }
      })
    })
  })
  observer.observe(document.body, { childList: true })

  function slideSpaceNavigator() {
    const current = document.querySelector('#navigator .active')
    const siblings = Array.from(
      document.querySelectorAll('#navigator .n-btn'),
    ).sort((a, b) => {
      return (
        parseInt(getComputedStyle(a).order) -
        parseInt(getComputedStyle(b).order)
      )
    }) as HTMLElement[]
    let index = siblings.findIndex((el) => el === current)

    const container = document.querySelector('#app') as HTMLElement

    setupSlide(
      container,
      55,
      () => {
        index++
        siblings[index].click()
      },
      () => {
        index--
        siblings[index].click()
      },
    )
  }
}
