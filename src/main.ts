// @grant 表示全局作用域运行，而不在隔离沙盒内使用特定 API

import './style/app.css'
import './style/header.css'
import './style/home.css'
import './style/search.css'
import './style/space.css'
import './style/message.css'
import './style/video.css'
import './style/video-control.css'
import './style/read.css'

import {
  preventBeforeUnload,
  countViewTime,
  increaseVideoLoadSize,
  handleScroll,
} from './window.js'
import {
  handleScriptPreSetting,
  handleScriptSetting,
  setScriptHelp,
} from './setting.js'
import { handleActionbar } from './bar/actionbar.ts'
import { preloadAnchor, handleHeaderImage, handleVideoCard } from './home.js'
import { videoInteraction } from './video.js'
import { createUnfoldBtn, coverContextMenu } from './message.ts'
import { waitDOMContentLoaded } from './utils/wait.ts'
import { initShadowHook } from './utils/shadow.ts'
;(function () {
  initShadowHook() // 必须先于页面脚本拦截 attachShadow

  if (window.top !== window.self) {
    return
  } // 检查当前执行环境是否为顶级窗口

  /* initViewport */ document.head.appendChild(
    Object.assign(document.createElement('meta'), {
      name: 'viewport',
      content: 'width=device-width, initial-scale=1',
    }),
  )

  preventBeforeUnload()
  countViewTime()

  /* iconfont for dialog */ document.head.appendChild(
    Object.assign(document.createElement('link'), {
      rel: 'stylesheet',
      href: 'https://s1.hdslb.com/bfs/static/jinkela/space/css/space.8.22c06a62b42dec796d083a84f5a769f44a97b325.css',
    }),
  )

  console.log('Bilibili mobile execute!')

  // 简单表达式: 常量折叠，解析引擎优化为只计算一次，然后缓存入临时变量。函数调用、对象属性访问等不适用。
  const firstSubdomain = location.hostname.substring(
    0,
    location.hostname.indexOf('.'),
  )

  const pathToTypeMap: Record<string, string> = {
    '/video': 'video',
    '/list': 'list',
    '/bangumi': 'video',
  }

  const getTypeFromPath = (map: Record<string, string>) => {
    for (const [prefix, type] of Object.entries(map)) {
      if (location.pathname.startsWith(prefix)) {
        return type
      }
    }
    return 'unknow'
  }

  const type =
    firstSubdomain === 'www'
      ? location.pathname === '/'
        ? 'home'
        : getTypeFromPath(pathToTypeMap)
      : firstSubdomain

  function handleCommonSettings(type: string) {
    handleScriptPreSetting()
    waitDOMContentLoaded(() => {
      handleScriptSetting()
      handleScroll(type)
      setScriptHelp()

      document.body.appendChild(
        Object.assign(document.createElement('div'), { id: 'toast' }),
      )

      // 悬浮底栏只在有专属按钮布局的页面注入
      if (
        ['home', 'video', 'list', 'search', 'space', 'message'].includes(type)
      ) {
        handleActionbar(type)
      }
    })
  }
  handleCommonSettings(type)

  switch (type) {
    case 'home':
      increaseVideoLoadSize()
      handleHeaderImage()
      waitDOMContentLoaded(() => {
        preloadAnchor()
        handleVideoCard()
      })
      break
    case 'video':
    case 'list':
      waitDOMContentLoaded(videoInteraction)
      break
    case 'message':
      waitDOMContentLoaded(() => {
        createUnfoldBtn()
        coverContextMenu()
      })
      break
    default:
      break
  }

  // ── SPA 导航检测（非视频页 → 视频页） ─────────────────────────────────
  // B 站是 SPA，从首页点击视频时通过 pushState 导航，不会重新加载页面。
  // 脚本启动时的 type 判断只执行一次，无法感知后续路由变化。
  // 通过 MutationObserver 监听任意 DOM 变动，检测 #bilibili-player 出现。
  if (type !== 'video' && type !== 'list') {
    waitDOMContentLoaded(() => {
      let videoInitDone = false
      const videoObserver = new MutationObserver(() => {
        const player = document.querySelector('#bilibili-player')
        if (player) {
          if (!videoInitDone) {
            videoInitDone = true
            videoInteraction()
          }
        } else {
          videoInitDone = false
        }
      })
      videoObserver.observe(document.body, { childList: true, subtree: true })
    })
  }
})()
