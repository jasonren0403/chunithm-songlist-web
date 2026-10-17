<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading, Moon, Sunny } from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {
  DIFFICULTIES,
  getCoverCandidates,
  hasDifficulty,
  loadCatalogs,
  type DifficultyKey,
  type Region,
  type Song,
} from './catalog'

type RegionFilter = 'all' | 'JPN' | 'EXP' | 'both' | 'jpn-only' | 'exp-only' | 'CHN'
type Theme = 'light' | 'dark'

const themeStorageKey = 'chunithm-song-atlas-theme'
const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')

function loadSavedTheme(): Theme | null {
  try {
    const savedTheme = localStorage.getItem(themeStorageKey)
    return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : null
  } catch (error) {
    console.error('Unable to read the saved theme preference.', error)
    return null
  }
}

const manualTheme = ref<Theme | null>(loadSavedTheme())
const systemPrefersDark = ref(systemThemeQuery.matches)
const theme = computed<Theme>(
  () => manualTheme.value ?? (systemPrefersDark.value ? 'dark' : 'light'),
)
const songs = ref<Song[]>([])
const isLoading = ref(true)
const errorMessage = ref('')
const keyword = ref('')
const category = ref('')
const difficulty = ref<DifficultyKey | ''>('')
const regionFilter = ref<RegionFilter>('all')
const currentPage = ref(1)
const pageSize = ref(24)
const failedCovers = ref(new Map<string, Set<string>>())
const regions: Region[] = ['JPN', 'EXP']
let requestController: AbortController | undefined

const categories = computed(() => [...new Set(songs.value.map((song) => song.category))].sort())

watch(
  theme,
  (value) => {
    document.documentElement.classList.toggle('dark', value === 'dark')
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', value === 'dark' ? '#10111b' : '#f4f5fb')
  },
  { immediate: true },
)

const filteredSongs = computed(() => {
  const search = keyword.value.trim().toLocaleLowerCase()

  return songs.value.filter((song) => {
    const matchesKeyword =
      !search ||
      [song.title, song.reading, song.artist, song.category].some((text) =>
        text.toLocaleLowerCase().includes(search),
      )
    const matchesCategory = !category.value || song.category === category.value
    const matchesDifficulty = !difficulty.value || hasDifficulty(song, difficulty.value)
    const hasJpn = Boolean(song.regions.JPN)
    const hasExp = Boolean(song.regions.EXP)
    const matchesRegion = {
      all: true,
      JPN: hasJpn,
      EXP: hasExp,
      both: hasJpn && hasExp,
      'jpn-only': hasJpn && !hasExp,
      'exp-only': hasExp && !hasJpn,
      CHN: true,
    }[regionFilter.value]

    return matchesKeyword && matchesCategory && matchesDifficulty && matchesRegion
  })
})

const pageCount = computed(() => Math.ceil(filteredSongs.value.length / pageSize.value))
const pagedSongs = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredSongs.value.slice(start, start + pageSize.value)
})

watch([keyword, category, difficulty, regionFilter, pageSize], () => {
  currentPage.value = 1
})

async function refreshCatalog(): Promise<void> {
  requestController?.abort()
  const controller = new AbortController()
  requestController = controller
  isLoading.value = true
  errorMessage.value = ''

  try {
    songs.value = await loadCatalogs(controller.signal)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    const message = error instanceof Error ? error.message : '发生未知错误'
    errorMessage.value = `${message}，请检查网络后重试。`
    ElMessage.error(errorMessage.value)
  } finally {
    if (requestController === controller) isLoading.value = false
  }
}

function clearFilters(): void {
  keyword.value = ''
  category.value = ''
  difficulty.value = ''
  regionFilter.value = 'all'
}

function toggleTheme(): void {
  const nextTheme = theme.value === 'dark' ? 'light' : 'dark'
  manualTheme.value = nextTheme
  try {
    localStorage.setItem(themeStorageKey, nextTheme)
  } catch (error) {
    console.error('Unable to save the theme preference.', error)
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

function currentCover(song: Song): string | undefined {
  const failed = failedCovers.value.get(song.key)
  return getCoverCandidates(song).find((image) => !failed?.has(image))
}

function hasStandardLevels(song: Song, region: Region): boolean {
  return Object.values(song.regions[region]?.levels ?? {}).some(Boolean)
}

onMounted(() => {
  systemThemeQuery.addEventListener('change', handleSystemThemeChange)
  void refreshCatalog()
})

onUnmounted(() => {
  systemThemeQuery.removeEventListener('change', handleSystemThemeChange)
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
            {{ theme === 'dark' ? '亮色模式' : '暗色模式' }}
          </el-button>
          <div class="live-mark"><i></i> 官方曲库同步</div>
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
          <el-select v-model="regionFilter" placeholder="全部区服" aria-label="区服筛选">
            <el-option label="全部区服" value="all" />
            <el-option label="日本区已收录" value="JPN" />
            <el-option label="国际区已收录" value="EXP" />
            <el-option label="JPN + EXP 均收录" value="both" />
            <el-option label="仅日本区收录" value="jpn-only" />
            <el-option label="仅国际区收录" value="exp-only" />
            <el-option label="中国区状态未知" value="CHN" />
          </el-select>
          <el-button class="reset-button" text @click="clearFilters">重置</el-button>
        </section>

        <div class="region-legend">
          <span>收录状态</span>
          <span class="legend-item"><i class="legend-dot jpn"></i> JPN 日本区</span>
          <span class="legend-item"><i class="legend-dot exp"></i> EXP 国际区</span>
          <span class="legend-item"><i class="legend-dot chn"></i> CHN 未知</span>
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
          <span>正在同步两个区服的曲库数据…</span>
        </div>

        <el-empty
          v-else-if="!errorMessage && filteredSongs.length === 0"
          description="没有找到符合条件的曲目"
        >
          <el-button @click="clearFilters">清除筛选条件</el-button>
        </el-empty>

        <section v-else-if="!errorMessage" class="song-grid" aria-label="曲目列表">
          <article v-for="song in pagedSongs" :key="song.key" class="song-card">
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
                <span class="song-id">
                  <template v-for="region in regions" :key="region">
                    <span v-if="song.regions[region]">
                      {{ region }} {{ song.regions[region]?.id }}
                    </span>
                  </template>
                </span>
              </div>
              <h3 :title="song.title">{{ song.title }}</h3>
              <p class="artist">{{ song.artist || '曲师信息暂无' }}</p>

              <div class="availability" aria-label="各区服收录状态">
                <el-tag
                  :type="song.regions.JPN ? 'success' : 'info'"
                  effect="dark"
                  round
                  size="small"
                >
                  JPN {{ song.regions.JPN ? '收录' : '未收录' }}
                </el-tag>
                <el-tag
                  :type="song.regions.EXP ? 'warning' : 'info'"
                  effect="dark"
                  round
                  size="small"
                >
                  EXP {{ song.regions.EXP ? '收录' : '未收录' }}
                </el-tag>
                <el-tag type="info" effect="plain" round size="small">CHN 未知</el-tag>
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
          </article>
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

      <footer class="site-footer">
        <span>CHUNITHM SONG ATLAS</span>
        <span>曲库数据来自 SEGA 官方网站 · 封面归原权利方所有</span>
      </footer>
    </main>
  </el-config-provider>
</template>
