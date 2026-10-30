import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { applyCatalogChanges, resolveChangeTimestamp } from "./catalog-changes.mjs"
import { getSupersededCoverHashes, normalizeTitle } from "./catalog-assets.mjs"
import { parseLxnsCatalog } from "./lxns-catalog.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const DATA_DIR = join(ROOT, "public", "data")
const IMAGE_DIR = join(ROOT, "public", "images")
const CONCURRENCY = 12
const RETRIES = 3

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

const REGIONS = {
  jpn: {
    label: "JPN",
    catalogUrl: process.env.CATALOG_URL_JPN ?? "https://chunithm.sega.jp/storage/json/music.json",
    imageBaseUrl:
      process.env.IMAGE_BASE_URL_JPN ??
      "https://new.chunithm-net.com/chuni-mobile/html/mobile/img/",
    outputFile: "catalog-jpn.json",
  },
  exp: {
    label: "EXP",
    catalogUrl: process.env.CATALOG_URL_EXP ?? "https://chunithm.sega.com/assets/data/music.json",
    imageBaseUrl: process.env.IMAGE_BASE_URL_EXP ?? "https://chunithm-net-eng.com/mobile/img/",
    outputFile: "catalog-exp.json",
  },
  chn: {
    label: "CHN",
    // 国服曲库来自 lxns 查分器的公共 API，不传 version 参数即跟随国服当前版本。
    // 曲目 ID 与 SEGA 官方一致；国服曲库是 JPN/EXP 的子集，封面复用其他区服，不单独下载。
    source: "lxns",
    catalogUrl: process.env.CATALOG_URL_CHN ?? "https://maimai.lxns.net/api/v0/chunithm/song/list",
    outputFile: "catalog-chn.json",
  },
}

async function fetchWithRetry(url, label, options = {}) {
  let lastError

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30_000) })
      if (response.ok) return response
      throw new HttpError(response.status)
    } catch (error) {
      lastError = error
      if (error instanceof HttpError && error.status < 500 && error.status !== 429) break
      if (attempt < RETRIES) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 500))
      }
    }
  }

  const reason = lastError instanceof Error ? lastError.message : String(lastError)
  throw new Error(`${label} 下载失败：${reason}`, { cause: lastError })
}

async function fetchCatalog(region) {
  const response = await fetchWithRetry(region.catalogUrl, `${region.label} 曲库`)
  const lastModified = response.headers.get("last-modified")
  const payload = await response.json()

  if (region.source === "lxns") {
    return { rows: parseLxnsCatalog(payload), lastModified }
  }

  if (
    !Array.isArray(payload) ||
    !payload.every(
      (song) =>
        song &&
        typeof song === "object" &&
        typeof song.title === "string" &&
        typeof song.catname === "string" &&
        typeof song.image === "string" &&
        /^[\w.-]+$/.test(song.image) &&
        song.image !== "." &&
        song.image !== "..",
    )
  ) {
    throw new Error(`${region.label} 曲库数据格式异常，未写入本地数据`)
  }

  return { rows: payload, lastModified }
}

async function readPreviousCatalog(region) {
  const catalogPath = join(DATA_DIR, region.outputFile)
  if (!(await fileExists(catalogPath))) return []

  const catalog = JSON.parse(await readFile(catalogPath, "utf8"))
  if (
    !Array.isArray(catalog) ||
    !catalog.every(
      (song) =>
        song &&
        typeof song === "object" &&
        typeof song.title === "string" &&
        typeof song.image === "string",
    )
  ) {
    throw new Error(`${region.label} 现有本地曲库格式异常，无法安全检查封面变化`)
  }

  return catalog
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).size > 0
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return false
    }
    throw error
  }
}

function removedCatalogPath(region) {
  return join(DATA_DIR, `removed-${region.name}.json`)
}

async function readRemovedCatalog(region) {
  const filePath = removedCatalogPath(region)
  if (!(await fileExists(filePath))) return []

  const removed = JSON.parse(await readFile(filePath, "utf8"))
  if (
    !Array.isArray(removed) ||
    !removed.every((song) => song && typeof song === "object" && typeof song.title === "string")
  ) {
    throw new Error(`${region.label} 现有下架曲目记录格式异常，无法安全合并`)
  }

  return removed
}

async function writeRemovedCatalog(region, removedSongs) {
  const filePath = removedCatalogPath(region)
  if (removedSongs.length === 0 && !(await fileExists(filePath))) return

  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(removedSongs, null, 2)}\n`, "utf8")
  await rename(temporaryPath, filePath)
}

function formatBeijingTime(timestamp) {
  return `${new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC+8`
}

function formatChangeStats(changeStats, changeTimestamp) {
  const hasChanges = changeStats.added + changeStats.updated + changeStats.removed > 0
  return `新增 ${changeStats.added} 首、调整 ${changeStats.updated} 首、下架 ${changeStats.removed} 首（累计下架 ${changeStats.removedSongs.length} 首）${hasChanges ? `，标记时间 ${formatBeijingTime(changeTimestamp)}` : ""}`
}

async function downloadCover(region, image) {
  const targetDir = join(IMAGE_DIR, region.name)
  const targetPath = join(targetDir, image)
  const cached = await fileExists(targetPath)

  let response
  try {
    response = await fetchWithRetry(
      new URL(encodeURIComponent(image), region.imageBaseUrl),
      `${region.label} 封面 ${image}`,
      { method: "HEAD" },
    )
  } catch (error) {
    if (error instanceof Error && error.cause instanceof HttpError && error.cause.status === 404) {
      return "missing"
    }
    // 源站临时不可用时，若本地已有封面则继续复用，不中断整次同步
    if (cached) return "cached"
    throw error
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.startsWith("image/")) {
    throw new Error(
      `${region.label} 封面 ${image} 返回了非图片内容（${contentType || "未知类型"}）`,
    )
  }
  if (cached) return "cached"

  response = await fetchWithRetry(
    new URL(encodeURIComponent(image), region.imageBaseUrl),
    `${region.label} 封面 ${image}`,
  )
  const imageContentType = response.headers.get("content-type") ?? ""
  if (!imageContentType.startsWith("image/")) {
    throw new Error(
      `${region.label} 封面 ${image} 返回了非图片内容（${imageContentType || "未知类型"}）`,
    )
  }

  const imageBytes = Buffer.from(await response.arrayBuffer())
  if (imageBytes.length === 0) {
    throw new Error(`${region.label} 封面 ${image} 内容为空`)
  }

  await mkdir(targetDir, { recursive: true })
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, imageBytes)
  await rename(temporaryPath, targetPath)
  return "downloaded"
}

async function downloadCovers(region, catalog) {
  const songImages = catalog.map((song) => ({
    key: normalizeTitle(song.title),
    image: song.image,
  }))
  const images = [...new Set(songImages.map(({ image }) => image).filter(Boolean))]
  if (images.length > 0 && !(await fileExists(join(IMAGE_DIR, ".git")))) {
    console.warn(
      "警告：封面 submodule 未初始化，封面将下载到本地 public/images/（不会提交到仓库）。" +
        "拥有封面仓权限时可执行 git submodule update --init --recursive 使用 submodule。",
    )
  }
  let nextIndex = 0
  let downloaded = 0
  const missingImages = new Set()
  const failedImages = new Set()

  const workers = Array.from({ length: Math.min(CONCURRENCY, images.length) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= images.length) return

      try {
        const result = await downloadCover(region, images[index])
        if (result === "downloaded") {
          downloaded += 1
        } else if (result === "missing") {
          missingImages.add(images[index])
        }
        if ((index + 1) % 100 === 0 || index + 1 === images.length) {
          console.log(`${region.label}: ${index + 1}/${images.length} 封面已检查`)
        }
      } catch (error) {
        // 源站临时不可用时保留引用，等下次同步补齐，不中断整次同步
        failedImages.add(images[index])
        const reason = error instanceof Error ? error.message : String(error)
        console.warn(
          `${region.label}: 封面 ${images[index]} 获取失败（${reason}），保留引用待下次同步`,
        )
      }
    }
  })

  await Promise.all(workers)
  for (const song of catalog) {
    if (!song.image) continue
    song.image = missingImages.has(song.image) ? "" : `images/${region.name}/${song.image}`
  }

  return {
    total: images.length,
    downloaded,
    missing: missingImages.size,
    failed: failedImages.size,
    songImages,
  }
}

async function removeChangedCoverHashes(region, previousCatalog, currentSongImages) {
  const oldHashes = getSupersededCoverHashes(region.name, previousCatalog, currentSongImages)
  await Promise.all(
    [...oldHashes].map((image) => rm(join(IMAGE_DIR, region.name, image), { force: true })),
  )
  return oldHashes.size
}

async function writeCatalog(region, catalog) {
  const targetPath = join(DATA_DIR, region.outputFile)
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8")
  await rename(temporaryPath, targetPath)
}

async function syncRegion(region) {
  console.log(`${region.label}: 正在下载曲库…`)
  const previousCatalog = await readPreviousCatalog(region)
  const { rows, lastModified } = await fetchCatalog(region)
  const coverStats = await downloadCovers(region, rows)
  return { region, catalog: rows, previousCatalog, coverStats, lastModified }
}

function printUsage() {
  console.log("用法: pnpm sync:data [jpn] [exp] [chn]")
  console.log("不传参数时同步全部区服；示例: pnpm sync:data chn 仅同步国服曲库。")
}

function resolveSelectedRegions(args) {
  if (args.includes("--help") || args.includes("-h")) {
    printUsage()
    process.exit(0)
  }
  if (args.length === 0) return Object.keys(REGIONS)

  const selected = []
  for (const arg of args) {
    const name = arg.trim().toLowerCase()
    if (!Object.hasOwn(REGIONS, name)) {
      console.error(`未知区服或参数 "${arg}"，可用区服: ${Object.keys(REGIONS).join(", ")}`)
      printUsage()
      process.exit(1)
    }
    if (!selected.includes(name)) selected.push(name)
  }
  return selected
}

const selectedRegions = resolveSelectedRegions(process.argv.slice(2))
console.log(`本次同步区服: ${selectedRegions.map((name) => REGIONS[name].label).join(", ")}`)

await mkdir(DATA_DIR, { recursive: true })

const results = await Promise.all(
  selectedRegions.map((name) => syncRegion({ ...REGIONS[name], name })),
)

const syncTime = Date.now()
for (const result of results) {
  const changeTimestamp = resolveChangeTimestamp({
    source: result.region.source,
    lastModified: result.lastModified,
    syncTime,
  })
  result.changeTimestamp = changeTimestamp
  result.changeStats = applyCatalogChanges({
    previousCatalog: result.previousCatalog,
    catalog: result.catalog,
    previousRemoved: await readRemovedCatalog(result.region),
    now: changeTimestamp,
    preferIncomingAddedAt: result.region.source === "lxns",
  })
  await writeRemovedCatalog(result.region, result.changeStats.removedSongs)
}

for (const { region, catalog } of results) {
  await writeCatalog(region, catalog)
}

for (const {
  region,
  catalog,
  previousCatalog,
  coverStats,
  changeStats,
  changeTimestamp,
} of results) {
  coverStats.removed = await removeChangedCoverHashes(
    region,
    previousCatalog,
    coverStats.songImages,
  )
  if (region.source === "lxns") {
    console.log(
      `${region.label}: ${catalog.length} 行曲目数据（封面复用 JPN/EXP，不单独下载）；曲目变更：${formatChangeStats(changeStats, changeTimestamp)}`,
    )
    continue
  }
  console.log(
    `${region.label}: ${catalog.length} 首曲目，新增 ${coverStats.downloaded} 张封面（共 ${coverStats.total} 张）${coverStats.removed ? `，清理 ${coverStats.removed} 张封面 hash 已变化的旧图片` : ""}${coverStats.missing ? `，${coverStats.missing} 张封面源站返回 404，将显示其他区服封面或本地占位图` : ""}${coverStats.failed ? `，${coverStats.failed} 张封面因源站不可用未获取，保留引用待下次同步` : ""}；曲目变更：${formatChangeStats(changeStats, changeTimestamp)}`,
  )
}

console.log("曲库和封面已同步到 public/。")
