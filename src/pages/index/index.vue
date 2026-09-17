<template>
  <view class="wrap">
    <!-- 一句话输入：解析后预填表单（后端 /api/parse 待补，mock 先行） -->
    <view class="card">
      <view class="title">说一句话，帮你填好表单</view>
      <textarea class="input" v-model="oneLine" maxlength="200"
        placeholder="例如：周末去杭州两天，带 60 岁父母，不想爬坡，喜欢古建筑和美食" />
      <view class="btn ghost" @tap="quickFill" :class="{ disabled: parsing }">
        {{ parsing ? '理解中…' : '帮我填表单' }}
      </view>
    </view>

    <!-- 规划表单（字段口径与后端文档 2.3 一致） -->
    <view class="card">
      <view class="title">规划表单</view>

      <view class="field">
        <view class="label">目的地城市 *</view>
        <input class="input single" v-model="form.destinationCity" maxlength="50" placeholder="如：杭州" />
      </view>

      <view class="field">
        <view class="label">开始日期 *</view>
        <picker mode="date" :value="form.startDate" :start="today" @change="onStartDate">
          <view class="input single picker">{{ form.startDate || '选择日期' }}</view>
        </picker>
      </view>

      <view class="field">
        <view class="label">天数 *（1–15）</view>
        <view class="stepper">
          <text class="step-btn" @tap="stepDays(-1)">−</text>
          <text class="step-num">{{ form.days }} 天</text>
          <text class="step-btn" @tap="stepDays(1)">＋</text>
        </view>
      </view>

      <view class="field">
        <view class="label">同行人 *（合计 1–20）</view>
        <view class="travelers">
          <view class="stepper" v-for="k in ['adults', 'children', 'seniors']" :key="k">
            <text class="step-name">{{ { adults: '成人', children: '儿童', seniors: '老人' }[k] }}</text>
            <text class="step-btn" @tap="stepTraveler(k, -1)">−</text>
            <text class="step-num">{{ form.travelers[k] }}</text>
            <text class="step-btn" @tap="stepTraveler(k, 1)">＋</text>
          </view>
        </view>
      </view>

      <view class="field">
        <view class="label">目的地总预算（元，选填）</view>
        <input class="input single" type="digit" v-model="form.totalBudgetCny" placeholder="含住宿/餐饮/门票/市内交通，不含往返大交通" />
      </view>

      <view class="field">
        <view class="label">兴趣偏好（多选）</view>
        <view class="tags">
          <text class="tag" v-for="p in PREF_OPTIONS" :key="p.value" @tap="togglePref(p.value)"
            :class="{ active: form.preferences.indexOf(p.value) >= 0 }">{{ p.label }}</text>
        </view>
      </view>

      <view class="field">
        <view class="label">体力档位 *</view>
        <view class="tags">
          <text class="tag" v-for="e in ENERGY_OPTIONS" :key="e.value" @tap="form.energyLevel = e.value"
            :class="{ active: form.energyLevel === e.value }">{{ e.label }}</text>
        </view>
      </view>

      <view class="field">
        <view class="label">主要交通 *（至少一项）</view>
        <view class="tags">
          <text class="tag" v-for="t in TRANSPORT_OPTIONS" :key="t.value" @tap="toggleTransport(t.value)"
            :class="{ active: form.transportModes.indexOf(t.value) >= 0 }">{{ t.label }}</text>
        </view>
      </view>

      <view class="field">
        <view class="label">住宿地 / 每日出发点（选填）</view>
        <input class="input single" v-model="form.startLocation" maxlength="100" placeholder="如：西湖区北山街附近酒店" />
      </view>

      <view class="field">
        <view class="label">特殊需求（选填，≤1000 字）</view>
        <textarea class="input" v-model="form.extraRequirements" maxlength="1000"
          placeholder="如：老人不适合长时间爬坡；对海鲜过敏。请勿填写证件号、手机号等敏感信息" />
      </view>
    </view>

    <view class="btn" @tap="submit" :class="{ disabled: submitting }">
      {{ submitting ? '创建中…' : '生成行程' }}
    </view>
    <view class="note center">生成约需几分钟，可切后台，回来继续看进度</view>

    <AuthMask />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import api from '../../services/api'
import { isLoggedIn, authState, requireLogin } from '../../utils/auth'
import AuthMask from '../../components/AuthMask.vue'

const PREF_OPTIONS = [
  { value: 'nature', label: '自然风光' }, { value: 'culture', label: '历史人文' },
  { value: 'food', label: '美食' }, { value: 'family', label: '亲子' },
  { value: 'shopping', label: '购物' }, { value: 'photography', label: '摄影打卡' },
  { value: 'nightlife', label: '夜游' }, { value: 'relaxation', label: '休闲度假' },
  { value: 'theme_park', label: '主题乐园' }
]
const ENERGY_OPTIONS = [
  { value: 'easy', label: '轻松' }, { value: 'medium', label: '适中' }, { value: 'hard', label: '充沛' }
]
const TRANSPORT_OPTIONS = [
  { value: 'walking', label: '步行' }, { value: 'transit', label: '公交/地铁' },
  { value: 'taxi', label: '打车' }, { value: 'driving', label: '自驾' }, { value: 'cycling', label: '骑行' }
]

const today = new Date().toISOString().slice(0, 10)
const emptyForm = () => ({
  destinationCity: '',
  startDate: '',
  days: 2,
  travelers: { adults: 2, children: 0, seniors: 0 },
  totalBudgetCny: '',
  preferences: [],
  energyLevel: 'medium',
  startLocation: '',
  transportModes: ['transit', 'walking'],
  extraRequirements: ''
})
const form = ref(emptyForm())
const oneLine = ref('周末去杭州两天，带 60 岁父母，不想爬坡，喜欢古建筑和美食')
const parsing = ref(false)
const submitting = ref(false)

// 首次进入且未登录：直接弹授权框（游客模式可跳过）
if (!isLoggedIn()) authState.visible = true

// ---------- 一句话 → 预填表单 ----------
function quickFill() {
  const text = (oneLine.value || '').trim()
  if (!text || parsing.value) return
  parsing.value = true
  api.parse.query(text).then(parsed => {
    const f = form.value
    f.destinationCity = parsed.destinationCity || f.destinationCity
    // 解析出的日期若早于今天（如今天是 9/18 说"9月17号"），smartYear 已顺延到明年，直接可用
    if (parsed.startDate) f.startDate = parsed.startDate
    f.days = parsed.days || f.days
    if (parsed.travelers) f.travelers = parsed.travelers
    if (parsed.preferences && parsed.preferences.length) f.preferences = parsed.preferences
    if (parsed.energyLevel) f.energyLevel = parsed.energyLevel
    if (parsed.transportModes && parsed.transportModes.length) f.transportModes = parsed.transportModes
    f.extraRequirements = parsed.extraRequirements || ''
    Taro.showToast({ title: parsed.startDate ? '已填好，请确认信息' : '已填好，请选择日期', icon: 'none' })
  }).catch(() => {
    Taro.showToast({ title: '没理解这句话，手动填一下吧', icon: 'none' })
  }).finally(() => { parsing.value = false })
}

// ---------- 表单交互 ----------
function onStartDate(e) { form.value.startDate = e.detail.value }
function stepDays(d) {
  const v = form.value.days + d
  if (v >= 1 && v <= 15) form.value.days = v
}
function stepTraveler(k, d) {
  const t = form.value.travelers
  const v = t[k] + d
  const total = t.adults + t.children + t.seniors + d
  if (v >= 0 && total >= 1 && total <= 20) t[k] = v
}
function togglePref(v) {
  const arr = form.value.preferences
  const i = arr.indexOf(v)
  i >= 0 ? arr.splice(i, 1) : arr.push(v)
}
function toggleTransport(v) {
  const arr = form.value.transportModes
  const i = arr.indexOf(v)
  i >= 0 ? arr.splice(i, 1) : arr.push(v)
}

// ---------- 校验（口径与后端一致，前端先挡一层） ----------
function validate() {
  const f = form.value
  if (!f.destinationCity.trim()) return '请填写目的地城市'
  if (!f.startDate) return '请选择开始日期'
  if (f.startDate < today) return '开始日期不能早于今天'
  if (!(f.days >= 1 && f.days <= 15)) return '天数必须是 1–15'
  const total = f.travelers.adults + f.travelers.children + f.travelers.seniors
  if (total < 1 || total > 20) return '同行人合计须为 1–20 人'
  if (f.totalBudgetCny && !(parseFloat(f.totalBudgetCny) > 0)) return '预算须大于 0'
  if (!f.transportModes.length) return '至少选择一种交通方式'
  return ''
}

// ---------- 提交：创建异步任务 → 跳生成页（未登录先弹授权） ----------
function submit() {
  const err = validate()
  if (err) { Taro.showToast({ title: err, icon: 'none' }); return }
  if (submitting.value) return
  requireLogin(doCreate)
}

function doCreate() {
  submitting.value = true
  const f = form.value
  const payload = {
    destinationCity: f.destinationCity.trim(),
    startDate: f.startDate,
    days: f.days,
    travelers: { ...f.travelers },
    preferences: f.preferences,
    energyLevel: f.energyLevel,
    transportModes: f.transportModes
  }
  // 可选字段不传空串（后端约定：未填写直接省略）
  if (f.totalBudgetCny) payload.totalBudgetCny = parseFloat(f.totalBudgetCny)
  if (f.startLocation.trim()) payload.startLocation = f.startLocation.trim()
  if (f.extraRequirements.trim()) payload.extraRequirements = f.extraRequirements.trim()

  api.trips.create(payload).then(res => {
    Taro.setStorageSync('currentTripId', res.tripId)
    goItinerary(res.tripId)
  }).catch(e => {
    Taro.showToast({ title: e.message || '创建失败，请重试', icon: 'none' })
  }).finally(() => { submitting.value = false })
}

// 跳转生成页：加锁防连点；navigateTo 失败（常见为上一次路由尚未结束）时
// 等 400ms 再用 reLaunch 兜底——立即补跳会与在途路由撞车，触发 routeDone webviewId 错乱
let routing = false
function goItinerary(tripId) {
  if (routing) return
  routing = true
  const url = `/pages/itinerary/itinerary?tripId=${tripId}`
  const unlock = () => setTimeout(() => { routing = false }, 600)
  Taro.navigateTo({
    url,
    success: unlock,
    fail: () => setTimeout(() => Taro.reLaunch({ url, complete: unlock }), 400)
  })
}
</script>

<style>
.field { margin: 24rpx 0; }
.label { font-size: 26rpx; color: #666; margin-bottom: 12rpx; }
.input.single {
  width: 100%; box-sizing: border-box; min-height: 72rpx;
  border: 1rpx solid #e5e2da; border-radius: 12rpx; padding: 16rpx 20rpx;
  background: #fff; font-size: 28rpx;
}
.picker { line-height: 40rpx; color: #333; }
.travelers { display: flex; flex-direction: column; gap: 16rpx; }
.stepper { display: flex; align-items: center; gap: 20rpx; }
.step-name { font-size: 26rpx; color: #666; width: 80rpx; }
.step-btn {
  width: 56rpx; height: 56rpx; line-height: 52rpx; text-align: center;
  border: 1rpx solid #e5e2da; border-radius: 50%; font-size: 32rpx; color: #185FA5;
}
.step-num { font-size: 28rpx; color: #333; min-width: 80rpx; text-align: center; }
.btn.ghost { background: #fff; color: #185FA5; border: 1rpx solid #185FA5; }
.note.center { text-align: center; }
</style>
