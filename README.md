# CHUNITHM Song Atlas

CHUNITHM Song Atlas 是一个基于 Vue 3、Vite 和 Element Plus 的本地曲库浏览器，用于对照查看 JPN、EXP、CHN 三个区服的歌曲与谱面等级。CHN（国服）数据来自 lxns 查分器的公共 API，曲目 ID 与 SEGA 官方一致。网页运行时只读取 `public/` 中的本地 JSON 和封面，不会请求 SEGA 官方接口、lxns 接口或远程图片。

## 启动

```sh
pnpm install
pnpm run sync:data
pnpm run dev
```

`sync:data` 从官方曲库下载最新数据和全部可用封面，写入 `public/data/`、`public/images/jpn/` 和 `public/images/exp/`；国服曲库从 lxns API 下载并写入 `public/data/catalog-chn.json`。支持传入区服参数以缩小更新范围，如 `pnpm sync:data chn` 仅同步国服、`pnpm sync:data jpn exp` 只同步日区与国际区；不传参数时同步全部区服。新增曲目及其封面可通过再次运行此命令同步；已有封面会先检查源站并复用。与上次数据相比，只有同一首仍在曲库中的歌曲更换了封面 hash 时才清理旧封面；已下架歌曲的旧封面会保留。若封面源站返回 404，该区服不再引用该封面，页面按 JPN、EXP、CHN 顺序尝试其他区服封面；若均不可用，则显示本地占位图。国服不单独下载封面：国服曲库目前是 JPN/EXP 的子集，封面直接复用其他区服（lxns 图床有访问频率限制，也避免了重复存储）。

- JPN: `https://chunithm.sega.jp/storage/json/music.json`
- EXP: `https://chunithm.sega.com/assets/data/music.json`
- CHN: `https://maimai.lxns.net/api/v0/chunithm/song/list`（lxns 查分器公共 API，不传 version 参数即跟随国服当前版本）

每次同步会自动对比本地上次曲库并标记变更：首次出现的条目写入 `added_at`，等级、封面等内容发生变化的条目写入 `updated_at`（SEGA 的 `newflag` 新曲角标例行翻转不计入变更）；检测到曲目下架时会将其从曲库文件移除，并以完整快照记录到 `public/data/removed-jpn.json`、`removed-exp.json` 或 `removed-chn.json`（含 `removed_at`）；曲目重新上架时撤销下架记录并重新标记 `added_at`。时间戳均为 Unix 毫秒数，并统一归一为变化当天（UTC+8）的 10:00，同一天内多次同步幂等。“变化当天”的判定：SEGA 官方 JSON 内容不含时间信息，取响应头 `Last-Modified`（文件真实修改时间）所在日，缺失时退回检测日；lxns 为动态接口、无任何更新时间可用，取同步检测日。`added_at` 缺失表示该曲目在启用变更追踪前就已收录。页面暂不消费这些字段，为“新增/下架”视图预留。

打开终端中显示的本地地址即可使用。筛选支持曲名/曲师关键词、分类、谱面难度和区服收录情况，并可分页浏览。收录情况为一组三态复选框，点击循环切换：不限 → ✓ 收录 → ― 未收录；多个区服的条件同时生效（取交集）。

页面支持暗色与亮色主题。首次访问会跟随系统外观设置；手动切换后会保存选择，后续访问优先使用该主题，并同步适配 Element Plus 控件。

曲目卡片分别显示日本区、国际区与国服官方曲目 ID；字体大小以不低于 `1em` 为目标。

WORLD'S END 谱面会单独显示专用标识、谱面标记和星数；同一首歌在一个区服内有多个 WORLD'S END 谱面时会全部保留。

## 构建

```sh
pnpm run type-check
pnpm run lint
pnpm run format:check
pnpm run test
pnpm run build
pnpm run preview
```

修改代码后使用 `pnpm run format` 自动格式化；Oxlint 启用常见的正确性、可疑代码和性能规则，并检查 Vue 与 TypeScript 文件。
