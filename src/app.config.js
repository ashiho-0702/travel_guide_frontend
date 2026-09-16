// 全局页面注册与窗口/tabBar 配置（对应原生 app.json）
export default {
  pages: [
    'pages/index/index',
    'pages/itinerary/itinerary',
    'pages/guide/guide',
    'pages/chat/chat'
  ],
  window: {
    navigationBarTitleText: '智慧文旅',
    navigationBarBackgroundColor: '#ffffff',
    navigationBarTextStyle: 'black',
    backgroundColor: '#f7f7f5',
    backgroundTextStyle: 'light'
  },
  tabBar: {
    color: '#888780',
    selectedColor: '#185FA5',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/index/index', text: '规划' },
      { pagePath: 'pages/guide/guide', text: '讲解' }
    ]
  },
  permission: {
    'scope.userFuzzyLocation': {
      desc: '用于展示你附近的景点'
    }
  },
  requiredPrivateInfos: ['getFuzzyLocation'],
  style: 'v2'
}
