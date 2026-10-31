import { canonicalChangeTimestamp } from "./catalog-changes.mjs"

const LEVEL_KEYS = ["lev_bas", "lev_adv", "lev_exp", "lev_mas", "lev_ult"]
const STANDARD_LEVEL_KEYS = LEVEL_KEYS.slice(0, 4)

const emptyLevels = () => Object.fromEntries(LEVEL_KEYS.map((key) => [key, ""]))

function releaseTimestamp(releaseDate) {
  if (typeof releaseDate !== "string" && typeof releaseDate !== "number") return undefined

  const timestamp = typeof releaseDate === "number" ? releaseDate : Date.parse(releaseDate)
  return Number.isFinite(timestamp) ? canonicalChangeTimestamp(timestamp) : undefined
}

function worldEndDateKey(kanji, star) {
  return `we:${kanji}|${star}`
}

/**
 * 将 lxns 的单条曲目转换为与 SEGA music.json 同构的行。
 *
 * 每首歌只输出一行；各谱面的更新时间保存在 level_updated_at 中。
 * CHN 行不携带封面（image 为空字符串）：国服曲库目前是 JPN/EXP 的子集，
 * 页面按 JPN、EXP、CHN 顺序回退封面，无需重复下载 lxns 图床资源。
 *
 * @param {{
 *   id: number | string,
 *   title: string,
 *   artist?: string,
 *   genre?: string,
 *   release_date?: string | number,
 *   difficulties?: Array<{
 *     difficulty: number,
 *     level?: string,
 *     kanji?: string,
 *     star?: number | string,
 *     release_date?: string | number,
 *   }>,
 * }} song
 * @returns {Array<Record<string, string | number>>}
 */
export function lxnsSongToRawSongs(song) {
  const levels = emptyLevels()
  const worldEndCharts = []
  const levelUpdatedAt = {}

  for (const chart of song.difficulties ?? []) {
    if (chart.difficulty >= 0 && chart.difficulty < STANDARD_LEVEL_KEYS.length) {
      levels[LEVEL_KEYS[chart.difficulty]] = String(chart.level ?? "")
      const updatedAt = releaseTimestamp(song.release_date)
      if (updatedAt !== undefined) levelUpdatedAt[LEVEL_KEYS[chart.difficulty]] = updatedAt
    } else if (chart.difficulty === 4) {
      levels.lev_ult = String(chart.level ?? "")
      const updatedAt = releaseTimestamp(chart.release_date) ?? releaseTimestamp(song.release_date)
      if (updatedAt !== undefined) levelUpdatedAt.lev_ult = updatedAt
    } else if (chart.difficulty === 5) {
      worldEndCharts.push(chart)
      const kanji = String(chart.kanji ?? "")
      const star = String(chart.star ?? "")
      const updatedAt = releaseTimestamp(chart.release_date) ?? releaseTimestamp(song.release_date)
      if (updatedAt !== undefined) levelUpdatedAt[worldEndDateKey(kanji, star)] = updatedAt
    }
  }

  const base = {
    id: String(song.id),
    catname: typeof song.genre === "string" ? song.genre : "",
    newflag: "0",
    title: song.title,
    reading: "",
    artist: typeof song.artist === "string" ? song.artist : "",
    image: "",
  }

  return [
    {
      ...base,
      ...levels,
      we_kanji: "",
      we_star: "",
      world_end: worldEndCharts.map((chart) => ({
        kanji: String(chart.kanji ?? ""),
        star: String(chart.star ?? ""),
      })),
      level_updated_at: levelUpdatedAt,
    },
  ]
}

/**
 * 校验 lxns 曲目列表接口的响应并转换为本地曲库格式。
 *
 * @param {unknown} payload
 * @returns {Array<Record<string, string | number>>}
 */
export function parseLxnsCatalog(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    !Array.isArray(payload.songs) ||
    !payload.songs.every(
      (song) =>
        song &&
        typeof song === "object" &&
        (typeof song.id === "number" || typeof song.id === "string") &&
        typeof song.title === "string" &&
        song.title.length > 0 &&
        Array.isArray(song.difficulties),
    )
  ) {
    throw new Error("CHN 曲库数据格式异常，未写入本地数据")
  }

  return payload.songs.flatMap((song) => lxnsSongToRawSongs(song))
}
