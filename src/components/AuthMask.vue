<template>
  <view v-if="authState.visible" class="auth-mask">
    <view class="auth-card">
      <view class="auth-logo">🧳</view>
      <view class="auth-title">欢迎使用 AI 旅行规划</view>
      <view class="auth-desc">
        {{ authState.pending ? '该功能需要登录后使用，登录后继续' : '登录后可保存行程历史、记住你的旅行偏好' }}
      </view>
      <view class="auth-btn" :class="{ disabled: loading }" @tap="doLogin">
        {{ loading ? '登录中…' : '微信一键授权登录' }}
      </view>
      <view class="auth-skip" @tap="onSkip">暂不登录</view>
    </view>
  </view>
</template>

<script setup>
// 全局授权弹层：哪个页面需要拦截登录，就引入一个 <AuthMask />
// 状态与拦截逻辑在 utils/auth.js（authState + requireLogin）
import { ref } from 'vue'
import Taro from '@tarojs/taro'
import { authState, silentLogin, finishLogin, cancelLogin } from '../utils/auth'

const loading = ref(false)

function doLogin() {
  if (loading.value) return
  loading.value = true
  silentLogin()
    .then(() => {
      Taro.showToast({ title: '登录成功', icon: 'success' })
      finishLogin() // 关弹层并继续被拦截的操作
    })
    .catch(err => {
      console.warn('[auth] 登录失败', err)
      Taro.showToast({ title: '登录失败，请重试', icon: 'none' })
    })
    .finally(() => { loading.value = false })
}

function onSkip() {
  cancelLogin()
}
</script>
