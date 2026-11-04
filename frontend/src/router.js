import { createRouter, createWebHistory } from 'vue-router'

import DashboardView from './views/DashboardView.vue'
import RosterView from './views/RosterView.vue'
import CreateView from './views/CreateView.vue'
import CharacterView from './views/CharacterView.vue'
import PlayView from './views/PlayView.vue'
import ScenariosView from './views/ScenariosView.vue'
import WorldView from './views/WorldView.vue'
import EventsView from './views/EventsView.vue'
import MissionsView from './views/MissionsView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: DashboardView, meta: { crumb: '总览 / dashboard', nav: 'dashboard' } },
    { path: '/roster', name: 'roster', component: RosterView, meta: { crumb: '人员档案 / personnel', nav: 'roster' } },
    { path: '/create', name: 'create', component: CreateView, meta: { crumb: '人员档案 / 新建角色', nav: 'roster' } },
    { path: '/characters/:id', name: 'character', component: CharacterView, meta: { crumb: '实例详情 / instance', nav: 'roster' } },
    { path: '/play/:id', name: 'play', component: PlayView, meta: { crumb: '事件处置 / incident', nav: 'play' } },
    { path: '/world', name: 'world', component: WorldView, meta: { crumb: '世界档案 / world', nav: 'world' } },
    { path: '/events', name: 'events', component: EventsView, meta: { crumb: '事件库 / events', nav: 'events' } },
    { path: '/missions', name: 'missions', component: MissionsView, meta: { crumb: '任务库 / missions', nav: 'missions' } },
    { path: '/scenarios', name: 'scenarios', component: ScenariosView, meta: { crumb: '作业手册 / runbooks', nav: 'scenarios' } },
    { path: '/:pathMatch(.*)*', redirect: '/' }
  ],
  scrollBehavior() {
    return { top: 0 }
  }
})

export default router
