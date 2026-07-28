import { GM_getValue } from '$'

/**
 * 设置不同页面的搜索事件的函数
 */
export function setSearchBtn(type: 'search' | 'space' | string) {
  const searchFab = document.getElementById('search-fab') as HTMLElement
  const svg = searchFab.querySelector('svg') as SVGElement

  const searchOverlay = document.createElement('div')
  searchOverlay.id = 'search-overlay'
  searchFab.appendChild(searchOverlay)

  const searchContainerSelector = '.center-search-container'

  let clickTimer: number = 0

  function handleClick(input: HTMLInputElement) {
    // 滑动时 .center-search-container 的 class 会刷新
    const searchContainer = document.querySelector(
      `${searchContainerSelector}`,
    ) as HTMLElement

    searchContainer.style.cssText = 'display: block !important' // 修复搜索页优先隐藏
    // 在同一个执行上下文中修改多个 CSS 属性时，浏览器会将这些属性的变化合并为一个重绘和重排操作
    setTimeout(() => {
      searchContainer.setAttribute('show', '')
    }, 10)

    input.focus()
    searchOverlay.classList.add('show')
    searchFab.classList.add('active')
  }

  /**
   * 单击事件、双击事件、searchOverlay 共用的 input
   */
  let input: HTMLInputElement // 在 TypeScript 中，类型检查是静态的，类型为 (... | null) 则要次次判断

  if (type !== 'search' && type !== 'space') {
    searchFab.addEventListener('click', () => {
      const inputElem = document.querySelector(
        `${searchContainerSelector} input`,
      ) as HTMLInputElement | null
      if (inputElem) {
        input = inputElem
      } else return

      handleClick(input)
    })
  }

  if (type === 'search') {
    // 底部显示搜索文本
    const typeInput = document.querySelector(
      '.search-input input',
    ) as HTMLInputElement

    const searchFabText = Object.assign(document.createElement('div'), {
      id: 'search-fab-text',
      textContent: typeInput.value,
    })
    searchFab.appendChild(searchFabText)

    searchFab.style.cssText =
      'background-color: var(--graph_bg_thick); border-radius: 16px;'
    svg.style.flex = '0 0 20px'

    // 文本更新到底部搜索
    const handleInput = () => {
      if (input) {
        searchFabText.textContent = input.value
        if (input.value === '') {
          searchFab.style.cssText = ''
          svg.style.flex = ''
        } else {
          searchFab.style.cssText =
            'background-color: var(--graph_bg_thick); border-radius: 16px;'
          svg.style.flex = '0 0 20px'
        }
      }
    }

    searchFab.addEventListener('click', () => {
      const inputElem = document.querySelector(
        `${searchContainerSelector} input`,
      ) as HTMLInputElement | null
      if (inputElem) {
        input = inputElem
      } else return

      clearTimeout(clickTimer)

      clickTimer = setTimeout(() => {
        handleClick(input)

        // 移除之前添加的 input 事件监听器
        input.removeEventListener('input', handleInput)

        // 模拟输入: 将文本填入底部搜索
        input.value = searchFabText.textContent
        input.dispatchEvent(new Event('input', { bubbles: true }))

        handleInput()

        input.addEventListener('input', handleInput)
      }, 300)
    })

    searchFab.addEventListener('dblclick', () => {
      if (!input) {
        return
      } // return 语句结束当前函数的执行

      clearTimeout(clickTimer)

      handleClick(input)

      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))

      searchFabText.textContent = input.value
      searchFab.style.cssText = ''
      svg.style.flex = ''

      handleInput()

      input.removeEventListener('input', handleInput)
      input.addEventListener('input', handleInput)
    })
  }

  if (type === 'space') {
    // 使用 let handleInput 声明变量并在内部块中赋值时，实际上是在创建一个新的函数。即使引用移除事件监听器时能访问到 let handleInput 变量，但是此时 handleInput 变量引用的函数并不是添加事件监听器时使用的那个函数
    const spaceHandleInput = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        const spaceInput = document.querySelector(
          '#navigator .space_input',
        ) as HTMLInputElement
        const spaceSearchBtn = document.querySelector(
          '#navigator .search-btn',
        ) as HTMLElement

        event.preventDefault()
        spaceInput.value = input!.value as string
        spaceInput.dispatchEvent(new Event('input', { bubbles: true }))
        spaceSearchBtn.click()

        searchOverlay.click()
      }
    }

    searchFab.addEventListener('click', () => {
      const inputElem = document.querySelector(
        `${searchContainerSelector} input`,
      ) as HTMLInputElement | null
      if (inputElem) {
        input = inputElem
      } else return

      clearTimeout(clickTimer)

      clickTimer = setTimeout(() => {
        handleClick(input)
        // 移除之前添加的 keydown 事件监听器
        input.removeEventListener('keydown', spaceHandleInput)

        // 移除事件监听器时，回调函数需要与添加事件监听器时使用的回调函数完全一致。内联定义的新箭头函数不是添加事件监听器时使用的原始回调函数
        // 引用回调函数时，形参写在函数声明中，不需要内联一个匿名函数 (匿名内部函数, 无函数名)
        input.addEventListener('keydown', spaceHandleInput)

        const searchPanel = document.querySelector(
          '.search-panel',
        ) as HTMLElement
        const firstChild = searchPanel.firstChild as HTMLElement
        if (
          firstChild.nodeType === Node.COMMENT_NODE ||
          !firstChild.classList.contains('space-search-tip')
        ) {
          const spaceSearchTip = Object.assign(document.createElement('div'), {
            className: 'header space-search-tip',
            innerHTML: '<div class="title">搜索 up 的视频、动态</div>',
          })
          searchPanel.insertBefore(spaceSearchTip, firstChild)
        }
      }, 300)
    })

    searchFab.addEventListener('dblclick', () => {
      if (!input) {
        return
      }

      clearTimeout(clickTimer)

      handleClick(input)

      input.removeEventListener('keydown', spaceHandleInput)

      document.querySelector('.space-search-tip')?.remove()
    })
  }

  // 避免存在双击事件时的延时操作导致视频页滑动阴影无法滚动内容以及卡顿感
  searchOverlay.addEventListener('click', (event) => {
    event.stopPropagation()

    const searchContainer = document.querySelector(
      `${searchContainerSelector}`,
    ) as HTMLElement

    searchContainer.removeAttribute('show')
    searchContainer.addEventListener(
      'transitionend',
      () => {
        searchContainer.style.cssText = ''
      },
      { once: true },
    )

    searchOverlay.classList.remove('show')
    searchFab.classList.remove('active')
  })

  // 移动端 click 会先触发 touchstart, touchend 和 mousemove
  function handleTouchMove() {
    searchOverlay.click()
  } // searchOverlay.click() 返回值为 undefined
  if (GM_getValue('touch-gesture', true)) {
    searchOverlay.addEventListener('touchstart', () =>
      searchOverlay.addEventListener('touchmove', handleTouchMove, {
        once: true,
      }),
    )
    searchOverlay.addEventListener('touchend', () =>
      searchOverlay.removeEventListener('touchmove', handleTouchMove),
    )
  }
}
