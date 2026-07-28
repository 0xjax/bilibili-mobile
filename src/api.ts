// fork 自 BiliPlus 项目：https://github.com/0xlau/biliplus
import { md5 } from 'js-md5'
import { BILIBILI_API } from './values.ts'

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
]

// 对 imgKey 和 subKey 进行字符顺序打乱编码
// 使用缓存机制减少重复计算
const mixinKeyCache = new Map()

const getMixinKey = (orig: string) => {
  if (mixinKeyCache.has(orig)) {
    return mixinKeyCache.get(orig)
  }
  const mixinKey = mixinKeyEncTab
    .map((n) => orig[n])
    .join('')
    .slice(0, 32)
  mixinKeyCache.set(orig, mixinKey)
  return mixinKey
}

// 为请求参数进行 wbi 签名
function encWbi(
  params: Record<string, string>,
  imgKey: string,
  subKey: string,
) {
  const mixinKey = getMixinKey(imgKey + subKey)
  const currTime = Math.round(Date.now() / 1000)
  const chrFilter = /[!'()*]/g

  Object.assign(params, { wts: currTime }) // 添加 wts 字段
  // 按照 key 重排参数
  const query = Object.keys(params)
    .sort()
    .map((key) => {
      // 过滤 value 中的 "!'()*" 字符
      const value = params[key].toString().replace(chrFilter, '')
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .join('&')

  // wbi 签名，计算 w_rid
  const wbiSign = md5(query + mixinKey)

  return `${query}&w_rid=${wbiSign}`
}

// 获取最新的 imgKey 和 subKey
async function getWbiKeys() {
  const {
    wbi_img: { img_url: imgUrl, sub_url: subUrl },
  } = await getNavUserInfo()

  return {
    imgKey: imgUrl.slice(imgUrl.lastIndexOf('/') + 1, imgUrl.lastIndexOf('.')),
    subKey: subUrl.slice(subUrl.lastIndexOf('/') + 1, subUrl.lastIndexOf('.')),
  }
}

// 刷新 wts 和 wrid
async function getwts(params: Record<string, string>) {
  const webKeys = await getWbiKeys()
  const imgKey = webKeys.imgKey
  const subKey = webKeys.subKey
  const query = encWbi(params, imgKey, subKey)
  return query
}

/**
 * 提取公共的 fetch 逻辑
 * @param {string} url 请求的 URL
 * @param {Object} options 请求的配置对象
 * @returns {Promise<Object>} 响应主体 response.json().data
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
async function fetchAPI(url: string, options = {}) {
  try {
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const jsonData = await response.json()
    return jsonData.data
  } catch (error) {
    console.error('Error fetching data:', error)
    throw error
  }
}

/**
 * 获取导航栏用户信息
 * @returns {Promise<Object>} 用户信息数据
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
async function getNavUserInfo() {
  return fetchAPI(`${BILIBILI_API}/x/web-interface/nav`, {
    credentials: 'include',
  })
}

/**
 * 获取B站视频 aid、cid 等信息
 * @param {string} bvid 视频 bvid
 * @returns {Promise<Object>} 视频信息数据
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
export async function getVideoInfo(bvid: string) {
  return fetchAPI(`${BILIBILI_API}/x/web-interface/view?bvid=${bvid}`)
}

/**
 * 获取 AI判断 响应
 * @param {object} params 请求参数 { bvid, cid, up_mid }
 * @returns {Promise<Object>} 响应主体 data
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
export async function getJudgeAI(params: Record<string, string>) {
  const query = await getwts(params)
  return fetchAPI(
    `${BILIBILI_API}/x/web-interface/view/conclusion/judge?${query}`,
  )
}

/**
 * 获取 AI 总结
 * @param {object} params { bvid, cid, up_mid }
 * @returns {Promise<Object>} 响应主体 data
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
export async function getAIConclusion(params: Record<string, string>) {
  const query = await getwts(params)
  return fetchAPI(
    `${BILIBILI_API}/x/web-interface/view/conclusion/get?${query}`,
  )
}

/**
 * 获取用户ID
 * @returns cookie: DedeUserID
 */
function getUserID() {
  const cookies = document.cookie
  const cookieArray = cookies.split('; ')
  for (let i = 0; i < cookieArray.length; i++) {
    const cookie = cookieArray[i].split('=')
    if (cookie[0] === 'DedeUserID') {
      return cookie[1]
    }
  }
  return null // 如果不返回 null，那么函数就会返回 undefined，这可能会导致一些意想不到的问题。
}

/**
 * 获取 CSRF
 * @returns cookie: bili_jct
 */
function getCSRF() {
  const cookies = document.cookie
  const cookieArray = cookies.split('; ')
  for (let i = 0; i < cookieArray.length; i++) {
    const cookie = cookieArray[i].split('=')
    if (cookie[0] === 'bili_jct') {
      return cookie[1]
    }
  }
  return null // 如果不返回 null，那么函数就会返回 undefined，这可能会导致一些意想不到的问题。
}

/**
 * 获取关注列表
 * @param 页码
 * @param 每页显示的数据条数
 * @param 排序方式，1: 最常访问，2: 最近关注
 * @returns 响应主体 data
 */
export async function getFollowList(
  pageNumber: number,
  pageSize: number,
  orderType: number,
): Promise<{list: Array<Record<string, string>>, total:number}> {
  const vmid = getUserID()
  const query = await getwts({})
  return fetchAPI(
    `${BILIBILI_API}/x/relation/followings?vmid=${vmid}&pn=${pageNumber}&ps=${pageSize}&order=desc&order_type=${orderType === 1 ? 'attention' : ''}&gaia_source=main_web&web_location=333.999&${query}`,
    { credentials: 'include' },
  )
}

/**
 * 获取动态列表
 * @param {string} offset the data.offset of last response
 * @returns {Promise<Object>} 响应主体 data
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
export async function getDynamicList(offset: string) {
  return fetchAPI(
    `${BILIBILI_API}/x/polymer/web-dynamic/v1/feed/nav?offset=${offset}`,
    { credentials: 'include' },
  )
}

/**
 * 获取历史记录列表
 * @param {Object} cursor the data.cursor of last response
 * @returns {Promise<Object>} 响应主体 data
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
export async function getHistoryList(cursor: { max: number; view_at: number }) {
  const url = `${BILIBILI_API}/x/web-interface/history/cursor?max=${cursor.max}&view_at=${cursor.view_at}&business=archive`
  const options = { credentials: 'include' }
  return fetchAPI(url, options)
}

/**
 * 获取历史搜索列表
 * @param {string} key 关键词
 * @param {number} pn 返回结果页序数
 * @returns {Promise<Object>} 响应主体 data
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
export async function getHistorySearchList(key: string, pn: number) {
  return fetchAPI(
    `${BILIBILI_API}/x/web-interface/history/search?pn=${pn}&keyword=${key}&business=all`,
    { credentials: 'include' },
  )
}

/**
 * 获取菜单消息数
 * @returns {Promise<Object>} [messageNum, dynamicNum]
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
export async function getUnreadNums() {
  const options = { credentials: 'include' }
  const messageNumObj = (await fetchAPI(
    'https://api.vc.bilibili.com/session_svr/v1/session_svr/single_unread?build=0&mobi_app=web&unread_type=0',
    options,
  )) as Record<string, number>
  const dynamicNumObj = await fetchAPI(
    `${BILIBILI_API}/x/web-interface/dynamic/entrance?alltype_offset=&video_offset=0&article_offset=0`,
    options,
  )

  const messageNum = Object.values(messageNumObj).reduce(
    // 数组方法：所有元素累积成一个值
    (acc, value) => acc + value, // 回调：累加器 + 当前值
    0, // 初始值
  )
  const dynamicNum = dynamicNumObj.update_info.item.count as number

  return { messageNum, dynamicNum }
}

/**
 * 关注用户
 * @param {string} mid 用户 id
 * @param {boolean} isFollow 关注/取关
 * @returns {Promise<Object>} 响应数据
 * @throws {Error} 如果请求失败或响应状态码不是 200
 */
export async function followUser(mid: string, isFollow: boolean) {
  const response = await fetch('https://api.bilibili.com/x/relation/modify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      fid: mid,
      act: isFollow ? '1' : '2',
      re_src: '11',
      csrf: getCSRF()!,
    }).toString(),
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`)
  }
  return response.json()
}
