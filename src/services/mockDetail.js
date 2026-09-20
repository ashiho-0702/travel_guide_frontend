// 模拟 TripDetail 生成器：按请求拼出符合后端 v1.0 第 5.3 章结构的完整结果
// 纯 mock 数据，字段口径以后端文档为准

const DAY_TEMPLATES = [
  {
    title: '西湖经典人文线',
    theme: '湖景与历史人文',
    summary: '从湖滨出发，公交与短距离步行为主，节奏平缓。',
    note: '午后预留休息时间；节假日可缩短湖边步行路段。',
    items: [
      { type: 'attraction', startTime: '09:00', endTime: '11:30', name: '西湖风景名胜区', address: '浙江省杭州市西湖区龙井路1号', reason: '代表性景观，适合以较缓节奏游览湖滨区域。', tips: '节假日客流较大，建议避开断桥最拥挤时段。', estimatedCostCny: 0, location: { lat: 30.24537, lng: 120.14751 }, sourceIds: ['src_01', 'src_02'] },
      { type: 'food', startTime: '12:00', endTime: '13:30', name: '湖滨商圈本地菜午餐', address: '浙江省杭州市上城区湖滨街道', reason: '靠近上午行程，减少往返距离。', tips: '点餐前向店员确认配料和交叉接触风险。', estimatedCostCny: 320, location: { lat: 30.25588, lng: 120.16342 }, sourceIds: ['src_03'] },
      { type: 'attraction', startTime: '14:30', endTime: '16:30', name: '中国茶叶博物馆', address: '浙江省杭州市西湖区龙井路88号', reason: '室内场馆，午后避晒，适合慢节奏参观。', tips: '周一闭馆，出行前确认开放时间。', estimatedCostCny: 0, location: { lat: 30.22692, lng: 120.12493 }, sourceIds: ['src_04'] }
    ]
  },
  {
    title: '灵隐与运河慢游线',
    theme: '寺院与城市文化',
    summary: '上午灵隐区域，午后运河街区，室内外搭配。',
    note: '灵隐入口排队较长，预留安检时间；下午保留机动时间。',
    items: [
      { type: 'attraction', startTime: '09:00', endTime: '11:00', name: '灵隐寺景区', address: '浙江省杭州市西湖区法云弄1号', reason: '代表性人文景点，上午游览体感较舒适。', tips: '节假日入口排队时间较长，预留安检和步行时间。', estimatedCostCny: 300, location: { lat: 30.24062, lng: 120.10284 }, sourceIds: ['src_05'] },
      { type: 'food', startTime: '12:00', endTime: '13:30', name: '桥西历史街区午餐', address: '浙江省杭州市拱墅区桥弄街', reason: '与下午行程相邻，减少交通消耗。', tips: '热门餐厅可能排队，优先可提前取号的门店。', estimatedCostCny: 360, location: { lat: 30.32086, lng: 120.13871 }, sourceIds: ['src_06'] },
      { type: 'attraction', startTime: '14:30', endTime: '16:30', name: '京杭大运河杭州段', address: '浙江省杭州市拱墅区运河沿线', reason: '了解城市发展与运河文化，游览强度低。', tips: '沿河步道较长，可根据体力缩短步行范围。', estimatedCostCny: 0, location: { lat: 30.31964, lng: 120.14192 }, sourceIds: ['src_06'] }
    ]
  }
]

const SOURCES = [
  { sourceId: 'src_01', title: '西湖风景名胜区游览信息', url: 'https://example.com/hangzhou-west-lake', site: '示例官方文旅站', publishedAt: '2026-08-20T09:00:00+08:00', retrievedAt: '2026-09-17T10:30:20+08:00', usedFor: ['opening_hours', 'visit_tips'] },
  { sourceId: 'src_02', title: '西湖公共交通提示', url: 'https://example.com/hangzhou-transport', site: '示例交通信息站', publishedAt: null, retrievedAt: '2026-09-17T10:30:25+08:00', usedFor: ['transport'] },
  { sourceId: 'src_03', title: '湖滨餐饮区域信息', url: 'https://example.com/hubin-food', site: '示例公开内容站', publishedAt: '2026-09-01T12:00:00+08:00', retrievedAt: '2026-09-17T10:30:28+08:00', usedFor: ['food'] },
  { sourceId: 'src_04', title: '中国茶叶博物馆开放信息', url: 'https://example.com/tea-museum', site: '示例官方文旅站', publishedAt: '2026-08-12T09:00:00+08:00', retrievedAt: '2026-09-17T10:30:30+08:00', usedFor: ['opening_hours', 'tickets'] },
  { sourceId: 'src_05', title: '灵隐寺景区游览信息', url: 'https://example.com/lingyin', site: '示例官方文旅站', publishedAt: '2026-08-15T09:00:00+08:00', retrievedAt: '2026-09-17T10:30:32+08:00', usedFor: ['opening_hours', 'tickets', 'visit_tips'] },
  { sourceId: 'src_06', title: '京杭大运河杭州段公共信息', url: 'https://example.com/hangzhou-grand-canal', site: '示例官方文旅站', publishedAt: '2026-08-22T09:00:00+08:00', retrievedAt: '2026-09-17T10:30:34+08:00', usedFor: ['visit_tips', 'food'] }
]

function addDays(dateStr, n) {
  // 用本地时区构造日期，避免 toISOString 按 UTC 取值导致日期早一天
  const parts = dateStr.split('-').map(Number)
  const d = new Date(parts[0], parts[1] - 1, parts[2] + n)
  const p = x => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function transitModeOf(request) {
  return (request.transportModes && request.transportModes[0]) || 'transit'
}

export function buildMockDetail(request) {
  const days = []
  // 预算：mock 内部统一为数字（budgetCny，来自自由文本 budget 的提取）
  const hasBudget = typeof request.budgetCny === 'number' && request.budgetCny > 0

  // 第一遍：按模板原价累计总费用
  let rawTotal = 0
  for (let i = 0; i < request.days; i++) {
    const tpl = DAY_TEMPLATES[i % DAY_TEMPLATES.length]
    rawTotal += tpl.items.reduce((sum, it) => sum + it.estimatedCostCny, 0)
  }
  // 用户给了预算且原价超支：按比例压缩各项费用（门票免费项保持 0），让方案贴合预算
  const factor = hasBudget && rawTotal > request.budgetCny ? request.budgetCny / rawTotal : 1

  let totalCost = 0
  for (let i = 0; i < request.days; i++) {
    const tpl = DAY_TEMPLATES[i % DAY_TEMPLATES.length]
    const items = tpl.items.map((it, idx) => ({
      itemId: `item_d${i + 1}_0${idx + 1}`,
      type: it.type,
      startTime: it.startTime,
      endTime: it.endTime,
      name: it.name,
      address: it.address,
      reason: it.reason,
      tips: it.tips,
      estimatedCostCny: Math.round(it.estimatedCostCny * factor),
      locationStatus: 'resolved',
      location: { lat: it.location.lat, lng: it.location.lng },
      sourceIds: it.sourceIds
    }))

    // 相邻可定位项之间生成路线段（真实环境由腾讯位置服务规划）
    const routeSegments = []
    for (let s = 0; s < items.length - 1; s++) {
      const a = items[s].location
      const b = items[s + 1].location
      routeSegments.push({
        segmentId: `route_d${i + 1}_0${s + 1}`,
        fromItemId: items[s].itemId,
        toItemId: items[s + 1].itemId,
        mode: transitModeOf(request),
        status: 'available',
        distanceMeters: 1500 + s * 800,
        durationMinutes: 15 + s * 8,
        path: [a, { lat: (a.lat + b.lat) / 2 + 0.002, lng: (a.lng + b.lng) / 2 }, b].map(p => ({ lat: p.lat, lng: p.lng }))
      })
    }

    const dayCost = items.reduce((sum, it) => sum + it.estimatedCostCny, 0)
    totalCost += dayCost
    days.push({
      dayNumber: i + 1,
      date: addDays(request.startDate, i),
      title: tpl.title,
      theme: tpl.theme,
      summary: tpl.summary,
      estimatedCostCny: dayCost,
      items,
      routeSegments,
      note: tpl.note
    })
  }

  return {
    destination: { city: request.destinationCity, province: request.destinationCity === '杭州' ? '浙江省' : '' },
    coordinateSystem: 'GCJ-02',
    overview: `为你安排了 ${request.destinationCity} ${request.days} 天行程，已按「${request.energyLevel}」体力档位控制每日节奏。` +
      (hasBudget && factor < 1 ? `已按预算 ${request.budgetCny} 元压缩各项开支。` : ''),
    generatedAt: new Date().toISOString(),
    budgetSummary: {
      currency: 'CNY',
      inputTotal: hasBudget ? request.budgetCny : null,
      estimatedTotal: totalCost,
      difference: hasBudget ? request.budgetCny - totalCost : null,
      status: hasBudget ? (totalCost <= request.budgetCny ? 'within' : 'over') : 'unknown',
      isEstimate: true,
      categories: [
        { category: 'accommodation', label: '住宿', amount: Math.round(totalCost * 0.42) },
        { category: 'food', label: '餐饮', amount: Math.round(totalCost * 0.26) },
        { category: 'tickets', label: '门票', amount: Math.round(totalCost * 0.12) },
        { category: 'local_transport', label: '市内交通', amount: Math.round(totalCost * 0.12) },
        { category: 'other', label: '其他', amount: Math.round(totalCost * 0.08) }
      ],
      disclaimer: '费用为生成时估算，不含往返大交通，实际价格以现场和官方渠道为准。'
    },
    days,
    tips: ['节假日优先使用公共交通。', '出发前请通过官方渠道复核开放时间与票价。'],
    sources: SOURCES,
    warnings: [
      { code: 'TIME_SENSITIVE_INFO', message: '开放时间、票价和交通信息可能变化，请出发前通过官方渠道复核。', relatedItemIds: [] }
    ]
  }
}
