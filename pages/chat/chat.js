const api = require('../../services/api')

Page({
  data: {
    poiId: '',
    question: '这个榫卯为什么不用钉子？',
    answer: '',
    sources: [],
    loading: false,
    outOfScope: false
  },

  onLoad(options) {
    if (options && options.poiId) this.setData({ poiId: options.poiId })
  },

  onInput(e) {
    this.setData({ question: e.detail.value })
  },

  // RAG 追问：高光②
  ask() {
    const question = (this.data.question || '').trim()
    if (!question || this.data.loading) return
    this.setData({ loading: true, answer: '', sources: [], outOfScope: false })

    let buffer = ''
    api.ask.question({ poiId: this.data.poiId, question, history: [] }, {
      onDelta: text => {
        buffer += text
        this.setData({ answer: buffer })
      },
      onDone: data => {
        this.setData({
          loading: false,
          answer: data.answer || buffer,
          sources: data.sources || [],
          outOfScope: !!data.outOfScope
        })
      },
      onError: err => {
        this.setData({
          loading: false,
          // 契约约定：检索不到相关内容返回 3001，明确拒答，不编造
          answer: err.code === 3001 ? '暂无相关资料，换个问法试试？' : '追问服务暂时不可用'
        })
      }
    })
  }
})
