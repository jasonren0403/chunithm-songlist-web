import { createApp } from 'vue'
import {
  ElAlert,
  ElButton,
  ElConfigProvider,
  ElEmpty,
  ElIcon,
  ElInput,
  ElOption,
  ElPagination,
  ElSelect,
  ElTag,
} from 'element-plus'
import 'element-plus/theme-chalk/base.css'
import 'element-plus/theme-chalk/el-alert.css'
import 'element-plus/theme-chalk/el-button.css'
import 'element-plus/theme-chalk/el-config-provider.css'
import 'element-plus/theme-chalk/el-empty.css'
import 'element-plus/theme-chalk/el-input.css'
import 'element-plus/theme-chalk/el-message.css'
import 'element-plus/theme-chalk/el-option.css'
import 'element-plus/theme-chalk/el-pagination.css'
import 'element-plus/theme-chalk/el-select.css'
import 'element-plus/theme-chalk/el-tag.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import App from './App.vue'
import './styles.css'

const app = createApp(App)

app.component('ElAlert', ElAlert)
app.component('ElButton', ElButton)
app.component('ElConfigProvider', ElConfigProvider)
app.component('ElEmpty', ElEmpty)
app.component('ElIcon', ElIcon)
app.component('ElInput', ElInput)
app.component('ElOption', ElOption)
app.component('ElPagination', ElPagination)
app.component('ElSelect', ElSelect)
app.component('ElTag', ElTag)
app.mount('#app')
