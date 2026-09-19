// 登录工具：微信一键授权的底层实现
// 流程：Taro.login() 拿临时 code → POST /api/v1/auth/wechat-login 换 accessToken → 存本地
// 后端 v1.0：token 有效期 expiresIn 秒，过期后接口返回 401 AUTH_REQUIRED，前端重新登录
import { reactive } from 'vue'
import Taro from '@tarojs/taro'
import api from '../services/api'

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
  return !!Taro.getStorageSync('token')
}

export function currentUser() {
  return Taro.getStorageSync('user') || null
}

// 静默登录：调微信登录接口换 code，再向后端换 accessToken
export function silentLogin() {
  return new Promise((resolve, reject) => {
    Taro.login({
      success: res => {
        if (!res.code) return reject({ message: 'wx.login 未返回 code' })
        api.auth.login(res.code).then(data => {
          const expiresIn = (data && data.expiresIn) || 7200
          Taro.setStorageSync('token', data.accessToken)
          // 存过期时间，提前 5 分钟视为过期，避免边界报 401
          Taro.setStorageSync('tokenExpiresAt', Date.now() + (expiresIn - 300) * 1000)
          Taro.setStorageSync('user', data.user || null)
          resolve(data)
        }).catch(reject)
      },
      fail: reject
    })
  })
}

// token 是否仍在有效期内
export function isTokenValid() {
  return isLoggedIn() && Taro.getStorageSync('tokenExpiresAt') > Date.now()
}

// 兜底用：有 token 直接过，没有就静默登录；失败不阻塞主流程（游客模式）
export function ensureLogin() {
  if (isLoggedIn()) return Promise.resolve(currentUser())
  return silentLogin().catch(err => {
    console.warn('[auth] 静默登录失败，进入游客模式', err)
    return null
  })
}
