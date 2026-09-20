// 全局配置：只改这里就能切换后端地址与 mock 策略
const CONFIG = {
  // 后端地址：当前用队友的 cpolar 内网穿透隧道（他本机 127.0.0.1:8080 映射出来）
  // 隧道地址会变，队友重启 cpolar 后要重新同步
  BASE_URL: 'http://2a1d8071.r24.cpolar.top',

  // ---------- mock 开关（按模块分别控制，后端做了一半时用这个） ----------
  // false = 打真实后端；true = 走 services/mock.js 本地假数据
  MOCK: {
    auth: false,    // 登录：后端已上线（真实调用微信 code2session）
    trips: false,   // 攻略生成/详情/列表/删除：后端已上线（需登录）
    parse: true,    // 一句话解析预填表单：后端未实现（前端创新点，mock 先行）
    poi: true,      // POI 列表：后端未实现
    guide: true,    // 景点讲解：后端未实现
    event: true     // 埋点上报：后端未实现
  },

  // 兜底开关：MOCK 里没单独列出的模块用它
  USE_MOCK: true,

  TIMEOUT: 15000
}

export default CONFIG
