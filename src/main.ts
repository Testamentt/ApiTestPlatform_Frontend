// 本项目编码格式：UTF-8（无 BOM）。
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import '@/styles/index.scss'
import App from './App.vue'
import router from './router'
import pinia from '@/stores'

// why：pinia 先于 router 安装——路由守卫 useUserStore() 依赖活动 pinia 实例，
// 首次导航在挂载后异步触发，此时实例已就绪。
const app = createApp(App)
app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
