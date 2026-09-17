// 应用入口（Taro Vue3）
import { createApp } from 'vue'
import { TaroElement } from '@tarojs/runtime'
import './app.css'

// 补丁：Vue 3.5 的 v-model 指令在 beforeUpdate 里会调 el.getRootNode()，
// 而 Taro 模拟的 DOM 节点没有实现该方法，值更新时直接报 TypeError。
// 返回 null 时 Vue 的 instanceof Document/ShadowRoot 判断均为 false，安全跳过 activeElement 检查。
if (TaroElement && !TaroElement.prototype.getRootNode) {
  TaroElement.prototype.getRootNode = function () { return null }
}

const App = createApp({
  onShow(options) {}
})

export default App
