// 应用入口（Taro Vue3）
import { createApp } from 'vue'
import { TaroElement } from '@tarojs/runtime'
import './app.css'

// 补丁：Vue 3.5 的 v-model 指令在 beforeUpdate 里会调 el.getRootNode() 并做
// `root instanceof Document / ShadowRoot` 判断，而小程序环境既没有实现 getRootNode、
// 也没有 Document/ShadowRoot 全局构造器（instanceof 直接抛 ReferenceError）。
// 处理：补上两个空壳类 + 让 getRootNode 返回 null —— instanceof 判断均为 false，
// Vue 安全跳过 activeElement 检查，仅正常赋值。
const _g = typeof globalThis !== 'undefined' ? globalThis : wx
if (typeof _g.Document === 'undefined') _g.Document = class Document {}
if (typeof _g.ShadowRoot === 'undefined') _g.ShadowRoot = class ShadowRoot {}
if (TaroElement && !TaroElement.prototype.getRootNode) {
  TaroElement.prototype.getRootNode = function () { return null }
}

const App = createApp({
  onShow(options) {}
})

export default App
