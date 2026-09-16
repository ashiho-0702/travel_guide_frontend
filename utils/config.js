// 全局配置：只改这里就能切换后端地址与是否用本地模拟数据
const CONFIG = {
  // 改成队友本机局域网 IP（如 http://192.168.1.100:8080）或内网穿透地址
  BASE_URL: 'http://192.168.1.100:8080',

  // 后端没就绪时保持 true：所有接口走 services/mock.js，前端可以独立开发
  USE_MOCK: true,

  TIMEOUT: 15000
}

module.exports = CONFIG
