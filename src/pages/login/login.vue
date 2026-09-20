<template>
  <view class="lg-page">
    <!-- 全页背景图（地图+大头针） -->
    <image class="lg-bg" src="../../assets/login-bg.jpg" mode="widthFix" />

    <view class="lg-body">
      <!-- 问候语 -->
      <view class="lg-hello">
        <text class="lg-hello-txt">Hello</text>
        <view class="lg-hello-line"></view>
      </view>

      <!-- 微信一键登录（唯一登录方式） -->
      <view class="lg-btn-wx" :class="{ disabled: submitting }" @tap="wxLogin">
        <text class="lg-wx-ico">💬</text>
        <text>{{ submitting ? '登录中…' : '微信一键登录' }}</text>
      </view>

      <view class="lg-tip">登录后即可生成专属旅行攻略</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import Taro, { useLoad } from '@tarojs/taro'
import { silentLogin, isLoggedIn, isTokenValid } from '../../utils/auth'

const submitting = ref(false)

// 启动判断：token 仍有效 → 直接进首页
// 有 token 但已过期 → 先静默重登（用户无感），成功进首页，失败留在登录页
useLoad(() => {
  if (isTokenValid()) {
    Taro.reLaunch({ url: '/pages/home/home' })
    return
  }
  if (isLoggedIn()) {
    Taro.showLoading({ title: '登录中…', mask: true })
    silentLogin()
      .then(() => Taro.reLaunch({ url: '/pages/home/home' }))
      .catch(() => { /* 重登失败：留在登录页，等用户点按钮 */ })
      .finally(() => Taro.hideLoading())
  }
})

// 微信一键登录：wx.login 拿 code 换 token，成功后进首页
function wxLogin() {
  if (submitting.value) return
  submitting.value = true
  Taro.showLoading({ title: '登录中…', mask: true })
  silentLogin()
    .then(() => Taro.reLaunch({ url: '/pages/home/home' }))
    .catch(err => {
      // 502 是后端调微信接口失败（服务端问题），其余（401 code 失效等）重试一次通常就好
      const msg = err && err.code === 502 ? '微信服务异常，请稍后重试' : '登录失败，请重试'
      Taro.showToast({ title: msg, icon: 'none' })
    })
    .finally(() => {
      Taro.hideLoading()
      submitting.value = false
    })
}
</script>

<style>
/* 登录页类名带 lg- 前缀，避免全局样式冲突 */
.lg-page {
  position: relative;
  min-height: 100vh;
  background: #f7f9f9;
  box-sizing: border-box;
}

/* 全页背景图：铺在底层，内容浮在上面 */
.lg-bg {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 0;
  pointer-events: none;
}
.lg-body {
  position: relative;
  z-index: 1;
  padding: 60rpx 48rpx 60rpx;
  box-sizing: border-box;
}

/* Hello 标题；下方留出 780rpx 露出背景图的地图区域 */
.lg-hello { margin: 20rpx 0 780rpx; }
.lg-hello-txt {
  font-size: 88rpx;
  font-weight: 800;
  color: #1f2d2a;
  line-height: 1.1;
}
.lg-hello-line {
  width: 180rpx;
  height: 10rpx;
  border-radius: 6rpx;
  background: #4cbfa6;
  margin-top: 10rpx;
}

/* 微信一键登录按钮 */
.lg-btn-wx {
  height: 96rpx;
  border-radius: 48rpx;
  background: #4cbfa6;
  color: #ffffff;
  font-size: 34rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  box-shadow: 0 8rpx 24rpx rgba(76, 191, 166, 0.35);
}
.lg-btn-wx.disabled { opacity: 0.6; }
.lg-wx-ico { font-size: 34rpx; }

.lg-tip {
  margin-top: 28rpx;
  text-align: center;
  font-size: 24rpx;
  color: #9aa8a4;
}
</style>
