<template>
  <view class="fm-shell">
    <!-- 表单区：放进 scroll-view 独立滚动，底栏不悬浮，内容永远不会滑到底栏下面
         （input 是原生组件层级最高，普通 view 盖不住，只能靠布局隔离） -->
    <scroll-view class="fm-scroll" :scroll-y="true">
      <view class="fm-wrap">
    <!-- 一句话输入（创新点：解析后预填表单，后端 /api/parse 待补，mock 先行） -->
    <view class="fm-card">
      <view class="fm-sec">
        <view class="fm-sec-ico">💬</view>
        <view class="fm-sec-title">一句话，帮你填好表单</view>
      </view>
      <textarea class="fm-textarea" v-model="oneLine" maxlength="200"
        placeholder="例如：周末去杭州两天，不想爬坡，喜欢古建筑和美食" />
      <view class="fm-parse-btn" @tap="quickFill" :class="{ disabled: parsing }">
        {{ parsing ? '理解中…' : '帮我填表单' }}
      </view>
    </view>

    <!-- 卡片1：基本信息 + 人数 -->
    <view class="fm-card">
      <view class="fm-sec">
        <view class="fm-sec-ico">🕐</view>
        <view class="fm-sec-title">基本信息</view>
        <text class="fm-req">*</text>
      </view>

      <view class="fm-row">
        <text class="fm-row-label">目的地城市</text>
        <input class="fm-row-input" v-model="form.destinationCity" maxlength="50" placeholder="请输入城市" />
        <text class="fm-chev">›</text>
      </view>

      <view class="fm-row">
        <text class="fm-row-label">开始日期</text>
        <picker mode="date" :value="form.startDate" :start="today" @change="onStartDate">
          <view class="fm-row-value" :class="{ placeholder: !form.startDate }">
            {{ form.startDate || '请选择' }} <text class="fm-chev">›</text>
          </view>
        </picker>
      </view>

      <view class="fm-row last">
        <text class="fm-row-label">结束日期</text>
        <picker mode="date" :value="form.endDate" :start="form.startDate || today" @change="onEndDate">
          <view class="fm-row-value" :class="{ placeholder: !form.endDate }">
            {{ form.endDate || '请选择' }} <text class="fm-chev">›</text>
          </view>
        </picker>
      </view>

      <view class="fm-sec gap">
        <view class="fm-sec-ico">👤</view>
        <view class="fm-sec-title">人数</view>
        <text class="fm-req">*</text>
      </view>
      <view class="fm-row last">
        <text class="fm-row-label">总人数</text>
        <view class="fm-stepper">
          <text class="fm-step-btn" @tap="stepTotal(-1)">−</text>
          <text class="fm-step-num">{{ totalTravelers }}</text>
          <text class="fm-step-btn plus" @tap="stepTotal(1)">＋</text>
        </view>
      </view>
    </view>

    <!-- 卡片2：总预算（填写式，选填） -->
    <view class="fm-card">
      <view class="fm-sec">
        <view class="fm-sec-ico">💰</view>
        <view class="fm-sec-title">总预算</view>
      </view>
      <view class="fm-budget-input-row">
        <text class="fm-budget-yen">¥</text>
        <input class="fm-budget-input" type="digit" v-model="budgetInput"
          placeholder="请输入总预算（选填）" />
        <text class="fm-budget-unit">元</text>
      </view>
      <view class="fm-budget-tip">含住宿/餐饮/门票/市内交通，不含往返大交通</view>
    </view>

    <!-- 卡片3：偏好设置 -->
    <view class="fm-card">
      <view class="fm-sec">
        <view class="fm-sec-ico">🤍</view>
        <view class="fm-sec-title">偏好设置</view>
      </view>

      <view class="fm-sub">兴趣</view>
      <view class="fm-tags">
        <text class="fm-tag" v-for="p in PREF_OPTIONS" :key="p.value" @tap="togglePref(p.value)"
          :class="{ active: form.preferences.indexOf(p.value) >= 0 }">{{ p.label }}</text>
      </view>

      <view class="fm-sub">体力 <text class="fm-req">*</text></view>
      <view class="fm-tags">
        <text class="fm-tag" v-for="e in ENERGY_OPTIONS" :key="e.value" @tap="form.energyLevel = e.value"
          :class="{ active: form.energyLevel === e.value }">{{ e.label }}</text>
      </view>

      <view class="fm-sub">交通方式 <text class="fm-req">*</text></view>
      <view class="fm-tags">
        <text class="fm-tag" v-for="t in TRANSPORT_OPTIONS" :key="t.value" @tap="toggleTransport(t.value)"
          :class="{ active: form.transportModes.indexOf(t.value) >= 0 }">{{ t.label }}</text>
      </view>
    </view>

    <!-- 卡片4：更多需求 -->
    <view class="fm-card">
      <view class="fm-sec">
        <view class="fm-sec-ico">📝</view>
        <view class="fm-sec-title">更多需求</view>
      </view>
      <textarea class="fm-textarea tall" v-model="form.extraRequirements" maxlength="1000"
        placeholder="请写下您的更多需求" />
      <view class="fm-count">{{ (form.extraRequirements || '').length }}/1000</view>
    </view>
      </view>
    </scroll-view>

    <!-- 底部操作栏：重置 + 确定（不悬浮，位于滚动区外） -->
    <view class="fm-footer">
      <view class="fm-footer-btn reset" @tap="reset">重置</view>
      <view class="fm-footer-btn ok" @tap="submit" :class="{ disabled: submitting }">
        {{ submitting ? '创建中…' : '确定' }}
      </view>
    </view>

    <AuthMask />
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import Taro from '@tarojs/taro'
import api from '../../services/api'
import { isLoggedIn, authState, requireLogin } from '../../utils/auth'
import AuthMask from '../../components/AuthMask.vue'

const PREF_OPTIONS = [
  { value: 'nature', label: '自然' }, { value: 'culture', label: '人文' },
  { value: 'food', label: '美食' }, { value: 'photography', label: '网红' },
  { value: 'shopping', label: '购物' }, { value: 'family', label: '亲子' },
  { value: 'nightlife', label: '夜游' }, { value: 'relaxation', label: '休闲' },
  { value: 'theme_park', label: '主题乐园' }
]
const ENERGY_OPTIONS = [
  { value: 'easy', label: '轻松' }, { value: 'medium', label: '适中' }, { value: 'hard', label: '充沛' }
]
const TRANSPORT_OPTIONS = [
  { value: 'walking', label: '步行' }, { value: 'transit', label: '公交' },
  { value: 'taxi', label: '打车' }, { value: 'driving', label: '自驾' }, { value: 'cycling', label: '骑行' }
]

const today = new Date().toISOString().slice(0, 10)
const emptyForm = () => ({
  destinationCity: '',
  startDate: '',
  endDate: '',
  travelers: { adults: 2, children: 0, seniors: 0 },
  preferences: [],
  energyLevel: 'medium',
  transportModes: ['transit', 'walking'],
  extraRequirements: ''
})
const form = ref(emptyForm())
const budgetInput = ref('')
const oneLine = ref('')
const parsing = ref(false)
const submitting = ref(false)

const totalTravelers = computed(() => {
  const t = form.value.travelers
  return t.adults + t.children + t.seniors
})

// 首次进入且未登录：直接弹授权框（游客模式可跳过）
if (!isLoggedIn()) authState.visible = true

// ---------- 日期工具（手动拼接避免 toISOString 的 UTC 偏移坑） ----------
function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function diffDays(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000) + 1
}
function addDays(s, n) {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  const p = x => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

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
    if (parsed.days) {
      // 有开始日期才算得出结束日期
      if (f.startDate) f.endDate = addDays(f.startDate, parsed.days - 1)
    }
    if (parsed.travelers) {
      const t = parsed.travelers
      const total = (t.adults || 0) + (t.children || 0) + (t.seniors || 0)
      if (total >= 1) f.travelers = { adults: total, children: 0, seniors: 0 }
    }
    if (parsed.preferences && parsed.preferences.length) f.preferences = parsed.preferences
    if (parsed.energyLevel) f.energyLevel = parsed.energyLevel
    if (parsed.transportModes && parsed.transportModes.length) f.transportModes = parsed.transportModes
    if (parsed.budgetCny > 0) budgetInput.value = String(parsed.budgetCny)
    f.extraRequirements = parsed.extraRequirements || ''
    Taro.showToast({ title: parsed.startDate ? '已填好，请确认信息' : '已填好，请选择日期', icon: 'none' })
  }).catch(() => {
    Taro.showToast({ title: '没理解这句话，手动填一下吧', icon: 'none' })
  }).finally(() => { parsing.value = false })
}

// ---------- 表单交互 ----------
function onStartDate(e) {
  form.value.startDate = e.detail.value
  // 开始日期晚于结束日期时，结束日期自动顺延对齐
  if (form.value.endDate && form.value.endDate < form.value.startDate) {
    form.value.endDate = form.value.startDate
  }
}
function onEndDate(e) { form.value.endDate = e.detail.value }
function stepTotal(d) {
  const v = totalTravelers.value + d
  if (v >= 1 && v <= 20) form.value.travelers = { adults: v, children: 0, seniors: 0 }
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
function reset() {
  form.value = emptyForm()
  budgetInput.value = ''
}

// ---------- 校验（口径与后端一致，前端先挡一层） ----------
function validate() {
  const f = form.value
  if (!f.destinationCity.trim()) return '请填写目的地城市'
  if (!f.startDate) return '请选择开始日期'
  if (f.startDate < today) return '开始日期不能早于今天'
  if (!f.endDate) return '请选择结束日期'
  const days = diffDays(f.startDate, f.endDate)
  if (days < 1 || days > 15) return '行程天数须为 1–15 天'
  const total = totalTravelers.value
  if (total < 1 || total > 20) return '人数须为 1–20 人'
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
  const days = diffDays(f.startDate, f.endDate)
  const payload = {
    destinationCity: f.destinationCity.trim(),
    startDate: f.startDate,
    days,
    // 界面只填总人数，按后端口径全部计入成人
    travelers: { adults: totalTravelers.value, children: 0, seniors: 0 },
    preferences: f.preferences,
    energyLevel: f.energyLevel,
    transportModes: f.transportModes
  }
  // 可选字段不传空值（后端约定：未填写直接省略）；预算填了且大于 0 才传
  const budget = parseFloat(budgetInput.value)
  if (budget > 0) payload.totalBudgetCny = budget
  if (f.extraRequirements.trim()) payload.extraRequirements = f.extraRequirements.trim()

  api.trips.create(payload).then(res => {
    Taro.setStorageSync('currentTripId', res.tripId)
    goItinerary(res.tripId)
  }).catch(e => {
    Taro.showToast({ title: e.message || '创建失败，请重试', icon: 'none' })
  }).finally(() => { submitting.value = false })
}

// 跳转生成页：整条跳转链期间持锁防连点。
// 失败时不提前解锁（否则再点会和兜底跳转撞车，触发 routeDone webviewId 错乱）：
// 先等 400ms 重试一次 navigateTo，仍失败才用 reLaunch 兜底
let routing = false
function goItinerary(tripId) {
  if (routing) return
  routing = true
  const url = `/pages/itinerary/itinerary?tripId=${tripId}`
  const unlock = () => setTimeout(() => { routing = false }, 600)
  Taro.navigateTo({ url })
    .then(unlock)
    .catch(() => {
      setTimeout(() => {
        Taro.navigateTo({ url })
          .then(unlock)
          .catch(() => {
            Taro.reLaunch({ url })
              .then(unlock)
              .catch(() => {
                unlock()
                Taro.showToast({ title: '跳转失败，请重试', icon: 'none' })
              })
          })
      }, 400)
    })
}
</script>

<style>
/* 全部类名带 fm- 前缀：小程序样式是全局的，避免和其他页面冲突 */
/* 上下结构：滚动区 + 底栏，避免 input 原生组件穿透悬浮底栏 */
.fm-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #e9f5f0;
}
/* 小程序 scroll-view 对 flex 支持不完整：必须 height:0 + flex:1 才能被 flex 撑开并获得滚动 */
.fm-scroll { flex: 1; height: 0; }
.fm-wrap {
  background: #e9f5f0;
  padding: 24rpx 24rpx 40rpx;
  box-sizing: border-box;
}
.fm-card {
  background: #ffffff;
  border-radius: 24rpx;
  padding: 28rpx 28rpx 32rpx;
  margin-bottom: 24rpx;
}
/* 分组标题：圆形图标 + 标题 + 红星 */
.fm-sec { display: flex; align-items: center; margin-bottom: 8rpx; }
.fm-sec.gap { margin-top: 32rpx; }
.fm-sec-ico {
  width: 48rpx; height: 48rpx; border-radius: 50%;
  background: #e2f3ed; font-size: 26rpx;
  display: flex; align-items: center; justify-content: center;
  margin-right: 14rpx;
}
.fm-sec-title { font-size: 32rpx; font-weight: 600; color: #2e3a36; }
.fm-req { color: #e24b4a; font-size: 30rpx; margin-left: 8rpx; }
/* 信息行：左标签 右值 */
.fm-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 26rpx 0; border-bottom: 1rpx solid #f0f4f2;
}
.fm-row.last { border-bottom: none; }
.fm-row-label { font-size: 28rpx; color: #4a5551; }
.fm-row-input {
  flex: 1; text-align: right; font-size: 28rpx; color: #2e3a36; margin-right: 8rpx;
}
.fm-row-value { font-size: 28rpx; color: #2e3a36; }
.fm-row-value.placeholder { color: #b8c6c1; }
.fm-chev { color: #c2cfc9; font-size: 30rpx; margin-left: 8rpx; }
/* 步进器（总人数） */
.fm-stepper { display: flex; align-items: center; gap: 24rpx; }
.fm-step-btn {
  width: 52rpx; height: 52rpx; line-height: 48rpx; text-align: center;
  border: 1rpx solid #dce8e3; border-radius: 50%;
  font-size: 32rpx; color: #4cbfa6; background: #fff;
}
.fm-step-btn.plus { background: #4cbfa6; color: #fff; border-color: #4cbfa6; }
.fm-step-num { font-size: 30rpx; color: #2e3a36; min-width: 60rpx; text-align: center; }
/* 预算输入 */
.fm-budget-input-row {
  display: flex; align-items: center; gap: 12rpx; margin-top: 16rpx;
  border: 1rpx solid #e3eae7; border-radius: 12rpx;
  padding: 18rpx 24rpx; background: #fff;
  overflow: hidden; /* 原生 input 超出部分不可见，防止文字透出框外 */
}
.fm-budget-yen { font-size: 32rpx; color: #2e8b77; line-height: 1; }
/* 小程序原生 input 有默认高度，必须显式限高，否则文字会溢出容器 */
.fm-budget-input {
  flex: 1; font-size: 28rpx; color: #2e3a36;
  height: 44rpx; min-height: 44rpx; line-height: 44rpx;
}
.fm-budget-unit { font-size: 26rpx; color: #6b7a75; line-height: 1; }
.fm-budget-tip { font-size: 22rpx; color: #b0beb9; margin-top: 14rpx; }
/* 标签多选 */
.fm-sub { font-size: 28rpx; color: #4a5551; margin: 24rpx 0 16rpx; }
.fm-tags { display: flex; flex-wrap: wrap; gap: 16rpx; }
.fm-tag {
  padding: 10rpx 28rpx; border-radius: 10rpx; font-size: 26rpx;
  border: 1rpx solid #e3eae7; color: #6b7a75; background: #fff;
}
.fm-tag.active {
  border-color: #4cbfa6; color: #2e8b77; background: #e5f4ef;
}
/* 文本域 */
.fm-textarea {
  width: 100%; box-sizing: border-box; min-height: 160rpx; margin-top: 16rpx;
  background: #f6faf8; border-radius: 16rpx; padding: 20rpx 24rpx;
  font-size: 28rpx; color: #2e3a36;
}
.fm-textarea.tall { min-height: 240rpx; background: transparent; padding: 0; }
.fm-parse-btn {
  margin-top: 20rpx; text-align: center; padding: 18rpx 0;
  border: 1rpx solid #4cbfa6; color: #2e8b77; border-radius: 16rpx; font-size: 28rpx;
}
.fm-parse-btn.disabled { opacity: 0.5; }
.fm-count { text-align: right; font-size: 22rpx; color: #b0beb9; margin-top: 12rpx; }
/* 底部操作栏 */
.fm-footer {
  flex-shrink: 0; /* 固定在滚动区下方，普通流式布局，内容不会滑到它下面 */
  display: flex; gap: 24rpx;
  padding: 20rpx 40rpx calc(20rpx + env(safe-area-inset-bottom));
  background: #e9f5f0;
}
.fm-footer-btn {
  flex: 1; text-align: center; padding: 22rpx 0;
  border-radius: 44rpx; font-size: 30rpx;
}
.fm-footer-btn.reset { background: #fff; color: #4a5551; border: 1rpx solid #dce8e3; }
.fm-footer-btn.ok { background: #4cbfa6; color: #fff; }
.fm-footer-btn.ok.disabled { opacity: 0.6; }
</style>
