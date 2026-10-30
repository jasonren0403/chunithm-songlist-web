import assert from "node:assert/strict"
import { test } from "node:test"
import {
  applyCatalogChanges,
  canonicalChangeTimestamp,
  resolveChangeTimestamp,
  songRowKey,
} from "./catalog-changes.mjs"

const song = (overrides = {}) => ({
  id: "1",
  catname: "POPS & ANIME",
  newflag: "0",
  title: "Test Song",
  reading: "TESTSONG",
  artist: "Someone",
  image: "images/jpn/a.jpg",
  lev_bas: "2",
  lev_adv: "5",
  lev_exp: "9",
  lev_mas: "12",
  lev_ult: "",
  we_kanji: "",
  we_star: "",
  ...overrides,
})

const NOW = Date.parse("2026-10-19T00:00:00.000Z")
const EARLIER = Date.parse("2026-10-01T00:00:00.000Z")

test("canonicalChangeTimestamp 归一到变化当天（UTC+8）的 10:00", () => {
  // 2026-10-19 15:23 UTC = 北京时间 19 日 23:23 → 19 日 10:00 UTC+8 = 02:00 UTC
  assert.equal(
    canonicalChangeTimestamp(Date.parse("2026-10-19T15:23:10.089Z")),
    Date.parse("2026-10-19T02:00:00.000Z"),
  )
  // UTC 19 日 17:00 = 北京时间 20 日凌晨 01:00 → 按 UTC+8 日期归到 20 日 10:00
  assert.equal(
    canonicalChangeTimestamp(Date.parse("2026-10-19T17:00:00.000Z")),
    Date.parse("2026-10-20T02:00:00.000Z"),
  )
  // 幂等：已是 10:00 UTC+8 的时刻保持不变
  const canonical = Date.parse("2026-10-19T02:00:00.000Z")
  assert.equal(canonicalChangeTimestamp(canonical), canonical)
})

test("resolveChangeTimestamp 按数据源选取基准时间", () => {
  const syncTime = Date.parse("2026-10-20T15:00:00.000Z")
  // SEGA：用 Last-Modified 所在日（文件真实修改日）
  assert.equal(
    resolveChangeTimestamp({ lastModified: "Thu, 08 Oct 2026 02:59:03 GMT", syncTime }),
    Date.parse("2026-10-08T02:00:00.000Z"),
  )
  // SEGA：Last-Modified 缺失时退回检测日
  assert.equal(
    resolveChangeTimestamp({ lastModified: null, syncTime }),
    Date.parse("2026-10-20T02:00:00.000Z"),
  )
  assert.equal(
    resolveChangeTimestamp({ lastModified: "not-a-date", syncTime }),
    Date.parse("2026-10-20T02:00:00.000Z"),
  )
  // lxns：即使有 Last-Modified 也忽略，用检测日
  assert.equal(
    resolveChangeTimestamp({
      source: "lxns",
      lastModified: "Thu, 08 Oct 2026 02:59:03 GMT",
      syncTime,
    }),
    Date.parse("2026-10-20T02:00:00.000Z"),
  )
})

test("新条目获得 added_at，已有条目原样保留", () => {
  const previous = [song({ added_at: EARLIER })]
  const catalog = [song({ added_at: EARLIER }), song({ id: "2", title: "Brand New" })]

  const stats = applyCatalogChanges({ previousCatalog: previous, catalog, now: NOW })

  assert.equal(stats.added, 1)
  assert.equal(stats.updated, 0)
  assert.equal(catalog[0].added_at, EARLIER)
  assert.equal(catalog[1].added_at, NOW)
  assert.equal(catalog[0].updated_at, undefined)
})

test("LXNS release date replaces a previously tracked added_at", () => {
  const previousCatalog = [{ id: "1", title: "Test", added_at: 100 }]
  const catalog = [{ id: "1", title: "Test", added_at: 200 }]

  applyCatalogChanges({
    previousCatalog,
    catalog,
    now: 300,
    preferIncomingAddedAt: true,
  })

  assert.equal(catalog[0].added_at, 200)
})

test("内容变化标记 updated_at，newflag 翻转不算变化", () => {
  const previous = [song({ added_at: EARLIER, lev_mas: "12" })]
  const catalog = [song({ added_at: EARLIER, lev_mas: "13" }), song({ id: "2", newflag: "1" })]
  const previous2 = [song({ id: "2", newflag: "0" })]

  const stats = applyCatalogChanges({ previousCatalog: previous, catalog: [catalog[0]], now: NOW })
  assert.equal(stats.updated, 1)
  assert.equal(catalog[0].updated_at, NOW)
  assert.equal(catalog[0].added_at, EARLIER)

  const stats2 = applyCatalogChanges({
    previousCatalog: previous2,
    catalog: [catalog[1]],
    now: NOW,
  })
  assert.equal(stats2.updated, 0)
  assert.equal(catalog[1].updated_at, undefined)
})

test("未变化条目的 updated_at 原样继承", () => {
  const previous = [song({ added_at: EARLIER, updated_at: EARLIER })]
  const catalog = [song()]

  applyCatalogChanges({ previousCatalog: previous, catalog, now: NOW })

  assert.equal(catalog[0].added_at, EARLIER)
  assert.equal(catalog[0].updated_at, EARLIER)
})

test("消失的条目写入墓碑并携带 removed_at，旧墓碑不刷新时间", () => {
  const previous = [song(), song({ id: "2", title: "Gone Soon" })]
  const catalog = [song()]

  const stats = applyCatalogChanges({ previousCatalog: previous, catalog, now: NOW })
  assert.equal(stats.removed, 1)
  assert.equal(stats.removedSongs.length, 1)
  assert.equal(stats.removedSongs[0].removed_at, NOW)
  assert.equal(stats.removedSongs[0].title, "Gone Soon")

  // 下一次同步仍然缺席：保留原 removed_at，不重复计数
  const stats2 = applyCatalogChanges({
    previousCatalog: catalog,
    catalog: [song()],
    previousRemoved: stats.removedSongs,
    now: Date.parse("2026-11-01T00:00:00.000Z"),
  })
  assert.equal(stats2.removed, 0)
  assert.equal(stats2.removedSongs.length, 1)
  assert.equal(stats2.removedSongs[0].removed_at, NOW)
})

test("重新上架的曲目撤销墓碑并重新获得 added_at", () => {
  const tombstone = { ...song({ id: "2", title: "Gone Soon" }), removed_at: EARLIER }
  const catalog = [song(), song({ id: "2", title: "Gone Soon" })]

  const stats = applyCatalogChanges({
    previousCatalog: [song()],
    catalog,
    previousRemoved: [tombstone],
    now: NOW,
  })

  assert.equal(stats.added, 1)
  assert.equal(stats.removedSongs.length, 0)
  assert.equal(catalog[1].added_at, NOW)
})

test("同 id 的常规行与 WORLD'S END 行互不干扰", () => {
  const standard = song({ id: "8020" })
  const worldEnd = song({ id: "8020", we_kanji: "戻", we_star: "4", lev_bas: "" })
  assert.notEqual(songRowKey(standard), songRowKey(worldEnd))

  const catalog = [standard]
  const stats = applyCatalogChanges({
    previousCatalog: [standard, worldEnd],
    catalog,
    now: NOW,
  })

  assert.equal(stats.removed, 1)
  assert.equal(stats.removedSongs[0].we_kanji, "戻")
})
