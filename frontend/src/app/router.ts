/**
 * 路由表。
 *
 * 职责：
 *     把 URL 映射到页面组件；meta.title / meta.subtitle 供顶栏显示。
 * 为什么需要：
 *     页面分发集中在一处，新增区域只要在 areas/ 下加组件、这里加一条记录。
 * 上下游：
 *     上游：main.ts 挂到应用；下游：areas/ 下的页面组件。
 */
import { createRouter, createWebHistory } from 'vue-router'

import ArchiveView from '../areas/archive/ArchiveView.vue'
import CharacterView from '../areas/play/CharacterView.vue'
import CreateView from '../areas/play/CreateView.vue'
import GameView from '../areas/play/GameView.vue'
import HomeView from '../areas/HomeView.vue'
import PlayView from '../areas/play/PlayView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { title: '玄门诡事录' } },
    { path: '/archive/:kind?', name: 'archive', component: ArchiveView, meta: { title: '背景档案' } },
    { path: '/game', name: 'game', component: GameView, meta: { title: '开始游戏' } },
    { path: '/characters/:id', name: 'character', component: CharacterView, meta: { title: '人物档案' } },
    { path: '/create', name: 'create', component: CreateView, meta: { title: '新建角色' } },
    { path: '/play/:id', name: 'play', component: PlayView, meta: { title: '事件处置' } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
