import { GM_getValue } from './utils/gm.ts'

export function createUnfoldBtn() {
  // 会话列表是 CSS-module 哈希类名（`_Sidebar_1k2p2_10`，哈希随站点构建变），只能按前缀匹配
  const LIST = 'main.message-main [class^="_Sidebar_"]'
  const findList = () => document.querySelector(LIST) as HTMLElement | null

  const list = findList()
  if (list) {
    addButton(list)
    return
  }

  // 会话列表可能还没渲染（SPA）：观察 #app 等它出现；取不到就安静退出，绝不抛
  const host = document.querySelector('#app')
  if (!host) return
  const observer = new MutationObserver(() => {
    const found = findList()
    if (!found) return
    observer.disconnect()
    addButton(found)
  })
  observer.observe(host, { childList: true, subtree: true })

  function addButton(listEl: HTMLElement) {
    if (document.getElementById('unfold-btn')) return
    const unfoldBtn = Object.assign(document.createElement('div'), {
      id: 'unfold-btn',
      textContent: '展开',
    })
    listEl.appendChild(unfoldBtn)

    // 宽度由 message.css 的 [unfold] 规则接管（70px ↔ 240px）
    unfoldBtn.addEventListener('click', () => {
      const unfolded = listEl.toggleAttribute('unfold')
      unfoldBtn.textContent = unfolded ? '折叠' : '展开'
    })
  }
}

export function coverContextMenu() {
  if (!GM_getValue('cover-context-menu', false)) return

  window.addEventListener(
    'contextmenu',
    (event) => {
      if ((event.target as HTMLElement).className === 'message-content') {
        event.stopImmediatePropagation() // 阻止同元素的其它事件监听器通过传播触发
      }
    },
    true, // 在捕获阶段
  )
}
