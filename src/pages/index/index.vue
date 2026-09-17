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

    <!-- 微信一键授权弹层：刚进小程序就显示 -->
    <view v-if="showAuth" class="auth-mask">
      <view class="auth-card">
        <view class="auth-logo">🧳</view>
        <view class="auth-title">欢迎使用 AI 旅行规划</view>
        <view class="auth-desc">登录后可保存行程历史、记住你的旅行偏好</view>
        <view class="auth-btn" :class="{ disabled: authLoading }" @tap="doLogin">
          {{ authLoading ? '登录中…' : '微信一键授权登录' }}
        </view>
        <view class="auth-skip" @tap="skipLogin">暂不登录，先逛逛</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro, { useUnload } from '@tarojs/taro'
import api from '../../services/api'
import { getPosition } from '../../utils/position'
import { buildDays } from '../../services/mock'
import { isLoggedIn, silentLogin } from '../../utils/auth'

const input = ref('周末两天，带 60 岁父母，不想爬坡，喜欢古建筑')
const answer = ref('')
const status = ref('')
const loading = ref(false)
let task = null

// ---------- 微信一键授权 ----------
const showAuth = ref(!isLoggedIn())
const authLoading = ref(false)

function doLogin() {
  if (authLoading.value) return
  authLoading.value = true
  silentLogin()
    .then(() => {
      showAuth.value = false
      Taro.showToast({ title: '登录成功', icon: 'success' })
      api.event.report([{ type: 'login', payload: { method: 'wechat' } }])
    })
    .catch(err => {
      console.warn('[auth] 登录失败', err)
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
    })
    .finally(() => { authLoading.value = false })
}

function skipLogin() {
  // 游客模式：关掉弹层继续用，下次冷启动还会再提示
  showAuth.value = false
}

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
        setTimeout(() => Taro.navigateTo({
          url: '/pages/itinerary/itinerary',
          // 极少数情况下开发者工具会抽风报 timeout，用 reLaunch 兜底
          fail: () => Taro.reLaunch({ url: '/pages/itinerary/itinerary' })
        }), 600)
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

<style>
.auth-mask {
  position: fixed;
  left: 0; top: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.auth-card {
  width: 560rpx;
  background: #fff;
  border-radius: 24rpx;
  padding: 48rpx 40rpx 40rpx;
  text-align: center;
}
.auth-logo { font-size: 72rpx; }
.auth-title { font-size: 36rpx; font-weight: 600; margin: 16rpx 0 8rpx; color: #333; }
.auth-desc { font-size: 26rpx; color: #888780; margin-bottom: 40rpx; }
.auth-btn {
  background: #185FA5;
  color: #fff;
  font-size: 30rpx;
  padding: 22rpx 0;
  border-radius: 44rpx;
}
.auth-btn.disabled { opacity: 0.6; }
.auth-skip { margin-top: 24rpx; font-size: 26rpx; color: #999; }
</style>
