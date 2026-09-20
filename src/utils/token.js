// 登录态本地存取：全项目唯一入口，api 层与 auth 层都从这里拿，避免循环依赖
// 登录链路（后端接口文档 2026-09-20）：
//   1. Taro.login() 拿 code（5 分钟有效，拿到即刻使用）
//   2. POST /api/auth/login（公开接口，body: { code }）
//      响应：{ code: 0, message: 'ok', data: { token, user: { id, openid, nickname, avatarUrl } } }
//   3. token 存本地，后续请求由 services/api.js 统一带 Authorization: Bearer <token>
import Taro from '@tarojs/taro'
import { reactive } from 'vue'

const KEY_TOKEN = 'token'
const KEY_EXPIRES = 'tokenExpiresAt'
const KEY_USER = 'user'

// 后端没有返回 expiresIn（也没约定 TTL），所以本地按 2 小时记，提前 5 分钟算过期
// 猜短了只会多一次无感的静默重登；猜长了由 401 自动恢复兜住 —— 真正的权威是后端的 401
const DEFAULT_TTL = 7200

// ---------- 响应式镜像：页面直接绑这个，登录/退出后自动刷新 ----------
// storage 是唯一数据源，sessionState 只是它的可观察副本（写入后调 syncSession 同步）
export const sessionState = reactive({
  token: '',
  user: null,
  loggedIn: false
})

export function syncSession() {
  const token = Taro.getStorageSync(KEY_TOKEN) || ''
  sessionState.token = token
  sessionState.user = Taro.getStorageSync(KEY_USER) || null
  sessionState.loggedIn = !!token
  return sessionState
}

// 从登录响应里取 token。后端已确认字段名为 token（2026-09-20），另两种命名留作兼容
function pickToken(data) {
  if (!data) return ''
  return data.token || data.accessToken || data.access_token || ''
}

// 保存登录结果：data 为登录接口的 data 体（{ token, user }）
export function saveToken(data) {
  const token = pickToken(data)
  if (!token) throw new Error('登录接口未返回 token')
  const expiresIn = (data && data.expiresIn > 0) ? data.expiresIn : DEFAULT_TTL
  Taro.setStorageSync(KEY_TOKEN, token)
  Taro.setStorageSync(KEY_EXPIRES, Date.now() + (expiresIn - 300) * 1000)
  // user 允许为空（后端取不到昵称头像时），为空则保留旧值不清空
  if (data && data.user) Taro.setStorageSync(KEY_USER, data.user)
  syncSession()
  return token
}

// 单独更新用户资料（后续做「补充昵称头像」时用）
export function saveUser(user) {
  if (!user) return null
  Taro.setStorageSync(KEY_USER, user)
  syncSession()
  return user
}

// 清空登录态（token 失效 / 退出登录时调用）
export function clearToken() {
  Taro.removeStorageSync(KEY_TOKEN)
  Taro.removeStorageSync(KEY_EXPIRES)
  Taro.removeStorageSync(KEY_USER)
  syncSession()
}

export function getToken() {
  return Taro.getStorageSync(KEY_TOKEN) || ''
}

export function getTokenExpiresAt() {
  return Taro.getStorageSync(KEY_EXPIRES) || 0
}

export function getUser() {
  return Taro.getStorageSync(KEY_USER) || null
}

// 模块加载时初始化一次响应式镜像
syncSession()
