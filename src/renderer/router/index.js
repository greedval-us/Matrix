import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Search from '@/renderer/views/SearchTabs.vue';
import PackageSearch from '@/renderer/views/PackageSearch.vue';
import Test from '../views/Test.vue'
import DataBase from '../views/DataBase.vue';
import Settings from '../views/Settings.vue';
import Info from '../views/Info.vue';

const routes = [
  { path: '/', name: 'Home', component: Home },
  { path: '/search', name: 'Search', component: Search },
  { path: '/package-search', name: 'PackageSearch', component: PackageSearch },
  { path: '/database', name: 'DataBase', component: DataBase },
  { path: '/settings', name: 'Settings', component: Settings },
  { path: '/info', name: 'Info', component: Info },
  { path: '/test', name: 'Test', component: Test },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router