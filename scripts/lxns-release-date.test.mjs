import assert from "node:assert/strict"
import test from "node:test"
import { applyCatalogChanges } from "./catalog-changes.mjs"
import { lxnsSongToRawSongs } from "./lxns-catalog.mjs"

test("LXNS keeps release dates separately for ULTIMA and WORLD'S END charts", () => {
  const rows = lxnsSongToRawSongs({
    id: 42,
    title: "Test song",
    release_date: "2020-01-01",
    difficulties: [
      { difficulty: 0, level: "3" },
      { difficulty: 4, level: "15.0", release_date: "2024-02-03" },
      { difficulty: 5, kanji: "蔵", star: 3, release_date: "2025-04-06" },
      { difficulty: 5, kanji: "狂", star: 4, release_date: "2026-07-08" },
    ],
  })

  assert.equal(rows.length, 4)
  assert.equal(rows[0].lev_ult, "")
  assert.equal(rows[0].added_at, Date.parse("2020-01-01T02:00:00.000Z"))
  assert.equal(rows[1].lev_ult, "15.0")
  assert.equal(rows[1].lev_bas, "")
  assert.equal(rows[1].added_at, Date.parse("2024-02-03T02:00:00.000Z"))
  assert.deepEqual(
    rows.slice(2).map((row) => row.added_at),
    [Date.parse("2025-04-06T02:00:00.000Z"), Date.parse("2026-07-08T02:00:00.000Z")],
  )
})

test("change tracking preserves release dates and sync-time fallback", () => {
  const rows = lxnsSongToRawSongs({
    id: 42,
    title: "Test song",
    difficulties: [
      { difficulty: 0, level: "3" },
      { difficulty: 4, level: "15.0", release_date: "2024-02-03" },
      { difficulty: 5, kanji: "蔵", star: 3, release_date: "not-a-date" },
    ],
  })
  const now = Date.parse("2026-10-30T02:00:00.000Z")

  const result = applyCatalogChanges({ previousCatalog: [], catalog: rows, now })

  assert.equal(result.added, 3)
  assert.deepEqual(
    rows.map((row) => row.added_at),
    [now, Date.parse("2024-02-03T02:00:00.000Z"), now],
  )
})

test("invalid chart release dates fall back to the song release date", () => {
  const rows = lxnsSongToRawSongs({
    id: 42,
    title: "Test song",
    release_date: "2020-01-01",
    difficulties: [{ difficulty: 4, level: "15.0", release_date: "not-a-date" }],
  })

  assert.equal(rows[0].added_at, Date.parse("2020-01-01T02:00:00.000Z"))
})

test("ULTIMA and standard rows have distinct identities during change tracking", () => {
  const rows = lxnsSongToRawSongs({
    id: 42,
    title: "Test song",
    difficulties: [
      { difficulty: 0, level: "3" },
      { difficulty: 4, level: "15.0" },
    ],
  })
  const result = applyCatalogChanges({
    previousCatalog: [],
    catalog: rows,
    now: Date.parse("2026-10-30T02:00:00.000Z"),
  })

  assert.equal(result.added, 2)
})
