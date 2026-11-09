import { createRouter, createWebHistory } from 'vue-router'

import HomeView from './views/HomeView.vue'
import ArchiveView from './views/ArchiveView.vue'
import GameView from './views/GameView.vue'
import CharacterView from './views/CharacterView.vue'
import CreateView from './views/CreateView.vue'
import PlayView from './views/PlayView.vue'

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
