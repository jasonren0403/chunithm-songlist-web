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
  image: string
  levels: DifficultyLevels
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
    'title',
    'reading',
    'artist',
    'catname',
    'image',
    ...DIFFICULTIES.map(({ key }) => key),
  ].every((field) => typeof song[field] === 'string')
}

function toRegionalSong(song: RawSong): RegionalSong {
  return {
    image: song.image ? `${import.meta.env.BASE_URL}${song.image.replace(/^\//, '')}` : '',
    levels: {
      lev_bas: song.lev_bas,
      lev_adv: song.lev_adv,
      lev_exp: song.lev_exp,
      lev_mas: song.lev_mas,
      lev_ult: song.lev_ult,
    },
  }
}

function parseCatalog(payload: unknown, region: Region): Song[] {
  if (!Array.isArray(payload) || !payload.every(isRawSong)) {
    throw new Error(`${REGION_CONFIG[region].label}曲库数据格式异常`)
  }

  return payload.map((rawSong) => ({
    key: normalizeTitle(rawSong.title),
    title: rawSong.title,
    reading: rawSong.reading,
    artist: rawSong.artist,
    category: rawSong.catname,
    regions: {
      [region]: toRegionalSong(rawSong),
    },
  }))
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
      existing.regions.EXP = song.regions.EXP
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
