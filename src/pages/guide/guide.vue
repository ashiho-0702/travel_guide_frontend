<template>
  <view class="wrap">
    <view class="card" v-if="current">
      <view class="title">{{ current.name }}</view>
      <view class="tags">
        <text class="tag" v-for="d in durations" :key="d"
          @tap="chooseDuration(d)"
          :style="duration === d ? 'background:#185FA5;color:#fff' : ''">
          {{ d === '30s' ? '30 秒' : (d === '2m' ? '2 分钟' : '5 分钟') }}
        </text>
      </view>
      <view class="subtitle" v-if="subtitle">{{ subtitle }}</view>
      <view class="note" v-else>{{ loading ? '加载讲稿…' : '点击下方按钮开始讲解' }}</view>
      <view class="btn" @tap="ask">听不懂？追问一句</view>
    </view>

    <view class="card">
      <view class="title">模拟触发（我已到达此处）</view>
      <view class="note">现场演示用这个，完全不依赖定位信号</view>
      <view class="list-item" v-for="item in pois" :key="item.poiId" @tap="play(item.poiId)">
        <view class="name">{{ item.name }}</view>
        <view class="sub">{{ item.stayMinutes }} 分钟 · 体力强度 {{ item.intensity }}</view>
        <text class="tag" v-for="t in item.tags" :key="t">{{ t }}</text>
      </view>
    </view>
    <AuthMask />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro, { useLoad, useShow, useUnload } from '@tarojs/taro'
import api from '../../services/api'
import { requireLogin } from '../../utils/auth'
import AuthMask from '../../components/AuthMask.vue'

const pois = ref([])
const current = ref(null)   // 当前讲解的 POI
const guide = ref(null)     // 讲稿 + 字幕
const subtitle = ref('')    // 当前显示的字幕
const playing = ref(false)
const duration = ref('2m')
const durations = ['30s', '2m', '5m']
const style = 'standard'
const loading = ref(false)

// 非响应式实例：音频对象与定时器
let audio = null
let timer = null

useLoad(options => {
  api.poi.list().then(list => {
    pois.value = list
    const pending = Taro.getStorageSync('pendingPoiId')
    if (options && options.poiId) play(options.poiId)
    else if (pending) { Taro.removeStorageSync('pendingPoiId'); play(pending) }
  })
})

// tab 再次切入时检查行程页带过来的点位（switchTab 不触发 onLoad，只触发 onShow）
useShow(() => {
  if (!pois.value.length) return
  const pending = Taro.getStorageSync('pendingPoiId')
  if (pending) { Taro.removeStorageSync('pendingPoiId'); play(pending) }
})

useUnload(() => {
  stopAudio()
})

function chooseDuration(d) {
  duration.value = d
  if (current.value) loadGuide()
}

// 讲解触发：模拟「我已到达此处」（演示主力）——未登录先弹授权
function play(poiId) {
  requireLogin(() => {
    const poi = pois.value.find(p => p.poiId === poiId)
    current.value = poi
    loadGuide()
  })
}

function loadGuide() {
  if (!current.value) return
  loading.value = true
  subtitle.value = ''
  api.guide.get(current.value.poiId, duration.value, style).then(g => {
    guide.value = g
    loading.value = false
    api.event.report([{ type: 'play', payload: { poiId: current.value.poiId, duration: duration.value } }])
    startAudio(g)
  }).catch(() => {
    loading.value = false
    Taro.showToast({ title: '讲稿加载失败', icon: 'none' })
  })
}

function startAudio(g) {
  stopAudio()
  // 音频未配好时，用字幕时间轴模拟播放（前端可以独立开发）
  if (!g.audioUrl) {
    playSubtitlesOnly(g.subtitles || [])
    return
  }
  audio = Taro.createInnerAudioContext()
  audio.src = g.audioUrl
  audio.play()
  playing.value = true
  audio.onTimeUpdate(() => syncSubtitle(audio.currentTime * 1000, g.subtitles))
  audio.onEnded(() => { playing.value = false })
}

function playSubtitlesOnly(subs) {
  if (!subs.length) return
  let i = 0
  playing.value = true
  subtitle.value = subs[0].text
  timer = setInterval(() => {
    i += 1
    if (i >= subs.length) {
      clearInterval(timer)
      timer = null
      playing.value = false
      return
    }
    subtitle.value = subs[i].text
  }, 3000)
}

function syncSubtitle(ms, subs) {
  if (!subs || !subs.length) return
  let text = subs[0].text
  subs.forEach(s => { if (ms >= s.t) text = s.text })
  if (text !== subtitle.value) subtitle.value = text
}

function stopAudio() {
  if (audio) { audio.stop(); audio.destroy(); audio = null }
  if (timer) { clearInterval(timer); timer = null }
  playing.value = false
}

// 追问：高光②入口
function ask() {
  const poiId = current.value ? current.value.poiId : ''
  Taro.navigateTo({ url: `/pages/chat/chat?poiId=${poiId}` })
}
</script>
