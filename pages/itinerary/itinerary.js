const api = require('../../services/api')

Page({
  data: {
    plan: null,
    markers: [],
    mapCenter: { latitude: 23.5, longitude: 113.6 },
    activeDay: 0,
    reviseText: '',
    reviseHint: '',
    revising: false
  },

  onLoad() {
    const plan = getApp().globalData.currentItinerary || wx.getStorageSync('itinerary')
    if (!plan) {
      wx.showToast({ title: '还没有行程，先去规划', icon: 'none' })
      return
    }
    this.renderPlan(plan)
    api.event.report([{ type: 'share', payload: { itineraryId: plan.itineraryId } }])
  },

  renderPlan(plan) {
    const day = plan.days[this.data.activeDay] || plan.days[0]
    const markers = (day.slots || [])
      .filter(s => s.lng && s.lat)
      .map((s, i) => ({
        id: i,
        latitude: s.lat,
        longitude: s.lng,
        width: 24,
        height: 24,
        callout: { content: `${i + 1} ${s.name}`, padding: 6, borderRadius: 6, display: 'ALWAYS' }
      }))

    this.setData({
      plan,
      markers,
      activeDay: day.day - 1,
      mapCenter: markers.length ? { latitude: markers[0].latitude, longitude: markers[0].longitude } : { latitude: 23.5, longitude: 113.6 }
    })
  },

  switchDay(e) {
    this.setData({ activeDay: Number(e.currentTarget.dataset.index) })
    this.renderPlan(this.data.plan)
  },

  onReviseInput(e) {
    this.setData({ reviseText: e.detail.value })
  },

  // 对话式重排：高光①
  revise() {
    const instruction = (this.data.reviseText || '').trim()
    if (!instruction || this.data.revising) return

    this.setData({ revising: true, reviseHint: '正在重排…' })
    let buffer = ''
    api.itinerary.revise({
      itineraryId: this.data.plan.itineraryId,
      instruction,
      current: { days: this.data.plan.days }
    }, {
      onDelta: text => { buffer += text },
      onDone: data => {
        const merged = { ...this.data.plan, days: data.days }
        wx.setStorageSync('itinerary', merged)
        getApp().globalData.currentItinerary = merged
        this.setData({ revising: false, reviseText: '', reviseHint: buffer || data.changeLog })
        this.renderPlan(merged)
      },
      onError: err => this.setData({ revising: false, reviseHint: '重排失败：' + (err.message || err.code) })
    })
  },

  // 走到景点 → 打开讲解
  openGuide(e) {
    const poiId = e.currentTarget.dataset.poi
    wx.navigateTo({ url: `/pages/guide/guide?poiId=${poiId}` })
  }
})
