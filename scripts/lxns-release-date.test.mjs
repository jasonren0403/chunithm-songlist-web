import assert from "node:assert/strict"
import test from "node:test"
import { applyCatalogChanges } from "./catalog-changes.mjs"
import { lxnsSongToRawSongs } from "./lxns-catalog.mjs"

test("LXNS keeps release dates for all chart difficulties on one catalog row", () => {
  const rows = lxnsSongToRawSongs({
    id: 42,
    title: "Test song",
    release_date: "2020-01-01",
    difficulties: [
      { difficulty: 0, level: "3" },
      { difficulty: 1, level: "5" },
      { difficulty: 2, level: "9" },
      { difficulty: 3, level: "12" },
      { difficulty: 4, level: "15.0", release_date: "2024-02-03" },
      { difficulty: 5, kanji: "蔵", star: 3, release_date: "2025-04-06" },
      { difficulty: 5, kanji: "狂", star: 4, release_date: "2026-07-08" },
    ],
  })

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].level_updated_at, {
    lev_bas: Date.parse("2020-01-01T02:00:00.000Z"),
    lev_adv: Date.parse("2020-01-01T02:00:00.000Z"),
    lev_exp: Date.parse("2020-01-01T02:00:00.000Z"),
    lev_mas: Date.parse("2020-01-01T02:00:00.000Z"),
    lev_ult: Date.parse("2024-02-03T02:00:00.000Z"),
    "we:蔵|3": Date.parse("2025-04-06T02:00:00.000Z"),
    "we:狂|4": Date.parse("2026-07-08T02:00:00.000Z"),
  })
})

test("missing chart release dates fall back to sync time and stay stable", () => {
  const rows = lxnsSongToRawSongs({
    id: 42,
    title: "Test song",
    difficulties: [
      { difficulty: 0, level: "3" },
      { difficulty: 4, level: "15.0", release_date: "not-a-date" },
      { difficulty: 5, kanji: "蔵", star: 3 },
    ],
  })
  const now = Date.parse("2026-10-30T02:00:00.000Z")

  applyCatalogChanges({
    previousCatalog: [],
    catalog: rows,
    now,
    mergeById: true,
  })

  assert.deepEqual(rows[0].level_updated_at, {
    lev_bas: now,
    lev_ult: now,
    "we:蔵|3": now,
  })
})

test("existing release dates and first-seen date survive catalog updates", () => {
  const previous = {
    id: "42",
    title: "Test song",
    lev_bas: "3",
    lev_ult: "15.0",
    we_kanji: "",
    we_star: "",
    world_end: [{ kanji: "蔵", star: "3" }],
    level_updated_at: {
      lev_bas: 100,
      lev_ult: 200,
      "we:蔵|3": 300,
    },
    added_at: 50,
  }
  const catalog = [
    {
      ...previous,
      level_updated_at: { lev_bas: 100 },
      added_at: undefined,
    },
  ]

  applyCatalogChanges({
    previousCatalog: [previous],
    catalog,
    now: 500,
    mergeById: true,
  })

  assert.equal(catalog[0].added_at, 50)
  assert.deepEqual(catalog[0].level_updated_at, {
    lev_bas: 100,
    lev_ult: 200,
    "we:蔵|3": 300,
  })
})

test("legacy repeated chart rows migrate to one row keyed by song id", () => {
  const legacyRows = [
    { id: "42", title: "Test song", lev_bas: "3", lev_adv: "5", updated_at: 100, added_at: 50 },
    { id: "42", title: "Test song", lev_ult: "15.0", updated_at: 200, added_at: 50 },
    { id: "42", title: "Test song", we_kanji: "蔵", we_star: "3", updated_at: 300, added_at: 50 },
  ]
  const catalog = lxnsSongToRawSongs({
    id: 42,
    title: "Test song",
    difficulties: [
      { difficulty: 0, level: "3" },
      { difficulty: 1, level: "5" },
      { difficulty: 4, level: "15.0" },
      { difficulty: 5, kanji: "蔵", star: 3 },
    ],
  })

  const result = applyCatalogChanges({
    previousCatalog: legacyRows,
    catalog,
    now: 500,
    mergeById: true,
  })

  assert.equal(result.added, 0)
  assert.equal(result.removed, 0)
  assert.equal(catalog.length, 1)
  assert.equal(catalog[0].added_at, 50)
  assert.deepEqual(catalog[0].level_updated_at, {
    lev_bas: 100,
    lev_adv: 100,
    lev_ult: 200,
    "we:蔵|3": 300,
  })
})

test("external charts added after an existing standard chart get independent dates", () => {
  const previous = [
    {
      id: "42",
      title: "Test song",
      lev_bas: "3",
      lev_adv: "5",
      lev_exp: "9",
      lev_mas: "12",
      lev_ult: "",
      we_kanji: "",
      we_star: "",
      updated_at: 100,
      added_at: 50,
    },
  ]
  const catalog = [
    ...previous.map((row) => ({ ...row })),
    {
      id: "42",
      title: "Test song",
      lev_bas: "",
      lev_adv: "",
      lev_exp: "",
      lev_mas: "",
      lev_ult: "13",
      we_kanji: "",
      we_star: "",
    },
    {
      id: "42",
      title: "Test song",
      lev_bas: "",
      lev_adv: "",
      lev_exp: "",
      lev_mas: "",
      lev_ult: "",
      we_kanji: "止",
      we_star: "1",
    },
  ]

  applyCatalogChanges({ previousCatalog: previous, catalog, now: 200, mergeById: true })

  assert.equal(catalog.length, 1)
  assert.equal(catalog[0].level_updated_at.lev_bas, 100)
  assert.equal(catalog[0].level_updated_at.lev_ult, 200)
  assert.equal(catalog[0].level_updated_at["we:止|1"], 200)
  assert.equal(catalog[0].added_at, 50)
})

test("external standard charts added after WORLD'S END keep the WE date", () => {
  const previous = [
    {
      id: "42",
      title: "Test song",
      lev_bas: "",
      lev_adv: "",
      lev_exp: "",
      lev_mas: "",
      lev_ult: "",
      we_kanji: "止",
      we_star: "1",
      updated_at: 100,
      added_at: 50,
    },
  ]
  const catalog = [
    {
      id: "42",
      title: "Test song",
      lev_bas: "3",
      lev_adv: "5",
      lev_exp: "9",
      lev_mas: "12",
      lev_ult: "",
      we_kanji: "",
      we_star: "",
    },
    { ...previous[0] },
  ]

  applyCatalogChanges({ previousCatalog: previous, catalog, now: 200, mergeById: true })

  assert.equal(catalog.length, 1)
  assert.equal(catalog[0].level_updated_at["we:止|1"], 100)
  assert.equal(catalog[0].level_updated_at.lev_bas, 200)
  assert.equal(catalog[0].added_at, 50)
})

test("changed external levels get a new date while unchanged levels keep theirs", () => {
  const previous = [
    {
      id: "42",
      title: "Test song",
      lev_bas: "3",
      lev_adv: "5",
      lev_exp: "",
      lev_mas: "",
      lev_ult: "",
      we_kanji: "",
      we_star: "",
      added_at: 50,
      level_updated_at: { lev_bas: 100, lev_adv: 110 },
    },
  ]
  const catalog = [
    {
      ...previous[0],
      lev_adv: "6",
      level_updated_at: {},
    },
  ]

  applyCatalogChanges({ previousCatalog: previous, catalog, now: 200, mergeById: true })

  assert.equal(catalog[0].level_updated_at.lev_bas, 100)
  assert.equal(catalog[0].level_updated_at.lev_adv, 200)
})
