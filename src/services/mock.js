// 本地模拟数据：后端没就绪时前端照常开发（config.USE_MOCK = true 时生效）
// 数据字段与《前后端接口契约 v1》第 3 章表结构保持一致（纯 JS，从原生版原样迁移）

const POIS = [
  { poiId: '01', name: '景区主入口', type: 'entrance', lng: 113.6, lat: 23.5, tags: ['入口', '平缓'], stayMinutes: 5, intensity: 1, ticket: 0, closedDays: [], accessibility: { steps: 0 } },
  { poiId: '02', name: '湖滨栈道', type: 'viewpoint', lng: 113.605, lat: 23.502, tags: ['湖畔', '全程无台阶'], stayMinutes: 25, intensity: 1, ticket: 0, closedDays: [], accessibility: { steps: 0, ramp: true } },
  { poiId: '03', name: '森林康养径', type: 'scenic', lng: 113.612, lat: 23.506, tags: ['康养', '负氧离子'], stayMinutes: 40, intensity: 2, ticket: 0, closedDays: [], accessibility: { steps: 0, ramp: true } },
  { poiId: '04', name: '观景亭', type: 'rest', lng: 113.618, lat: 23.51, tags: ['休息', '座椅'], stayMinutes: 15, intensity: 1, ticket: 0, closedDays: [], accessibility: { steps: 6, handrail: 'double' } },
  { poiId: '05', name: '岭南古亭', type: 'scenic', lng: 113.624, lat: 23.514, tags: ['古建筑', '碑刻'], stayMinutes: 30, intensity: 2, ticket: 10, closedDays: [1], accessibility: { steps: 3 } },
  { poiId: '06', name: '游客中心', type: 'service', lng: 113.6, lat: 23.5, tags: ['服务', 'AED', '轮椅租借'], stayMinutes: 10, intensity: 1, ticket: 0, closedDays: [], accessibility: { steps: 0, wheelchair: true } }
]

const GUIDE = {
  '05': {
    text: '这座凉亭建于清光绪年间，是当年村民进山歇脚之处。梁架采用抬梁式，木构件之间全靠榫卯咬合，没有使用一根铁钉。亭内的石碑记录了三次重修，最近一次在 1987 年。',
    audioUrl: '',
    subtitles: [
      { t: 0, text: '这座凉亭建于清光绪年间' },
      { t: 4200, text: '是当年村民进山歇脚之处' },
      { t: 9000, text: '梁架采用抬梁式，全靠榫卯咬合' }
    ]
  }
}

const PLAN_TEXT =
  '为你安排了 2 天行程，以平缓主径为主，全程避开台阶。\n\n' +
  '第一天上午从景区主入口进入，先走湖滨栈道热身，这段路全程无台阶、有扶手，适合长辈慢慢走；' +
  '中午在游客中心附近的餐厅用餐并休息 40 分钟，避开正午日晒。\n\n' +
  '第二天沿森林康养径慢行，中途在观景亭休息两次，下午到岭南古亭，这段有 3 级台阶，' +
  '可绕行东侧无障碍通道。整体单日步行约 2.8 公里，无连续爬升。'

function delayer(fn, ms) {
  return new Promise(resolve => setTimeout(() => resolve(fn()), ms || 200))
}

function mockRequest(path) {
  if (path.indexOf('/api/poi/list') === 0) return delayer(() => POIS)
  if (path.indexOf('/api/guide') === 0) {
    const poiId = (path.match(/poiId=([^&]+)/) || [])[1] || '05'
    return delayer(() => GUIDE[poiId] || GUIDE['05'])
  }
  if (path.indexOf('/api/dashboard') === 0) {
    return delayer(() => ({
      heat: [{ poiId: '02', name: '湖滨栈道', visits: 128 }, { poiId: '05', name: '岭南古亭', visits: 76 }],
      profile: [{ theme: '亲子', count: 34 }, { theme: '银发', count: 21 }],
      guide: { finishRate: 0.68, askRate: 0.24 },
      service: { generateSuccessRate: 0.97, avgReviseMs: 2400 }
    }))
  }
  return delayer(() => ({}))
}

// 把一段完整文本按小块"流"出去，模拟后端 SSE
function streamText(full, handlers, doneData, tag) {
  let i = 0
  let aborted = false
  if (handlers.onMeta && tag === 'generate') {
    handlers.onMeta({ days: 2, people: 3, interests: ['古建筑'], stamina: 2 })
  }
  const timer = setInterval(() => {
    if (aborted) return
    const step = 3 + Math.floor(Math.random() * 4)
    const piece = full.slice(i, i + step)
    i += step
    if (handlers.onDelta) handlers.onDelta(piece)
    if (i >= full.length) {
      clearInterval(timer)
      const payload = typeof doneData === 'function' ? doneData() : doneData
      if (handlers.onDone) handlers.onDone(payload)
    }
  }, 55)
  return { abort() { aborted = true; clearInterval(timer) } }
}

function mockStream(path, data, handlers) {
  if (path.indexOf('/api/ask') === 0) {
    const answer =
      '榫卯依靠木材自身的咬合来受力：凸出的"榫"插进凹进的"卯"里，地震时能轻微错动卸力，所以不需要铁钉。' +
      '铁钉在潮湿环境下容易锈蚀，反而会撑裂木料。'
    return streamText(answer, handlers, {
      answer,
      sources: [{ cardId: 'k_05_03', title: '建筑结构·榫卯工艺', origin: '《岭南古建筑营造》' }],
      outOfScope: false
    }, 'ask')
  }

  if (path.indexOf('/api/itinerary/revise') === 0) {
    const text = '已按"同行的人腿脚不方便"重排：第二天减少 1 个点位，绕过 3 级台阶的东侧通道，增加 2 处休息点，单日步行降至 2.2 公里。'
    return streamText(text, handlers, () => ({
      itineraryId: 'it_mock_002',
      days: buildDays(true),
      changeLog: '第二天景点由 4 个减为 3 个，避开台阶段，增加 2 处休息点'
    }), 'revise')
  }

  // 默认走行程生成
  return streamText(PLAN_TEXT, handlers, () => ({
    itineraryId: 'it_mock_001',
    parsedIntent: { days: 2, themes: ['古建筑'], avoid: ['台阶'], stamina: 2 },
    days: buildDays(false),
    summary: '两天行程以平缓主径为主，全程避开台阶'
  }), 'generate')
}

function buildDays(accessible) {
  const pick = ids => ids.map(id => POIS.find(p => p.poiId === id))
  const day1 = pick(['01', '02', '06'])
  const day2 = accessible ? pick(['03', '04']) : pick(['03', '04', '05'])

  const toSlots = (list, accessible) =>
    list.map((p, idx) => ({
      start: ['08:30', '10:00', '12:00', '14:00', '15:30'][idx] || '16:00',
      end: ['09:00', '10:40', '13:00', '15:00', '16:00'][idx] || '16:30',
      type: p.type === 'service' ? 'meal' : 'visit',
      poiId: p.poiId,
      name: p.name,
      lng: p.lng,
      lat: p.lat,
      reason: accessible && p.poiId === '05' ? '已替换为无台阶东侧通道' : '与你的偏好匹配，步行强度低'
    }))

  return [
    { day: 1, date: '2026-09-20', walkDistance: 2800, climbMeters: 0, slots: toSlots(day1, accessible) },
    { day: 2, date: '2026-09-21', walkDistance: accessible ? 2200 : 3100, climbMeters: accessible ? 0 : 15, slots: toSlots(day2, accessible) }
  ]
}

export { mockRequest as request, mockStream as stream, POIS, buildDays }
