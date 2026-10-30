import { canonicalChangeTimestamp } from "./catalog-changes.mjs"

const LEVEL_KEYS = ["lev_bas", "lev_adv", "lev_exp", "lev_mas", "lev_ult"]
const STANDARD_LEVEL_KEYS = LEVEL_KEYS.slice(0, 4)

const emptyLevels = () => Object.fromEntries(LEVEL_KEYS.map((key) => [key, ""]))

function releaseTimestamp(releaseDate) {
  if (typeof releaseDate !== "string" && typeof releaseDate !== "number") return undefined

  const timestamp = typeof releaseDate === "number" ? releaseDate : Date.parse(releaseDate)
  return Number.isFinite(timestamp) ? canonicalChangeTimestamp(timestamp) : undefined
}

function withAddedAt(row, releaseDate, fallbackReleaseDate) {
  const addedAt = releaseTimestamp(releaseDate) ?? releaseTimestamp(fallbackReleaseDate)
  return addedAt === undefined ? row : { ...row, added_at: addedAt }
}

/**
 * 将 lxns 的单条曲目转换为与 SEGA music.json 同构的行。
 *
 * WORLD'S END 谱面按 SEGA 官方曲库的惯例拆成独立行（等级字段为空，
 * 仅携带 we_kanji / we_star）；ULTIMA 也拆成独立行，以保留各自的收录日期。
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
  const standardLevels = emptyLevels()
  const worldEndCharts = []
  const standardCharts = []
  let ultimaChart

  for (const chart of song.difficulties ?? []) {
    if (chart.difficulty >= 0 && chart.difficulty < STANDARD_LEVEL_KEYS.length) {
      standardCharts.push(chart)
      standardLevels[LEVEL_KEYS[chart.difficulty]] = String(chart.level ?? "")
    } else if (chart.difficulty === 4) {
      ultimaChart = chart
    } else if (chart.difficulty === 5) {
      worldEndCharts.push(chart)
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

  const rows = []
  if (standardCharts.length > 0 || (!ultimaChart && worldEndCharts.length === 0)) {
    rows.push(
      withAddedAt(
        {
          ...base,
          ...standardLevels,
          we_kanji: "",
          we_star: "",
        },
        song.release_date,
      ),
    )
  }
  if (ultimaChart) {
    rows.push(
      withAddedAt(
        {
          ...base,
          ...levels,
          lev_ult: String(ultimaChart.level ?? ""),
          we_kanji: "",
          we_star: "",
        },
        ultimaChart.release_date,
        song.release_date,
      ),
    )
  }
  for (const chart of worldEndCharts) {
    rows.push(
      withAddedAt(
        {
          ...base,
          ...emptyLevels(),
          we_kanji: String(chart.kanji ?? ""),
          we_star: String(chart.star ?? ""),
        },
        chart.release_date,
        song.release_date,
      ),
    )
  }

  return rows
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
