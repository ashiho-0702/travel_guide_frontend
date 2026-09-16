// 接口层：唯一出口。页面只调这里，不直接发请求
// 契约依据：《前后端接口契约 v1》。Taro 版：wx.* → Taro.*
import Taro from '@tarojs/taro'
import CONFIG from '../utils/config'
import { createNdjsonParser } from '../utils/stream'
import * as mock from './mock'

function baseHeader() {
  const token = Taro.getStorageSync('token')
  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : ''
  }
}

// ---------- 非流式请求 ----------
function request(path, method, data) {
  if (CONFIG.USE_MOCK) return mock.request(path, method, data)
  return new Promise((resolve, reject) => {
    Taro.request({
      url: CONFIG.BASE_URL + path,
      method: method || 'GET',
      data: data || {},
      header: baseHeader(),
      timeout: CONFIG.TIMEOUT,
      success: res => {
        const body = res.data || {}
        if (body.code === 0) resolve(body.data)
        else reject({ code: body.code, message: body.message || '请求失败' })
      },
      fail: reject
    })
  })
}

// ---------- 流式请求 ----------
// handlers: { onMeta, onDelta, onDone, onError }
// 说明：流式响应体在 success 里是空的，数据全部走 onChunkReceived
function stream(path, data, handlers) {
  if (CONFIG.USE_MOCK) return mock.stream(path, data, handlers)

  const parser = createNdjsonParser(msg => {
    if (msg.type === 'meta' && handlers.onMeta) handlers.onMeta(msg.data)
    else if (msg.type === 'delta' && handlers.onDelta) handlers.onDelta(msg.text)
    else if (msg.type === 'done' && handlers.onDone) handlers.onDone(msg.data)
    else if (msg.type === 'error' && handlers.onError) handlers.onError(msg)
    else if (msg.type === 'node' && handlers.onNode) handlers.onNode(msg)
  })

  const task = Taro.request({
    url: CONFIG.BASE_URL + path,
    method: 'POST',
    header: baseHeader(),
    data: data || {},
    timeout: CONFIG.TIMEOUT,
    enableChunked: true,
    success: () => {},
    fail: err => handlers.onError && handlers.onError({ code: -1, message: '网络异常', raw: err })
  })

  if (task.onChunkReceived) {
    task.onChunkReceived(res => parser.push(res.data))
  } else {
    handlers.onError &&
      handlers.onError({ code: -2, message: '当前基础库不支持分块接收，请把调试基础库调到 2.20.2 以上' })
  }

  return {
    abort() {
      task.abort && task.abort()
    }
  }
}

// ---------- 业务接口 ----------
const api = {
  auth: {
    login: code => request('/api/auth/login', 'POST', { code })
  },

  itinerary: {
    // 一句话生成行程（流式）
    generate: (payload, handlers) => stream('/api/itinerary/generate', payload, handlers),
    // 对话式重排（流式）
    revise: (payload, handlers) => stream('/api/itinerary/revise', payload, handlers),
    detail: itineraryId => request(`/api/itinerary/${itineraryId}`, 'GET')
  },

  poi: {
    list: () => request('/api/poi/list', 'GET'),
    detail: poiId => request(`/api/poi/${poiId}`, 'GET')
  },

  guide: {
    // duration: 30s | 2m | 5m ; style: standard | kids | fun
    get: (poiId, duration, style) =>
      request(`/api/guide?poiId=${poiId}&duration=${duration || '2m'}&style=${style || 'standard'}`, 'GET')
  },

  ask: {
    // AI 追问（流式，带溯源）
    question: (payload, handlers) => stream('/api/ask', payload, handlers)
  },

  event: {
    report: events => request('/api/event', 'POST', { events })
  },

  dashboard: {
    stats: range => request(`/api/dashboard/stats?range=${range || '7d'}`, 'GET')
  }
}

export default api
