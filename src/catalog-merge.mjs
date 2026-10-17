/**
 * @typedef {{ kanji: string, stars: string }} WorldEndChart
 * @typedef {{
 *   image: string,
 *   levels: Record<'lev_bas' | 'lev_adv' | 'lev_exp' | 'lev_mas' | 'lev_ult', string>,
 *   worldEnd: WorldEndChart[]
 * }} RegionalSong
 */

/**
 * Merge multiple catalog rows for one song and region without dropping WORLD'S END charts.
 *
 * @param {RegionalSong | undefined} existing
 * @param {RegionalSong} incoming
 * @returns {RegionalSong}
 */
export function mergeRegionalSongs(existing, incoming) {
  if (!existing) return incoming

  const worldEnd = [...existing.worldEnd, ...incoming.worldEnd]
  const uniqueWorldEnd = worldEnd.filter(
    (chart, index) =>
      worldEnd.findIndex(
        (candidate) => candidate.kanji === chart.kanji && candidate.stars === chart.stars,
      ) === index,
  )

  return {
    image: incoming.image || existing.image,
    levels: {
      lev_bas: incoming.levels.lev_bas || existing.levels.lev_bas,
      lev_adv: incoming.levels.lev_adv || existing.levels.lev_adv,
      lev_exp: incoming.levels.lev_exp || existing.levels.lev_exp,
      lev_mas: incoming.levels.lev_mas || existing.levels.lev_mas,
      lev_ult: incoming.levels.lev_ult || existing.levels.lev_ult,
    },
    worldEnd: uniqueWorldEnd,
  }
}
