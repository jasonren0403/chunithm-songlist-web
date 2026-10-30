// 曲库变更追踪：对比上次同步结果，为条目打上收录/调整时间戳，并维护下架曲目墓碑列表。
//
// 字段约定（均为 Unix 毫秒时间戳，number，可用 new Date(value) 还原日期）：
// - added_at:   该条目首次出现在曲库中的同步时间；缺失表示启用追踪前就已收录
// - updated_at: 条目内容最近一次发生变化的同步时间
// - removed_at: 仅存在于下架记录（removed-<region>.json）中，为检测到下架的同步时间
//
// 条目身份：同一区服内以 id + WORLD'S END 标记区分行
// （lxns 转换出的 WE 行可能与原曲共享 id，SEGA 官方 WE 行有独立 id）。

const BOOKKEEPING_FIELDS = ["added_at", "updated_at"]
// newflag 是 SEGA 官网的“新曲”角标，会例行翻转，不计入内容变更以避免噪音
const VOLATILE_FIELDS = ["newflag"]

const DAY_MS = 24 * 60 * 60 * 1000
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000
const CANONICAL_HOUR_MS = 10 * 60 * 60 * 1000

/**
 * 将任意时刻归一为其所在日（按 UTC+8 日期计算）的 10:00 UTC+8，返回 Unix 毫秒时间戳。
 * 同一天内多次同步得到相同时间戳，保证幂等。
 *
 * @param {number} timeMs
 * @returns {number}
 */
export function canonicalChangeTimestamp(timeMs) {
  const dayIndex = Math.floor((timeMs + BEIJING_OFFSET_MS) / DAY_MS)
  return dayIndex * DAY_MS - BEIJING_OFFSET_MS + CANONICAL_HOUR_MS
}

/**
 * 决定本次同步的变更标记基准时间：
 * - SEGA 官方 JSON 内容不含时间信息，取响应头 Last-Modified（文件真实修改时间）所在日
 * - lxns 为动态接口、无任何更新时间可用，取同步检测时刻
 * 两者统一归一为当天（UTC+8）10:00；Last-Modified 缺失或无法解析时退回检测时刻。
 *
 * @param {{ source?: string, lastModified?: string | null, syncTime: number }} options
 * @returns {number} Unix 毫秒时间戳
 */
export function resolveChangeTimestamp({ source, lastModified, syncTime }) {
  const lastModifiedTime = Date.parse(lastModified ?? "")
  const base = source !== "lxns" && Number.isFinite(lastModifiedTime) ? lastModifiedTime : syncTime
  return canonicalChangeTimestamp(base)
}

export function songRowKey(song) {
  const isUltimaOnly =
    song.lev_ult && !song.lev_bas && !song.lev_adv && !song.lev_exp && !song.lev_mas
  const chartType = isUltimaOnly ? "ultima" : "standard"
  return `${song.id}::${song.we_kanji ?? ""}|${song.we_star ?? ""}::${chartType}`
}

export function songContentKey(song) {
  const entries = Object.entries(song)
    .filter(([field]) => !BOOKKEEPING_FIELDS.includes(field) && !VOLATILE_FIELDS.includes(field))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return JSON.stringify(entries)
}

/**
 * 对比上次曲库与本次抓取结果，就地标记时间戳，并合并下架墓碑列表。
 *
 * @param {object} options
 * @param {Array<Record<string, string>>} options.previousCatalog 上次写入本地的曲库
 * @param {Array<Record<string, string>>} options.catalog 本次抓取的曲库（会被就地标记）
 * @param {Array<Record<string, string>>} [options.previousRemoved] 已有下架记录
 * @param {number} options.now 本次同步的 Unix 毫秒时间戳
 * @returns {{
 *   added: number,
 *   updated: number,
 *   removed: number,
 *   removedSongs: Array<Record<string, string>>,
 * }} 本次新增/调整/下架数量与合并后的完整下架记录
 */
export function applyCatalogChanges({ previousCatalog, catalog, previousRemoved = [], now }) {
  const previousByKey = new Map(previousCatalog.map((song) => [songRowKey(song), song]))
  const removedByKey = new Map(previousRemoved.map((song) => [songRowKey(song), song]))

  const currentKeys = new Set()
  let added = 0
  let updated = 0

  for (const song of catalog) {
    const key = songRowKey(song)
    currentKeys.add(key)

    const previous = previousByKey.get(key)
    if (!previous) {
      if (song.added_at === undefined || song.added_at === null) song.added_at = now
      added += 1
      continue
    }

    if (previous.added_at !== undefined && previous.added_at !== null) {
      song.added_at = previous.added_at
    } else if (song.added_at === undefined || song.added_at === null) song.added_at = now
    if (songContentKey(previous) !== songContentKey(song)) {
      song.updated_at = now
      updated += 1
    } else if (previous.updated_at) {
      song.updated_at = previous.updated_at
    }
  }

  // 重新上架的曲目撤销下架记录（无论上次曲库里有没有它）
  for (const key of [...removedByKey.keys()]) {
    if (currentKeys.has(key)) removedByKey.delete(key)
  }

  let removed = 0
  for (const [key, previous] of previousByKey) {
    if (currentKeys.has(key) || removedByKey.has(key)) continue
    removedByKey.set(key, { ...previous, removed_at: now })
    removed += 1
  }

  return { added, updated, removed, removedSongs: [...removedByKey.values()] }
}
