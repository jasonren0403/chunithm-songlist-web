import { randomUUID } from 'node:crypto'
import { mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = join(ROOT, 'public', 'data')
const IMAGE_DIR = join(ROOT, 'public', 'images')
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
    label: 'JPN',
    catalogUrl: 'https://chunithm.sega.jp/storage/json/music.json',
    imageBaseUrl: 'https://new.chunithm-net.com/chuni-mobile/html/mobile/img/',
    outputFile: 'catalog-jpn.json',
  },
  exp: {
    label: 'EXP',
    catalogUrl: 'https://chunithm.sega.com/assets/data/music.json',
    imageBaseUrl: 'https://chunithm-net-eng.com/mobile/img/',
    outputFile: 'catalog-exp.json',
  },
}

async function fetchWithRetry(url, label) {
  let lastError

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
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
  const catalog = await response.json()
  if (
    !Array.isArray(catalog) ||
    !catalog.every(
      (song) =>
        song &&
        typeof song === 'object' &&
        typeof song.title === 'string' &&
        typeof song.catname === 'string' &&
        typeof song.image === 'string' &&
        /^[\w.-]+$/.test(song.image) &&
        song.image !== '.' &&
        song.image !== '..',
    )
  ) {
    throw new Error(`${region.label} 曲库数据格式异常，未写入本地数据`)
  }

  return catalog
}

async function fileExists(filePath) {
  try {
    return (await stat(filePath)).size > 0
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function downloadCover(region, image) {
  const targetDir = join(IMAGE_DIR, region.name)
  const targetPath = join(targetDir, image)
  if (await fileExists(targetPath)) return false

  let response
  try {
    response = await fetchWithRetry(
      new URL(encodeURIComponent(image), region.imageBaseUrl),
      `${region.label} 封面 ${image}`,
    )
  } catch (error) {
    if (error instanceof Error && error.cause instanceof HttpError && error.cause.status === 404) {
      return false
    }
    throw error
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error(
      `${region.label} 封面 ${image} 返回了非图片内容（${contentType || '未知类型'}）`,
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
  return true
}

async function downloadCovers(region, catalog) {
  const images = [...new Set(catalog.map(({ image }) => image))]
  let nextIndex = 0
  let downloaded = 0
  const missingImages = new Set()
  let failure

  const workers = Array.from({ length: Math.min(CONCURRENCY, images.length) }, async () => {
    while (!failure) {
      const index = nextIndex++
      if (index >= images.length) return

      try {
        if (await downloadCover(region, images[index])) {
          downloaded += 1
        } else if (!(await fileExists(join(IMAGE_DIR, region.name, images[index])))) {
          missingImages.add(images[index])
        }
        if ((index + 1) % 100 === 0 || index + 1 === images.length) {
          console.log(`${region.label}: ${index + 1}/${images.length} 封面已检查`)
        }
      } catch (error) {
        failure = error
      }
    }
  })

  await Promise.all(workers)
  if (failure) throw failure
  for (const song of catalog) {
    song.image = missingImages.has(song.image) ? '' : `images/${region.name}/${song.image}`
  }

  return { total: images.length, downloaded, missing: missingImages.size }
}

async function writeCatalog(region, catalog) {
  const targetPath = join(DATA_DIR, region.outputFile)
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, targetPath)
}

async function syncRegion(region) {
  console.log(`${region.label}: 正在下载曲库…`)
  const catalog = await fetchCatalog(region)
  const coverStats = await downloadCovers(region, catalog)
  return { region, catalog, coverStats }
}

await mkdir(DATA_DIR, { recursive: true })

const results = await Promise.all(
  Object.entries(REGIONS).map(([name, config]) => syncRegion({ ...config, name })),
)

for (const { region, catalog } of results) {
  await writeCatalog(region, catalog)
}

for (const { region, catalog, coverStats } of results) {
  console.log(
    `${region.label}: ${catalog.length} 首曲目，新增 ${coverStats.downloaded} 张封面（共 ${coverStats.total} 张）${coverStats.missing ? `，${coverStats.missing} 张封面源站返回 404，将显示本地占位图` : ''}`,
  )
}

console.log('曲库和封面已同步到 public/。')
