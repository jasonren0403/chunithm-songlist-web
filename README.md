# CHUNITHM Song Atlas

CHUNITHM Song Atlas 是一个基于 Vue 3、Vite 和 Element Plus 的本地曲库浏览器，用于对照查看 JPN、EXP、CHN 三个区服的歌曲与谱面等级。CHN（国服）数据来自 lxns 查分器的公共 API，曲目 ID 与 SEGA 官方一致。网页运行时只读取 `public/` 中的本地 JSON 和封面，不会请求 SEGA 官方接口、lxns 接口或远程图片。

## 启动

```sh
pnpm install
pnpm run sync:data
pnpm run dev
```

封面图片存放在独立仓库 [chunithm-songlist-covers](https://github.com/jasonren0403/chunithm-songlist-covers)（私有），主仓通过 git submodule 挂载在 `public/images`。**封面是可选增强**：缺少封面时站点依然可以正常构建和使用，卡片会显示占位图（封面回退链为 JPN → EXP → CHN）。

```sh
git clone --recursive git@github.com:jasonren0403/chunithm-songlist-web.git
# 已克隆但缺少封面 submodule 时：
git submodule update --init --recursive
```

- **拥有封面仓权限**：按上面的命令拉取 submodule，封面随仓库版本管理；CI 通过 `COVERS_TOKEN` 拉取并更新指针。
- **没有权限的公开克隆者**：直接 `git clone` 即可，站点照常构建（无封面时显示占位图）。若想本地也有封面，执行 `pnpm run sync:data` 会从官方 CDN 拉取到本地 `public/images/`，该路径已在 `.gitignore` 中忽略，不会进入仓库。
- **部署**：产物中的封面来自构建时的 `public/images`，与仓库是否公开无关。

`sync:data` 从官方曲库下载最新数据和全部可用封面，写入 `public/data/`、`public/images/jpn/` 和 `public/images/exp/`；国服曲库从 lxns API 下载并写入 `public/data/catalog-chn.json`。支持传入区服参数以缩小更新范围，如 `pnpm sync:data chn` 仅同步国服、`pnpm sync:data jpn exp` 只同步日区与国际区；不传参数时同步全部区服。新增曲目及其封面可通过再次运行此命令同步；已有封面会先检查源站并复用。与上次数据相比，只有同一首仍在曲库中的歌曲更换了封面 hash 时才清理旧封面；已下架歌曲的旧封面会保留。若封面源站返回 404，该区服不再引用该封面，页面按 JPN、EXP、CHN 顺序尝试其他区服封面；若均不可用，则显示本地占位图。国服不单独下载封面：国服曲库目前是 JPN/EXP 的子集，封面直接复用其他区服（lxns 图床有访问频率限制，也避免了重复存储）。

- JPN: `https://chunithm.sega.jp/storage/json/music.json`
- EXP: `https://chunithm.sega.com/assets/data/music.json`
- CHN: `https://maimai.lxns.net/api/v0/chunithm/song/list`（lxns 查分器公共 API，不传 version 参数即跟随国服当前版本）

每次同步会自动对比本地上次曲库并标记变更：首次出现的条目写入 `added_at`；SEGA 曲库中等级、封面等内容发生变化时写入 `updated_at`（`newflag` 例行翻转不计入变更），该日期取响应头 `Last-Modified`（文件真实修改时间）所在日，缺失时退回检测日。JPN、EXP、CHN 每首曲目在各自曲库 JSON 中只存一行；各难度的日期记录在 `level_updated_at`：Basic、Advanced、Expert、Master 分别记录变更日期；ULTIMA 与每张 WORLD'S END 谱面分别使用各自日期。CHN 使用 LXNS 的 `release_date`，SEGA 曲库则使用对应同步日期。已有曲目后续追加 ULTIMA、WORLD'S END 或普通难度时，只更新新增谱面的日期，保留已有谱面的日期，无论 WORLD'S END 还是普通难度先出现。检测到曲目下架时会将其从曲库文件移除，并以完整快照记录到 `public/data/removed-jpn.json`、`removed-exp.json` 或 `removed-chn.json`（含 `removed_at`）；曲目重新上架时撤销下架记录并重新标记 `added_at`。时间戳均为 Unix 毫秒数，并统一归一为对应日期（UTC+8）的 10:00，同一天内多次同步幂等。

仓库内置 GitHub Actions 工作流 `.github/workflows/sync-catalogs.yml`：每周四 10:30（UTC+8）自动全量同步，先运行同步脚本测试再执行；发现曲库或封面变化时**不直接推默认分支**，而是先把封面提交到私有封面仓，再在主仓创建（或更新已存在的）Pull Request 更新 submodule 指针，审核后手动合并；重复触发只会刷新同一个 PR。工作流需要配置 `COVERS_TOKEN` secret（对主仓与封面仓均有读写权限的 PAT），否则私有封面仓的 submodule 无法拉取。也可在 Actions 页面手动触发，通过 `regions` 参数指定同步范围——`all`（默认）或以空格/逗号分隔的 `jpn`、`exp`、`chn` 列表，非法区服名会直接报错。

PR 的标题与正文会随每次运行刷新（标题形如 `chore(data): sync catalogs 2026-10-22 (jpn,exp,chn)`，日期取 UTC+8）。同步分支基于 `main` 重建，因此 PR 始终反映**最近一次运行的同步范围**：只同步部分区服时，其余区服会回到 `main` 的状态；若要一次评审全部变更，请用 `regions=all` 触发。

当 `main` 上的 `public/data/` 或 `public/images` 发生变化（例如合并同步 PR、手工对齐 submodule 指针）时，工作流会自动重跑并基于最新 `main` 重建同步分支，从而自动消除 PR 的基点冲突。封面步骤还会校验 submodule 指针确实存在于封面仓 `main` 上，若不一致会直接报错中止，避免 PR 引用未推送的提交。

打开终端中显示的本地地址即可使用。筛选支持曲名/曲师关键词、分类、谱面难度和区服收录情况，并可分页浏览。点击或键盘聚焦后按 Enter/空格打开曲目详情，可查看完整曲绘、歌曲信息、各区服的 ID、收录起止时间及谱面等级；不同区服曲绘不同时可在详情中切换。收录开始时间使用 `added_at`，下架曲目的结束时间使用 `removed_at`，仍在收录的曲目显示“至今”，没有历史时间记录时显示“暂无记录”。收录情况为一组三态复选框，点击循环切换：不限 → ✓ 收录 → ― 未收录；多个区服的条件同时生效（取交集）。

页面支持暗色与亮色主题。首次访问会跟随系统外观设置；手动切换后会保存选择，后续访问优先使用该主题，并同步适配 Element Plus 控件。

曲目详情分别显示日本区、国际区与国服官方曲目 ID。

WORLD'S END 谱面会单独显示专用标识、谱面标记和星数；同一首歌在一个区服内有多个 WORLD'S END 谱面时会全部保留。

## 部署到 Vercel

在 Vercel 中导入 GitHub 仓库，保持项目根目录为仓库根目录，生产分支设为 `main`。仓库中的 `vercel.json` 会配置 Vite 构建和 `dist` 输出；连接 GitHub 后，合并到 `main` 会部署生产版本，Pull Request 会生成预览部署。

封面位于单独的私有仓库，需在 GitHub 创建一个 fine-grained personal access token，并仅授予 `jasonren0403/chunithm-songlist-covers` 仓库的 **Contents: Read-only** 权限。将其作为 Vercel 环境变量 `COVERS_READ_TOKEN` 添加到 Production 和 Preview 环境，然后重新部署。Vercel 构建会使用此凭证初始化 `public/images` submodule；令牌不会写入仓库或打印到构建日志。不要复用拥有封面仓写权限的 GitHub Actions `COVERS_TOKEN`。本地构建不需要配置此变量。

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
