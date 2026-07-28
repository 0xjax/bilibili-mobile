import { GM_getValue, GM_setValue, GM_registerMenuCommand } from '$'
import { waitDOMContentLoaded } from './utils/wait.ts'

function appendStyle(id: string, textContent: string) {
  const style = Object.assign(document.createElement('style'), {
    id,
    textContent,
  })
  document.head.appendChild(style)
}

// 预加载与偏好修改共用
function homeSingleColumn() {
  appendStyle(
    'home-single-column',
    `
div.recommended-container_floor-aside .container {
  grid-template-columns: repeat(1, 1fr) !important;
}
div.bili-video-card.is-rcmd,
div.bili-live-card.is-rcmd {
  --cover-radio: 56.25% !important;
}
.bili-live-card__skeleton--right {
  height: 70px;
}
div.recommended-container_floor-aside .container {
  padding: 15px 0;
  grid-gap: 15px !important;
  background-color: white;
}
picture.v-img.bili-video-card__cover, picture.v-img.bili-live-card__cover {
  border-radius: 0 !important;
}
div.bili-video-card__wrap, div.bili-live-card__wrap {
  border-radius: 0;
}
div.bili-video-card__info,
div.bili-live-card__info {
  --title-padding-right: 30px;
  --no-interest-entry-size: 30px;
}
`,
  )
}

// 修改后 需刷新
function foldDescTag() {
  appendStyle(
    'fold-desc-tag',
    `
.video-desc-container,
.video-tag-container{
  max-height: 0;
  overflow: hidden;
  margin: 0 !important;
  padding: 0 !important;
}
.left-container[unfold] .video-desc-container,
.left-container[unfold] .video-tag-container{
  max-height: unset;
  padding: 5px 0 !important;
}
#fold-desc-btn {
  width: 24px;
  height: 24px;
  transform: rotate(180deg);
  position: absolute;
  right: 10px;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 25%;
  box-shadow: 0 0 0 1px var(--line_regular) inset;
  padding: 2px;
}
.left-container[unfold] #fold-desc-btn{
  transform: none;
}  
`,
  )
}

// 脚本预加载设置
export function handleScriptPreSetting() {
  const defaultValue = Array(11).fill(false)

  const css = {
    css1: `
      .bpx-player-sending-area.bpx-player-sending-area {display:none !important;}
      .left-container.left-container {padding:5px 10px 10px;}
      html body {--commentbox-display: none;}
    `,
    css2: '.video-tag-container {display:none !important;}',
    css3: `
      .video-info-meta div.copyright.item {display: none;}
      .video-info-meta a.honor.item {display: none;}
      .video-info-meta .video-info-detail-list:has(.honor.item) {margin-top: 0;}
      .video-info-meta .video-argue.item {display: none !important;}
      .video-info-meta .video-info-detail-list:has(.video-argue.item) {margin-bottom: 0;}
    `,
    css4: '.trending {display:none;}',
    css5: '.bpx-player-ctrl-volume, .bpx-player-ctrl-full, .bpx-player-ctrl-web {display: none;}',
    css6: `
      .bili-footer {display: none;}
      .vui_pagenation {padding-bottom: var(--actionbar-height);}
    `,
    css7: '.fixed-sidenav-storage, div.float-nav-exp {display: none !important;}',
    css8: '.bili-live-card {display: none !important;}',
    css9: '.bangumi-pgc-list {display: none;}',
    css10: '#danmukuBox {display: none;}',
    css11: 'div.bpx-player-toast-wrap {display: none !important;}',
  } // 对象的值可通过 object[key] 获取

  readScriptSetting()

  if (GM_getValue('home-single-column', false)) {
    homeSingleColumn()
  }

  if (GM_getValue('fold-desc-tag', false)) {
    foldDescTag()
  }

  waitDOMContentLoaded(() => {
    createSettingPanel()

    GM_registerMenuCommand('元素隐藏设置', () => {
      const settingPanel = document.getElementById(
        'setting-panel-style',
      ) as HTMLElement
      settingPanel.style.display = 'flex'
      setTimeout(() => {
        settingPanel.setAttribute('show', '')
      }, 10) // 修复搜索页show类优先块状显示
    })
  })

  // 形参 diference 隐式声明成 let
  function readScriptSetting(diference: boolean[] | undefined = undefined) {
    // 傻逼 GM_getValue 获取未设的值就报错加阻塞线程，值不自动转字符串
    const settingShowHidden = GM_getValue(
      'settingShowHidden',
      defaultValue,
    ) as boolean[]
    const values = Object.values(css) // 可枚举属性值，返回 [v1, v2]

    if (diference) {
      for (const [index, value] of diference.entries()) {
        // 可枚举属性，对数组使用获得元素为索引加值的二维数组，返回 [ [1,v1], [2,v2] ]
        if (value) {
          if (settingShowHidden[index]) {
            appendStyle(`script-pre-style-${index}`, values[index])
          } else {
            document.getElementById(`script-pre-style-${index}`)?.remove()
          }
        }
      }
    } else {
      for (const [index, value] of values.entries()) {
        if (settingShowHidden[index]) {
          appendStyle(`script-pre-style-${index}`, value)
        }
      }
    }
  }

  function createSettingPanel() {
    const settingPanel = Object.assign(document.createElement('div'), {
      id: 'setting-panel-style',
      className: 'setting-panel',
      innerHTML: `
        <div class="setting-title">隐藏元素</div>
        <div class="setting-checkboxes">
          <label><input type="checkbox"><span>弹幕行与评论行</span></label>
          <label><input type="checkbox"><span>标签块</span></label>
          <label><input type="checkbox"><span>标题附加声明提示</span></label>
          <label><input type="checkbox"><span>热搜榜</span></label>
          <label><input type="checkbox"><span>播放器全屏音量键</span></label>
          <label><input type="checkbox"><span>页脚导航链接</span></label>
          <label><input type="checkbox"><span>视频页回顶部按钮</span></label>
          <label><input type="checkbox"><span>首页直播推荐</span></label>
          <label><input type="checkbox"><span>搜索综合栏影视块</span></label>
          <label><input type="checkbox"><span>视频侧栏弹幕列表</span></label>
          <label><input type="checkbox"><span>视频弹出提示条</span></label>
        </div>
        <button id="setting-conform-1" class="setting-conform">确认</button>
        `,
    })
    document.body.appendChild(settingPanel)

    const checkboxElements = settingPanel.querySelectorAll(
      '.setting-checkboxes input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>
    const oldValues = GM_getValue(
      'settingShowHidden',
      defaultValue,
    ) as boolean[]
    for (const [index, element] of Array.from(checkboxElements).entries()) {
      element.checked = oldValues[index]
    }

    settingPanel
      .querySelector('#setting-conform-1')!
      .addEventListener('click', () => {
        const oldValues = GM_getValue(
          'settingShowHidden',
          defaultValue,
        ) as boolean[]
        const selectedValues = Array.from(checkboxElements).map(
          (checkbox) => checkbox.checked,
        )

        GM_setValue('settingShowHidden', selectedValues)
        const difference = selectedValues.map(
          (value, index) => value !== oldValues[index],
        )

        readScriptSetting(difference)

        settingPanel.removeAttribute('show')
        settingPanel.addEventListener(
          'transitionend',
          () => {
            settingPanel.style.cssText = ''
          },
          { once: true },
        )
      })
  }
}

// 脚本设置
export function handleScriptSetting() {
  const keyValues = {
    'ban-video-click-play': '禁用点击视频播放/暂停',
    'allow-video-slid': '视频滑动调整进度',
    'fold-desc-tag': '折叠简介和标签',
    'video-click-unmute': '视频页点击空白解除静音',
    'ban-actionbar-hidden': '禁止底栏滚动时隐藏',
    'message-sidebar-change-right': '消息页侧边栏靠右',
    'cover-context-menu': '覆盖消息页长按弹窗',
    'home-single-column': '首页单列推荐',
    'menu-dialog-move-down': '菜单弹窗(收藏、历史等)靠下',
    'touch-gesture': '触摸手势功能(全屏按钮、滑动关闭搜索)',
  } as { [key: string]: string }

  // 默认开启的设置项
  const keyDefaults = { 'touch-gesture': true } as { [key: string]: boolean }

  const customKeyValues = {
    'menu-dialog-move-down-value': '20',
    'video-longpress-speed': '2',
    'header-image-source': 'unsplash', // 与 home.js 保持一致
  }

  const customKeyNames = {
    'menu-dialog-move-down-value': '自定义菜单弹窗底边距',
    'video-longpress-speed': '自定义视频长按倍速',
    'header-image-source': '主页头图换源',
  } as { [key: string]: string }

  const menuOptions = {
    key: 'modify-menu-options',
    value: [true, true, ...Array(6).fill(false)],
    names: ['热门', '分类', '消息', '动态', '收藏', '历史', '主页', '关注'], // 菜单选项排序
  }

  // 初始化设置
  initSettings()

  // 创建设置面板
  createSettingPanel()

  // 注册菜单命令
  GM_registerMenuCommand('操作偏好设置', () => {
    const settingPanel = document.getElementById(
      'setting-panel-preference',
    ) as HTMLElement
    settingPanel.style.display = 'flex'
    setTimeout(() => {
      settingPanel.setAttribute('show', '')
    }, 10)
  })

  function initSettings() {
    if (GM_getValue('ban-actionbar-hidden', false)) {
      banActionbarHidden()
    }
    if (GM_getValue('message-sidebar-change-right', false)) {
      messageSidebarRight()
    }
    if (GM_getValue('menu-dialog-move-down', false)) {
      menuDialogMoveDown()
    }
    // home-single-column 由预加载初始化
    if (
      !(GM_getValue(menuOptions.key, menuOptions.value) as boolean[]).every(
        (item) => item === false,
      )
    ) {
      modifyMenuOptions()
    }
  }

  function banActionbarHidden() {
    appendStyle(
      'ban-actionbar-hidden',
      `
      [scroll-hidden] #actionbar,
      [scroll-hidden] .flexible-roll-btn-inner, /* 刷新、回顶 */
      [scroll-hidden] .top-btn {
        transform: none !important;
      }
    `,
    )
  }

  function messageSidebarRight() {
    appendStyle(
      'message-sidebar-change-right' /* window slide 也获取该值 */,
      `
      .space-left.space-left { left: 100%; }      
      body>.container[sidebar] .space-left.space-left { transform: translateX(-100%); }
    `,
    )
  }

  function menuDialogMoveDown() {
    const downValue = GM_getValue('menu-dialog-move-down-value', '20')
    appendStyle(
      'menu-dialog-move-down-value',
      `
      div.bili-header .v-popover.v-popover {
        top: unset !important;
        bottom: var(--actionbar-height);
        transform: translate(-50%, -${downValue}px) scale(.9);
      }
      div.bili-header .v-popover.v-popover[show] {
        transform: translate(-50%, -${downValue}px) !important;
      }
    `,
    )
  }

  function modifyMenuOptions() {
    const options = GM_getValue(menuOptions.key, menuOptions.value) as boolean[]
    let selector = ''
    options.forEach((value, index) => {
      if (value) {
        selector += `#header-in-menu ul li:nth-of-type(${index + 1}), `
      }
    })
    appendStyle(
      'modify-menu-options',
      `${selector.slice(0, -2)} { display: none; }`,
    )
  }

  function createSettingPanel() {
    const settingPanel = Object.assign(document.createElement('div'), {
      id: 'setting-panel-preference',
      className: 'setting-panel',
      innerHTML: `
        <div class="setting-title">操作偏好</div>
        <div class="setting-checkboxes">
        ${Object.entries(keyValues)
          .map(
            ([key, value]) => `
          <label><input type="checkbox" data-key="${key}"><span>${value}</span></label>
        `,
          )
          .join('')}
        ${Object.entries(customKeyValues)
          .filter(([key]) => key !== 'header-image-source')
          .map(
            ([key, value]) => `
          <label><input type="number" value="${value}" data-key="${key}"><span>${customKeyNames[key]}</span></label>
        `,
          )
          .join('')}
          <label><select class="header-image-source" data-key="header-image-source">
              <option value="local">本地图片</option>
              <option value="bing">必应每日</option>
              <option value="unsplash">Unsplash</option>
              <option value="picsum">Picsum</option>
              <option value="meizi">妹子⏳</option>
              <option value="dongman">动漫⏳</option>
              <option value="fengjing">风景⏳</option>
              <option value="suiji">随机⏳</option>
          </select><details><summary>主页头图换源</summary>本地图片限制大小</details></label>
          <label class="modify-menu-options"><span>修改菜单显示选项</span></label>
        </div>
        <button id="setting-conform-2" class="setting-conform">确认</button>
      `,
    })
    document.body.appendChild(settingPanel)

    const checkboxElements = settingPanel.querySelectorAll(
      '.setting-checkboxes input[type="checkbox"]',
    ) as NodeListOf<HTMLInputElement>
    const customElements = settingPanel.querySelectorAll(
      '.setting-checkboxes input[type="number"], .setting-checkboxes select',
    ) as NodeListOf<HTMLInputElement>

    checkboxElements.forEach((checkbox, index) => {
      const key = Object.keys(keyValues)[index]
      checkbox.checked = GM_getValue(key, keyDefaults[key] ?? false) as boolean
    })

    customElements.forEach((elem, index) => {
      elem.value = GM_getValue(
        Object.keys(customKeyValues)[index],
        Object.values(customKeyValues)[index],
      ) as string
    })

    settingPanel
      .querySelector('#setting-conform-2')!
      .addEventListener('click', () => {
        const selectedValues = Array.from(checkboxElements).map(
          (checkbox) => checkbox.checked,
        )
        const writenValues = Array.from(customElements).map(
          (elem) => elem.value,
        )

        selectedValues.forEach((value, index) => {
          const key = Object.keys(keyValues)[index]
          if (value !== GM_getValue(key, keyDefaults[key] ?? false)) {
            GM_setValue(key, value)
            switch (key) {
              case 'ban-actionbar-hidden':
                if (value) banActionbarHidden()
                else document.getElementById(key)?.remove()
                break
              case 'message-sidebar-change-right':
                if (value) messageSidebarRight()
                else document.getElementById(key)?.remove()
                break
              case 'menu-dialog-move-down':
                if (value) menuDialogMoveDown()
                else document.getElementById(`${key}-value`)?.remove()
                break
              case 'home-single-column':
                if (value) homeSingleColumn()
                else document.getElementById(key)?.remove()
                break
            }
          }
        })

        writenValues.forEach((value, index) => {
          const key = Object.keys(customKeyValues)[index]
          if (
            value !== GM_getValue(key, Object.values(customKeyValues)[index])
          ) {
            GM_setValue(key, value)
            if (key === 'menu-dialog-move-down-value') {
              document.getElementById(key)?.remove()
              menuDialogMoveDown()
            } else if (key === 'header-image-source' && value !== 'local') {
              window.dispatchEvent(
                new CustomEvent('variableChanged', {
                  detail: { key, newValue: value },
                }),
              )
            }
          }
        })

        settingPanel.removeAttribute('show')
        settingPanel.addEventListener(
          'transitionend',
          () => {
            settingPanel.style.cssText = ''
          },
          { once: true },
        )
      })

    settingPanel
      .querySelector('.header-image-source')!
      .addEventListener('change', (event) => {
        if ((event.target as HTMLInputElement).value === 'local') {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/*'
          input.addEventListener('change', () => {
            const file = input.files![0]
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = () => {
              const base64Data = reader.result
              localStorage.setItem('header-image', base64Data!.toString())
            }
          })
          input.click()
        }
      })

    settingPanel
      .querySelector('.modify-menu-options')!
      .addEventListener('click', () => {
        const settingPanel = Object.assign(document.createElement('div'), {
          id: 'setting-panel-modify-menu-options',
          className: 'setting-panel mini',
          innerHTML: `
          <div class="setting-title">隐藏选项</div>
          <div class="setting-checkboxes">
            ${menuOptions.names
              .map(
                (name, index) => `
              <label><input type="checkbox" data-index="${index}"><span>${name}</span></label>
            `,
              )
              .join('')}
          </div>
          <button id="setting-conform-3" class="setting-conform">确认</button>
        `,
        })
        document.body.appendChild(settingPanel)

        const checkboxElements = settingPanel.querySelectorAll(
          '.setting-checkboxes input[type="checkbox"]',
        ) as NodeListOf<HTMLInputElement>
        const oldValues = GM_getValue(
          menuOptions.key,
          menuOptions.value,
        ) as boolean[]

        checkboxElements.forEach((element, index) => {
          element.checked = oldValues[index]
        })

        settingPanel
          .querySelector('#setting-conform-3')!
          .addEventListener('click', () => {
            const selectedValues = Array.from(checkboxElements).map(
              (checkbox) => (checkbox as HTMLInputElement).checked,
            )

            if (selectedValues.some((value, index) => value !== oldValues[index])) {
              GM_setValue(menuOptions.key, selectedValues)
              document.head.querySelector('#modify-menu-options')?.remove()
              modifyMenuOptions()
            }

            settingPanel.remove()
          })
      })
  }
}

// 脚本帮助
export function setScriptHelp() {
  createSettingPanel()

  GM_registerMenuCommand('脚本说明', () => {
    const settingPanel = document.getElementById(
      'setting-panel-help',
    ) as HTMLElement
    settingPanel.style.display = 'flex'
    setTimeout(() => {
      settingPanel.setAttribute('show', '')
    }, 10)
  })

  function createSettingPanel() {
    const settingPanel = Object.assign(document.createElement('div'), {
      id: 'setting-panel-help',
      className: 'setting-panel',
      innerHTML: `
        <div class="setting-title">脚本说明</div>
        <div class="setting-content">
          <li>视频页：双击全屏按钮竖屏播放，左右滑动切换侧边栏</li>
          <li>搜索页：双击搜索按钮清空输入框，左右滑动切换分类</li>
          <li>个人空间：双击搜索按钮全局搜索，左右滑动切换分类</li>
          <li>作者持续改进和处理反馈，<a href="https://github.com/jk278/bilibili-mobile" target="_blank">Github 仓库</a>、<a href="https://t.me/dream_x_forest" target="_blank">电报吹水群</a></li>
          <li>Firefox 推荐扩展：<a href="https://addons.mozilla.org/zh-CN/firefox/addon/uaswitcher/" target="_blank">User Agent Switcher</a></li>
          <li>更多自定义功能，请查看脚本设置</li>
        </div>
        <button id="setting-conform-3" class="setting-conform">关闭</button>
      `,
    })
    document.body.appendChild(settingPanel)

    settingPanel
      .querySelector('#setting-conform-3')!
      .addEventListener('click', () => {
        settingPanel.removeAttribute('show')
        settingPanel.addEventListener(
          'transitionend',
          () => {
            settingPanel.style.cssText = ''
          },
          { once: true },
        )
      })

    if (GM_getValue('is-first-use', true)) {
      settingPanel.style.display = 'flex'
      setTimeout(() => {
        settingPanel.setAttribute('show', '')
      }, 10)
      GM_setValue('is-first-use', false)
    }
  }
}
