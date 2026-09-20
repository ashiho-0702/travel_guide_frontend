<template>
  <view class="wrap">
    <!-- ========== 加载中 ========== -->
    <view v-if="phase === 'loading'">
      <view class="card center-card">
        <view class="big-icon">⏳</view>
        <view class="title">正在加载行程…</view>
      </view>
    </view>

    <!-- 失败态 -->
    <view v-if="phase === 'failed'">
      <view class="card center-card">
        <view class="big-icon">😵</view>
        <view class="title">加载失败</view>
        <view class="note">{{ errorMsg }}</view>
        <view class="btn" @tap="reload" :class="{ disabled: submitting }">
          {{ submitting ? '加载中…' : '重新加载' }}
        </view>
        <view class="btn ghost" @tap="goHome">返回重新规划</view>
      </view>
    </view>

    <!-- ========== 阶段二：结果展示 ========== -->
    <view v-if="phase === 'done' && detail">
      <!-- 概览 + 预算 -->
      <view class="card">
        <view class="title">{{ detail.title }}</view>
        <view class="sub">{{ detail.result.overview }}</view>
        <view class="budget" v-if="detail.result.budgetSummary">
          <text class="budget-total">预估 ¥{{ detail.result.budgetSummary.estimatedTotal }}</text>
          <text class="budget-tag" :class="detail.result.budgetSummary.status">
            {{ { within: '预算内', over: '已超支', unknown: '预算未知' }[detail.result.budgetSummary.status] }}
          </text>
        </view>
        <view class="note" v-if="detail.result.budgetSummary && detail.result.budgetSummary.status !== 'unknown'">
          较你的预算{{ detail.result.budgetSummary.difference >= 0 ? '少' : '多' }}
          ¥{{ Math.abs(detail.result.budgetSummary.difference) }} · {{ detail.result.budgetSummary.disclaimer }}
        </view>
      </view>

      <!-- 地图：marker = resolved 项，polyline = available 路线段 -->
      <map class="map" :latitude="mapCenter.latitude" :longitude="mapCenter.longitude"
        :markers="markers" :polyline="polylines" scale="12" :show-location="false" />
      <view class="note warn-note" v-if="dayHasRouteIssue">部分路线未能规划，地图仅展示点位顺序</view>

      <!-- 按天时间表 -->
      <view class="card">
        <view class="tags">
          <text class="tag" v-for="(d, idx) in detail.result.days" :key="d.dayNumber" @tap="switchDay(idx)"
            :class="{ active: activeDay === idx }">
            第 {{ d.dayNumber }} 天
          </text>
        </view>
        <view class="sub" v-if="currentDay">{{ currentDay.title }} · 预估 ¥{{ currentDay.estimatedCostCny }}</view>

        <view class="slot" v-for="item in currentItems" :key="item.itemId">
          <view class="slot-head">
            <text class="time">{{ item.startTime }}–{{ item.endTime }}</text>
            <text class="name">{{ typeIcon(item.type) }} {{ item.name }}</text>
          </view>
          <text class="reason">{{ item.reason }}</text>
          <text class="tips" v-if="item.tips">避坑：{{ item.tips }}</text>
          <text class="cost" v-if="item.estimatedCostCny">预估 ¥{{ item.estimatedCostCny }}</text>
        </view>
        <view class="note" v-if="currentDay && currentDay.note">💡 {{ currentDay.note }}</view>
      </view>

      <!-- 整体提示 + 来源 + 警告 -->
      <view class="card" v-if="detail.result.tips && detail.result.tips.length">
        <view class="title">注意事项</view>
        <view class="reason" v-for="(t, i) in detail.result.tips" :key="i">· {{ t }}</view>
      </view>

      <view class="card" v-if="detail.result.warnings && detail.result.warnings.length">
        <view class="title">警告</view>
        <view class="tips" v-for="(w, i) in detail.result.warnings" :key="i">⚠️ {{ w.message }}</view>
      </view>

      <view class="card" v-if="detail.result.sources && detail.result.sources.length">
        <view class="title">信息来源</view>
        <view class="source" v-for="s in detail.result.sources" :key="s.sourceId">
          <text class="source-title">{{ s.title }}</text>
          <text class="source-site">{{ s.site }} · 检索于 {{ (s.retrievedAt || '').slice(0, 10) }}</text>
        </view>
      </view>
    </view>

    <AuthMask />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import Taro, { useLoad } from '@tarojs/taro'
import api from '../../services/api'
import AuthMask from '../../components/AuthMask.vue'

const tripId = ref('')
const phase = ref('loading') // loading | done | failed
const submitting = ref(false)
const errorMsg = ref('')

const detail = ref(null)
const activeDay = ref(0)
const markers = ref([])
const polylines = ref([])
const mapCenter = ref({ latitude: 30.25, longitude: 120.15 })

const currentDay = computed(() => {
  const days = (detail.value && detail.value.result && detail.value.result.days) || []
  return days[activeDay.value] || days[0] || null
})
const currentItems = computed(() => (currentDay.value && currentDay.value.items) || [])
const dayHasRouteIssue = computed(() =>
  currentDay.value && (currentDay.value.routeSegments || []).some(s => s.status !== 'available')
)

function typeIcon(t) {
  return { attraction: '🏞️', food: '🍜', accommodation: '🏨', transfer: '🚌', free_time: '☕' }[t] || '📍'
}

useLoad(options => {
  tripId.value = (options && options.tripId) || Taro.getStorageSync('currentTripId') || ''
  if (!tripId.value) {
    Taro.showToast({ title: '缺少行程，先去规划', icon: 'none' })
    return
  }
  loadDetail()
})

// ---------- 详情：GET /api/trip/{id} ----------
function loadDetail() {
  phase.value = 'loading'
  api.trips.detail(tripId.value).then(d => {
    detail.value = d
    // 库里 result 字段可空（生成中/生成失败的历史记录），无结果时给明确提示而不是白屏
    if (!d || !d.result || !Array.isArray(d.result.days) || !d.result.days.length) {
      phase.value = 'failed'
      errorMsg.value = '这份行程还没有生成结果'
      return
    }
    phase.value = 'done'
    renderDay(0)
  }).catch(e => {
    phase.value = 'failed'
    errorMsg.value = e.message || '读取结果失败'
  })
}

function reload() {
  if (submitting.value) return
  submitting.value = true
  loadDetail()
  submitting.value = false
}

function renderDay(idx) {
  activeDay.value = idx
  const days = (detail.value && detail.value.result && detail.value.result.days) || []
  const day = days[idx]
  if (!day) return
  const resolved = (day.items || []).filter(it => it.locationStatus === 'resolved')
  markers.value = resolved.map((it, i) => ({
    id: i,
    latitude: it.location.lat,
    longitude: it.location.lng,
    width: 26, height: 26,
    callout: { content: `${i + 1} ${it.name}`, padding: 6, borderRadius: 6, display: 'ALWAYS' }
  }))
  polylines.value = (day.routeSegments || [])
    .filter(s => s.status === 'available' && s.path && s.path.length)
    .map(s => ({
      points: s.path.map(p => ({ latitude: p.lat, longitude: p.lng })),
      color: '#185FA5', width: 4, arrowLine: true
    }))
  if (markers.value.length) {
    mapCenter.value = { latitude: markers.value[0].latitude, longitude: markers.value[0].longitude }
  }
}

function switchDay(idx) { renderDay(Number(idx)) }

function goHome() {
  // 表单页已移出 tabBar，改用 navigateTo（tab 页才需要 switchTab）
  Taro.navigateTo({ url: '/pages/index/index' })
}
</script>

<style>
.center-card { text-align: center; padding: 60rpx 40rpx; }
.big-icon { font-size: 88rpx; margin-bottom: 16rpx; }
.btn.ghost { background: #fff; color: #185FA5; border: 1rpx solid #185FA5; }
.budget { display: flex; align-items: center; gap: 16rpx; margin: 16rpx 0 8rpx; }
.budget-total { font-size: 36rpx; font-weight: 600; color: #185FA5; }
.budget-tag { font-size: 22rpx; padding: 4rpx 16rpx; border-radius: 20rpx; }
.budget-tag.within { background: #e6f4ea; color: #2e7d32; }
.budget-tag.over { background: #fdecea; color: #d9534f; }
.budget-tag.unknown { background: #f0efe9; color: #888780; }
.warn-note { color: #b26a00; }
.slot { padding: 20rpx 0; border-bottom: 1rpx solid #f0efe9; }
.slot-head { display: flex; gap: 16rpx; align-items: baseline; margin-bottom: 8rpx; }
.time { font-size: 24rpx; color: #185FA5; min-width: 180rpx; }
.name { font-size: 30rpx; font-weight: 600; color: #333; }
.reason { display: block; font-size: 26rpx; color: #666; margin: 4rpx 0; }
.tips { display: block; font-size: 24rpx; color: #b26a00; margin: 4rpx 0; }
.cost { display: block; font-size: 24rpx; color: #999; }
.source { padding: 12rpx 0; border-bottom: 1rpx solid #f0efe9; }
.source-title { display: block; font-size: 26rpx; color: #333; }
.source-site { display: block; font-size: 22rpx; color: #999; }
.tag.active { background: #185FA5; color: #fff; }
</style>
