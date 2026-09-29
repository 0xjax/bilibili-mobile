import { GM_getValue } from './utils/gm.ts'
import { handleCommentShadow } from './comment.ts'

/**
 * 处理视频的响应操作交互
 */
export function videoInteraction() {
  // ── 页面级别（一次性初始化，不依赖播放器 DOM） ──────────────────────────
  const pageFeatures = [
    foldDescTag,
    closeMiniPlayer,
    setEndingContent,
    handleCommentShadow,
  ]
  for (const feature of pageFeatures) {
    try {
      feature()
    } catch {}
  }

  // ── 播放器级别（首次初始化与重建监听） ────────────────────────────────────
  tryInitPlayerControls()
  observePlayerRebuild()
}

// ─── 播放器生命周期与重建检测 ────────────────────────────────────────────────

let playerAbortController: AbortController | null = null
let playerObserverActive = false

// 已绑定监听器的 video 元素。换集 / 切视频时 B 站可能复用 controlWrap 却替换内部 video，
// 仅凭容器标记会漏绑，因此以 video 节点本身作为绑定依据。
let boundVideo: HTMLVideoElement | null = null
// 已绑定的控制栏节点。video 未变但控制栏被重建时，旧监听器会随旧节点一起失效，同样需要重绑。
let boundControlWrap: HTMLElement | null = null

/**
 * 监听播放器 DOM 就绪和重建（B 站 SPA 导航、Vue 组件刷新）。
 * 控件可见性完全由 ctrl-shown 属性 + CSS 管理，不再依赖自建 .new 容器。
 */
function observePlayerRebuild() {
  if (playerObserverActive) return
  playerObserverActive = true

  const observer = new MutationObserver(() => {
    tryInitPlayerControls()
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

/**
 * 幂等初始化播放器控件，节点未就绪时等待后续 MutationObserver 触发。
 */
function tryInitPlayerControls() {
  const playerContainer = document.querySelector(
    '.bpx-player-container',
  ) as HTMLElement | null
  const videoArea = playerContainer?.querySelector(
    '.bpx-player-video-area',
  ) as HTMLElement | null
  const controlWrap = videoArea?.querySelector(
    '.bpx-player-control-wrap',
  ) as HTMLElement | null
  const controlEntity = controlWrap?.querySelector(
    '.bpx-player-control-entity',
  ) as HTMLElement | null
  // 以播放器内的 video 为准，避免绑到页面里其它 video 元素
  const video = playerContainer?.querySelector('video') as
    | HTMLVideoElement
    | null

  if (!playerContainer || !videoArea || !controlWrap || !controlEntity || !video)
    return

  // 以 video 节点身份为主判据：video / 控制栏任一被替换都需要重新绑定
  if (boundVideo === video && boundControlWrap === controlWrap) return

  // 清理上一轮绑定的监听器，防止播放器重建后累积
  playerAbortController?.abort()
  playerAbortController = new AbortController()
  const { signal } = playerAbortController
  boundVideo = video
  boundControlWrap = controlWrap

  // 以已解析的 playerContainer / videoArea / video 显式传参，
  // 避免处理过程中节点被替换 / 页面存在其它 video 时绑错
  handlePortrait(video, signal)
  handlelVideoClick(playerContainer, videoArea, video, signal)
  handleVideoInteraction(video, signal)
}

// ─── 播放器内部交互逻辑 ───────────────────────────────────────────────────────

let isPortrait = false

function handlePortrait(video: HTMLVideoElement, signal: AbortSignal) {
  video.addEventListener(
    'resize',
    () => {
      isPortrait = video.videoHeight / video.videoWidth > 1
    },
    { signal },
  )
}

// 接管视频点击事件
function handlelVideoClick(
  playerContainer: HTMLElement,
  videoArea: HTMLElement,
  video: HTMLVideoElement,
  signal: AbortSignal,
) {
  const videoPerch = videoArea.querySelector(
    '.bpx-player-video-perch',
  ) as HTMLElement | null

  // 防止布局偏移导致崩溃：videoWrap 可能已在之前的运行中被移动到 videoArea 下
  const videoWrap = (videoPerch?.querySelector('.bpx-player-video-wrap') ||
    videoArea.querySelector('.bpx-player-video-wrap')) as HTMLElement | null
  if (!videoWrap) return

  // 架空双击全屏层以适应竖屏
  if (videoPerch && videoWrap.parentElement === videoPerch) {
    videoArea.insertBefore(videoWrap, videoPerch)
  }

  // safari 内联播放
  video.playsInline = true

  // 直接使用原有 controlWrap，不创建新容器、不移动节点
  // 控件可见性完全由 ctrl-shown 属性与 CSS 管理
  const controlWrap = videoArea.querySelector(
    '.bpx-player-control-wrap',
  ) as HTMLElement | null
  if (!controlWrap) return
  const controlEntity = controlWrap.querySelector(
    '.bpx-player-control-entity',
  ) as HTMLElement | null
  if (!controlEntity) return

  let clickTimer: number
  let hideTimer: number

  const isBpxStateShow = () =>
    controlEntity.querySelector(
      '.bpx-player-control-bottom-right>.bpx-state-show',
    )

  const controlTop = controlEntity.querySelector(
    '.bpx-player-control-top',
  ) as HTMLElement | null
  const bottomRight = controlEntity.querySelector(
    '.bpx-player-control-bottom-right',
  ) as HTMLElement | null

  const isShown = () => playerContainer.getAttribute('ctrl-shown') === 'true'

  // 初始设为显示状态，随后由 delayHideTimer 统一管理
  playerContainer.setAttribute('ctrl-shown', 'true')

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      const firstNode = mutation.addedNodes[0]
      if (
        firstNode?.nodeType === Node.ELEMENT_NODE &&
        (firstNode as HTMLElement).classList.contains('bpx-player-ctrl-web')
      ) {
        if (video.paused) {
          showControlWrap()
        }
        const subtitleBtn = document.querySelector('.bpx-player-ctrl-subtitle')
        if (subtitleBtn) {
          window.addEventListener(
            'click',
            (event) => {
              if (!subtitleBtn.contains(event.target as HTMLElement)) {
                subtitleBtn.dispatchEvent(new MouseEvent('mouseleave'))
              }
            },
            { signal },
          )
        }
        observer.disconnect()
      }
    })
  })
  if (bottomRight) {
    observer.observe(bottomRight, { childList: true })
  }

  function hideControlWrap(isEnd: boolean = false) {
    if ((!video.paused && !isBpxStateShow()) || isEnd) {
      playerContainer.setAttribute('ctrl-shown', 'false')
      clearTimeout(hideTimer)
    } else {
      delayHideTimer()
    }
  }

  video.addEventListener(
    'ended',
    () => {
      hideControlWrap(true)
    },
    { signal },
  )

  function showControlWrap() {
    playerContainer.setAttribute('ctrl-shown', 'true')
    delayHideTimer()
  }

  function delayHideTimer() {
    clearTimeout(hideTimer)
    hideTimer = setTimeout(hideControlWrap, 3000)
  }

  // 初始化后启动自动隐藏计时器
  delayHideTimer()

  videoWrap.addEventListener(
    'mousemove',
    (event) => {
      event.stopPropagation()
    },
    { signal },
  )
  controlWrap.addEventListener(
    'mousemove',
    (event) => {
      event.stopPropagation()
    },
    { signal },
  )

  video.addEventListener('play', delayHideTimer, { signal })

  controlWrap.addEventListener(
    'click',
    (event) => {
      event.stopPropagation()
      delayHideTimer()
    },
    { signal },
  )

  controlTop?.addEventListener('touchstart', delayHideTimer, { signal })

  // 单击监听
  videoWrap.addEventListener(
    'click',
    () => {
      clearTimeout(clickTimer)

      clickTimer = setTimeout(() => {
        if (isShown()) hideControlWrap()
        else showControlWrap()

        if (!GM_getValue('ban-video-click-play', false)) {
          if (video.paused) video.play()
          else video.pause()
        }
      }, 250)
    },
    { signal },
  )

  // 双击监听
  videoWrap.addEventListener(
    'dblclick',
    () => {
      clearTimeout(clickTimer)
      unmute()
      if (isPortrait)
        (
          document.querySelector('.bpx-player-ctrl-web') as HTMLElement | null
        )?.click()
      else if (videoPerch)
        videoPerch.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    },
    { signal },
  )

  function unmute() {
    video.muted = false
    if (video.volume === 0) {
      ;(
        document.querySelector(
          '.bpx-player-ctrl-muted-icon',
        ) as HTMLElement | null
      )?.click()
    }
  }

  videoArea.addEventListener(
    'touchstart',
    (event) => {
      event.stopPropagation()
    },
    { signal },
  )

  if (GM_getValue('video-click-unmute', false)) {
    window.addEventListener(
      'click',
      (event) => {
        if (!videoArea.contains(event.target as HTMLElement)) {
          unmute()
        }
      },
      { signal },
    )
  }
}

function closeMiniPlayer() {
  if (!localStorage.getItem('is-mini-player-closed')) {
    const miniPlayerBtn = document.getElementsByClassName(
      'mini-player-window',
    )[0] as HTMLElement | null
    if (!miniPlayerBtn) return
    new MutationObserver((mutations) =>
      mutations.forEach((mutation) => {
        if ((mutation.target as HTMLElement).classList.contains('on')) {
          miniPlayerBtn.click()
          localStorage.setItem('is-mini-player-closed', 'true')
        }
      }),
    ).observe(miniPlayerBtn, { attributes: true, attributeFilter: ['class'] })
  }
}

function handleVideoInteraction(video: HTMLVideoElement, signal: AbortSignal) {
  let startX: number, startY: number, startTime: number
  const threshold = 10 // 滑动阈值
  const initialCheckDuration = 300
  let isLongPress = false
  let isSliding = false
  let timeoutId: number
  let times: number
  let isSlideAllowed: boolean
  let progressInfo: HTMLElement
  let progressInfoCreated = false
  let isCreatingProgressInfo = false
  let videoWidth = 0
  let pendingTime = 0
  let lastSeekTime = 0

  video.addEventListener(
    'touchstart',
    (event) => {
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
      startTime = video.currentTime
      videoWidth = video.clientWidth
      times = Number(GM_getValue('video-longpress-speed', '2'))
      isSlideAllowed = GM_getValue('allow-video-slid', false)

      timeoutId = setTimeout(() => {
        video.playbackRate = video.playbackRate * times
        isLongPress = true
      }, initialCheckDuration)
    },
    { signal },
  )

  video.addEventListener(
    'touchmove',
    (event) => {
      if (!isSlideAllowed) {
        return
      }

      const moveX = event.touches[0].clientX
      const moveY = event.touches[0].clientY
      const deltaX = moveX - startX
      const deltaY = moveY - startY

      if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
        if (!isLongPress) {
          clearTimeout(timeoutId)
          isSliding = true
        } else {
          return
        }

        if (isSliding) {
          if (!progressInfoCreated && !isCreatingProgressInfo) {
            isCreatingProgressInfo = true
            progressInfo = document.createElement('div')
            progressInfo.id = 'progress-info'
            video.parentNode!.insertBefore(progressInfo, video.nextSibling)
            progressInfoCreated = true
            isCreatingProgressInfo = false
          }

          video.pause()
          const progressChange = (deltaX / videoWidth) * video.duration
          pendingTime = Math.min(
            Math.max(startTime + progressChange, 0),
            video.duration,
          )

          // seek 开销大，滑动中最多每 200ms 一次，松手时最终定位
          const now = Date.now()
          if (now - lastSeekTime > 200) {
            video.currentTime = pendingTime
            lastSeekTime = now
          }

          if (progressInfoCreated) {
            progressInfo.textContent = `进度: ${formatTime(pendingTime)} / ${formatTime(video.duration)}`
            progressInfo.style.display = 'block'
          }
        }
      }
    },
    { signal },
  )

  video.addEventListener(
    'touchend',
    () => {
      clearTimeout(timeoutId)

      if (isLongPress) {
        video.playbackRate = video.playbackRate / times
        isLongPress = false
      }

      if (isSliding) {
        video.currentTime = pendingTime
        video.play()
        progressInfo.style.display = ''
        isSliding = false
      }
    },
    { signal },
  )

  function formatTime(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
}

// 折叠简介
function foldDescTag() {
  if (!GM_getValue('fold-desc-tag', false)) return
  // 幂等：SPA 来回导航会重复调用 videoInteraction，已注入则不再创建
  if (document.querySelector('#fold-desc-btn')) return

  const leftContainer = document.querySelector(
    '.left-container',
  ) as HTMLElement | null
  const commentApp = document.querySelector('#commentapp') as HTMLElement | null
  if (!leftContainer || !commentApp) return

  const foldBtn = Object.assign(document.createElement('div'), {
    id: 'fold-desc-btn',
    innerHTML: `
<svg width="18" height="18" viewBox="0 0 40 40" fill="currentColor" stroke="currentColor" stroke-width="3" xmlns="http://www.w3.org/2000/svg"><path transform="translate(4,4)" d="M0.256 23.481c0 0.269 0.106 0.544 0.313 0.75 0.412 0.413 1.087 0.413 1.5 0l14.119-14.119 13.913 13.912c0.413 0.413 1.087 0.413 1.5 0s0.413-1.087 0-1.5l-14.663-14.669c-0.413-0.412-1.088-0.412-1.5 0l-14.869 14.869c-0.213 0.212-0.313 0.481-0.313 0.756z"></path></svg>
    `,
  })

  foldBtn.addEventListener('click', () => {
    leftContainer.toggleAttribute('unfold')
  })

  // 等待评论预加载；插入前再确认，避免两次调用在 2s 内交错导致重复注入
  setTimeout(() => {
    if (!foldBtn.isConnected && !document.querySelector('#fold-desc-btn')) {
      commentApp.insertBefore(foldBtn, commentApp.firstChild)
    }
    ;(document.querySelector('.toggle-btn') as HTMLElement | null)?.click()
    ;(
      document.querySelector('.tag:has(>.show-more-btn)') as HTMLElement | null
    )?.click()
  }, 2000)
}

function setEndingContent() {
  addEndingScale()

  function addEndingScale() {
    const style = Object.assign(document.createElement('style'), {
      id: 'ending-content-scale',
      textContent: `
        .bpx-player-ending-content[screen-mode=little-screen] { transform: scale(calc(${window.innerWidth}/536*0.9)) !important; }
        .bpx-player-ending-content { transform: scale(calc(${window.innerWidth}/710*0.9)) !important; }
        .bpx-player-container[data-screen=full] .bpx-player-ending-content { transform: scale(calc(${window.innerWidth}/952*0.9)) !important; }
      `,
    })
    document.head.appendChild(style)
  }

  function renewEndingScale() {
    document.head.querySelector('#ending-content-scale')?.remove()
    addEndingScale()
  }

  screen.orientation?.addEventListener('change', renewEndingScale)
  window.addEventListener('resize', renewEndingScale)
}
