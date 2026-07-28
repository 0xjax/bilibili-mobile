import { GM_getValue } from './utils/gm.ts'
import { getVideoInfo, getJudgeAI } from './api.ts'
import { loadAI } from './ai.ts'

// 真正的预加载
export function preloadAnchor() {
  let anchor: Node
  let firstUnloadElem: HTMLElement
  let height: number

  const container = document.querySelector('.container')
  if (!container) return
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // dev 模式获取不到全部 addedNode
      mutation.addedNodes.forEach((node) => {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node as HTMLElement).className === 'load-more-anchor'
        ) {
          anchor = node
          firstUnloadElem = document.querySelector(
            '.container>.bili-video-card:not(.is-rcmd)',
          )!
          height = firstUnloadElem.clientHeight + 8
          observer.disconnect()
        }
      })
    })
  })
  observer.observe(container, { childList: true })

  function preload() {
    if (firstUnloadElem?.getBoundingClientRect().top < height * 6) {
      // 为何使用 {once: true} 无法正常工作？
      window.removeEventListener('scroll', preload)
      anchor.parentNode!.children[1].appendChild(anchor)
      setTimeout(() => {
        firstUnloadElem.parentNode!.appendChild(anchor)
        window.addEventListener('scroll', preload)
      }, 500)
    }
  }

  window.addEventListener('scroll', preload)
}

// 控制首页头图函数
export function handleHeaderImage() {
  const source = GM_getValue<string>('header-image-source', 'unsplash')
  const mapping = {
    bing: 'https://api.suyanw.cn/api/bing.php',
    unsplash: 'https://unsplash.it/1600/900?random',
    picsum: 'https://picsum.photos/1600/900',
    meizi: 'https://api.suyanw.cn/api/sjbz.php?method=pc&lx=meizi',
    dongman: 'https://api.suyanw.cn/api/sjbz.php?method=pc&lx=dongman',
    fengjing: 'https://api.suyanw.cn/api/sjbz.php?method=pc&lx=fengjing',
    suiji: 'https://api.suyanw.cn/api/sjbz.php?method=pc&lx=suiji',
  } as { [key: string]: string }

  let url = mapping[source]
  const elementSelector = '.bili-header__banner'
  const key = 'header-image'

  loadImage(key, elementSelector)

  if (source !== 'local') {
    setTimeout(renewImage, 5000)
  }

  window.addEventListener('variableChanged', (event: Event) => {
    const e = event as CustomEvent<{ key: string; newValue: string }>
    if (e.detail.key === 'header-image-source') {
      url = mapping[e.detail.newValue]
      setTimeout(() => renewImage(true), 0)
    }
  })

  async function renewImage(loadImmediately: boolean) {
    try {
      const img = await getImage(url)
      const base64Data = imageToBase64(img)
      storeImage(key, base64Data)
      if (loadImmediately) {
        loadImage(key, elementSelector)
      }
    } catch (error) {
      console.error('Failed to get image:', error)
    }
  }

  function getImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'Anonymous'
      img.src = url
      img.onload = () => resolve(img)
      img.onerror = reject
    })
  }

  function imageToBase64(img: HTMLImageElement) {
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    ctx?.drawImage(img, 0, 0)
    return canvas.toDataURL('image/jpeg')
  }

  function storeImage(key: string, base64Data: string) {
    localStorage.setItem(key, base64Data)
  }

  function loadImage(key: string, elementSelector: string) {
    const base64Data = localStorage.getItem(key)
    if (base64Data) {
      applyStyle(elementSelector, base64Data)
    } else {
      getImage(url)
        .then((img) => {
          const base64Data = imageToBase64(img)
          storeImage(key, base64Data)
          applyStyle(elementSelector, base64Data)
        })
        .catch((error) => console.error('Failed to get image:', error))
    }
  }

  function applyStyle(elementSelector: string, base64Data: string) {
    const style = document.createElement('style')
    style.innerHTML = `
      ${elementSelector}::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
        background-image: url(${base64Data});
        background-size: cover;
        background-position: center;
      }
    `
    document.head.appendChild(style)
  }
}

// 处理视频卡片
export function handleVideoCard() {
  judgeHasAi()

  let isLoading = false
  const recommendContainer = document.querySelector(
    '.recommended-container_floor-aside>.container',
  )
  if (recommendContainer) {
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (isLoading) {
          return
        }
        mutation.addedNodes.forEach((node) => {
          if (
            node.nodeType === Node.ELEMENT_NODE &&
            (node as HTMLElement).classList.contains('bili-video-card')
          ) {
            isLoading = true
            setTimeout(() => {
              judgeHasAi()
              isLoading = false
            }, 2000)
          }
        })
      })
    }).observe(recommendContainer, { childList: true })
  }

  function judgeHasAi() {
    const imageLinks = document.querySelectorAll(
      '.bili-video-card__image--link',
    ) as NodeListOf<HTMLElement>
    let delay = 0
    imageLinks.forEach(async (link) => {
      await new Promise((resolve) => setTimeout(resolve, delay))
      const card = link.closest(
        '.bili-video-card:not(:has(.bili-video-card__info--ad))',
      ) as HTMLElement
      if (card && !link.dataset.hasJudgedAi) {
        const aiJudgeRes = await judge(card)
        if (aiJudgeRes) {
          card.dataset.hasAi = 'true'
        }
        delay += 100
      }
      link.dataset.hasJudgedAi = 'true'
    })
  }

  let lastPreviewCard: HTMLElement | null = null
  new MutationObserver((mutations) => {
    mutations.forEach(async (mutation) => {
      const firstChild = mutation.addedNodes[0]?.firstChild as HTMLElement
      if (
        firstChild &&
        (firstChild as HTMLElement).className === 'v-popover is-bottom-end'
      ) {
        const panel = firstChild.querySelector(
          '.bili-video-card__info--no-interest-panel',
        ) as HTMLElement
        const previewOption = createOption('预览此视频')
        panel.insertBefore(previewOption, panel.firstChild)
        previewOption.addEventListener('click', (event) =>
          onPreviewOptionClick(event, firstChild),
        )

        const card = await getCard()
        if (!card) {
          return
        } // 如果 card 为空，直接返回

        const hasAi = card.dataset.hasAi
        if (!hasAi) {
          return
        }

        const AIOption = createOption('生成视频总结')
        panel.insertBefore(AIOption, previewOption.nextSibling)
        AIOption.addEventListener('click', async (event) => {
          event.stopPropagation()
          firstChild.dispatchEvent(
            new MouseEvent('mouseleave', { bubbles: true }),
          )
          loadAI(card)
        })
      }
    })
  }).observe(document.body, { childList: true })

  window.addEventListener('click', (event) => {
    const btn = document.querySelector(
      '.bili-video-card__info--no-interest.active',
    )
    if (btn?.contains(event.target as HTMLElement)) {
      btn.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      btn.classList.remove('use')
      btn.addEventListener(
        'click',
        () => {
          btn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
        },
        { once: true },
      )
    }
  })

  function onPreviewOptionClick(event: MouseEvent, firstChild: HTMLElement) {
    event.stopPropagation()
    firstChild.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
    window.addEventListener(
      'click',
      () => {
        lastPreviewCard?.dispatchEvent(
          new MouseEvent('mouseleave', { bubbles: true }),
        )
      },
      { once: true },
    )

    const card = document
      .querySelector('.bili-video-card__info--no-interest.active')!
      .closest('.bili-video-card')!
    const cardEventWrap = card.querySelector(
      '.bili-video-card__image--wrap',
    ) as HTMLElement
    cardEventWrap.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    lastPreviewCard = cardEventWrap

    if (!cardEventWrap.querySelector('.inline-progress-bar')) {
      let attempts = 0
      const intervalId = setInterval(() => {
        if (cardEventWrap.querySelector('video')) {
          createProgressBar(cardEventWrap)
          clearInterval(intervalId)
        } else if (++attempts >= 10) {
          clearInterval(intervalId)
        }
      }, 1000)
    }
  }

  function createProgressBar(cardEventWrap: HTMLElement) {
    const progressBar = document.createElement('div')
    progressBar.className = 'inline-progress-bar'
    progressBar.innerHTML =
      '<div class="inline-progress-bar-filled"></div><div class="inline-progress-bar-thumb"></div>'
    cardEventWrap.appendChild(progressBar)

    const video = cardEventWrap.querySelector('video')!
    const progressBarFilled = progressBar.querySelector(
      '.inline-progress-bar-filled',
    ) as HTMLElement
    const progressBarThumb = progressBar.querySelector(
      '.inline-progress-bar-thumb',
    ) as HTMLElement
    const progressBarWidth = progressBar.offsetWidth

    function updateProgressBar(progress: number) {
      progressBarFilled.style.width = `${progress * 100}%`
      progressBarThumb.style.left = `${progress * progressBarWidth}px`
    }

    video.addEventListener(
      'timeupdate',
      () => {
        const progress = Math.min(
          Math.max(video.currentTime / video.duration, 0),
          1,
        )
        updateProgressBar(progress)
      },
      true,
    )

    // 在捕获阶段阻止时间传播，从而禁用后续同一事件的监听
    video.addEventListener(
      'timeupdate',
      (event) => event.stopImmediatePropagation(),
      true,
    )

    function onTouchEvent(event: TouchEvent) {
      const progress =
        (event.touches[0].clientX - progressBar.getBoundingClientRect().left) /
        progressBarWidth
      updateProgressBar(progress)
      video.currentTime = progress * video.duration
    }

    progressBar.addEventListener('touchstart', (event) => {
      onTouchEvent(event)
      document.addEventListener('touchmove', onTouchEvent)
    })

    document.addEventListener('touchend', () => {
      document.removeEventListener('touchmove', onTouchEvent)
    })

    progressBar.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
  }

  async function judge(card: HTMLElement) {
    const cardImageLinkElement = card.querySelector(
      '.bili-video-card__image--link',
    ) as HTMLLinkElement
    const match =
      /\/video\/([A-Za-z0-9]+)/.exec(cardImageLinkElement.dataset.targetUrl!) ||
      /\/video\/([A-Za-z0-9]+)/.exec(cardImageLinkElement.href)
    const bvid = match?.[1]
    if (!bvid) return

    try {
      const videoInfo = await getVideoInfo(bvid)
      cardImageLinkElement.dataset.cid = videoInfo.cid
      cardImageLinkElement.dataset.bvid = videoInfo.bvid
      cardImageLinkElement.dataset.upMid = videoInfo.owner.mid
      const cid = videoInfo.cid
      const up_mid = videoInfo.owner.mid

      const aiJudgeRes = await getJudgeAI({ bvid, cid, up_mid })
      return aiJudgeRes.judge === 1
    } catch (error) {
      console.error(error)
    }
  }

  function createOption(text: string) {
    return Object.assign(document.createElement('div'), {
      className: 'bili-video-card__info--no-interest-panel--item',
      textContent: text,
    })
  }

  async function getCard(): Promise<HTMLElement | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const btn = document.querySelector(
          '.bili-video-card__info--no-interest.active:not(.use)',
        )
        if (!btn) {
          resolve(null) // 如果 btn 为空，返回 null
          console.log('疑似弹窗动作被打断：未获取到激活的视频更多选项按钮')
          return
        }
        const card = btn.closest('.bili-video-card') as HTMLElement
        btn.classList.add('use')
        resolve(card)
      }, 50)
    })
  }
}
