# CHUNITHM Song Atlas

CHUNITHM Song Atlas 是一个基于 Vue 3、Vite 和 Element Plus 的本地曲库浏览器，用于对照查看 JPN、EXP 两个区服的歌曲与谱面等级。CHN 区服暂时没有接入数据源，因此显示为“未知”。网页运行时只读取 `public/` 中的本地 JSON 和封面，不会请求 SEGA 官方接口或远程图片。

## 启动

```sh
pnpm install
pnpm run sync:data
pnpm run dev
```

`sync:data` 从官方曲库下载最新数据和全部可用封面，写入 `public/data/`、`public/images/jpn/` 和 `public/images/exp/`。新增曲目及其封面可通过再次运行此命令同步；已有封面会复用。若官方图片源返回 404，该曲目会显示页面内的本地占位图，并在同步结果中报告数量。

- JPN: `https://chunithm.sega.jp/storage/json/music.json`
- EXP: `https://chunithm.sega.com/assets/data/music.json`

打开终端中显示的本地地址即可使用。筛选支持曲名/曲师关键词、分类、谱面难度和区服收录情况，并可分页浏览。

## 构建

```sh
pnpm run type-check
pnpm run lint
pnpm run format:check
pnpm run build
pnpm run preview
```

修改代码后使用 `pnpm run format` 自动格式化；Oxlint 启用常见的正确性、可疑代码和性能规则，并检查 Vue 与 TypeScript 文件。
