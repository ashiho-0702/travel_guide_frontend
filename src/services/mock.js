// 本地模拟：后端没就绪时前端照常开发（config.USE_MOCK = true 时生效）
// 对齐后端《功能与接口文档》v1.0：异步任务（queued→running→completed）+ SSE 事件流 + TripDetail 结构
import { buildMockDetail } from './mockDetail'

// ---------- 讲解页用的模拟 POI / 讲稿（guide 接口后端待补） ----------
const POIS = [
  { poiId: 'item_d1_01', name: '西湖风景名胜区', type: 'attraction', lng: 120.14751, lat: 30.24537, tags: ['湖景', '平缓'], stayMinutes: 150, intensity: 1, ticket: 0, closedDays: [], accessibility: {} },
  { poiId: 'item_d1_02', name: '湖滨商圈本地菜午餐', type: 'food', lng: 120.16342, lat: 30.25588, tags: ['餐饮'], stayMinutes: 90, intensity: 1, ticket: 0, closedDays: [], accessibility: {} }
]

const GUIDE = {
  item_d1_01: {
    text: '西湖三面环山，一面临市。你脚下的苏堤是北宋苏轼任杭州知州时疏浚西湖、用挖出的葑泥筑成的，后人为纪念他而命名。走完这条 2.8 公里的长堤，正好把西里湖的景致看个遍。',
    audioUrl: '',
    subtitles: [
      { t: 0, text: '西湖三面环山，一面临市' },
      { t: 4200, text: '苏堤是北宋苏轼疏浚西湖时筑成的' },
      { t: 9000, text: '全长 2.8 公里，为纪念苏轼而命名' }
    ]
  }
}

// ---------- 任务内存库 ----------
const trips = new Map() // tripId -> { ...TripSummary 字段, request, error, subscribers, timer, detail }
const idemKeys = new Map() // Idempotency-Key -> tripId

const STAGES = [
  { stage: 'validating', percent: 8, message: '正在校验你的需求' },
  { stage: 'retrieving', percent: 24, message: '正在搜索攻略资料和知识库' },
  { stage: 'generating', percent: 48, message: '正在生成结构化行程' },
  { stage: 'verifying', percent: 62, message: '正在校验时间安排和事实信息' },
  { stage: 'geocoding', percent: 76, message: '正在解析景点坐标' },
  { stage: 'routing', percent: 86, message: '正在规划景点间真实路线' },
  { stage: 'budgeting', percent: 94, message: '正在汇总预算' },
  { stage: 'saving', percent: 100, message: '正在保存结果' }
]

function now() {
  return new Date().toISOString()
}

function summaryOf(t) {
  return {
    id: t.id,
    title: t.title,
    destinationCity: t.request.destinationCity,
    startDate: t.request.startDate,
    days: t.request.days,
    status: t.status,
    stage: t.stage,
    progressPercent: t.progressPercent,
    createdAt: t.createdAt,
    updatedAt: now()
  }
}

function notify(t, event, data) {
  ;(t.subscribers || []).forEach(h => {
    try {
      h({ id: 'evt_' + Math.random().toString(36).slice(2, 8), event, data })
    } catch (e) {
      console.warn('[mock] 订阅者回调异常', e)
    }
  })
}

function advance(t) {
  const next = STAGES.find(s => s.percent > t.progressPercent)
  if (next) {
    t.status = 'running'
    t.stage = next.stage
    t.progressPercent = next.percent
    t.message = next.message
    notify(t, 'progress', { tripId: t.id, status: t.status, stage: t.stage, progressPercent: t.progressPercent, message: t.message, occurredAt: now() })
  }
  if (t.progressPercent >= 100) {
    clearInterval(t.timer)
    t.status = 'completed'
    t.stage = 'saving'
    t.resultAvailable = true
    t.detail = buildMockDetail(t.request)
    notify(t, 'completed', { tripId: t.id, status: 'completed', occurredAt: now() })
    t.subscribers = []
  }
}

function startTask(t) {
  t.status = 'running'
  t.stage = 'validating'
  t.progressPercent = 0
  t.message = '已开始生成'
  // 演示用：1.5 秒推进一个阶段（真实环境要几分钟）
  t.timer = setInterval(() => {
    if (t.status !== 'running') return
    advance(t)
  }, 1500)
}

// ---------- 请求分发 ----------
function mockRequest(path, method, data) {
  method = method || 'GET'

  // 登录：POST /api/v1/auth/wechat-login
  if (path.indexOf('/api/v1/auth/wechat-login') === 0) {
    return delayer(() => ({ accessToken: 'mock_token_' + Date.now(), expiresIn: 7200, user: { id: 'usr_mock_001' } }))
  }

  // 一句话解析（后端待补 /api/v1/parse）：简单关键词提取
  if (path.indexOf('/api/v1/parse') === 0) {
    return delayer(() => parseText(data && data.text))
  }

  // 创建任务：POST /api/v1/trips
  if (path === '/api/v1/trips' && method === 'POST') {
    return delayer(() => {
      const t = {
        id: 'trp_' + Date.now().toString(36),
        title: `${data.destinationCity} ${data.days} 天`,
        request: JSON.parse(JSON.stringify(data)),
        status: 'queued',
        stage: null,
        progressPercent: 0,
        message: '已创建，等待执行',
        error: null,
        resultAvailable: false,
        subscribers: [],
        createdAt: now()
      }
      if (data.extraRequirements && data.extraRequirements.indexOf('触发失败') >= 0) {
        // 测试失败态：特殊需求里写「触发失败」
        t.status = 'failed'
        t.error = { code: 'UPSTREAM_UNAVAILABLE', message: '生成服务暂时不可用，请稍后重试', retryable: true }
      } else {
        setTimeout(() => startTask(t), 600)
      }
      trips.set(t.id, t)
      return { tripId: t.id, status: t.status, statusUrl: `/api/v1/trips/${t.id}/status`, eventsUrl: `/api/v1/trips/${t.id}/events` }
    }, 300)
  }

  // 历史列表：GET /api/v1/trips
  if (path.indexOf('/api/v1/trips?') === 0 || path === '/api/v1/trips') {
    return delayer(() => {
      const items = Array.from(trips.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(summaryOf)
      return { items, nextCursor: null }
    })
  }

  const tripId = (path.match(/\/api\/v1\/trips\/([^/?]+)/) || [])[1]
  const t = trips.get(tripId)

  if (!t) return Promise.reject({ code: 'TRIP_NOT_FOUND', message: '行程不存在或已删除' })

  // 事件流订阅走 subscribe()，不会进这里
  if (path.indexOf('/status') > 0) {
    return delayer(() => ({
      tripId: t.id,
      status: t.status,
      stage: t.stage,
      progressPercent: t.progressPercent,
      message: t.status === 'completed' ? '生成完成' : t.message,
      resultAvailable: !!t.resultAvailable,
      error: t.error,
      updatedAt: now()
    }))
  }
  if (path.indexOf('/cancel') > 0) {
    return delayer(() => {
      if (t.status === 'queued' || t.status === 'running') {
        clearInterval(t.timer)
        t.status = 'canceled'
        notify(t, 'canceled', { tripId: t.id, status: 'canceled', occurredAt: now() })
        t.subscribers = []
      } else if (t.status === 'completed' || t.status === 'failed') {
        return Promise.reject({ code: 'TRIP_NOT_CANCELABLE', message: '当前状态不允许取消' })
      }
      return { tripId: t.id, status: t.status }
    })
  }
  if (method === 'DELETE') {
    return delayer(() => {
      trips.delete(tripId)
      return null
    })
  }
  // 详情：GET /api/v1/trips/{id}，返回 TripDetail 包装层（文档 5.3）
  return delayer(() => {
    if (t.status === 'queued' || t.status === 'running') {
      return Promise.reject({ code: 'TRIP_NOT_READY', message: '结果尚未完成，请先查询状态接口' })
    }
    if (t.status === 'failed') {
      return { id: t.id, title: t.title, status: 'failed', request: t.request, result: null, error: t.error, createdAt: t.createdAt, updatedAt: now() }
    }
    if (t.status === 'canceled') {
      return { id: t.id, title: t.title, status: 'canceled', request: t.request, result: null, error: null, createdAt: t.createdAt, updatedAt: now() }
    }
    return {
      id: t.id,
      title: t.title,
      status: 'completed',
      stage: 'saving',
      progressPercent: 100,
      request: t.request,
      result: t.detail,
      error: null,
      createdAt: t.createdAt,
      updatedAt: now(),
      completedAt: now()
    }
  })
}

// ---------- SSE 订阅模拟 ----------
// 立即补发一条当前进度，之后每个阶段推进时推送（文档 6.3：重连可从当前状态恢复）
function mockSubscribe(path, handlers) {
  const tripId = (path.match(/\/api\/v1\/trips\/([^/?]+)/) || [])[1]
  const t = trips.get(tripId)
  if (!t) {
    handlers.onError && handlers.onError({ code: 'TRIP_NOT_FOUND', message: '行程不存在或已删除' })
    return { abort() {} }
  }

  const handler = ev => handlers.onEvent && handlers.onEvent(ev)
  t.subscribers = t.subscribers || []
  t.subscribers.push(handler)

  // 已在终态：直接补发对应事件
  if (t.status === 'completed') {
    setTimeout(() => handler({ id: 'evt_done', event: 'completed', data: { tripId: t.id, status: 'completed', occurredAt: now() } }), 100)
  } else if (t.status === 'failed') {
    setTimeout(() => handler({ id: 'evt_fail', event: 'failed', data: { tripId: t.id, status: 'failed', error: t.error, occurredAt: now() } }), 100)
  } else if (t.status === 'canceled') {
    setTimeout(() => handler({ id: 'evt_cancel', event: 'canceled', data: { tripId: t.id, status: 'canceled', occurredAt: now() } }), 100)
  } else {
    setTimeout(() => notify(t, 'progress', { tripId: t.id, status: t.status, stage: t.stage, progressPercent: t.progressPercent, message: t.message, occurredAt: now() }), 100)
  }

  return {
    abort() {
      t.subscribers = (t.subscribers || []).filter(h => h !== handler)
    }
  }
}

// ---------- AI 追问流式模拟（chat 页用，后端待补 /api/ask） ----------
function streamAsk(handlers) {
  const answer =
    '西湖的苏堤全长 2.8 公里，是北宋元祐年间苏轼任杭州知州时疏浚西湖、用挖出的葑泥堆筑而成的。' +
    '堤上六桥依次是映波、锁澜、望山、压堤、东浦、跨虹，晨雾或雨后走堤最有味道。'
  let i = 0
  let aborted = false
  const timer = setInterval(() => {
    if (aborted) return
    const piece = answer.slice(i, i + 3 + Math.floor(Math.random() * 4))
    i += piece.length
    if (handlers.onDelta) handlers.onDelta(piece)
    if (i >= answer.length) {
      clearInterval(timer)
      if (handlers.onDone) {
        handlers.onDone({
          answer,
          sources: [{ sourceId: 'src_01', title: '西湖风景名胜区游览信息', url: 'https://example.com/hangzhou-west-lake' }],
          outOfScope: false
        })
      }
    }
  }, 55)
  return { abort() { aborted = true; clearInterval(timer) } }
}

// ---------- 一句话解析（关键词提取，真实环境由大模型做） ----------
function parseText(text) {
  text = text || ''
  const cities = ['杭州', '北京', '苏州', '南京', '西安', '成都', '广州', '厦门']
  const city = cities.find(c => text.indexOf(c) >= 0) || '杭州'
  // 天数：支持中文数字（玩四天/两天）和阿拉伯数字（玩4天）
  const dayMatch = text.match(/([一二两三四五六七八九十\d]{1,3})\s*天/)
  const days = dayMatch ? Math.min(15, Math.max(1, cnNum(dayMatch[1]) || 2)) : 2
  const prefs = []
  if (/古|历史|人文|寺|博物馆/.test(text)) prefs.push('culture')
  if (/吃|美食|菜|小吃/.test(text)) prefs.push('food')
  if (/自然|湖|山|湿地|公园/.test(text)) prefs.push('nature')
  if (/娃|小孩|亲子|儿童/.test(text)) prefs.push('family')
  if (/拍|打卡|照片/.test(text)) prefs.push('photography')
  const seniors = /父母|老人|长辈|爷爷|奶奶|腿脚/.test(text) ? 2 : 0
  return {
    destinationCity: city,
    startDate: parseDateFromText(text),
    days,
    travelers: { adults: seniors ? 2 : 1, children: 0, seniors },
    preferences: prefs.length ? prefs : ['culture'],
    energyLevel: /老人|父母|长辈|腿脚|轻松|不赶/.test(text) ? 'easy' : 'medium',
    transportModes: ['transit', 'walking'],
    budgetCny: parseBudgetFromText(text),
    extraRequirements: ''
  }
}

// ---------- 从一句话里提取预算（预算2000 / 预算两千左右 / 2000元以内） ----------
function cnAmount(s) {
  // 中文金额：支持 两千 / 三千五 / 两千五百 等组合
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s)
  let n = 0
  const qian = s.split('千')
  if (qian.length > 1) { n += (qian[0] ? cnNum(qian[0]) : 1) * 1000; s = qian[1] || '' }
  const bai = s.split('百')
  if (bai.length > 1) { n += (bai[0] ? cnNum(bai[0]) : 1) * 100; s = bai[1] || '' }
  if (s) n += cnNum(s)
  return n
}
function parseBudgetFromText(text) {
  if (!text) return 0
  const num = '[一二两三四五六七八九十百千\\d]+(?:\\.\\d+)?'
  // 优先"预算/花费 + 数字"：预算2000、预算两千左右、花费1500元
  let m = text.match(new RegExp('(?:预算|花费|控制在?)\\s*(' + num + ')\\s*(?:元|块|左右|以内|之内|上下)*'))
  if (m) return Math.round(cnAmount(m[1]))
  // 次选"数字 + 元/块"：2000元以内、大概1500块
  m = text.match(new RegExp('(' + num + ')\\s*(?:元|块)\\s*(?:以内|左右|之内)?'))
  if (m) return Math.round(cnAmount(m[1]))
  return 0
}

// ---------- 从一句话里提取出发日期（真实环境由大模型解析，这里做关键词/正则提取） ----------
const CN_DIGIT = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
function cnNum(s) {
  // 中文数字 1~31：一、十、十二、二十、二十三…
  if (/^\d+$/.test(s)) return parseInt(s, 10)
  if (s === '十') return 10
  const i = s.indexOf('十')
  if (i < 0) return CN_DIGIT[s] || 0
  const tens = i === 0 ? 1 : (CN_DIGIT[s[0]] || 0)
  const ones = s.length > i + 1 ? (CN_DIGIT[s[i + 1]] || 0) : 0
  return tens * 10 + ones
}
function pad2(n) { return n < 10 ? '0' + n : '' + n }
function todayStr() {
  const d = new Date() // 本地时区，避免 UTC 偏一天
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}
function fmtDate(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d) }
function addDaysLocal(baseStr, n) {
  const p = baseStr.split('-').map(Number)
  const d = new Date(p[0], p[1] - 1, p[2])
  d.setDate(d.getDate() + n)
  return fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}
// 月/日确定后选年份：今年这一天还没过就用今年，过了自动顺延一年
function smartYear(m, d) {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= 31)) return ''
  const y = new Date().getFullYear()
  const candidate = fmtDate(y, m, d)
  return candidate >= todayStr() ? candidate : fmtDate(y + 1, m, d)
}
function parseDateFromText(text) {
  if (!text) return ''
  // 2026-10-01 / 2026年10月1日 / 2026.10.1 / 2026/10/1
  const iso = text.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*[日号]?/)
  if (iso) return smartYear(parseInt(iso[2], 10), parseInt(iso[3], 10))
  // 9月17日 / 9月17号 / 九月十七号 / 09月17 (允许省略"日")
  const md = text.match(/([一二两三四五六七八九十\d]{1,3})\s*月\s*([一二两三四五六七八九十\d]{1,3})\s*[日号]?/)
  if (md) {
    const m = cnNum(md[1]); const d = cnNum(md[2])
    if (m && d) return smartYear(m, d)
  }
  // 相对日期
  if (/大后天/.test(text)) return addDaysLocal(todayStr(), 3)
  if (/后天/.test(text)) return addDaysLocal(todayStr(), 2)
  if (/明天/.test(text)) return addDaysLocal(todayStr(), 1)
  if (/今天|今晚/.test(text)) return todayStr()
  // 周末 → 最近的一个周六（今天是周六就算今天）
  if (/周末|周六|星期六|礼拜六/.test(text)) {
    const diff = (6 - new Date().getDay() + 7) % 7
    return addDaysLocal(todayStr(), diff)
  }
  return ''
}

function delayer(fn, ms) {
  return new Promise(resolve => setTimeout(() => resolve(fn()), ms || 200))
}

export { mockRequest as request, mockSubscribe as subscribe, streamAsk, POIS, GUIDE }
