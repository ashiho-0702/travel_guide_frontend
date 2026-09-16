<template>
  <view class="wrap">
    <view class="card">
      <view class="title">说一句话，帮你排行程</view>
      <textarea class="input" v-model="input" maxlength="200"
        placeholder="例如：周末两天，带 60 岁父母，不想爬坡" />
      <view class="note">定位来源：演示回放（不依赖真实信号）</view>
    </view>

    <view class="btn" @tap="generate" :class="{ disabled: loading }">
      {{ loading ? '生成中…' : '生成行程' }}
    </view>

    <view class="card" v-if="status">
      <view class="sub">{{ status }}</view>
    </view>

    <view class="card" v-if="answer">
      <view class="output">{{ answer }}</view>
      <view class="note">内容由 AI 生成，仅供参考</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro, { useUnload } from '@tarojs/taro'
import api from '../../services/api'
import { getPosition } from '../../utils/position'
import { buildDays } from '../../services/mock'

const input = ref('周末两天，带 60 岁父母，不想爬坡，喜欢古建筑')
const answer = ref('')
const status = ref('')
const loading = ref(false)
let task = null

// 一句话生成行程（高光①的前半段）
function generate() {
  const query = (input.value || '').trim()
  if (!query || loading.value) return

  loading.value = true
  answer.value = ''
  status.value = '正在理解你的需求…'
  api.event.report([{ type: 'generate', payload: { query } }])

  getPosition().then(pos => {
    let buffer = ''
    task = api.itinerary.generate({ query, position: { lng: pos.lng, lat: pos.lat } }, {
      onMeta: data => { status.value = '已理解：' + JSON.stringify(data) },
      // 注意：高频渲染会卡，这里每积累一段再刷新（简单节流）
      onDelta: text => {
        buffer += text
        if (buffer.length >= 8) {
          answer.value += buffer
          buffer = ''
        }
      },
      onDone: data => {
        if (buffer) answer.value += buffer
        Taro.setStorageSync('itinerary', data)
        status.value = '生成完成，正在进入行程页…'
        loading.value = false
        setTimeout(() => Taro.navigateTo({ url: '/pages/itinerary/itinerary' }), 600)
      },
      onError: err => {
        loading.value = false
        status.value = 'AI 暂时不可用（' + (err.message || err.code) + '），已切换预置行程'
        // 兜底：直接用预置行程，保证演示能走下去
        const fallback = { itineraryId: 'it_fallback', days: buildDays(false), summary: '预置兜底行程' }
        Taro.setStorageSync('itinerary', fallback)
      }
    })
  })
}

useUnload(() => {
  task && task.abort()
})
</script>
