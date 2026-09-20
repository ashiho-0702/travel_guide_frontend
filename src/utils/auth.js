// 登录工具：微信一键授权的底层实现
// 流程（对齐后端登录接口文档 2026-09-20）：
//   1. Taro.login() 拿临时 code（5 分钟有效，拿到即刻使用）
//   2. POST /api/auth/login（公开接口）用 code 换 token + user
//   3. token 存本地 storage，后续请求由 services/api.js 统一带 Authorization: Bearer <token>
// 失败语义：401 = code 无效或过期（重新 Taro.login 拿新 code 一般就能成功）
//          502 = 后端调微信接口失败（服务端问题，重试未必有用）
// token 过期后业务接口返回 code 401，api 层已内置静默重登一次；重登失败才要求用户手动登录
import { reactive } from 'vue'
import Taro from '@tarojs/taro'
import api from '../services/api'
import { saveToken, clearToken, getToken, getTokenExpiresAt, getUser, syncSession, sessionState } from './token'

// 页面统一从 auth 引登录态（sessionState 为响应式，登录/退出后自动更新）
export { sessionState }

// ---------- 全局授权弹层状态（所有页面共用同一份） ----------
export const authState = reactive({
  visible: false,   // 弹层是否显示
  pending: null     // 登录成功后要继续执行的操作（requireLogin 传入）
})

// 功能级登录拦截：未登录则弹授权框，登录成功后自动继续 onOk
export function requireLogin(onOk) {
  if (isLoggedIn()) { onOk && onOk(); return }
  authState.pending = onOk || null
  authState.visible = true
}

// 登录成功：关弹层并继续刚才被拦截的操作
export function finishLogin() {
  authState.visible = false
  const cb = authState.pending
  authState.pending = null
  cb && cb()
}

// 用户点「暂不登录」：关弹层，丢弃待执行操作
export function cancelLogin() {
  authState.visible = false
  authState.pending = null
}

export function isLoggedIn() {
  return !!getToken()
}

export function currentUser() {
  return getUser()
}

// 静默登录：Taro.login 换 code → 后端换 token → 落地本地
export function silentLogin() {
  return new Promise((resolve, reject) => {
    Taro.login({
      success: res => {
        if (!res.code) return reject({ code: 'WX_LOGIN_FAIL', message: '微信登录未返回 code' })
        api.auth.login(res.code).then(data => {
          try {
            saveToken(data)
          } catch (e) {
            return reject({ code: 'AUTH_NO_TOKEN', message: e.message })
          }
          resolve(data)
        }).catch(reject)
      },
      fail: err => reject({ code: 'WX_LOGIN_FAIL', message: '微信登录失败，请重试', raw: err })
    })
  })
}

// token 是否仍在有效期内
export function isTokenValid() {
  return isLoggedIn() && getTokenExpiresAt() > Date.now()
}

// 退出登录 / token 失效：清本地登录态（token + user 一起清，并同步响应式镜像）
export function logout() {
  clearToken()
}

// 重新从本地读取登录态到响应式镜像（页面 useDidShow 里调一次即可）
export function refreshSession() {
  return syncSession()
}

// 兜底用：有 token 直接过，没有就静默登录；失败不阻塞主流程（游客模式）
export function ensureLogin() {
  if (isLoggedIn()) return Promise.resolve(currentUser())
  return silentLogin().catch(err => {
    console.warn('[auth] 静默登录失败，进入游客模式', err)
    return null
  })
}
