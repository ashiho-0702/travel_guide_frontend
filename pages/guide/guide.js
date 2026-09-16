const api = require('../../services/api')

Page({
  data: {
    pois: [],
    current: null,       // 当前讲解的 POI
    guide: null,         // 讲稿 + 字幕
    subtitle: '',        // 当前显示的字幕
    playing: false,
    duration: '2m',
    durations: ['30s', '2m', '5m'],
    style: 'standard',
    loading: false
  },

  onLoad(options) {
    api.poi.list().then(list => {
      this.setData({ pois: list })
      // 从行程页点进来时直接播这个点位的讲解
      if (options && options.poiId) this.play({ currentTarget: { dataset: { poi: options.poiId } } })
    })
  },

  chooseDuration(e) {
    this.setData({ duration: e.currentTarget.dataset.value })
    if (this.data.current) this.loadGuide()
  },

  // 讲解触发：模拟「我已到达此处」（演示主力）
  play(e) {
    const poiId = e.currentTarget.dataset.poi
    const poi = this.data.pois.find(p => p.poiId === poiId)
    this.setData({ current: poi })
    this.loadGuide()
  },

  loadGuide() {
    const { current, duration, style } = this.data
    if (!current) return
    this.setData({ loading: true, subtitle: '' })
    api.guide.get(current.poiId, duration, style).then(guide => {
      this.setData({ guide, loading: false })
      api.event.report([{ type: 'play', payload: { poiId: current.poiId, duration } }])
      this.startAudio(guide)
    }).catch(err => {
      this.setData({ loading: false })
      wx.showToast({ title: '讲稿加载失败', icon: 'none' })
    })
  },

  startAudio(guide) {
    this.stopAudio()
    // 音频未配好时，用字幕时间轴模拟播放（前端可以独立开发）
    if (!guide.audioUrl) {
      this.playSubtitlesOnly(guide.subtitles || [])
      return
    }
    this.audio = wx.createInnerAudioContext()
    this.audio.src = guide.audioUrl
    this.audio.play()
    this.setData({ playing: true })
    this.audio.onTimeUpdate(() => this.syncSubtitle(this.audio.currentTime * 1000, guide.subtitles))
    this.audio.onEnded(() => this.setData({ playing: false }))
  },

  playSubtitlesOnly(subs) {
    if (!subs.length) return
    let i = 0
    this.setData({ playing: true, subtitle: subs[0].text })
    this.timer = setInterval(() => {
      i += 1
      if (i >= subs.length) {
        clearInterval(this.timer)
        this.setData({ playing: false })
        return
      }
      this.setData({ subtitle: subs[i].text })
    }, 3000)
  },

  syncSubtitle(ms, subs) {
    if (!subs || !subs.length) return
    let text = subs[0].text
    subs.forEach(s => { if (ms >= s.t) text = s.text })
    if (text !== this.data.subtitle) this.setData({ subtitle: text })
  },

  stopAudio() {
    if (this.audio) { this.audio.stop(); this.audio.destroy(); this.audio = null }
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    this.setData({ playing: false })
  },

  // 追问：高光②入口
  ask() {
    const poiId = this.data.current ? this.data.current.poiId : ''
    wx.navigateTo({ url: `/pages/chat/chat?poiId=${poiId}` })
  },

  onUnload() {
    this.stopAudio()
  }
})
