<template>
  <view class="wrap" v-if="plan">
    <view class="card">
      <view class="title">{{ plan.summary || '你的行程' }}</view>
      <view class="sub">行程号 {{ plan.itineraryId }}</view>
    </view>

    <map class="map" :latitude="mapCenter.latitude" :longitude="mapCenter.longitude"
      :markers="markers" scale="14" :show-location="false" />

    <view class="card">
      <view class="tags">
        <text class="tag" v-for="(item, idx) in plan.days" :key="item.day"
          @tap="switchDay(idx)"
          :style="activeDay === idx ? 'background:#185FA5;color:#fff' : ''">
          第 {{ item.day }} 天
        </text>
      </view>
      <view class="sub" v-if="currentDay">
        步行 {{ currentDay.walkDistance }} 米 · 累计爬升 {{ currentDay.climbMeters }} 米
      </view>
      <view class="slot" v-for="item in currentDay.slots" :key="item.start"
        @tap="openGuide(item.poiId)">
        <text class="time">{{ item.start }}–{{ item.end }}</text>
        <text class="name">{{ item.name }}</text>
        <text class="reason">{{ item.reason }}</text>
      </view>
    </view>

    <view class="card">
      <view class="title">说一句就能改</view>
      <textarea class="input" v-model="reviseText"
        placeholder="例如：第二天太累了 / 下雨了 / 同行的人腿脚不方便" />
      <view class="btn" @tap="revise" :class="{ disabled: revising }">
        {{ revising ? '重排中…' : '重新安排' }}
      </view>
      <view class="note" v-if="reviseHint">{{ reviseHint }}</view>
    </view>
    <AuthMask />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import Taro, { useLoad } from '@tarojs/taro'
import api from '../../services/api'
import { requireLogin } from '../../utils/auth'
import AuthMask from '../../components/AuthMask.vue'

const plan = ref(null)
const markers = ref([])
const mapCenter = ref({ latitude: 23.5, longitude: 113.6 })
const activeDay = ref(0)
const reviseText = ref('')
const reviseHint = ref('')
const revising = ref(false)

const currentDay = computed(() => {
  if (!plan.value || !plan.value.days.length) return { slots: [], walkDistance: 0, climbMeters: 0 }
  return plan.value.days[activeDay.value] || plan.value.days[0]
})

useLoad(() => {
  const saved = Taro.getStorageSync('itinerary')
  if (!saved) {
    Taro.showToast({ title: '还没有行程，先去规划', icon: 'none' })
    return
  }
  renderPlan(saved)
  api.event.report([{ type: 'share', payload: { itineraryId: saved.itineraryId } }])
})

function renderPlan(p) {
  const day = p.days[activeDay.value] || p.days[0]
  markers.value = (day.slots || [])
    .filter(s => s.lng && s.lat)
    .map((s, i) => ({
      id: i,
      latitude: s.lat,
      longitude: s.lng,
      width: 24,
      height: 24,
      callout: { content: `${i + 1} ${s.name}`, padding: 6, borderRadius: 6, display: 'ALWAYS' }
    }))
  plan.value = p
  activeDay.value = day.day - 1
  if (markers.value.length) {
    mapCenter.value = { latitude: markers.value[0].latitude, longitude: markers.value[0].longitude }
  }
}

function switchDay(idx) {
  activeDay.value = Number(idx)
  renderPlan(plan.value)
}

// 对话式重排：高光①——未登录先弹授权
function revise() {
  const instruction = (reviseText.value || '').trim()
  if (!instruction || revising.value) return
  requireLogin(() => startRevise(instruction))
}

function startRevise(instruction) {
  revising.value = true
  reviseHint.value = '正在重排…'
  let buffer = ''
  api.itinerary.revise({
    itineraryId: plan.value.itineraryId,
    instruction,
    current: { days: plan.value.days }
  }, {
    onDelta: text => { buffer += text },
    onDone: data => {
      const merged = { ...plan.value, days: data.days }
      Taro.setStorageSync('itinerary', merged)
      revising.value = false
      reviseText.value = ''
      reviseHint.value = buffer || data.changeLog
      renderPlan(merged)
    },
    onError: err => {
      revising.value = false
      reviseHint.value = '重排失败：' + (err.message || err.code)
    }
  })
}

// 走到景点 → 打开讲解
function openGuide(poiId) {
  // guide 在 tabBar 里，navigateTo 会报 timeout；改 switchTab + storage 传参
  Taro.setStorageSync('pendingPoiId', poiId)
  Taro.switchTab({ url: '/pages/guide/guide' })
}
</script>
