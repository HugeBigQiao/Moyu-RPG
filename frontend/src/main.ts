/**
 * 应用入口。
 *
 * 职责：
 *     创建 Vue 应用，挂路由与全局样式，最后挂到 #app。
 * 为什么需要：
 *     入口只做装配，页面与逻辑分别在 app/ 与 areas/ 下。
 * 上下游：
 *     上游：index.html 的 <script type="module" src="/src/main.ts">；
 *     下游：app/App.vue、app/router.ts、style.css。
 */
import { createApp } from 'vue'

import App from './app/App.vue'
import router from './app/router'
import './style.css'

createApp(App).use(router).mount('#app')
