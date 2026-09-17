// 登录工具：微信一键授权的底层实现
// 流程：Taro.login() 拿临时 code → POST /api/auth/login 换 token → 存本地
import Taro from '@tarojs/taro'
import api from '../services/api'

export function isLoggedIn() {
  return !!Taro.getStorageSync('token')
}

export function currentUser() {
  return Taro.getStorageSync('user') || null
}

// 静默登录：调微信登录接口换 code，再向后端换 token
export function silentLogin() {
  return new Promise((resolve, reject) => {
    Taro.login({
      success: res => {
        if (!res.code) return reject({ message: 'wx.login 未返回 code' })
        api.auth.login(res.code).then(data => {
          Taro.setStorageSync('token', data.token)
          Taro.setStorageSync('user', data.user || null)
          resolve(data)
        }).catch(reject)
      },
      fail: reject
    })
  })
}

// 兜底用：有 token 直接过，没有就静默登录；失败不阻塞主流程（游客模式）
export function ensureLogin() {
  if (isLoggedIn()) return Promise.resolve(currentUser())
  return silentLogin().catch(err => {
    console.warn('[auth] 静默登录失败，进入游客模式', err)
    return null
  })
}
