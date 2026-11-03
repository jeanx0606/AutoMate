import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import AddPlatform from '../views/AddPlatform.vue'
import Settings from '../views/Settings.vue'
import Wifi from '../views/Wifi.vue'
import GroupManagement from '../views/GroupManagement.vue'
import Help from '../views/Help.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: Home,
    meta: { titleKey: 'router.home' }
  },
  {
    path: '/add',
    name: 'add',
    component: AddPlatform,
    meta: { titleKey: 'router.add' }
  },
  {
    path: '/edit/:id',
    name: 'edit',
    component: AddPlatform,
    meta: { titleKey: 'router.edit' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: Settings,
    meta: { titleKey: 'router.settings' }
  },
  {
    path: '/wifi',
    name: 'wifi',
    component: Wifi,
    meta: { titleKey: 'router.wifi' }
  },
  {
    path: '/web-management',
    name: 'web-management',
    component: GroupManagement,
    meta: { titleKey: 'router.webManagement' }
  },
  {
    path: '/help',
    name: 'help',
    component: Help,
    meta: { titleKey: 'router.help' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router