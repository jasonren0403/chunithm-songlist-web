import { mergeRegionalSongs } from './catalog-merge.mjs'

export const REGION_CONFIG = {
  JPN: {
    label: '日本区',
  },
  EXP: {
    label: '国际区',
  },
  CHN: {
    label: '中国区',
  },
} as const

export const CATALOG_REGIONS = ['JPN', 'EXP'] as const
export const COVER_REGIONS = ['JPN', 'EXP', 'CHN'] as const

export const DIFFICULTIES = [
  { key: 'lev_bas', label: 'BASIC', shortLabel: 'BAS' },
  { key: 'lev_adv', label: 'ADVANCED', shortLabel: 'ADV' },
  { key: 'lev_exp', label: 'EXPERT', shortLabel: 'EXP' },
  { key: 'lev_mas', label: 'MASTER', shortLabel: 'MAS' },
  { key: 'lev_ult', label: 'ULTIMA', shortLabel: 'ULT' },
] as const

export type Region = (typeof CATALOG_REGIONS)[number]
export type CoverRegion = (typeof COVER_REGIONS)[number]
export type DifficultyKey = (typeof DIFFICULTIES)[number]['key']
export type DifficultyLevels = Record<DifficultyKey, string>
export type RegionSongs = Partial<Record<CoverRegion, RegionalSong>>

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
}

const FEEDS: Record<Region, string> = {
  JPN: `${import.meta.env.BASE_URL}data/catalog-jpn.json`,
  EXP: `${import.meta.env.BASE_URL}data/catalog-exp.json`,
}

export function normalizeTitle(title: string): string {
  return title.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase()
}

export function getCoverCandidates(song: Song): string[] {
  return COVER_REGIONS.flatMap((region) => {
    const image = song.regions[region]?.image
    return image ? [image] : []
  })
}

function isRawSong(value: unknown): value is RawSong {
  if (typeof value !== 'object' || value === null) return false

  const song = value as Record<string, unknown>
  return [
    'id',
    'title',
    'reading',
    'artist',
    'catname',
    'image',
    ...DIFFICULTIES.map(({ key }) => key),
    'we_kanji',
    'we_star',
  ].every((field) => typeof song[field] === 'string')
}

function toRegionalSong(song: RawSong): RegionalSong {
  return {
    id: song.id,
    image: song.image ? `${import.meta.env.BASE_URL}${song.image.replace(/^\//, '')}` : '',
    levels: {
      lev_bas: song.lev_bas,
      lev_adv: song.lev_adv,
      lev_exp: song.lev_exp,
      lev_mas: song.lev_mas,
      lev_ult: song.lev_ult,
    },
    worldEnd: song.we_kanji || song.we_star ? [{ kanji: song.we_kanji, stars: song.we_star }] : [],
  }
}

function parseCatalog(payload: unknown, region: Region): Song[] {
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

  return [...songs.values()]
}

async function fetchCatalog(region: Region, signal: AbortSignal): Promise<Song[]> {
  const response = await fetch(FEEDS[region], { signal })
  if (!response.ok) {
    throw new Error(`${REGION_CONFIG[region].label}曲库请求失败（HTTP ${response.status}）`)
  }

  return parseCatalog(await response.json(), region)
}

export async function loadCatalogs(signal: AbortSignal): Promise<Song[]> {
  const [jpnSongs, expSongs] = await Promise.all([
    fetchCatalog('JPN', signal),
    fetchCatalog('EXP', signal),
  ])
  const songs = new Map<string, Song>()

  for (const song of jpnSongs) {
    songs.set(song.key, song)
  }

  for (const song of expSongs) {
    const existing = songs.get(song.key)
    if (existing) {
      const expSong = song.regions.EXP
      if (expSong) {
        existing.regions.EXP = mergeRegionalSongs(existing.regions.EXP, expSong)
      }
    } else {
      songs.set(song.key, song)
    }
  }

  return [...songs.values()]
}

export function hasDifficulty(song: Song, difficulty: DifficultyKey): boolean {
  return Object.values(song.regions).some((regionalSong) =>
    Boolean(regionalSong?.levels[difficulty]),
  )
}
