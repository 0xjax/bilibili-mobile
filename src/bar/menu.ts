import { loadFollowList } from './menu-follow.ts'
import { handleHistoryShowMore } from './menu-history.ts'
import { handleDynamicShowMore } from './menu-dynamic.ts'
import { getUnreadNums } from '../api.ts'
import { handleTransitionEndOnce } from '../utils/transition.ts'

export function setMenuBtn() {
  let isOldApp: boolean
  // 覆盖显隐，初始化加载：消息、动态、收藏、历史（依DOM中顺序）、主页（从最前置最后））
  const preloadeditems1 = [
    // 旧APP不用预加载消息
    '.v-popover-wrap:has(>.right-entry__outside[href="//t.bilibili.com/"])',
    '.v-popover-wrap:has(>.right-entry__outside[data-header-fav-entry])',
    '.right-entry__outside[href="//www.bilibili.com/history"]',
    '.header-avatar-wrap',
  ]
  const preloadeditems2 = [
    // NOTE 站点改过顶栏结构：入口现在是 `a.right-entry__item-trigger[href=…]`，
    // 弹层是它的下一个兄弟 `.v-popover`（旧版是 `.right-entry__outside[href=…]`）
    '.v-popover-wrap:has(>a.right-entry__item-trigger[href="//message.bilibili.com"])',
    '.v-popover-wrap:has(>a.right-entry__item-trigger[href="//t.bilibili.com/"])',
    '.v-popover-wrap:has(>a.right-entry__item-trigger[data-header-fav-entry])',
    '.v-popover-wrap:has(>a.right-entry__item-trigger[href="//www.bilibili.com/history"])',
    '.header-avatar-wrap',
  ]

  /*
   * 菜单项 → 站点顶栏入口选择器。
   *
   * 脚本菜单靠「入口 + 它的 `.v-popover`」去开站点自己的弹层，所以入口选择器一失效，
   * 点菜单项就只会弹「网页菜单加载中，请稍后重试」。这里只存 token，选择器集中在下面两张表里
   * —— 站点再改版只需要改这里（改的时候记得用 console 里 `querySelector(选择器+'+.v-popover')`
   * 实测一遍）。
   */
  const referMap: Record<string, string> = {
    category: '[data-idx=category]', // 脚本自己造的弹窗
    message: 'a.right-entry__item-trigger[href="//message.bilibili.com"]',
    dynamic: 'a.right-entry__item-trigger[href="//t.bilibili.com/"]',
    fav: 'a.right-entry__item-trigger[data-header-fav-entry]',
    history: 'a.right-entry__item-trigger[href="//www.bilibili.com/history"]',
    home: 'a.header-entry-avatar',
    follow: '[data-idx=follow]', // 脚本自己造的弹窗
  }
  const oldAppReferMap: Record<string, string> = {
    message: '.right-entry__outside[href="//message.bilibili.com"]',
    dynamic: '.right-entry__outside[href="//t.bilibili.com/"]',
    fav: '.right-entry__outside[data-header-fav-entry]',
    history: '.right-entry__outside[href="//www.bilibili.com/history"]',
  }
  function resolveRefer(token: string): string | undefined {
    return (isOldApp ? oldAppReferMap[token] : undefined) ?? referMap[token]
  }

  function preload() {
    const preloadeditems = isOldApp ? preloadeditems1 : preloadeditems2
    preloadeditems.forEach((item) => {
      document.querySelector(item)?.dispatchEvent(new MouseEvent('mouseenter'))
    })
    setTimeout(handleHistoryShowMore, 70)
    setTimeout(handleDynamicShowMore, 60)
  }

  tryPreload()
  function tryPreload(retry = 20) {
    if (
      document.querySelector(preloadeditems1[0]) && // 排除登录、主页
      document.querySelector(preloadeditems1[1]) &&
      document.querySelector(preloadeditems1[2])
    ) {
      isOldApp = true
      preload()
      // 旧版 APP 的入口值由 oldAppReferMap 处理，不再需要改写 DOM 上的 data-refer
    } else if (
      document.querySelector(preloadeditems2[0]) && // 排除登录、主页
      document.querySelector(preloadeditems2[1]) &&
      document.querySelector(preloadeditems2[2]) &&
      document.querySelector(preloadeditems2[3])
    ) {
      isOldApp = false
      preload()
    } else if (retry > 0) {
      setTimeout(() => tryPreload(retry - 1), 1000)
    }
  }

  const menuFab = document.getElementById('menu-fab') as HTMLElement

  // headerInMenu
  const menuOverlay = Object.assign(document.createElement('div'), {
    id: 'menu-overlay',
    // 顺序要与 setting.js 中的菜单选项排序对应
    // data-refer 只存 token，真正的选择器看上面的 referMap
    innerHTML: `
    <div id="header-in-menu">
      <ul>
        <li><a target="_blank" href="https://www.bilibili.com/v/popular/all/">热门</a></li>
        <li data-refer="category">分类</li>
        <li data-refer="message">消息<span class="badge" id="message-badge"></span></li>
        <li data-refer="dynamic">动态<span class="badge" id="dynamic-badge"></span></li>
        <li data-refer="fav">收藏</li>
        <li data-refer="history">历史</li>
        <li data-refer="home">主页</li>
        <li data-refer="follow">关注</li>
      </ul>
    </div>
    `,
  })
  menuFab.appendChild(menuOverlay)
  const menu = menuOverlay.querySelector('#header-in-menu') as HTMLElement

  menuFab.addEventListener('click', () => {
    menu.classList.add('show')
    menuOverlay.classList.add('show')
    menuFab.classList.add('active')
  })

  updateBadges()
  // 消息数
  async function updateBadges() {
    function update(id: string, number: number) {
      const badge = menuOverlay.querySelector(`#${id}`) as HTMLElement
      if (number > 0) {
        badge.textContent = number > 99 ? '99+' : number.toString()
        badge.style.visibility = 'visible'
      } else {
        badge.style.visibility = 'hidden'
      }
    }
    const { messageNum, dynamicNum } = await getUnreadNums()
    update('message-badge', messageNum)
    update('dynamic-badge', dynamicNum)
  }

  let openedDialog = '' // sessionStorage 刷新网页不变

  const items = menuOverlay.querySelectorAll('li')
  items.forEach((item) =>
    item.addEventListener('click', (event) => {
      event.stopPropagation()
      menu.classList.remove('show')

      const token = item.dataset.refer

      if (!token) {
        // 热门
        menuOverlay.classList.remove('show')
        return
      }

      const refer = resolveRefer(token)
      const referElement = refer
        ? document.querySelector(`${refer}+.v-popover`)
        : null
      if (!referElement) {
        // 弹层没建出来（站点没提供，或还在加载）。站点的入口本身就是链接 —— 直接跳过去，
        // 别把用户堵在一句「请稍后重试」上（历史/主页现在就没有自己的弹层）
        const link = (refer
          ? document.querySelector(refer)
          : null) as HTMLAnchorElement | null
        if (link?.href) {
          menuOverlay.classList.remove('show')
          location.href = link.href
          return
        }

        const toast = document.querySelector('#toast') as HTMLElement
        toast.textContent = '网页菜单加载中，请稍后重试'
        toast.style.display = 'block'
        setTimeout(() => {
          toast.setAttribute('show', '')
        }, 10)

        menuOverlay.click()

        setTimeout(() => {
          toast.removeAttribute('show')
          toast.addEventListener(
            'transitionend',
            () => {
              toast.style.cssText = ''
            },
            { once: true },
          )
        }, 3000)

        return
      }

      openedDialog = token

      referElement.setAttribute('display', '')
      setTimeout(() => {
        referElement.setAttribute('show', '')
      }, 10)
    }),
  )

  menuOverlay.addEventListener('click', (event) => {
    event.stopPropagation()
    menu.classList.remove('show')
    menuOverlay.classList.remove('show')
    menuFab.classList.remove('active')

    if (openedDialog === '') {
      return
    }

    const refer = resolveRefer(openedDialog)
    const referElement = (refer
      ? document.querySelector(`${refer}+.v-popover`)
      : null) as HTMLElement | null
    if (!referElement) return
    referElement.removeAttribute('show')

    handleTransitionEndOnce(referElement, 'opacity', () => {
      referElement.removeAttribute('display')
    })

    if (openedDialog === 'message' || openedDialog === 'dynamic') {
      updateBadges()
    }
  })

  function handleTouchMove() {
    menuOverlay.click()
  }
  menuOverlay.addEventListener('touchstart', () =>
    menuOverlay.addEventListener('touchmove', handleTouchMove, { once: true }),
  )
  menuOverlay.addEventListener('touchend', () =>
    menuOverlay.removeEventListener('touchmove', handleTouchMove),
  )

  createExtraDialog()

  // 添加额外弹窗-分类、关注
  function createExtraDialog() {
    const falseHeader = Object.assign(document.createElement('div'), {
      className: 'bili-header false-header',
      innerHTML: `
      <div data-idx="category" class="right-entry__outside copy-category"></div>
<div class="v-popover" id="copy-category-dialog">
  <div class="v-popover-content">
    <div class="bili-header-channel-panel">
      <div class="channel-panel__column">
        <a href="//www.bilibili.com/anime/" target="_blank"><span class="name">番剧</span></a>
        <a href="//www.bilibili.com/movie/" target="_blank"><span class="name">电影</span></a>
        <a href="//www.bilibili.com/guochuang/" target="_blank"><span class="name">国创</span></a>
        <a href="//www.bilibili.com/tv/" target="_blank"><span class="name">电视</span></a>
        <a href="//www.bilibili.com/variety/" target="_blank"><span class="name">综艺</span></a>
        <a href="//www.bilibili.com/documentary/" target="_blank"><span class="name">纪录</span></a>
        <a href="//www.bilibili.com/v/douga/" target="_blank"><span class="name">动画</span></a>
        <a href="//www.bilibili.com/v/game/" target="_blank"><span class="name">游戏</span></a>
        <a href="//www.bilibili.com/v/kichiku/" target="_blank"><span class="name">鬼畜</span></a>
        <a href="//www.bilibili.com/v/music" target="_blank"><span class="name">音乐</span></a>
      </div>
      <div class="channel-panel__column">
        <a href="//www.bilibili.com/v/dance/" target="_blank"><span class="name">舞蹈</span></a>
        <a href="//www.bilibili.com/v/cinephile" target="_blank"><span class="name">影视</span></a>
        <a href="//www.bilibili.com/v/ent/" target="_blank"><span class="name">娱乐</span></a>
        <a href="//www.bilibili.com/v/knowledge/" target="_blank"><span class="name">知识</span></a>
        <a href="//www.bilibili.com/v/tech/" target="_blank"><span class="name">科技</span></a>
        <a href="//www.bilibili.com/v/information/" target="_blank"><span class="name">资讯</span></a>
        <a href="//www.bilibili.com/v/food" target="_blank"><span class="name">美食</span></a>
        <a href="//www.bilibili.com/v/life" target="_blank"><span class="name">生活</span></a>
        <a href="//www.bilibili.com/v/car" target="_blank"><span class="name">汽车</span></a>
        <a href="//www.bilibili.com/v/fashion" target="_blank"><span class="name">时尚</span></a>
      </div>
      <div class="channel-panel__column">
        <a href="//www.bilibili.com/v/sports" target="_blank"><span class="name">运动</span></a>
        <a href="//www.bilibili.com/v/animal" target="_blank"><span class="name">动物</span></a>
        <a href="//www.bilibili.com/v/life/daily/?tag=530003" target="_blank"><span class="name">VLOG</span></a>
        <a href="//www.bilibili.com/v/life/funny" target="_blank"><span class="name">搞笑</span></a>
        <a href="//www.bilibili.com/v/game/stand_alone" target="_blank"><span class="name">单机游戏</span></a>
        <a href="//www.bilibili.com/v/virtual" target="_blank"><span class="name">虚拟UP</span></a>
        <a href="//love.bilibili.com" target="_blank"><span class="name">公益</span></a>
        <a href="//www.bilibili.com/mooc" target="_blank"><span class="name">公开</span></a>
      </div>
      <div class="channel-panel__column">
        <a href="//www.bilibili.com/read/home" target="_blank"><span class="name">专栏</span></a>
        <a href="//live.bilibili.com" target="_blank"><span class="name">直播</span></a>
        <a href="//www.bilibili.com/blackboard/activity-list.html?" target="_blank"><span class="name">活动</span></a>
        <a href="//www.bilibili.com/cheese/" target="_blank"><span class="name">课堂</span></a>
        <a href="https://www.bilibili.com/blackboard/activity-5zJxM3spoS.html" target="_blank"><span class="name">社区中心</span></a>
        <a href="//music.bilibili.com/pc/music-center/" target="_blank"><span class="name">新歌热榜</span></a>
      </div>
    </div>
  </div>
</div>
      `,
    })
    document.body.appendChild(falseHeader)

    const followOutside = document.createElement('div')
    followOutside.className = 'right-entry__outside follow-list'
    followOutside.dataset.idx = 'follow'
    falseHeader.appendChild(followOutside)

    const followDialog = Object.assign(document.createElement('div'), {
      className: 'v-popover is-bottom',
      id: 'follow-list-dialog',
      // /* html */
      innerHTML: `
        <div class="v-popover-content"><div class="history-panel-popover">
          <div class="header-tabs-panel">
            <div class="header-tabs-panel__item--active header-tabs-panel__item">最常访问</div>
            <div class="header-tabs-panel__item">最近添加</div>
          </div>
          <ul class="follow-list-content"></ul>
        </div></div>
        `,
    })
    falseHeader.appendChild(followDialog)

    loadFollowList(1)
  }
}
