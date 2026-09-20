<template>
  <view class="wrap">
    <view class="card" v-if="items.length">
      <view class="trip" v-for="t in items" :key="t.id" @tap="openTrip(t)">
        <view class="trip-head">
          <text class="trip-title">{{ tripTitle(t) }}</text>
        </view>
        <view class="trip-sub">创建于 {{ (t.createdAt || '').slice(5, 16).replace('T', ' ') }}</view>
        <view class="trip-actions">
          <text class="action danger" @tap.stop="removeTrip(t)">删除</text>
        </view>
      </view>
      <view class="note center" v-if="items.length">没有更多了</view>
    </view>

    <view class="card empty" v-if="!items.length && !loading">
      <view class="big-icon">🧳</view>
      <view class="title">还没有行程</view>
      <view class="note">去「首页」创建第一份行程吧</view>
      <view class="btn" @tap="goHome">去规划</view>
    </view>

    <view class="note center" v-if="loading">加载中…</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro, { useDidShow } from '@tarojs/taro'
import api from '../../services/api'

const items = ref([])
const loading = ref(false)

// 每次切到本页都刷新（新建/删除后保持最新）
useDidShow(() => refresh())

function refresh() {
  loading.value = true
  // 新契约：GET /api/trip/list → 简单数组 [{ id, title, createdAt }]
  api.trips.list().then(res => {
    items.value = Array.isArray(res) ? res : []
  }).catch(e => {
    Taro.showToast({ title: e.message || '加载失败', icon: 'none' })
  }).finally(() => { loading.value = false })
}

// 点开行程 → 详情页
function openTrip(t) {
  Taro.setStorageSync('currentTripId', t.id)
  Taro.navigateTo({ url: `/pages/itinerary/itinerary?tripId=${t.id}` })
}

// 标题兜底：库里没有 title 字段，后端未拼时用 city + days 组合
function tripTitle(t) {
  if (t.title) return t.title
  if (t.city) return `${t.city} ${t.days || ''}天游`
  return '未命名行程'
}

function removeTrip(t) {
  Taro.showModal({
    title: '删除行程',
    content: `确定删除「${tripTitle(t)}」吗？删除后不可恢复。`,
    success: res => {
      if (!res.confirm) return
      api.trips.remove(t.id).then(() => {
        items.value = items.value.filter(x => x.id !== t.id)
        Taro.showToast({ title: '已删除', icon: 'success' })
      }).catch(e => {
        Taro.showToast({ title: e.message || '删除失败', icon: 'none' })
      })
    }
  })
}

function goHome() {
  // 表单页已移出 tabBar，改用 navigateTo（tab 页才需要 switchTab）
  Taro.navigateTo({ url: '/pages/index/index' })
}
</script>

<style>
.trip { padding: 24rpx 0; border-bottom: 1rpx solid #f0efe9; }
.trip-head { display: flex; justify-content: space-between; align-items: center; }
.trip-title { font-size: 30rpx; font-weight: 600; color: #333; }
.trip-status { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; }
.trip-status.completed { background: #e6f4ea; color: #2e7d32; }
.trip-status.running, .trip-status.queued { background: #e8f1fa; color: #185FA5; }
.trip-status.failed { background: #fdecea; color: #d9534f; }
.trip-status.canceled { background: #f0efe9; color: #888780; }
.trip-sub { font-size: 24rpx; color: #999; margin-top: 8rpx; }
.trip-actions { margin-top: 12rpx; text-align: right; }
.action { font-size: 24rpx; color: #d9534f; padding: 8rpx 0 8rpx 32rpx; }
.empty { text-align: center; padding: 80rpx 40rpx; }
.big-icon { font-size: 88rpx; margin-bottom: 16rpx; }
.btn.ghost { background: #fff; color: #185FA5; border: 1rpx solid #185FA5; }
.note.center { text-align: center; }
</style>
