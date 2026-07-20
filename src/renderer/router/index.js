import { createRouter, createWebHashHistory } from "vue-router";

const Home = () => import("../views/Home.vue");
const Search = () => import("../views/SearchTabs.vue");
const PackageSearch = () => import("../views/PackageSearch.vue");
const Test = () => import("../views/Test.vue");
const DataBase = () => import("../views/DataBase.vue");
const Import = () => import("../views/Import.vue");
const Settings = () => import("../views/Settings.vue");
const Info = () => import("../views/Info.vue");

const routes = [
  { path: "/", name: "Home", component: Home },
  { path: "/search", name: "Search", component: Search },
  { path: "/package-search", name: "PackageSearch", component: PackageSearch },
  { path: "/database", name: "DataBase", component: DataBase },
  { path: "/import", name: "Import", component: Import },
  { path: "/settings", name: "Settings", component: Settings },
  { path: "/info", name: "Info", component: Info },
  { path: "/test", name: "Test", component: Test },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
