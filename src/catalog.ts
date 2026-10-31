import { mergeRegionalSongs } from "./catalog-merge.mjs"

export const REGION_CONFIG = {
  JPN: {
    label: "日本区",
  },
  EXP: {
    label: "国际区",
  },
  CHN: {
    label: "中国区",
  },
} as const

export const CATALOG_REGIONS = ["JPN", "EXP", "CHN"] as const
export const COVER_REGIONS = ["JPN", "EXP", "CHN"] as const

export const DIFFICULTIES = [
  { key: "lev_bas", label: "BASIC", shortLabel: "BAS" },
  { key: "lev_adv", label: "ADVANCED", shortLabel: "ADV" },
  { key: "lev_exp", label: "EXPERT", shortLabel: "EXP" },
  { key: "lev_mas", label: "MASTER", shortLabel: "MAS" },
  { key: "lev_ult", label: "ULTIMA", shortLabel: "ULT" },
] as const

export type Region = (typeof CATALOG_REGIONS)[number]
export type CoverRegion = (typeof COVER_REGIONS)[number]
export type DifficultyKey = (typeof DIFFICULTIES)[number]["key"]
export type DifficultyLevels = Record<DifficultyKey, string>
export type RegionSongs = Partial<Record<CoverRegion, RegionalSong>>
export type CatalogLastAddedAt = Record<Region, number | null>

export interface RegionalSong {
  id: string
  image: string
  levels: DifficultyLevels
  worldEnd: WorldEndChart[]
}

export interface WorldEndChart {
  kanji: string
  stars: string
}

export interface Song {
  key: string
  title: string
  reading: string
  artist: string
  category: string
  regions: RegionSongs
}

interface RawSong {
  id: string
  title: string
  reading: string
  artist: string
  catname: string
  image: string
  lev_bas: string
  lev_adv: string
  lev_exp: string
  lev_mas: string
  lev_ult: string
  we_kanji: string
  we_star: string
  added_at?: number
  world_end?: Array<{ kanji: string; star: string }>
  level_updated_at?: Record<string, number>
}

const FEEDS: Record<Region, string> = {
  JPN: `${import.meta.env.BASE_URL}data/catalog-jpn.json`,
  EXP: `${import.meta.env.BASE_URL}data/catalog-exp.json`,
  CHN: `${import.meta.env.BASE_URL}data/catalog-chn.json`,
}

export function normalizeTitle(title: string): string {
  return title.normalize("NFKC").trim().replace(/\s+/g, "").toLocaleLowerCase()
}

export function getCoverCandidates(song: Song): string[] {
  return COVER_REGIONS.flatMap((region) => {
    const image = song.regions[region]?.image
    return image ? [image] : []
  })
}

function isRawSong(value: unknown): value is RawSong {
  if (typeof value !== "object" || value === null) return false

  const song = value as Record<string, unknown>
  const hasRequiredFields = [
    "id",
    "title",
    "reading",
    "artist",
    "catname",
    "image",
    ...DIFFICULTIES.map(({ key }) => key),
    "we_kanji",
    "we_star",
  ].every((field) => typeof song[field] === "string")
  const hasValidWorldEnd =
    song.world_end === undefined ||
    (Array.isArray(song.world_end) &&
      song.world_end.every(
        (chart) =>
          typeof chart === "object" &&
          chart !== null &&
          typeof chart.kanji === "string" &&
          typeof chart.star === "string",
      ))
  const hasValidLevelDates =
    song.level_updated_at === undefined ||
    (typeof song.level_updated_at === "object" &&
      song.level_updated_at !== null &&
      !Array.isArray(song.level_updated_at) &&
      Object.values(song.level_updated_at).every((date) => typeof date === "number"))
  const hasValidAddedAt =
    song.added_at === undefined ||
    (typeof song.added_at === "number" && Number.isFinite(song.added_at))
  return hasRequiredFields && hasValidWorldEnd && hasValidLevelDates && hasValidAddedAt
}

function toRegionalSong(song: RawSong): RegionalSong {
  return {
    id: song.id,
    image: song.image ? `${import.meta.env.BASE_URL}${song.image.replace(/^\//, "")}` : "",
    levels: {
      lev_bas: song.lev_bas,
      lev_adv: song.lev_adv,
      lev_exp: song.lev_exp,
      lev_mas: song.lev_mas,
      lev_ult: song.lev_ult,
    },
    worldEnd: [
      ...(song.world_end ?? []).map(({ kanji, star }) => ({ kanji, stars: star })),
      ...(song.we_kanji || song.we_star ? [{ kanji: song.we_kanji, stars: song.we_star }] : []),
    ],
  }
}

function parseCatalog(
  payload: unknown,
  region: Region,
): { songs: Song[]; lastAddedAt: number | null } {
  if (!Array.isArray(payload) || !payload.every(isRawSong)) {
    throw new Error(`${REGION_CONFIG[region].label}曲库数据格式异常`)
  }

  const songs = new Map<string, Song>()
  for (const rawSong of payload) {
    const key = normalizeTitle(rawSong.title)
    const regionalSong = toRegionalSong(rawSong)
    const existing = songs.get(key)
    if (existing) {
      existing.regions[region] = mergeRegionalSongs(existing.regions[region], regionalSong)
      continue
    }

    songs.set(key, {
      key,
      title: rawSong.title,
      reading: rawSong.reading,
      artist: rawSong.artist,
      category: rawSong.catname,
      regions: {
        [region]: regionalSong,
      },
    })
  }

  const addedAtTimes = payload.flatMap((song) =>
    song.added_at === undefined ? [] : [song.added_at],
  )

  return {
    songs: [...songs.values()],
    lastAddedAt: addedAtTimes.length ? Math.max(...addedAtTimes) : null,
  }
}

async function fetchCatalog(
  region: Region,
  signal: AbortSignal,
): Promise<{ songs: Song[]; lastAddedAt: number | null }> {
  const response = await fetch(FEEDS[region], { signal })
  if (!response.ok) {
    throw new Error(`${REGION_CONFIG[region].label}曲库请求失败（HTTP ${response.status}）`)
  }

  return parseCatalog(await response.json(), region)
}

export async function loadCatalogs(
  signal: AbortSignal,
): Promise<{ songs: Song[]; lastAddedAt: CatalogLastAddedAt }> {
  const catalogs = await Promise.all(CATALOG_REGIONS.map((region) => fetchCatalog(region, signal)))
  const songs = new Map<string, Song>()
  const lastAddedAt: CatalogLastAddedAt = { JPN: null, EXP: null, CHN: null }

  catalogs.forEach((catalog, index) => {
    const region = CATALOG_REGIONS[index]
    lastAddedAt[region] = catalog.lastAddedAt
    for (const song of catalog.songs) {
      const existing = songs.get(song.key)
      if (!existing) {
        songs.set(song.key, song)
        continue
      }

      const regionalSong = song.regions[region]
      if (regionalSong) {
        existing.regions[region] = mergeRegionalSongs(existing.regions[region], regionalSong)
      }
    }
  })

  return { songs: [...songs.values()], lastAddedAt }
}

export function hasDifficulty(song: Song, difficulty: DifficultyKey): boolean {
  return Object.values(song.regions).some((regionalSong) =>
    Boolean(regionalSong?.levels[difficulty]),
  )
}
