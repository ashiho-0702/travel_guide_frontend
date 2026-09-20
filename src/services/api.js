// 接口层：唯一出口。页面只调这里，不直接发请求
// 契约依据：后端《微信小程序接口文档》攻略模块（2026-09-19）+ 登录接口（2026-09-20）
//   登录：POST /api/auth/login（公开，body { code }）
//         → { code: 0, message: 'ok', data: { token, user: { id, openid, nickname, avatarUrl } } }
//         业务异常：401 code 无效/过期 · 502 微信接口调用失败
//   攻略：POST /api/trip/generate · GET /api/trip/{id} · GET /api/trip/list · DELETE /api/trip/{id}
//   统一包装 { code: 0, message, data }，code===0 为成功（HTTP 状态码恒为 200，判成败看 body.code）
//   鉴权：除登录接口外，所有请求带 Authorization: Bearer <token>；token 失效返回 code 401
import Taro from '@tarojs/taro'
import CONFIG from '../utils/config'
import { saveToken, clearToken, getToken } from '../utils/token'
import { createSseParser, decodeUtf8 } from '../utils/stream'
import * as mock from './mock'

// 登录等公开接口不带 Authorization：避免上一轮的过期 token 干扰登录
function isPublicPath(path) {
  return (path || '').indexOf('/api/auth/') === 0
}

function baseHeader(extra, path) {
  const h = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token && !isPublicPath(path)) h.Authorization = `Bearer ${token}`   // 未登录时不带空 header，避免后端误判
  return Object.assign(h, extra || {})
}

// ---------- 裸请求：单次发送，不做重试（401 恢复在 request 层） ----------
function rawRequest(path, method, data, opts) {
  opts = opts || {}
  return new Promise((resolve, reject) => {
    Taro.request({
      url: CONFIG.BASE_URL + path,
      method: method || 'GET',
      data: data || {},
      header: baseHeader(opts.header, path),
      timeout: opts.timeout || CONFIG.TIMEOUT,
      success: res => {
        const body = res.data || {}
        const ok = res.statusCode >= 200 && res.statusCode < 300 && (body.code === 0 || body.code === 'OK')
        if (ok) {
          resolve(body.data)
        } else {
          reject({
            code: body.code || 'HTTP_' + res.statusCode,
            message: body.message || '请求失败',
            statusCode: res.statusCode,
            data: body.data
          })
        }
      },
      fail: err => reject({ code: 'NETWORK_ERROR', message: '网络异常，请检查网络后重试', raw: err })
    })
  })
}

// 是否属于「登录态失效」：兼容 HTTP 401 与业务码 AUTH_REQUIRED / UNAUTHORIZED
function isAuthError(err) {
  if (!err) return false
  if (err.statusCode === 401) return true
  const c = err.code
  return c === 401 || c === '401' || c === 'AUTH_REQUIRED' || c === 'UNAUTHORIZED'
}

// ---------- 静默重登：401 时自动恢复一次，同名并发只发一次请求 ----------
let reloginTask = null
function relogin() {
  if (reloginTask) return reloginTask
  reloginTask = new Promise((resolve, reject) => {
    Taro.login({
      success: res => {
        if (!res.code) return reject({ code: 'WX_LOGIN_FAIL', message: '微信登录未返回 code' })
        // 走 request 而非 rawRequest：保持 mock 模式下同样可用
        request('/api/auth/login', 'POST', { code: res.code }).then(d => {
          try {
            saveToken(d)
          } catch (e) {
            return reject({ code: 'AUTH_NO_TOKEN', message: e.message })
          }
          resolve(d)
        }).catch(reject)
      },
      fail: err => reject({ code: 'WX_LOGIN_FAIL', message: '微信登录失败，请重试', raw: err })
    })
  })
  const done = () => { reloginTask = null }   // 无论成败都释放，下次可重试
  reloginTask.then(done, done)
  return reloginTask
}

// ---------- 路径 → 模块：用于按模块决定走 mock 还是真实后端 ----------
function moduleOf(path) {
  if (path.indexOf('/api/auth') === 0) return 'auth'
  if (path.indexOf('/api/trip') === 0) return 'trips'
  if (path.indexOf('/api/parse') === 0) return 'parse'
  if (path.indexOf('/api/poi') === 0) return 'poi'
  if (path.indexOf('/api/guide') === 0) return 'guide'
  if (path.indexOf('/api/event') === 0) return 'event'
  return ''
}

// 是否走本地 mock：config.MOCK 里单独配了该模块就用它，没配则回落到全局 USE_MOCK
// 好处是后端「做了一半」时，已实现的模块连真实后端、未实现的继续用假数据，互不影响
function useMock(path) {
  const m = moduleOf(path)
  const flags = CONFIG.MOCK || {}
  if (m && Object.prototype.hasOwnProperty.call(flags, m)) return !!flags[m]
  return !!CONFIG.USE_MOCK
}

// ---------- 普通请求：401 自动重登并重试一次 ----------
function request(path, method, data, opts) {
  opts = opts || {}
  if (useMock(path)) return mock.request(path, method, data)
  const isAuthPath = path.indexOf('/api/auth/') === 0   // 登录接口自身 401 不递归
  return rawRequest(path, method, data, opts).catch(err => {
    if (isAuthPath || !isAuthError(err)) throw err
    console.warn('[api] 登录态失效，尝试静默重登后重试', err.code)
    clearToken()
    return relogin()
      .then(() => rawRequest(path, method, data, opts))
      .catch(e => {
        // 重登成功但原请求仍 401，或重登失败 → 交给页面走手动登录
        if (isAuthError(e)) throw { code: 'AUTH_REQUIRED', message: '登录已过期，请重新登录' }
        throw e
      })
  })
}

// ---------- 流式生成（SSE）：POST /api/trip/generate/stream（2026-09-20 协议） ----------
// 事件：step(进度文案) · token(JSON 文本片段) · done({tripId}) · error(错误信息)
// 与普通请求的差异：不能用 statusCode 判错（流中错误以 error 事件送达），
// 鉴权失败发生在流开始前，会以普通 JSON {code:401} 返回 → 在 success 回调里兜底识别
function sseRequest(path, method, data, handlers) {
  return new Promise((resolve, reject) => {
    let finished = false
    const finish = fn => arg => { if (!finished) { finished = true; fn(arg) } }
    const ok = finish(resolve)
    const bad = finish(reject)

    // 兼容两种封装：SSE 标准的 event:/data: 行，或 data 为 {type, data} 的 JSON
    const parser = createSseParser(({ event, data: val }) => {
      let type = event
      if ((type === 'message' || !type) && val && typeof val === 'object' && val.type) {
        type = val.type
        val = val.data
      }
      try {
        if (type === 'step') { if (handlers.onStep) handlers.onStep(String(val)) }
        else if (type === 'token') { if (handlers.onToken) handlers.onToken(typeof val === 'string' ? val : '') }
        else if (type === 'done') ok({ tripId: val && (val.tripId != null ? val.tripId : val.id) })
        else if (type === 'error') bad({ code: 'GENERATE_ERROR', message: typeof val === 'string' ? val : '生成失败，请重试' })
      } catch (e) {
        console.warn('[stream] 事件处理异常', e)
      }
    })

    const task = Taro.request({
      url: CONFIG.BASE_URL + path,
      method: method || 'POST',
      data: data || {},
      header: baseHeader({ Accept: 'text/event-stream' }, path),
      timeout: 300000,
      enableChunked: true,           // 分块接收，配合 onChunkReceived
      responseType: 'arraybuffer',   // chunk 进字节层解析器（中文防切断）
      success: res => {
        if (finished) return
        // 流结束但没收到 done 事件：可能是鉴权失败等以普通 JSON 返回
        if (res.statusCode !== 200) {
          return bad({ code: 'HTTP_' + res.statusCode, message: '生成服务暂不可用' })
        }
        try {
          const body = JSON.parse(decodeUtf8(new Uint8Array(res.data)))
          if (body && body.code !== 0) {
            const err = { code: body.code, message: body.message || '生成失败', statusCode: res.statusCode }
            return bad(isAuthError(err) ? { code: 'AUTH_REQUIRED', message: '登录已过期，请重新登录' } : err)
          }
        } catch (e) { /* 不是 JSON（如空响应），按流中断处理 */ }
        bad({ code: 'STREAM_INCOMPLETE', message: '生成中断，请重试' })
      },
      fail: err => bad({ code: 'NETWORK_ERROR', message: '网络异常，请检查网络后重试', raw: err })
    })
    if (task && task.onChunkReceived) {
      task.onChunkReceived(res => {
        try { parser.push(res.data) } catch (e) { console.warn('[stream] chunk 解析失败', e) }
      })
    } else {
      bad({ code: 'STREAM_UNSUPPORTED', message: '当前环境不支持流式接收' })
    }
  })
}

// 业务接口
const api = {
  auth: {
    // 登录：wx.login 拿到的 code 换 token（文档 2026-09-20）。code 有效期 5 分钟，须即刻使用
    login: code => request('/api/auth/login', 'POST', { code }),
    relogin
  },

  // 一句话解析预填表单（文档未含此接口，前端创新点，mock 先行）
  parse: {
    query: text => request('/api/parse', 'POST', { text })
  },

  // 攻略模块（文档 2026-09-19）
  trips: {
    // 生成攻略（同步一次性返回，AI 生成耗时较长 → 超时放大到 5 分钟）
    // payload: { city, startDate?, days, peopleCount?, budget?, preferences?, energyLevel?, transportation, extraRequirements? }
    // 返回 data: { tripId, result }
    generate: payload => request('/api/trip/generate', 'POST', payload, { timeout: 300000 }),
    // 生成攻略（流式）：POST /api/trip/generate/stream → SSE 事件 step/token/done/error
    // handlers: { onStep(text), onToken(text) }；resolve({ tripId })
    // mock 模式走本地假流式；401 时静默重登后整条流重试一次（流不可中途续传，只能重开）
    generateStream: (payload, handlers) => {
      const h = handlers || {}
      if (useMock('/api/trip/generate/stream')) return mock.streamGenerate(payload, h)
      return sseRequest('/api/trip/generate/stream', 'POST', payload, h).catch(err => {
        if (!isAuthError(err)) throw err
        console.warn('[api] 流式生成登录态失效，重登后重试')
        clearToken()
        return relogin().then(() => sseRequest('/api/trip/generate/stream', 'POST', payload, h))
      })
    },
    // 行程详情：GET /api/trip/{id} → data: { id, city, ..., status, result, createdAt }
    detail: tripId => request(`/api/trip/${tripId}`, 'GET'),
    // 历史列表（简单数组）：[{ id, title, createdAt }]
    list: () => request('/api/trip/list', 'GET'),
    // 删除行程
    remove: tripId => request(`/api/trip/${tripId}`, 'DELETE')
  },

  // ---------- 以下接口后端还没出，mock 先行保证页面可开发 ----------
  poi: {
    list: () => request('/api/poi/list', 'GET')
  },

  guide: {
    get: (poiId, duration, style) =>
      request(`/api/guide?poiId=${poiId}&duration=${duration || '2m'}&style=${style || 'standard'}`, 'GET')
  },

  ask: {
    // AI 追问（流式 + 溯源）：后端流式协议未约定，固定走 mock
    // 接口定下后改成 request('/api/ask', 'POST', payload)，并在 config.MOCK 里加 ask 开关
    question: (payload, handlers) => mock.streamAsk(handlers)
  },

  event: {
    // 埋点上报：后端待补，静默失败不打扰用户
    report: events =>
      request('/api/event', 'POST', { events }).catch(err =>
        console.warn('[event] 埋点上报失败（不影响功能）', err && err.code)
      )
  }
}

export default api
