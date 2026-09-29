import { GM_getValue } from './utils/gm.ts'

export function createUnfoldBtn() {
  const messageContainer = document.querySelector(
    'body>.container',
  ) as HTMLElement | null

  // 站点改过消息页标记（body 下现在是 header#message-pc-header + #app，没有 body>.container），
  // 取不到就安静退出：「展开按钮」暂不生效，但绝不能把异常抛出去
  if (!messageContainer) return

  const observer = new MutationObserver((mutations) =>
    mutations.forEach((mutation) => {
      // innerHTML 属性可一次性插入多个节点。此处 mutation.addedNodes.length 为 0 或 1。非数组使用 for...of 循环。
      const addedNode = mutation.addedNodes[0]
      if (
        addedNode?.nodeType === Node.ELEMENT_NODE &&
        (addedNode as HTMLElement).classList.contains('bili-im')
      ) {
        createElement()
        observer.disconnect()
      }
    }),
  )
  observer.observe(messageContainer, { childList: true, subtree: true })

  function createElement() {
    const unfoldBtn = Object.assign(document.createElement('div'), {
      id: 'unfold-btn',
      textContent: '展开',
    })
    const messageList = document.querySelector(
      '.bili-im .left',
    ) as HTMLElement | null
    // 同理：站点标记变了就安静退出
    if (!messageList) return
    messageList.appendChild(unfoldBtn)

    unfoldBtn.addEventListener('click', () => {
      if (messageList.style.cssText === '') {
        messageList.style.cssText = 'width: 240px !important'
        unfoldBtn.textContent = '折叠'
      } else {
        messageList.style.cssText = ''
        unfoldBtn.textContent = '展开'
      }
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
