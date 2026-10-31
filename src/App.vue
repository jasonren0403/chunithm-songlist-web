<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue"
import { ElMessage } from "element-plus"
import zhCn from "element-plus/es/locale/lang/zh-cn"
import {
  CATALOG_REGIONS,
  DIFFICULTIES,
  REGION_CONFIG,
  getCoverCandidates,
  hasDifficulty,
  loadCatalogs,
  type CatalogLastAddedAt,
  type DifficultyKey,
  type Region,
  type Song,
} from "./catalog"

// 三态收录筛选：0 = 不限，1 = 收录，2 = 未收录，点击复选框循环切换
type RegionState = 0 | 1 | 2
type Theme = "light" | "dark"
type SongSort = "default" | "title-asc" | "title-desc" | "recent"

const REGION_STATE_HINTS = ["不限", "收录", "未收录"] as const
const SONG_SORT_OPTIONS: { value: SongSort; label: string }[] = [
  { value: "default", label: "默认顺序" },
  { value: "title-asc", label: "曲名升序" },
  { value: "title-desc", label: "曲名降序" },
  { value: "recent", label: "最近收录" },
]
const songTitleCollator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" })

const themeStorageKey = "chunithm-song-atlas-theme"
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)")

function loadSavedTheme(): Theme | null {
  try {
    const savedTheme = localStorage.getItem(themeStorageKey)
    return savedTheme === "light" || savedTheme === "dark" ? savedTheme : null
  } catch (error) {
    console.error("Unable to read the saved theme preference.", error)
    return null
  }
}

const manualTheme = ref<Theme | null>(loadSavedTheme())
const systemPrefersDark = ref(systemThemeQuery.matches)
const theme = computed<Theme>(
  () => manualTheme.value ?? (systemPrefersDark.value ? "dark" : "light"),
)
const songs = ref<Song[]>([])
const lastAddedAt = ref<CatalogLastAddedAt | null>(null)
const isLoading = ref(true)
const errorMessage = ref("")
const keyword = ref("")
const category = ref("")
const difficulty = ref<DifficultyKey | "">("")
const songSort = ref<SongSort>("default")
const emptyRegionStates = (): Record<Region, RegionState> => ({ JPN: 0, EXP: 0, CHN: 0 })
const regionStates = ref<Record<Region, RegionState>>(emptyRegionStates())
const currentPage = ref(1)
const pageSize = ref(24)
const failedCovers = ref(new Map<string, Set<string>>())
const detailDialogVisible = ref(false)
const selectedSong = ref<Song | null>(null)
const selectedCoverRegion = ref<Region | null>(null)
const regions: readonly Region[] = CATALOG_REGIONS
let requestController: AbortController | undefined

const categories = computed(() => [...new Set(songs.value.map((song) => song.category))].sort())

watch(
  theme,
  (value) => {
    document.documentElement.classList.toggle("dark", value === "dark")
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", value === "dark" ? "#10111b" : "#f4f5fb")
  },
  { immediate: true },
)

const filteredSongs = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()

  const matchingSongs = songs.value.filter((song) => {
    const matchesKeyword =
      !search ||
      [song.title, song.reading, song.artist, song.category].some((text) =>
        text.toLocaleLowerCase().includes(search),
      )
    const matchesCategory = !category.value || song.category === category.value
    const matchesDifficulty = !difficulty.value || hasDifficulty(song, difficulty.value)
    const matchesRegions = CATALOG_REGIONS.every((region) => {
      const state = regionStates.value[region]
      if (state === 0) return true
      return state === 1 ? Boolean(song.regions[region]) : !song.regions[region]
    })

    return matchesKeyword && matchesCategory && matchesDifficulty && matchesRegions
  })

  if (songSort.value === "default") return matchingSongs

  return matchingSongs
    .map((song, index) => ({ song, index }))
    .sort((left, right) => {
      if (songSort.value === "recent") {
        const latestAddedAt = (song: Song): number =>
          Math.max(...Object.values(song.regionHistory).map((history) => history?.addedAt ?? 0))
        return latestAddedAt(right.song) - latestAddedAt(left.song) || left.index - right.index
      }

      const titleOrder = songTitleCollator.compare(left.song.title, right.song.title)
      const direction = songSort.value === "title-asc" ? 1 : -1
      return titleOrder * direction || left.index - right.index
    })
    .map(({ song }) => song)
})

const pageCount = computed(() => Math.ceil(filteredSongs.value.length / pageSize.value))
const pagedSongs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredSongs.value.slice(start, start + pageSize.value)
})

watch([keyword, category, difficulty, regionStates, pageSize, songSort], () => {
  currentPage.value = 1
})

async function refreshCatalog(): Promise<void> {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  isLoading.value = true
  errorMessage.value = ""

  try {
    const catalogData = await loadCatalogs(controller.signal)
    songs.value = catalogData.songs
    lastAddedAt.value = catalogData.lastAddedAt
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return
    const message = error instanceof Error ? error.message : "发生未知错误"
    errorMessage.value = `${message}，请检查网络后重试。`
    ElMessage.error(errorMessage.value)
  } finally {
    if (requestController === controller) isLoading.value = false
  }
}

function clearFilters(): void {
  keyword.value = ""
  category.value = ""
  difficulty.value = ""
  songSort.value = "default"
  regionStates.value = emptyRegionStates()
}

function cycleRegionState(region: Region): void {
  const next = ((regionStates.value[region] + 1) % 3) as RegionState
  regionStates.value = { ...regionStates.value, [region]: next }
}

function toggleTheme(): void {
  const nextTheme = theme.value === "dark" ? "light" : "dark"
  manualTheme.value = nextTheme
  try {
    localStorage.setItem(themeStorageKey, nextTheme)
  } catch (error) {
    console.error("Unable to save the theme preference.", error)
  }
}

function handleSystemThemeChange(event: MediaQueryListEvent): void {
  systemPrefersDark.value = event.matches
}

function handleCoverError(key: string, image?: string): void {
  if (!image) return
  const failed = new Set(failedCovers.value.get(key))
  failed.add(image)
  failedCovers.value = new Map(failedCovers.value).set(key, failed)
}

function startCardMarquees(event: MouseEvent): void {
  const card = event.currentTarget
  if (!(card instanceof HTMLElement)) return

  for (const text of card.querySelectorAll<HTMLElement>(".marquee-text")) {
    const distance = text.scrollWidth - text.clientWidth
    if (distance <= 1) continue

    text.style.setProperty("--marquee-distance", `${distance}px`)
    text.style.setProperty("--marquee-duration", `${Math.max(3, distance / 35)}s`)
    text.classList.add("is-marquee-active")
  }
}

function stopCardMarquees(event: MouseEvent): void {
  const card = event.currentTarget
  if (!(card instanceof HTMLElement)) return

  for (const text of card.querySelectorAll<HTMLElement>(".marquee-text")) {
    text.classList.remove("is-marquee-active")
    text.style.removeProperty("--marquee-distance")
    text.style.removeProperty("--marquee-duration")
  }
}

function startDetailTitleMarquee(): void {
  const viewport = document.querySelector<HTMLElement>(".song-detail-dialog-title")
  const text = viewport?.querySelector<HTMLElement>(".song-detail-dialog-title-text")
  if (!viewport || !text) return

  text.classList.add("is-marquee-measuring")
  const fullWidth = text.getBoundingClientRect().width
  text.classList.remove("is-marquee-measuring")

  const distance = fullWidth - viewport.clientWidth
  if (distance <= 1) return

  text.style.setProperty("--marquee-distance", `${distance}px`)
  text.style.setProperty("--marquee-duration", `${Math.max(3, distance / 35)}s`)
  text.classList.add("is-marquee-active")
}

function stopDetailTitleMarquee(): void {
  const text = document.querySelector<HTMLElement>(".song-detail-dialog-title-text")
  if (!text) return

  text.classList.remove("is-marquee-active")
  text.style.removeProperty("--marquee-distance")
  text.style.removeProperty("--marquee-duration")
}

function currentCover(song: Song): string | undefined {
  const failed = failedCovers.value.get(song.key)
  return getCoverCandidates(song).find((image) => !failed?.has(image))
}

const detailCovers = computed(() => {
  const song = selectedSong.value
  if (!song) return []

  return regions.flatMap((region) => {
    const image = song.regions[region]?.image
    return image ? [{ region, image }] : []
  })
})

const includedRegions = computed(() =>
  regions.filter((region) => Boolean(selectedSong.value?.regions[region])),
)

const hasDifferentDetailCovers = computed(
  () => new Set(detailCovers.value.map(({ image }) => image)).size > 1,
)

const currentDetailCover = computed(() => {
  const song = selectedSong.value
  if (!song) return undefined

  const failed = failedCovers.value.get(song.key)
  return (
    detailCovers.value.find(
      ({ region, image }) => region === selectedCoverRegion.value && !failed?.has(image),
    ) ?? detailCovers.value.find(({ image }) => !failed?.has(image))
  )
})

function openSongDetails(song: Song): void {
  selectedSong.value = song
  selectedCoverRegion.value = regions.find((region) => Boolean(song.regions[region]?.image)) ?? null
  detailDialogVisible.value = true
}

function handleDetailCoverError(cover: { region: Region; image: string } | undefined): void {
  if (!cover || !selectedSong.value) return
  handleCoverError(selectedSong.value.key, cover.image)
  if (selectedCoverRegion.value !== cover.region) return

  const failed = failedCovers.value.get(selectedSong.value.key)
  selectedCoverRegion.value =
    detailCovers.value.find(({ image }) => !failed?.has(image))?.region ?? null
}

function hasStandardLevels(song: Song, region: Region): boolean {
  return Object.values(song.regions[region]?.levels ?? {}).some(Boolean)
}

function formatSongAddedAt(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Shanghai",
  }).format(timestamp)
}

function formatRegionalDate(timestamp: number | null | undefined, ongoing = false): string {
  if (ongoing) return "至今"
  return typeof timestamp === "number" ? `${formatSongAddedAt(timestamp)} UTC+8` : "暂无记录"
}

function formatChartUpdatedAt(timestamp: number | undefined): string {
  return typeof timestamp === "number"
    ? `谱面更新 ${formatRegionalDate(timestamp)}`
    : "谱面日期暂无记录"
}

function regionalStatus(song: Song, region: Region): string {
  if (song.regions[region]) return "收录中"
  return typeof song.regionHistory[region]?.removedAt === "number" ? "已下架" : "未收录"
}

function hasNeverBeenInRegion(song: Song, region: Region): boolean {
  return !song.regions[region] && typeof song.regionHistory[region]?.removedAt !== "number"
}

onMounted(() => {
  systemThemeQuery.addEventListener("change", handleSystemThemeChange)
  void refreshCatalog()
})

onUnmounted(() => {
  systemThemeQuery.removeEventListener("change", handleSystemThemeChange)
  requestController?.abort()
})
</script>

<template>
  <el-config-provider :locale="zhCn">
    <main class="page-shell">
      <header class="site-header">
        <div class="header-brand">
          <span class="eyebrow"><span></span> MUSIC DATABASE</span>
          <h1>CHUNITHM <span>SONG ATLAS</span></h1>
        </div>
        <el-input
          v-model="keyword"
          class="header-search"
          clearable
          placeholder="搜索曲名、曲师或读音"
          aria-label="搜索曲名、曲师或读音"
        >
          <template #prefix><span class="search-icon">⌕</span></template>
        </el-input>
        <div class="header-actions">
          <el-button
            class="theme-toggle"
            plain
            :aria-label="theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'"
            :aria-pressed="theme === 'dark'"
            @click="toggleTheme"
          >
            <el-icon><Sunny v-if="theme === 'dark'" /><Moon v-else /></el-icon>
            {{ theme === "dark" ? "亮色模式" : "暗色模式" }}
          </el-button>
          <el-tooltip placement="bottom" effect="dark" :trigger="['hover', 'focus']">
            <template #content>
              <div v-if="lastAddedAt" class="sync-time-tooltip">
                <strong>最近新增歌曲</strong>
                <div v-for="region in regions" :key="region">
                  <span>{{ REGION_CONFIG[region].label }}</span>
                  <template v-if="lastAddedAt[region] !== null">
                    <time :datetime="new Date(lastAddedAt[region]!).toISOString()">
                      {{ formatSongAddedAt(lastAddedAt[region]!) }} UTC+8
                    </time>
                  </template>
                  <span v-else>暂无记录</span>
                </div>
              </div>
              <span v-else>正在加载曲库数据…</span>
            </template>
            <div
              class="live-mark"
              tabindex="0"
              aria-label="官方曲库同步，悬停或聚焦查看三个区服最近新增歌曲的时间"
            >
              <i aria-hidden="true"></i> 官方曲库同步
            </div>
          </el-tooltip>
        </div>
      </header>

      <section class="catalog-area">
        <div class="catalog-heading">
          <div>
            <div class="section-kicker">THE COLLECTION</div>
            <h2>曲库索引 <span>SONG CATALOG</span></h2>
          </div>
          <div class="catalog-count" aria-live="polite">
            <strong>{{ filteredSongs.length.toLocaleString() }}</strong>
            <span>首曲目</span>
          </div>
        </div>

        <section class="filter-panel" aria-label="曲目筛选">
          <el-select v-model="category" clearable placeholder="全部分类" aria-label="分类筛选">
            <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
          </el-select>
          <el-select v-model="difficulty" clearable placeholder="全部难度" aria-label="等级筛选">
            <el-option
              v-for="item in DIFFICULTIES"
              :key="item.key"
              :label="item.label"
              :value="item.key"
            />
          </el-select>
          <el-select v-model="songSort" aria-label="曲目排序">
            <el-option
              v-for="option in SONG_SORT_OPTIONS"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <div class="region-checks" role="group" aria-label="按区服收录状态筛选">
            <el-checkbox
              v-for="region in regions"
              :key="region"
              :class="[
                'region-check',
                `region-check-${region.toLowerCase()}`,
                { 'is-excluded': regionStates[region] === 2 },
              ]"
              :model-value="regionStates[region] === 1"
              :indeterminate="regionStates[region] === 2"
              :title="`点击循环：不限 → 收录 → 未收录（当前：${REGION_STATE_HINTS[regionStates[region]]}）`"
              @change="cycleRegionState(region)"
            >
              {{ region }}
            </el-checkbox>
          </div>
          <el-button class="reset-button" text @click="clearFilters">重置</el-button>
        </section>

        <div class="region-legend">
          <span>收录状态</span>
          <span class="legend-item"><i class="legend-dot jpn"></i> JPN 日本区</span>
          <span class="legend-item"><i class="legend-dot exp"></i> EXP 国际区</span>
          <span class="legend-item"><i class="legend-dot chn"></i> CHN 中国区</span>
          <span class="legend-item">勾选点击循环：不限 → ✓ 收录 → ― 未收录</span>
        </div>

        <el-alert
          v-if="errorMessage"
          class="error-alert"
          :title="errorMessage"
          type="error"
          show-icon
          :closable="false"
        >
          <template #default>
            <el-button size="small" @click="refreshCatalog">重新加载</el-button>
          </template>
        </el-alert>

        <div v-if="isLoading" class="loading-state" role="status">
          <el-icon class="loading-icon"><Loading /></el-icon>
          <span>正在同步三个区服的曲库数据…</span>
        </div>

        <el-empty
          v-else-if="!errorMessage && filteredSongs.length === 0"
          description="没有找到符合条件的曲目"
        >
          <el-button @click="clearFilters">清除筛选条件</el-button>
        </el-empty>

        <section v-else-if="!errorMessage" class="song-grid" aria-label="曲目列表">
          <div
            v-for="song in pagedSongs"
            :key="song.key"
            class="song-card"
            role="button"
            tabindex="0"
            :aria-label="`查看《${song.title}》的详细信息`"
            @click="openSongDetails(song)"
            @keydown.enter="openSongDetails(song)"
            @keydown.space.prevent="openSongDetails(song)"
            @mouseenter="startCardMarquees"
            @mouseleave="stopCardMarquees"
          >
            <div class="cover-wrap">
              <img
                v-if="currentCover(song)"
                :src="currentCover(song)"
                :alt="`${song.title} 封面`"
                loading="lazy"
                @error="handleCoverError(song.key, currentCover(song))"
              />
              <div v-else class="cover-placeholder">
                <span>CHUNITHM</span>
                <strong>{{ song.title.slice(0, 1) }}</strong>
              </div>
            </div>

            <div class="song-content">
              <div class="song-topline">
                <el-tag class="category-tag" effect="plain" size="small">{{
                  song.category
                }}</el-tag>
              </div>
              <h3 :title="song.title">
                <span class="marquee-text">{{ song.title }}</span>
              </h3>
              <p class="artist" :title="song.artist || '曲师信息暂无'">
                <span class="marquee-text">{{ song.artist || "曲师信息暂无" }}</span>
              </p>

              <div class="availability" aria-label="各区服收录状态">
                <el-tag
                  :type="song.regions.JPN ? 'success' : 'info'"
                  effect="dark"
                  round
                  size="small"
                >
                  JPN {{ song.regions.JPN ? "收录" : "未收录" }}
                </el-tag>
                <el-tag
                  :type="song.regions.EXP ? 'warning' : 'info'"
                  effect="dark"
                  round
                  size="small"
                >
                  EXP {{ song.regions.EXP ? "收录" : "未收录" }}
                </el-tag>
                <el-tag
                  :type="song.regions.CHN ? 'danger' : 'info'"
                  effect="dark"
                  round
                  size="small"
                >
                  CHN {{ song.regions.CHN ? "收录" : "未收录" }}
                </el-tag>
              </div>

              <div class="difficulty-list">
                <div v-for="region in regions" :key="region" class="difficulty-row">
                  <span class="region-code" :class="region.toLowerCase()">{{ region }}</span>
                  <template v-if="song.regions[region]">
                    <span
                      v-for="item in DIFFICULTIES"
                      v-show="song.regions[region]?.levels[item.key]"
                      :key="item.key"
                      class="difficulty-chip"
                      :class="`difficulty-${item.key}`"
                      :title="item.label"
                    >
                      <b>{{ item.shortLabel }}</b>
                      {{ song.regions[region]?.levels[item.key] }}
                    </span>
                    <span
                      v-if="
                        !hasStandardLevels(song, region) && !song.regions[region]?.worldEnd.length
                      "
                      class="no-levels"
                      >—</span
                    >
                    <span
                      v-for="(chart, index) in song.regions[region]?.worldEnd"
                      :key="`${chart.kanji}-${chart.stars}-${index}`"
                      class="world-end-chip"
                      :title="`WORLD'S END ${chart.kanji} · ${chart.stars} 星`"
                    >
                      <b>WORLD'S END</b>
                      <span class="world-end-kanji">{{ chart.kanji }}</span>
                      <span class="world-end-stars">★ {{ chart.stars }}</span>
                    </span>
                  </template>
                  <span v-else class="no-levels">—</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div v-if="!isLoading && !errorMessage && filteredSongs.length > 0" class="pagination-wrap">
          <span>第 {{ currentPage }} / {{ pageCount }} 页</span>
          <el-pagination
            v-model:current-page="currentPage"
            v-model:page-size="pageSize"
            :page-sizes="[12, 24, 48]"
            :total="filteredSongs.length"
            layout="sizes, prev, pager, next"
            popper-class="pagination-size-popper"
            background
          />
        </div>
      </section>

      <el-dialog
        v-model="detailDialogVisible"
        width="min(900px, calc(100vw - 32px))"
        class="song-detail-dialog"
        @opened="startDetailTitleMarquee"
        @closed="stopDetailTitleMarquee"
      >
        <template #header>
          <div class="song-detail-dialog-heading">
            <span class="song-detail-dialog-label">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 11v5M12 8h.01" />
              </svg>
              详细信息
            </span>
            <span class="song-detail-dialog-title">
              <span class="song-detail-dialog-title-text">
                {{ selectedSong?.title ?? "" }}
              </span>
            </span>
          </div>
        </template>
        <div v-if="selectedSong" class="song-detail">
          <div class="song-detail-cover-panel">
            <div class="song-detail-cover">
              <img
                v-if="currentDetailCover"
                :src="currentDetailCover.image"
                :alt="`${selectedSong.title} 曲绘`"
                @error="handleDetailCoverError(currentDetailCover)"
              />
              <div v-else class="cover-placeholder">
                <span>CHUNITHM</span>
                <strong>{{ selectedSong.title.slice(0, 1) }}</strong>
              </div>
            </div>
            <div
              v-if="hasDifferentDetailCovers"
              class="detail-cover-selector"
              aria-label="切换曲绘区服"
            >
              <el-button
                v-for="cover in detailCovers"
                :key="cover.region"
                size="small"
                :type="selectedCoverRegion === cover.region ? 'primary' : 'default'"
                :aria-pressed="selectedCoverRegion === cover.region"
                @click="selectedCoverRegion = cover.region"
              >
                {{ cover.region }}
              </el-button>
            </div>
          </div>

          <div class="song-detail-content">
            <div class="song-detail-metadata">
              <el-tag class="category-tag" effect="plain" size="small">
                {{ selectedSong.category || "分类暂无" }}
              </el-tag>
              <div class="song-detail-region-summary">
                <strong>收录区服</strong>
                <div>
                  <el-tag
                    v-for="region in includedRegions"
                    :key="region"
                    :type="region === 'JPN' ? 'success' : region === 'EXP' ? 'warning' : 'danger'"
                    effect="plain"
                    size="small"
                  >
                    {{ region }}
                  </el-tag>
                  <span v-if="includedRegions.length === 0">暂无记录</span>
                </div>
              </div>
              <p>
                <strong>曲师</strong><span>{{ selectedSong.artist || "暂无记录" }}</span>
              </p>
            </div>

            <section
              v-for="region in regions"
              :key="region"
              class="region-detail"
              :aria-label="`${REGION_CONFIG[region].label}曲目信息`"
            >
              <div class="region-detail-heading">
                <h3>
                  {{ region }} <span>{{ REGION_CONFIG[region].label }}</span>
                </h3>
                <span
                  class="region-song-id"
                  :aria-label="`曲目 ID ${selectedSong.regionHistory[region]?.id ?? '暂无记录'}`"
                >
                  <svg
                    class="region-song-id-icon"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="9" cy="10" r="2" />
                    <path d="M6 16c.6-1.6 1.6-2.4 3-2.4s2.4.8 3 2.4M15 10h3M15 14h3" />
                  </svg>
                  <span>{{ selectedSong.regionHistory[region]?.id ?? "暂无记录" }}</span>
                </span>
                <el-tag
                  :type="selectedSong.regions[region] ? 'success' : 'info'"
                  effect="plain"
                  size="small"
                >
                  {{ regionalStatus(selectedSong, region) }}
                </el-tag>
              </div>
              <el-timeline
                v-if="hasNeverBeenInRegion(selectedSong, region)"
                class="inclusion-timeline"
                aria-label="区服收录时间线"
              >
                <el-timeline-item
                  timestamp="暂未收录"
                  color="var(--text-secondary)"
                  placement="top"
                />
              </el-timeline>
              <el-timeline v-else class="inclusion-timeline" aria-label="区服收录时间线">
                <el-timeline-item
                  :timestamp="formatRegionalDate(selectedSong.regionHistory[region]?.addedAt)"
                  color="var(--accent-strong)"
                  placement="top"
                >
                  收录起始
                </el-timeline-item>
                <el-timeline-item
                  :timestamp="
                    selectedSong.regions[region]
                      ? '仍在收录中'
                      : formatRegionalDate(selectedSong.regionHistory[region]?.removedAt)
                  "
                  color="var(--text-secondary)"
                  :hollow="Boolean(selectedSong.regions[region])"
                  placement="top"
                >
                  {{ selectedSong.regions[region] ? "" : "收录结束" }}
                </el-timeline-item>
              </el-timeline>
              <div class="detail-difficulties" aria-label="谱面等级">
                <div v-for="item in DIFFICULTIES" :key="item.key" class="chart-detail-entry">
                  <span
                    class="difficulty-chip"
                    :class="`difficulty-${item.key}`"
                    :title="item.label"
                  >
                    <b>{{ item.shortLabel }}</b>
                    {{ selectedSong.regions[region]?.levels[item.key] || "—" }}
                  </span>
                  <small v-if="selectedSong.regions[region]?.levels[item.key]">
                    {{
                      formatChartUpdatedAt(selectedSong.regions[region]?.levelUpdatedAt[item.key])
                    }}
                  </small>
                </div>
                <div
                  v-for="(chart, index) in selectedSong.regions[region]?.worldEnd ?? []"
                  :key="`${chart.kanji}-${chart.stars}-${index}`"
                  class="chart-detail-entry"
                >
                  <span
                    class="world-end-chip"
                    :title="`WORLD'S END ${chart.kanji} · ${chart.stars} 星`"
                  >
                    <b>WORLD'S END</b>
                    <span class="world-end-kanji">{{ chart.kanji }}</span>
                    <span class="world-end-stars">★ {{ chart.stars }}</span>
                  </span>
                  <small>
                    {{
                      formatChartUpdatedAt(
                        selectedSong.regions[region]?.levelUpdatedAt[
                          `we:${chart.kanji}|${chart.stars}`
                        ],
                      )
                    }}
                  </small>
                </div>
              </div>
            </section>
          </div>
        </div>
      </el-dialog>

      <footer class="site-footer">
        <span>CHUNITHM SONG ATLAS</span>
        <span>曲库数据来自 SEGA 官方网站与 lxns 查分器 · 封面归原权利方所有</span>
      </footer>
    </main>
  </el-config-provider>
</template>
