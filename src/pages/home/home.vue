<template>
  <view class="wrap">
    <!-- 顶部问候区 -->
    <view class="hero">
      <!-- 用户信息：来自登录响应里的 user（nickname / avatarUrl 均可空） -->
      <view class="hero-user">
        <image v-if="avatarUrl" class="hero-avatar" :src="avatarUrl" mode="aspectFill" />
        <view v-else class="hero-avatar hero-avatar-fallback">
          <text class="hero-avatar-char">{{ avatarChar }}</text>
        </view>
        <text class="hero-nick">你好，{{ nickname }}</text>
      </view>
      <view class="hero-title">小沃伴途</view>
      <view class="hero-sub">一句话，生成你的专属旅行攻略</view>
    </view>

    <!-- 中间插画占位区（后续可换成轮播/推荐卡片） -->
    <view class="placeholder">
      <text class="placeholder-text">首页内容位</text>
    </view>

    <!-- 底部 + 号：点击进入表单页创建行程 -->
    <view class="fab" @tap="goCreate">
      <text class="fab-icon">＋</text>
    </view>
    <view class="fab-tip">点击 ＋ 创建行程</view>
  </view>
</template>

<script setup>
import Taro from '@tarojs/taro'
import { useDidShow } from '@tarojs/taro'
import { computed } from 'vue'
import { sessionState, refreshSession } from '../../utils/auth'

// 用户信息来自登录响应里的 user（已由 utils/token.js 落地本地）
const user = computed(() => sessionState.user)
// 昵称兜底：微信侧现已拿不到昵称，后端可能返回空 → 用「微信用户」占位
const nickname = computed(() => (user.value && user.value.nickname) || (sessionState.loggedIn ? '微信用户' : '游客'))
// 头像兜底：无 avatarUrl 时用昵称首字做纯色圆形头像
const avatarUrl = computed(() => (user.value && user.value.avatarUrl) || '')
const avatarChar = computed(() => nickname.value.charAt(0))

// 每次进入首页都同步一次登录态（登录/退出后问候区自动更新）
useDidShow(() => {
  refreshSession()
})

// 跳转表单页：整条跳转链期间持锁防连点。
// 失败时不提前解锁（否则再点会和兜底跳转撞车，触发 routeDone webviewId 错乱）：
// 先等 400ms 重试一次 navigateTo，仍失败才用 reLaunch 兜底
let routing = false
function goCreate() {
  if (routing) return
  routing = true
  const url = '/pages/index/index'
  const unlock = () => { routing = false }
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
.wrap {
  min-height: 100vh;
  background: #e9f5f0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40rpx;
  box-sizing: border-box;
}
.hero { margin-top: 60rpx; text-align: center; }
/* 用户信息行 */
.hero-user {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
  margin-bottom: 28rpx;
}
.hero-avatar {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 4rpx 12rpx rgba(46, 110, 94, 0.12);
}
/* 无头像时的兜底：昵称首字 + 薄荷绿圆底 */
.hero-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #4cbfa6;
}
.hero-avatar-char { color: #ffffff; font-size: 36rpx; font-weight: 600; }
.hero-nick { font-size: 30rpx; font-weight: 600; color: #2e6e5e; }
.hero-title { font-size: 52rpx; font-weight: 700; color: #2e6e5e; }
.hero-sub { margin-top: 16rpx; font-size: 28rpx; color: #6ba292; }
.placeholder {
  margin-top: 60rpx;
  width: 100%;
  height: 500rpx;
  background: #ffffff;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.placeholder-text { font-size: 26rpx; color: #c2cfc9; }
/* 悬浮 + 号按钮 */
.fab {
  position: fixed;
  bottom: 190rpx;
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: #4cbfa6;
  box-shadow: 0 8rpx 24rpx rgba(76, 191, 166, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
}
.fab-icon { color: #ffffff; font-size: 64rpx; font-weight: 300; line-height: 1; }
.fab-tip {
  position: fixed;
  bottom: 120rpx;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 24rpx;
  color: #6ba292;
}
</style>
