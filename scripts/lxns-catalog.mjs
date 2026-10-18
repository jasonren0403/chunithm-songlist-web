const LEVEL_KEYS = ['lev_bas', 'lev_adv', 'lev_exp', 'lev_mas', 'lev_ult']

const emptyLevels = () => Object.fromEntries(LEVEL_KEYS.map((key) => [key, '']))

/**
 * 将 lxns 的单条曲目转换为与 SEGA music.json 同构的行。
 *
 * WORLD'S END 谱面按 SEGA 官方曲库的惯例拆成独立行（等级字段为空，
 * 仅携带 we_kanji / we_star），由前端按曲名合并回同一首歌。
 * CHN 行不携带封面（image 为空字符串）：国服曲库目前是 JPN/EXP 的子集，
 * 页面按 JPN、EXP、CHN 顺序回退封面，无需重复下载 lxns 图床资源。
 *
 * @param {{
 *   id: number | string,
 *   title: string,
 *   artist?: string,
 *   genre?: string,
 *   difficulties?: Array<{
 *     difficulty: number,
 *     level?: string,
 *     kanji?: string,
 *     star?: number | string,
 *   }>,
 * }} song
 * @returns {Array<Record<string, string>>}
 */
export function lxnsSongToRawSongs(song) {
  const levels = emptyLevels()
  const worldEndCharts = []
  let hasStandardChart = false

  for (const chart of song.difficulties ?? []) {
    if (chart.difficulty >= 0 && chart.difficulty <= 4) {
      hasStandardChart = true
      levels[LEVEL_KEYS[chart.difficulty]] = String(chart.level ?? '')
    } else if (chart.difficulty === 5) {
      worldEndCharts.push(chart)
    }
  }

  const base = {
    id: String(song.id),
    catname: typeof song.genre === 'string' ? song.genre : '',
    newflag: '0',
    title: song.title,
    reading: '',
    artist: typeof song.artist === 'string' ? song.artist : '',
    image: '',
  }

  const rows = []
  if (hasStandardChart || worldEndCharts.length === 0) {
    rows.push({ ...base, ...levels, we_kanji: '', we_star: '' })
  }
  for (const chart of worldEndCharts) {
    rows.push({
      ...base,
      ...emptyLevels(),
      we_kanji: String(chart.kanji ?? ''),
      we_star: String(chart.star ?? ''),
    })
  }

  return rows
}

/**
 * 校验 lxns 曲目列表接口的响应并转换为本地曲库格式。
 *
 * @param {unknown} payload
 * @returns {Array<Record<string, string>>}
 */
export function parseLxnsCatalog(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray(payload.songs) ||
    !payload.songs.every(
      (song) =>
        song &&
        typeof song === 'object' &&
        (typeof song.id === 'number' || typeof song.id === 'string') &&
        typeof song.title === 'string' &&
        song.title.length > 0 &&
        Array.isArray(song.difficulties),
    )
  ) {
    throw new Error('CHN 曲库数据格式异常，未写入本地数据')
  }

  return payload.songs.flatMap((song) => lxnsSongToRawSongs(song))
}
