import { fileURLToPath, URL } from "node:url"
import * as elementPlusIcons from "@element-plus/icons-vue"
import vue from "@vitejs/plugin-vue"
import Components from "unplugin-vue-components/vite"
import { ElementPlusResolver } from "unplugin-vue-components/resolvers"
import { defineConfig } from "vite"

// @element-plus/icons-vue 的全部图标名，模板中直接使用（如 <Loading />）即可按需自动解析
const iconNames = new Set(Object.keys(elementPlusIcons))

export default defineConfig({
  plugins: [
    vue(),
    // 模板中用到的 Element Plus 组件与图标按需自动注册，组件样式自动引入
    Components({
      resolvers: [
        ElementPlusResolver(),
        (name: string) => {
          if (iconNames.has(name)) {
            return { name, from: "@element-plus/icons-vue" }
          }
        },
      ],
      dts: "src/components.d.ts",
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
