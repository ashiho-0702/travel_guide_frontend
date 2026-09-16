<template>
  <view class="wrap">
    <view class="card">
      <view class="title">就着这个景点，随便问</view>
      <view class="sub">只回答当前景点相关问题，回答都会附出处</view>
      <textarea class="input" v-model="question" maxlength="200" />
      <view class="btn" @tap="ask" :class="{ disabled: loading }">
        {{ loading ? '思考中…' : '问一句' }}
      </view>
    </view>

    <view class="card" v-if="answer">
      <view class="output">{{ answer }}</view>
      <view class="source" v-for="s in sources" :key="s.cardId">
        来源：{{ s.title }}（{{ s.cardId }}）· {{ s.origin }}
      </view>
      <view class="note">回答基于景点知识库生成，内容由 AI 生成，仅供参考</view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { useLoad } from '@tarojs/taro'
import api from '../../services/api'

const poiId = ref('')
const question = ref('这个榫卯为什么不用钉子？')
const answer = ref('')
const sources = ref([])
const loading = ref(false)

useLoad(options => {
  if (options && options.poiId) poiId.value = options.poiId
})

// RAG 追问：高光②
function ask() {
  const q = (question.value || '').trim()
  if (!q || loading.value) return
  loading.value = true
  answer.value = ''
  sources.value = []

  let buffer = ''
  api.ask.question({ poiId: poiId.value, question: q, history: [] }, {
    onDelta: text => {
      buffer += text
      answer.value = buffer
    },
    onDone: data => {
      loading.value = false
      answer.value = data.answer || buffer
      sources.value = data.sources || []
    },
    onError: err => {
      loading.value = false
      // 契约约定：检索不到相关内容返回 3001，明确拒答，不编造
      answer.value = err.code === 3001 ? '暂无相关资料，换个问法试试？' : '追问服务暂时不可用'
    }
  })
}
</script>
