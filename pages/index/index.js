const api = require('../../services/api')
const position = require('../../utils/position')

Page({
  data: {
    input: '周末两天，带 60 岁父母，不想爬坡，喜欢古建筑',
    answer: '',
    status: '',
    loading: false
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  // 一句话生成行程（高光①的前半段）
  generate() {
    const query = (this.data.input || '').trim()
    if (!query || this.data.loading) return

    this.setData({ loading: true, answer: '', status: '正在理解你的需求…' })
    api.event.report([{ type: 'generate', payload: { query } }])

    position.getPosition().then(pos => {
      let buffer = ''
      this.task = api.itinerary.generate({ query, position: { lng: pos.lng, lat: pos.lat } }, {
        onMeta: data => this.setData({ status: '已理解：' + JSON.stringify(data) }),
        // 注意：高频 setData 会卡，这里每积累一段再刷新（简单节流）
        onDelta: text => {
          buffer += text
          if (buffer.length >= 8) {
            this.setData({ answer: this.data.answer + buffer })
            buffer = ''
          }
        },
        onDone: data => {
          if (buffer) this.setData({ answer: this.data.answer + buffer })
          wx.setStorageSync('itinerary', data)
          getApp().globalData.currentItinerary = data
          this.setData({ loading: false, status: '生成完成，正在进入行程页…' })
          setTimeout(() => wx.navigateTo({ url: '/pages/itinerary/itinerary' }), 600)
        },
        onError: err => {
          this.setData({
            loading: false,
            status: 'AI 暂时不可用（' + (err.message || err.code) + '），已切换预置行程'
          })
          // 兜底：直接用预置行程，保证演示能走下去
          const fallback = { itineraryId: 'it_fallback', days: require('../../services/mock').buildDays(false), summary: '预置兜底行程' }
          wx.setStorageSync('itinerary', fallback)
        }
      })
    })
  },

  onUnload() {
    this.task && this.task.abort()
  }
})
