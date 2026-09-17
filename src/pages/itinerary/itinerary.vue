<template>
  <view class="wrap">
    <!-- ========== 阶段一：生成进度 ========== -->
    <view v-if="phase === 'running'">
      <view class="card center-card">
        <view class="big-icon">⏳</view>
        <view class="title">{{ statusText }}</view>
        <view class="progress-wrap">
          <view class="progress-bar">
            <view class="progress-inner" :style="{ width: percent + '%' }"></view>
          </view>
          <view class="percent">{{ percent }}%</view>
        </view>
        <view class="note">{{ message || '正在准备…' }}</view>
        <view class="btn danger" @tap="cancelTask" :class="{ disabled: canceling }">取消生成</view>
        <view class="note">可以切到后台，回来会自动恢复进度</view>
      </view>
    </view>

    <!-- 失败态 -->
    <view v-if="phase === 'failed'">
      <view class="card center-card">
        <view class="big-icon">😵</view>
        <view class="title">生成失败</view>
        <view class="note">{{ errorMsg }}</view>
        <view class="btn" @tap="retry" :class="{ disabled: submitting }">
          {{ submitting ? '创建中…' : '用原需求重新生成' }}
        </view>
        <view class="btn ghost" @tap="goHome">返回修改需求</view>
      </view>
    </view>

    <!-- 取消态 -->
    <view v-if="phase === 'canceled'">
      <view class="card center-card">
        <view class="big-icon">🚫</view>
        <view class="title">已取消生成</view>
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
import Taro, { useLoad, useShow, useUnload } from '@tarojs/taro'
import api from '../../services/api'
import AuthMask from '../../components/AuthMask.vue'

const tripId = ref('')
const phase = ref('running') // running | done | failed | canceled
const status = ref('queued')
const stage = ref('')
const percent = ref(0)
const message = ref('')
const errorMsg = ref('')
const canceling = ref(false)
const submitting = ref(false)

const detail = ref(null)
const activeDay = ref(0)
const markers = ref([])
const polylines = ref([])
const mapCenter = ref({ latitude: 30.25, longitude: 120.15 })

let subscriber = null
let pollTimer = null
let lastEventId = ''

const STAGE_TEXT = {
  validating: '正在校验需求', retrieving: '正在搜集资料', generating: '正在生成行程',
  verifying: '正在核对信息', geocoding: '正在定位景点', routing: '正在规划路线',
  budgeting: '正在汇总预算', saving: '正在保存结果'
}
const statusText = computed(() => {
  if (status.value === 'queued') return '排队中，马上开始…'
  return STAGE_TEXT[stage.value] || '正在生成'
})

const currentDay = computed(() => {
  if (!detail.value) return null
  return detail.value.result.days[activeDay.value] || detail.value.result.days[0]
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
    Taro.showToast({ title: '缺少行程任务，先去规划', icon: 'none' })
    return
  }
  startWatch()
})

// 回前台：先查状态，运行中则从最后事件恢复订阅（文档 2.4 / 8.2）
useShow(() => {
  if (!tripId.value) return
  api.trips.status(tripId.value).then(s => {
    applyStatus(s)
    if (s.status === 'queued' || s.status === 'running') resubscribe()
  }).catch(e => {
    if (e.code === 'TRIP_NOT_FOUND') Taro.showToast({ title: '行程已被删除', icon: 'none' })
  })
})

useUnload(() => {
  stopWatch()
})

// ---------- 订阅事件流，失败降级轮询 ----------
function startWatch() {
  api.trips.status(tripId.value).then(applyStatus).catch(() => {})
  subscribe()
}

function subscribe() {
  stopWatch()
  subscriber = api.trips.events(tripId.value, lastEventId, {
    onEvent: ev => onEvent(ev),
    onError: () => startPolling() // 事件流不可用 → 3 秒轮询（文档 6.4）
  })
}

function resubscribe() {
  if (subscriber) return // 还在订阅中就不重复
  subscribe()
}

function onEvent(ev) {
  if (ev.event === 'progress') {
    status.value = ev.data.status || 'running'
    stage.value = ev.data.stage || stage.value
    percent.value = ev.data.progressPercent || percent.value
    message.value = ev.data.message || ''
  } else if (ev.event === 'completed') {
    stopWatch()
    loadDetail()
  } else if (ev.event === 'failed') {
    stopWatch()
    phase.value = 'failed'
    status.value = 'failed'
    errorMsg.value = (ev.data.error && ev.data.error.message) || '生成失败，请稍后重试'
  } else if (ev.event === 'canceled') {
    stopWatch()
    phase.value = 'canceled'
    status.value = 'canceled'
  }
  // heartbeat / 未知事件类型：忽略（文档 8.3）
}

// 断流兜底：每 3 秒查一次状态，直到终态
function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    api.trips.status(tripId.value).then(s => {
      applyStatus(s)
      if (s.status === 'completed') { stopWatch(); loadDetail() }
      else if (s.status === 'failed') {
        stopWatch(); phase.value = 'failed'
        errorMsg.value = (s.error && s.error.message) || '生成失败'
      } else if (s.status === 'canceled') { stopWatch(); phase.value = 'canceled' }
    }).catch(() => {})
  }, 3000)
}

function applyStatus(s) {
  status.value = s.status
  stage.value = s.stage || stage.value
  percent.value = s.progressPercent || percent.value
  message.value = s.message || ''
  if (s.status === 'completed') loadDetail()
  else if (s.status === 'failed') {
    phase.value = 'failed'
    errorMsg.value = (s.error && s.error.message) || '生成失败'
  } else if (s.status === 'canceled') phase.value = 'canceled'
}

function stopWatch() {
  if (subscriber) { subscriber.abort(); subscriber = null }
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

// ---------- 详情 ----------
function loadDetail() {
  api.trips.detail(tripId.value).then(d => {
    detail.value = d
    phase.value = 'done'
    renderDay(0)
  }).catch(e => {
    if (e.code === 'TRIP_NOT_READY') { phase.value = 'running'; resubscribe(); return }
    phase.value = 'failed'
    errorMsg.value = e.message || '读取结果失败'
  })
}

function renderDay(idx) {
  activeDay.value = idx
  const day = detail.value.result.days[idx]
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

// ---------- 操作 ----------
function cancelTask() {
  if (canceling.value) return
  Taro.showModal({
    title: '取消生成',
    content: '确定要取消这次行程生成吗？',
    success: res => {
      if (!res.confirm) return
      canceling.value = true
      api.trips.cancel(tripId.value).catch(() => {}).finally(() => { canceling.value = false })
    }
  })
}

// 失败重试：用原需求 + 新幂等键创建新任务（文档 4.5）
function retry() {
  if (!detail.value || !detail.value.request) return
  if (submitting.value) return
  submitting.value = true
  api.trips.create(detail.value.request).then(res => {
    tripId.value = res.tripId
    Taro.setStorageSync('currentTripId', res.tripId)
    phase.value = 'running'
    percent.value = 0
    stage.value = ''
    message.value = ''
    errorMsg.value = ''
    lastEventId = ''
    startWatch()
  }).catch(e => {
    Taro.showToast({ title: e.message || '创建失败', icon: 'none' })
  }).finally(() => { submitting.value = false })
}

function goHome() {
  Taro.switchTab({ url: '/pages/index/index' })
}
</script>

<style>
.center-card { text-align: center; padding: 60rpx 40rpx; }
.big-icon { font-size: 88rpx; margin-bottom: 16rpx; }
.progress-wrap { display: flex; align-items: center; gap: 20rpx; margin: 32rpx 0; }
.progress-bar {
  flex: 1; height: 16rpx; background: #ece9e1; border-radius: 8rpx; overflow: hidden;
}
.progress-inner { height: 100%; background: #185FA5; border-radius: 8rpx; transition: width 0.4s; }
.percent { font-size: 26rpx; color: #185FA5; min-width: 80rpx; }
.btn.danger { background: #d9534f; margin-top: 24rpx; }
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
