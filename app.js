App({
  onLaunch() {
    // 演示通道说明：开发期用开发者工具/真机调试，域名校验在 project.config.json 里已关闭（urlCheck: false）
    // 这里保留一个启动日志，方便确认环境
    console.log('[app] 启动，后端地址见 utils/config.js')
  },
  globalData: {
    token: '',
    currentItinerary: null, // 行程页与讲解页共享
    currentPoiId: ''
  }
})
