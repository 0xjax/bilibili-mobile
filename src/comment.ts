import { injectStyleIntoShadows, onShadowRoot } from './utils/shadow.ts'

let initialized = false

/**
 * 通过 attachShadow 钩子为评论相关组件注入样式并接线交互。
 * 替代原先逐层嵌套的 MutationObserver 监控；SPA 切换视频时
 * 新组件的 shadow root 会经钩子自动应用，无需重复调用。
 */
export function handleCommentShadow() {
  if (initialized) return
  initialized = true

  injectStyleIntoShadows(
    `
div#contents {
  padding-top: 0;
}`,
    'bili-comments',
  )

  injectStyleIntoShadows(
    `
div#commentbox {
  position: fixed;
  left: 0;
  bottom: var(--actionbar-height);
  z-index: 10;
  width: calc(100% - (100% - 200px) / 3);
  padding: 7px calc((100% - 200px) / 6);
  transition: calc(var(--actionbar-time)*1.40) ease-in;
  display: var(--commentbox-display);
  transform: var(--shadow-transform);
  backdrop-filter: blur(3px);
  background-color: rgba(255, 255, 255, .6);
}
div#commentbox[style] {
  display: none;
}
div#commentbox[style]+.bili-comments-bottom-fixed-wrapper {
  width: 100% !important;
  bottom: var(--actionbar-height) !important;
}
div#commentbox[style]+.bili-comments-bottom-fixed-wrapper>div {
  padding: 8px 12px !important;
  width: calc(100% - 24px) !important;
  transition: calc(var(--actionbar-time)* 1.40) ease-in;
  display: var(--commentbox-display);
  transform: var(--shadow-transform);
  backdrop-filter: blur(3px);
  background-color: rgba(255, 255, 255, .6) !important;
  border: none !important;
}
div#navbar {
  margin-bottom: 0;
}
#notice {
  display: none;
}`,
    'bili-comments-header-renderer',
  )

  injectStyleIntoShadows(
    `
:host {
  display: var(--commentbox-display) !important;
}
div#user-avatar {
  display: none;
}
div#comment-area {
  width: 100%;
}
div#editor {
  border-radius: 13px;
  padding: 0;
  border: none;
}`,
    'bili-comment-box',
  )

  injectStyleIntoShadows(
    `
.option.left,
.option.right {
  min-width: 0 !important;
}
#card {
  padding-top: 27px !important;
}
#info {
  transform: translateY(-23px);
}
#title {
  overflow: visible !important;
  white-space: nowrap;
  position: absolute;
}
#desc {
  padding-top: 20px;
}`,
    'bili-comments-vote-card',
  )

  injectStyleIntoShadows(
    `
textarea#input {
  line-height: 26px;
  min-height: 26px;
  height: 26px !important;
}`,
    'bili-comment-textarea',
  )

  injectStyleIntoShadows(
    `
div#input, div.brt-root {
  line-height: 26px;
  min-height: 26px;
  --brt-line-height: 26px;
}`,
    'bili-comment-rich-textarea',
  )

  injectStyleIntoShadows(
    `
div#body {
  padding: 4px 0 0 44px;
  --bili-comment-hover-more-display: block;
}
a#user-avatar {
  left: 0;
  top: 12px;
}`,
    'bili-comment-renderer',
  )

  injectStyleIntoShadows(
    `
div#expander {
  padding-left: 40px;
}`,
    'bili-comment-replies-renderer',
  )

  injectStyleIntoShadows(
    `
div#body {
  padding: 4px 0 4px 29px;
  --bili-comment-hover-more-display: block;
}`,
    'bili-comment-reply-renderer',
  )

  // bili-avatar 也用于评论区以外的场景，限定只改评论内的头像。
  // attachShadow 时宿主尚未插入文档，延后一帧再判断上下文。
  onShadowRoot('bili-avatar', (root, host) => {
    setTimeout(() => {
      if (host.closest('bili-comment-renderer')) {
        root.appendChild(
          Object.assign(document.createElement('style'), {
            textContent: `
.layer.center {
  width: 48px !important;
  height: 48px !important;
}`,
          }),
        )
      }
    })
  })

  setupPhotoViewer()
  setupCommentsPopup()
}

// 评论区图片预览（B 站已改用 PhotoSwipe v5 的 div.pswp，纯 light DOM）
function setupPhotoViewer() {
  // 事件委托：点击图片或背景关闭查看器，屏蔽原生 click-to-zoom
  document.addEventListener(
    'click',
    (event) => {
      const pswp = document.querySelector('.pswp')
      if (!pswp) return

      const target = event.target as HTMLElement
      if (target.closest('.pswp__item') || target.classList.contains('pswp__bg')) {
        event.stopImmediatePropagation()
        ;(
          pswp.querySelector('.pswp__button--close') as HTMLElement | null
        )?.click()
      }
    },
    true,
  )
}

// 评论区详情、笔记弹层
function setupCommentsPopup() {
  onShadowRoot('bili-comments-popup', (root, host) => {
    host.addEventListener(
      'click',
      () => {
        ;(root.querySelector('#close') as HTMLElement | null)?.click()
      },
      { once: true },
    )

    const wireIframe = (): boolean => {
      const iframe = host.querySelector('iframe')
      if (!iframe) return false

      // iframe 的 load 事件触发时，iframe 的 contentDocument 已完全加载，并此后才能访问
      iframe.addEventListener('load', () => {
        const contentDocument = iframe.contentDocument!
        const style = contentDocument.createElement('style')
        style.textContent = `
div.bili-dyn-item-draw {
  min-width: 0;
  padding-left: 58px;
}
div.bili-dyn-item-draw__avatar {
  width: 58px;
  height: 58px;
}
.bili-album__preview__picture {
  max-width: 100%;
  height: auto !important;
}
.bili-album__preview[class*=grid] {
  max-width: 100%;
}
.bili-album__preview[class*=grid] .bili-album__preview__picture {
    margin-bottom: 4px;
}
          `
        contentDocument.head.appendChild(style)
      })
      return true
    }

    if (!wireIframe()) {
      const observer = new MutationObserver(() => {
        if (wireIframe()) observer.disconnect()
      })
      observer.observe(host, { childList: true, subtree: true })
    }
  })
}
