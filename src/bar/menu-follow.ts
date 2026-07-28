import { followUser, getFollowList } from '../api.ts'

/**
 * 加载关注列表
 * @param {number} orderType 排序方式，1: 最常访问，2: 最近关注
 */
export async function loadFollowList(orderType: number) {
  const content = document.querySelector(
    '#follow-list-dialog .follow-list-content',
  ) as HTMLElement

  let pageNumber = 1
  let pageSize = 20
  const data = await getFollowList(pageNumber, pageSize, orderType)

  const list = data.list
  list.forEach(addElementByItem)

  const total = data.total

  async function onScroll() {
    const { scrollTop, scrollHeight, clientHeight } = content
    if (Math.abs(scrollTop + clientHeight - scrollHeight) > 1) {
      return
    }

    content.removeEventListener('scroll', onScroll)

    const remainingData = total - pageNumber * pageSize
    if (remainingData <= pageSize) {
      pageSize = remainingData
    } else {
      setTimeout(() => {
        content.addEventListener('scroll', onScroll)
      }, 2000)
      console.log('Scroll to bottom')
    }

    const data = await getFollowList(++pageNumber, pageSize, orderType)

    const list = data.list
    list.forEach(addElementByItem)
  }
  content.addEventListener('scroll', onScroll)

  const tabsPanel = document.querySelector(
    '#follow-list-dialog .header-tabs-panel',
  ) as HTMLElement
  const firstItem = tabsPanel.firstElementChild as HTMLElement
  const secondItem = firstItem.nextElementSibling as HTMLElement

  firstItem.addEventListener('click', () => {
    if (firstItem.classList.contains('header-tabs-panel__item--active')) {
      return
    }

    firstItem.classList.add('header-tabs-panel__item--active')
    secondItem.classList.remove('header-tabs-panel__item--active')

    content.innerHTML = ''
    content.removeEventListener('scroll', onScroll)
    loadFollowList(1)
  })

  secondItem.addEventListener('click', () => {
    if (secondItem.classList.contains('header-tabs-panel__item--active')) {
      return
    }

    secondItem.classList.add('header-tabs-panel__item--active')
    firstItem.classList.remove('header-tabs-panel__item--active')

    content.innerHTML = ''
    content.removeEventListener('scroll', onScroll)
    loadFollowList(2)
  })

  function addElementByItem(item: Record<string, string>) {
    const up = Object.assign(document.createElement('li'), {
      className: 'list-item clearfix',
      /* html */
      innerHTML: `
          <div class="cover-container"><a href="//space.bilibili.com/${item.mid}" target="_blank" class="up-cover-components">
            <div class="bili-avatar" style="width: 100%;height:100%;">
              <img class="bili-avatar-img bili-avatar-face bili-avatar-img-radius" data-src="${formatUrl(item.face)}@96w_96h_1c_1s_!web-avatar-space-list.avif" alt="" src="${formatUrl(item.face)}@96w_96h_1c_1s_!web-avatar-space-list.avif">
            </div>
          </a></div>
          <div class="content">
            <a href="//space.bilibili.com/${item.mid}/" target="_blank" class="title"><span class="fans-name" style="color: rgb(251, 114, 153);">${item.uname}</span></a>
            <p title="${desc(item)}" class="auth-description">${desc(item)}</p>
            <div class="fans-action">
              <div class="be-dropdown fans-action-btn fans-action-follow">
                <i class="iconfont video-commonmenu"></i><span class="fans-action-text">已关注</span>
                <!--ul class="be-dropdown-menu" style="display: none;">
                  <li class="be-dropdown-item">设置分组</li>
                  <li class="be-dropdown-item">取消关注</li>
                </ul-->
              </div>
              <div class="be-dropdown">
                <div class="be-dropdown-trigger"><i title="更多操作" class="iconfont icon-ic_more"></i></div>
                <ul class="be-dropdown-menu" style="display: none;">
                  <li class="be-dropdown-item"><a target="_blank" href="//message.bilibili.com/#whisper/mid${item.mid}">发消息</a></li>
                </ul>
              </div>
            </div>
          </div>
          `,
    })
    content.appendChild(up)

    const fansAction = up.querySelector('.fans-action') as HTMLElement
    const follow = fansAction.firstElementChild as HTMLElement
    const more = follow.nextElementSibling as HTMLElement

    follow.addEventListener('click', async () => {
      if (!follow.classList.contains('follow')) {
        const followRes = await followUser(item.mid, false)
        if (followRes.code === 0) {
          follow.className = 'fans-action-btn follow'
          follow.innerHTML =
            '<span class="fans-action-text">+&nbsp;&nbsp;关注</span>'
          follow.style.backgroundColor = '#00a1d6'
          follow.style.color = 'white'
        }
      } else {
        const followRes = await followUser(item.mid, true)
        if (followRes.code === 0) {
          follow.className = 'be-dropdown fans-action-btn fans-action-follow'
          follow.innerHTML =
            '<i class="iconfont video-commonmenu"></i><span class="fans-action-text">已关注</span>'
          follow.style.backgroundColor = ''
          follow.style.color = ''
        }
      }
    })

    more.addEventListener('mouseenter', () => {
      const dropdownMenu = more.querySelector(
        '.be-dropdown-menu',
      ) as HTMLElement
      dropdownMenu.style.display = ''
      fansAction.style.zIndex = `${2}`
      more.style.color = '#00a1d6'
    })
    more.addEventListener('mouseleave', () => {
      const dropdownMenu = more.querySelector(
        '.be-dropdown-menu',
      ) as HTMLElement
      dropdownMenu.style.display = 'none'
      fansAction.style.zIndex = `${2}`
      more.style.color = ''
    })
  }

  // 若为函数表达式，则不能在声明前调用
  function formatUrl(url: string) {
    return url.slice(url.indexOf(':') + 1)
  }
  function desc(item: Record<string, string | Record<string, string>>) {
    return (item.official_verify as Record<string, string>).desc || item.sign
  }
}
