// 接口层：唯一出口。页面只调这里，不直接发请求
// 契约依据：后端《功能与接口文档》v1.0（2026-09-17）——异步任务模型 + SSE 事件流
import Taro from '@tarojs/taro'
import CONFIG from '../utils/config'
import { createSseParser } from '../utils/stream'
import * as mock from './mock'

function baseHeader(extra) {
  const token = Taro.getStorageSync('token')
  return Object.assign(
    {
      'Content-Type': 'application/json',
      Authorization: token ? `Bearer ${token}` : ''
    },
    extra || {}
  )
}

// 客户端生成 UUID 作幂等键（文档 4.5）
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ---------- 普通请求 ----------
// 后端统一响应 { code:'OK', message, data, requestId }，HTTP 状态码表达协议结果
function request(path, method, data, header) {
  if (CONFIG.USE_MOCK) return mock.request(path, method, data)
  return new Promise((resolve, reject) => {
    Taro.request({
      url: CONFIG.BASE_URL + path,
      method: method || 'GET',
      data: data || {},
      header: baseHeader(header),
      timeout: CONFIG.TIMEOUT,
      success: res => {
        const body = res.data || {}
        if (res.statusCode >= 200 && res.statusCode < 300 && body.code === 'OK') {
          resolve(body.data)
        } else {
          reject({ code: body.code || 'HTTP_' + res.statusCode, message: body.message || '请求失败', data: body.data })
        }
      },
      fail: err => reject({ code: 'NETWORK_ERROR', message: '网络异常，请检查网络后重试', raw: err })
    })
  })
}

// ---------- SSE 事件流订阅 ----------
// handlers: { onEvent({id,event,data}), onError(err) }；返回 { abort(), lastEventId() }
function subscribeEvents(path, handlers) {
  if (CONFIG.USE_MOCK) return mock.subscribe(path, handlers)

  const parser = createSseParser(ev => {
    if (handlers.onEvent) handlers.onEvent(ev)
  })

  const task = Taro.request({
    url: CONFIG.BASE_URL + path, // GET /api/v1/trips/{id}/events
    method: 'GET',
    header: baseHeader({ Accept: 'text/event-stream' }),
    timeout: 600000, // 事件流是长连接，超时要放大
    enableChunked: true,
    success: () => {},
    fail: err => handlers.onError && handlers.onError({ code: 'NETWORK_ERROR', message: '事件流连接失败', raw: err })
  })

  if (task.onChunkReceived) {
    task.onChunkReceived(res => parser.push(res.data))
  } else {
    handlers.onError && handlers.onError({ code: 'CHUNK_UNSUPPORTED', message: '当前基础库不支持分块接收，请把调试基础库调到 2.20.2 以上' })
  }

  return {
    abort() { task.abort && task.abort() },
    lastEventId: () => parser.lastEventId
  }
}

// ---------- 业务接口 ----------
const api = {
  auth: {
    // POST /api/v1/auth/wechat-login → { accessToken, expiresIn, user }
    login: code => request('/api/v1/auth/wechat-login', 'POST', { code })
  },

  // 一句话解析预填表单（后端待补 POST /api/v1/parse，mock 先行）
  parse: {
    query: text => request('/api/v1/parse', 'POST', { text })
  },

  // 行程任务（文档第 6 章）
  trips: {
    // 创建任务：请求体 TripCreateRequest，必须带 Idempotency-Key → 202 { tripId, statusUrl, eventsUrl }
    create: payload => request('/api/v1/trips', 'POST', payload, { 'Idempotency-Key': uuid() }),
    // 订阅事件流：GET /api/v1/trips/{id}/events?afterEventId=xxx
    events: (tripId, afterEventId, handlers) =>
      subscribeEvents(`/api/v1/trips/${tripId}/events${afterEventId ? '?afterEventId=' + afterEventId : ''}`, handlers),
    // 查询状态（断流兜底 / 回前台恢复）
    status: tripId => request(`/api/v1/trips/${tripId}/status`, 'GET'),
    // 取消（幂等）
    cancel: tripId => request(`/api/v1/trips/${tripId}/cancel`, 'POST'),
    // 完整结果 TripDetail
    detail: tripId => request(`/api/v1/trips/${tripId}`, 'GET'),
    // 历史列表（游标分页）
    list: (cursor, limit) => request(`/api/v1/trips?limit=${limit || 20}${cursor ? '&cursor=' + encodeURIComponent(cursor) : ''}`, 'GET'),
    // 删除
    remove: tripId => request(`/api/v1/trips/${tripId}`, 'DELETE')
  },

  // ---------- 以下接口后端 v1.0 还没出，M1~M4 排期待补，mock 先行保证页面可开发 ----------
  poi: {
    list: () => request('/api/poi/list', 'GET')
  },

  guide: {
    get: (poiId, duration, style) =>
      request(`/api/guide?poiId=${poiId}&duration=${duration || '2m'}&style=${style || 'standard'}`, 'GET')
  },

  ask: {
    // AI 追问（流式 + 溯源）：后端待补 POST /api/ask，当前仅 mock
    question: (payload, handlers) => mock.streamAsk(handlers)
  },

  event: {
    // 埋点上报：后端待补，静默失败不打扰用户
    report: events =>
      request('/api/event', 'POST', { events }).catch(err =>
        console.warn('[event] 埋点上报失败（不影响功能）', err && err.code)
      )
  },

  dashboard: {
    stats: range => request(`/api/dashboard/stats?range=${range || '7d'}`, 'GET')
  }
}

export default api
