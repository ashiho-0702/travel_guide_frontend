// babel 配置：Taro 预设（Vue3 + webpack5）
module.exports = {
  presets: [
    ['taro', {
      framework: 'vue3',
      ts: false,
      compiler: 'webpack5'
    }]
  ]
}
