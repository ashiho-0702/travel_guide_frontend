// 本地模拟：后端没就绪时前端照常开发
// 是否走这里由 src/utils/config.js 的 MOCK（按模块）决定，未配置的模块回落到 USE_MOCK
// 当前已连真实后端的模块：auth（登录）、trips（攻略）；仍走 mock：parse / poi / guide / event / ask
// 对齐后端《微信小程序接口文档》攻略模块（2026-09-19）：
//   POST /api/trip/generate（同步一次性返回 { tripId, result }）
//   GET /api/trip/{id} · GET /api/trip/list（简单数组）· DELETE /api/trip/{id}
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

// ---------- 行程内存库 ----------
const trips = new Map() // id -> { ...详情字段, detail }
let nextId = 1

function now() {
  return new Date().toISOString()
}

// 预算自由文本 → 数字（"3000" / "3000元左右" / "三千" 都能取到 3000）
function budgetToNumber(text) {
  if (!text) return 0
  const m = String(text).match(/\d+(?:\.\d+)?/)
  return m ? parseFloat(m[0]) : 0
}

// 把新契约请求体规范成 mock 内部结构
function normalizeRequest(data) {
  data = data || {}
  return {
    destinationCity: data.city,
    startDate: data.startDate,
    days: data.days,
    peopleCount: data.peopleCount || 1,
    budgetText: data.budget || '',
    budgetCny: budgetToNumber(data.budget),
    preferences: data.preferences || [],
    energyLevel: data.energyLevel || 'medium',
    transportModes: data.transportation || ['transit'],
    extraRequirements: data.extraRequirements || ''
  }
}

function detailResponse(t) {
  const r = t.request
  return {
    id: t.id,
    city: r.destinationCity,
    startDate: r.startDate,
    days: r.days,
    peopleCount: r.peopleCount,
    preferences: r.preferences.join(','),
    budget: r.budgetText,
    energyLevel: r.energyLevel,
    transportation: r.transportModes.join(','),
    extraRequirements: r.extraRequirements,
    status: 'done',
    result: t.detail,
    createdAt: t.createdAt
  }
}

// ---------- 请求分发（mock 返回的已经是拆包后的 data，api 层不再包装） ----------
function mockRequest(path, method, data) {
  method = method || 'GET'

  // 登录：POST /api/auth/login（公开，body: { code }）
  // 严格对齐后端文档 2026-09-20 的返回结构（含 nickname/avatarUrl 为 null 的真实情形）
  if (path.indexOf('/api/auth/login') === 0) {
    if (!data || !data.code) {
      return delayer(() => { throw { code: 400, message: '缺少 code' } })
    }
    return delayer(() => ({
      token: 'mock_token_' + Date.now(),
      user: {
        id: 1,
        openid: 'mock_openid_001',
        nickname: null,
        avatarUrl: null
      }
    }))
  }

  // 一句话解析（前端创新点，后端待补 /api/parse）：关键词提取
  if (path.indexOf('/api/parse') === 0) {
    return delayer(() => parseText(data && data.text))
  }

  // POI / 讲解（后端待补）
  if (path.indexOf('/api/poi/list') === 0) {
    return delayer(() => POIS)
  }
  if (path.indexOf('/api/guide') === 0) {
    const poiId = (path.match(/[?&]poiId=([^&]+)/) || [])[1]
    return delayer(() => GUIDE[poiId] || { text: '这个景点的讲解内容准备中。', audioUrl: '', subtitles: [] })
  }

  // 埋点上报（后端待补）：本地直接吞掉，返回空体
  if (path.indexOf('/api/event') === 0) {
    return delayer(() => null, 0)
  }

  // 生成攻略：POST /api/trip/generate（同步，一次性返回）
  if (path === '/api/trip/generate' && method === 'POST') {
    return delayer(() => {
      const req = normalizeRequest(data)
      if (!req.destinationCity) {
        return Promise.reject({ code: 400, message: '城市为空' })
      }
      if (!(req.days >= 1 && req.days <= 15)) {
        return Promise.reject({ code: 400, message: '天数须为 1–15' })
      }
      // 测试失败态：其他需求里写「触发失败」
      if (req.extraRequirements.indexOf('触发失败') >= 0) {
        return Promise.reject({ code: 502, message: 'AI 服务暂时不可用，请稍后重试' })
      }
      const t = {
        id: nextId++,
        title: `${req.destinationCity} ${req.days}天`,
        request: req,
        detail: buildMockDetail(req),
        createdAt: now()
      }
      trips.set(t.id, t)
      return { tripId: t.id, result: t.detail }
    }, 2500) // 模拟 AI 生成耗时
  }

  // 历史列表：GET /api/trip/list（简单数组）
  if (path === '/api/trip/list') {
    return delayer(() =>
      Array.from(trips.values())
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map(t => ({ id: t.id, title: t.title, createdAt: t.createdAt }))
    )
  }

  // 详情 / 删除：/api/trip/{id}
  const tripId = Number((path.match(/\/api\/trip\/([^/?]+)/) || [])[1])
  const t = trips.get(tripId)
  if (!t) return Promise.reject({ code: 404, message: '行程不存在' })

  if (method === 'DELETE') {
    return delayer(() => {
      trips.delete(tripId)
      return null
    })
  }
  return delayer(() => detailResponse(t))
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

// ---------- 生成攻略（流式 mock）：模拟后端 SSE 事件节奏，行为与真实接口对齐 ----------
// 协议（2026-09-20）：step=进度文案 · token=JSON 文本片段 · done={tripId} · error=错误信息
// 与真实接口同契约：resolve({ tripId })；进度经 handlers.onStep、逐字文本经 handlers.onToken 送达
function streamGenerate(payload, handlers) {
  const steps = [
    '正在理解你的需求…',
    '正在搜索：景点与开放时间',
    '正在搜索：本地美食推荐',
    '正在规划每日行程路线',
    '正在核算交通与预算…'
  ]
  return new Promise((resolve, reject) => {
    let i = 0
    // 先同步生成好行程数据（不通知页面），再按事件节奏演出：step → token 逐字 → done
    mockRequest('/api/trip/generate', 'POST', payload || {})
      .then(d => {
        const text = JSON.stringify(d.result, null, 1)
        let pos = 0
        const timer = setInterval(() => {
          if (i < steps.length) {
            if (handlers.onStep) handlers.onStep(steps[i++])
            return
          }
          if (pos < text.length) {
            // 每帧吐 8~20 个字符，模拟大模型逐字输出
            const n = 8 + Math.floor(Math.random() * 12)
            if (handlers.onToken) handlers.onToken(text.slice(pos, pos + n))
            pos += n
            return
          }
          clearInterval(timer)
          resolve({ tripId: d.tripId })
        }, 60)
      })
      .catch(e => reject(e))
  })
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
  if (/夜|夜景|酒吧/.test(text)) prefs.push('nightlife')
  if (/乐园|游乐/.test(text)) prefs.push('theme_park')
  const seniors = /父母|老人|长辈|爷爷|奶奶|腿脚/.test(text) ? 2 : 0
  return {
    city,
    startDate: parseDateFromText(text),
    days,
    peopleCount: seniors ? 3 : 1,
    preferences: prefs.length ? prefs : ['culture'],
    energyLevel: /老人|父母|长辈|腿脚|轻松|不赶/.test(text) ? 'easy' : 'medium',
    transportation: ['transit', 'walking'],
    budget: parseBudgetFromText(text) ? String(parseBudgetFromText(text)) : '',
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
  // fn 抛错时转为 reject，让 mock 的失败形态与真实接口一致（页面 catch 逻辑得以验证）
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try { resolve(fn()) } catch (e) { reject(e) }
    }, ms || 200)
  })
}

export { mockRequest as request, streamAsk, streamGenerate, POIS, GUIDE }
