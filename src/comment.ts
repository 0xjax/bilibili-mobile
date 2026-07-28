import { touchZoomWrap } from './utils/zoom.ts'

/**
 * 动态修改播放组件样式
 * @param {boolean} isDynamicRefresh - 是否动态刷新
 */
export function modifyShadowDOMLate(isDynamicRefresh: boolean = false) {
  let commentsShadow: ShadowRoot | null | undefined = null
  let commentsHeaderShadow: ShadowRoot | null | undefined = null
  let headerBoxShadow: ShadowRoot | null | undefined = null

  // 初始化动态要获胜 #comment，第一次变化删除.comment增加.comment，第二次添加bili-comments
  const comment = document.getElementById('commentapp')
  if (!comment) return

  const observer = new MutationObserver(handleCommentMutation)
  observer.observe(comment, { childList: true, subtree: true })

  function handleCommentMutation(mutations: MutationRecord[]): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.nodeName.toLowerCase() === 'bili-comments'
        ) {
          observeComments()
          observer.disconnect()
        }
      })
    })
  }

  //  始终观察动态加载的新评论
  function observeComments() {
    commentsShadow = document.querySelector('bili-comments')?.shadowRoot
    if (!commentsShadow) return

    const observer = new MutationObserver(handleCommentsMutation)
    observer.observe(commentsShadow, { childList: true, subtree: true })

    appendStyle(
      commentsShadow,
      `
        div#contents {
          padding-top: 0;
        }`,
    )
  }

  function handleCommentsMutation(mutations: MutationRecord[]): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE && (node as Element).id === 'contents'
        ) {
          observeHeader()
          observeContent()
        } else if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.nodeName.toLowerCase() === 'bili-comment-thread-renderer'
        ) {
          // 新增的评论单独添加观察器
          const threadShadow = (node as Element).shadowRoot

          let observer: MutationObserver
          const callback = (mutations: MutationRecord[]) =>
            handleContentMutation(mutations, observer)

          observer = new MutationObserver(callback)
          observer.observe(threadShadow!, { childList: true, subtree: true })
        }

      })
    })
  }

  // --------------------
  // header
  function observeHeader() {
    commentsHeaderShadow = commentsShadow?.querySelector(
      'bili-comments-header-renderer',
    )?.shadowRoot
    if (!commentsHeaderShadow) return

    let observer: MutationObserver
    const callback = (mutations: MutationRecord[]) =>
      handleHeaderMutation(mutations, observer)
    observer = new MutationObserver(callback)
    observer.observe(commentsHeaderShadow, { childList: true, subtree: true })

    // 修复评论行概率性异常
    appendStyle(
      commentsHeaderShadow,
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
    )
  }

  function handleHeaderMutation(mutations: MutationRecord[], observer: MutationObserver): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.nodeName.toLowerCase() === 'div' &&
          (node as Element).id === 'commentbox'
        ) {
          observeHeader2()
          observer.disconnect()
        }
      })
    })
  }

  function observeHeader2() {
    headerBoxShadow =
      commentsHeaderShadow?.querySelector('bili-comment-box')?.shadowRoot
    if (!headerBoxShadow) return


    let observer: MutationObserver
    const callback = (mutations: MutationRecord[]) =>
      handleHeader2Mutation(mutations, observer)
    observer = new MutationObserver(callback)
    observer.observe(headerBoxShadow, { childList: true, subtree: true })

    appendStyle(
      headerBoxShadow,
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
    )

    const headerVote = commentsHeaderShadow?.querySelector(
      'bili-comments-vote-card',
    )
    if (headerVote) {
      appendStyle(
        headerVote.shadowRoot!,
        `.option.left,
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
      )
    }
  }

  function handleHeader2Mutation(mutations: MutationRecord[], observer: MutationObserver): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.nodeName.toLowerCase() === 'div' &&
          (node as Element).id === 'comment-area'
        ) {
          observeHeader3()
          observer.disconnect()
        }
      })
    })
  }

  function observeHeader3() {
    // list 还是 bili-comment-textarea
    const oldTextarea = headerBoxShadow?.querySelector('bili-comment-textarea')

    const textarea = oldTextarea
      ? oldTextarea
      : headerBoxShadow?.querySelector('bili-comment-rich-textarea')

    if (oldTextarea) {
      appendStyle(
        textarea!.shadowRoot!,
        `textarea#input {
            line-height: 26px;
            min-height: 26px;
            height: 26px !important;
          }`,
      )
    } else {
      appendStyle(
        textarea!.shadowRoot!,
        `div#input, div.brt-root {
        line-height: 26px;
        min-height: 26px;
        --brt-line-height: 26px;
      }`,
      )
    }
  }

  // --------------------
  // content
  function observeContent() {
    // 对初次加载的所有评论添加观察器
    const commentThreads = commentsShadow?.querySelectorAll(
      'bili-comment-thread-renderer',
    )
    commentThreads?.forEach((thread) => {
      const threadShadow = thread.shadowRoot

      let observer: MutationObserver
      const callback = (mutations: MutationRecord[]) =>
        handleContentMutation(mutations, observer)

      observer = new MutationObserver(callback)
      observer.observe(threadShadow!, { childList: true, subtree: true })
    })
  }

  function handleContentMutation(mutations: MutationRecord[], observer: MutationObserver): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.nodeName.toLowerCase() === 'div' &&
          (node as Element).id === 'replies'
        ) {
          observeContent2(mutation.target as ShadowRoot)
          observer.disconnect()
        }
      })
    })
  }

  function observeContent2(threadShadow: ShadowRoot): void {
    const commentShadow = threadShadow?.querySelector(
      'bili-comment-renderer',
    )?.shadowRoot
    const repliesShadow = threadShadow?.querySelector(
      'bili-comment-replies-renderer',
    )?.shadowRoot

    appendStyle(
      commentShadow!,
      `
        div#body {
          padding: 4px 0 0 44px;
          --bili-comment-hover-more-display: block;
        }
        a#user-avatar {
          left: 0;
          top: 12px;
        }`,
    )

    appendStyle(
      repliesShadow!,
      `
        div#expander {
          padding-left: 40px;
        }`,
    )

    let observer: MutationObserver
    const callback = (mutations: MutationRecord[]) =>
      handleCommentShadowMutation(mutations, observer)

    observer = new MutationObserver(callback)
    observer.observe(commentShadow!, { childList: true, subtree: true })

    let observer2: MutationObserver
    const callback2 = (mutations: MutationRecord[]) =>
      handleRepliesShadowMutation(mutations, observer2)

    observer2 = new MutationObserver(callback2)
    observer2.observe(repliesShadow!, { childList: true, subtree: true })
  }

  function handleCommentShadowMutation(mutations: MutationRecord[], observer: MutationObserver): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.nodeName.toLowerCase() === 'div' &&
          (node as Element).id === 'body'
        ) {
          const avatarShadow = (mutation.target! as HTMLElement).querySelector(
            'bili-avatar',
          )?.shadowRoot
          appendStyle(
            avatarShadow!,
            `
              .layer.center {
                width: 48px !important;
                height: 48px !important;
              }`,
          )
          observer.disconnect()
        }
      })
    })
  }

  function handleRepliesShadowMutation(mutations: MutationRecord[], observer: MutationObserver): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.nodeName.toLowerCase() === 'div' &&
          (node as Element).id === 'expander'
        ) {
          const replies = (mutation.target as HTMLElement).querySelectorAll(
            'bili-comment-reply-renderer',
          )
          replies.forEach((reply) => {
            const replyShadow = reply.shadowRoot
            appendStyle(
              replyShadow!,
              `
                div#body {
                  padding: 4px 0 4px 29px;
                  --bili-comment-hover-more-display: block;
                }`,
            )
            observer.disconnect()
          })
        }
      })
    })
  }

  function appendStyle(shadowRoot: ShadowRoot, cssText: string) {
    const style = document.createElement('style')
    style.textContent = cssText
    shadowRoot.appendChild(style)
  }

  if (isDynamicRefresh) {
    return
  }

  // 评论区图片、详情、笔记（合并为单个 body 观察器，减少回调触发）
  new MutationObserver((mutations) => {
    handleBodyMutation(mutations)
    handleBodyMutation2(mutations)
  }).observe(document.body, {
    childList: true,
  })

  function handleBodyMutation(mutations: MutationRecord[]): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.nodeName.toLowerCase() === 'bili-photoswipe'
        ) {
          const photoShadow = (node as Element).shadowRoot
          const zoomWrap = photoShadow?.querySelector(
            '#zoom-wrap',
          ) as HTMLElement

          zoomWrap.addEventListener(
            'click',
            (event) => {
              event.stopImmediatePropagation() // 禁用点击
                ; (photoShadow?.querySelector('#close') as HTMLElement | null)?.click()
            },
            { capture: true, once: true },
          )

          touchZoomWrap(zoomWrap, photoShadow!)

          appendStyle(
            photoShadow!,
            `
#container {z-index:3;}
#thumb {z-index: 4;}
#prev, #next, #close {visibility: hidden;}
#item {
  display: flex;
  justify-content: center;
  align-items: center;
}
#zoom-wrap {
  position: unset !important;
  transform: none !important;
}
`,
          )
        }
      })
    })
  }

  // 评论区详情、笔记
  function handleBodyMutation2(mutations: MutationRecord[]): void {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node.nodeName.toLowerCase() === 'bili-comments-popup'
        ) {
          const iframe = (node as Element).querySelector('iframe')!
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

          node.addEventListener(
            'click',
            () => {
              ; (
                (node as HTMLElement).shadowRoot!.querySelector(
                  '#close',
                ) as HTMLElement
              ).click()
            },
            { once: true },
          )
        }
      })
    })
  }
}
