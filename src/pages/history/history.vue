<template>
  <view class="wrap">
    <view class="card" v-if="items.length">
      <view class="trip" v-for="t in items" :key="t.id" @tap="openTrip(t)">
        <view class="trip-head">
          <text class="trip-title">{{ t.title }}</text>
          <text class="trip-status" :class="t.status">{{ statusLabel(t.status) }}</text>
        </view>
        <view class="trip-sub">{{ t.startDate }} 开始 · {{ t.days }} 天 · 创建于 {{ (t.createdAt || '').slice(5, 16).replace('T', ' ') }}</view>
        <view class="trip-actions">
          <text class="action danger" @tap.stop="removeTrip(t)">删除</text>
        </view>
      </view>
      <view class="note center" v-if="!nextCursor && items.length">没有更多了</view>
      <view class="btn ghost" v-if="nextCursor" @tap="loadMore" :class="{ disabled: loadingMore }">
        {{ loadingMore ? '加载中…' : '加载更多' }}
      </view>
    </view>

    <view class="card empty" v-if="!items.length && !loading">
      <view class="big-icon">🧳</view>
      <view class="title">还没有行程</view>
      <view class="note">去「规划」页创建第一份行程吧</view>
      <view class="btn" @tap="goHome">去规划</view>
    </view>

    <view class="note center" v-if="loading">加载中…</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro, { useShow } from '@tarojs/taro'
import api from '../../services/api'

const items = ref([])
const nextCursor = ref('')
const loading = ref(false)
const loadingMore = ref(false)

// 每次切到本页都刷新（新建/删除后保持最新）
useShow(() => refresh())

function refresh() {
  loading.value = true
  api.trips.list('', 20).then(res => {
    items.value = res.items || []
    nextCursor.value = res.nextCursor || ''
  }).catch(e => {
    Taro.showToast({ title: e.message || '加载失败', icon: 'none' })
  }).finally(() => { loading.value = false })
}

function loadMore() {
  if (!nextCursor.value || loadingMore.value) return
  loadingMore.value = true
  api.trips.list(nextCursor.value, 20).then(res => {
    items.value = items.value.concat(res.items || [])
    nextCursor.value = res.nextCursor || ''
  }).catch(() => {
    Taro.showToast({ title: '加载失败', icon: 'none' })
  }).finally(() => { loadingMore.value = false })
}

function statusLabel(s) {
  return { queued: '排队中', running: '生成中', completed: '已完成', failed: '失败', canceled: '已取消' }[s] || s
}

// 运行中回生成页；已完成进结果；失败/取消也进详情页（有重试按钮）
function openTrip(t) {
  Taro.setStorageSync('currentTripId', t.id)
  Taro.navigateTo({ url: `/pages/itinerary/itinerary?tripId=${t.id}` })
}

function removeTrip(t) {
  Taro.showModal({
    title: '删除行程',
    content: `确定删除「${t.title}」吗？删除后不可恢复。`,
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
  Taro.switchTab({ url: '/pages/index/index' })
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
