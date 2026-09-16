// 定位统一入口：三种实现可切换，默认 demo（比赛演示零风险）
// real   : wx.getFuzzyLocation —— 个人主体可申请，精度约 1 公里
// manual : 地图选点，需用户在开放范围内
// demo   : 预设坐标回放，演示主力（不依赖任何定位权限）
let MODE = 'demo'

const DEMO_TRACK = [
  { lng: 113.6, lat: 23.5, name: '景区主入口' },
  { lng: 113.61, lat: 23.5, name: '湖滨栈道' },
  { lng: 113.62, lat: 23.51, name: '古亭' },
  { lng: 113.63, lat: 23.52, name: '康养径出口' }
]

let demoIndex = 0

function getPosition() {
  if (MODE === 'real') return realPosition()
  if (MODE === 'manual') return manualPosition()
  return demoPosition()
}

function demoPosition() {
  const p = DEMO_TRACK[demoIndex % DEMO_TRACK.length]
  demoIndex++
  console.log('[position] demo 回放：', p.name)
  return Promise.resolve(p)
}

function realPosition() {
  return new Promise((resolve, reject) => {
    wx.getFuzzyLocation({
      type: 'wgs84',
      success: resolve,
      fail: err => {
        console.warn('[position] 模糊定位失败，回退 demo 模式', err)
        resolve(demoPosition())
      }
    })
  })
}

function manualPosition() {
  return new Promise((resolve, reject) => {
    wx.chooseLocation({ success: resolve, fail: reject })
  })
}

function setMode(mode) {
  MODE = mode
}

module.exports = { getPosition, setMode }
