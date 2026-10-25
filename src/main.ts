import { createApp } from "vue"
// ElMessage 在 App.vue 中显式导入（非模板组件，插件不会自动处理），样式需手动引入；
// 其余 Element Plus 组件与样式由 unplugin-vue-components 按需自动注册。
import "element-plus/theme-chalk/el-message.css"
import "element-plus/theme-chalk/dark/css-vars.css"
import App from "./App.vue"
import "./styles.css"

createApp(App).mount("#app")
