import assert from "node:assert/strict"
import { test } from "node:test"
import { lxnsSongToRawSongs, parseLxnsCatalog } from "./lxns-catalog.mjs"

test("一个曲目只输出一行并包含全部难度", () => {
  const rows = lxnsSongToRawSongs({
    id: 3,
    title: "B.B.K.K.B.K.K.",
    artist: "nora2r",
    genre: "其他游戏",
    difficulties: [
      { difficulty: 0, level: "4" },
      { difficulty: 1, level: "6" },
      { difficulty: 2, level: "10" },
      { difficulty: 3, level: "12+" },
      { difficulty: 4, level: "13+" },
    ],
  })

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    id: "3",
    catname: "其他游戏",
    newflag: "0",
    title: "B.B.K.K.B.K.K.",
    reading: "",
    artist: "nora2r",
    image: "",
    lev_bas: "4",
    lev_adv: "6",
    lev_exp: "10",
    lev_mas: "12+",
    lev_ult: "13+",
    we_kanji: "",
    we_star: "",
    world_end: [],
    level_updated_at: {},
  })
})

test("缺失的难度留空字符串", () => {
  const rows = lxnsSongToRawSongs({
    id: 10,
    title: "Test Song",
    difficulties: [
      { difficulty: 0, level: "3" },
      { difficulty: 2, level: "9" },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].lev_bas, "3")
  assert.equal(rows[0].lev_adv, "")
  assert.equal(rows[0].lev_exp, "9")
  assert.equal(rows[0].lev_mas, "")
  assert.equal(rows[0].lev_ult, "")
})

test("仅含 WORLD'S END 的曲目写入独立谱面数组", () => {
  const rows = lxnsSongToRawSongs({
    id: 8020,
    title: "B.B.K.K.B.K.K.",
    artist: "nora2r",
    genre: "其他游戏",
    difficulties: [{ difficulty: 5, level: "0", kanji: "戻", star: 4, origin_id: 3 }],
  })

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].world_end, [{ kanji: "戻", star: "4" }])
  assert.equal(rows[0].lev_bas, "")
  assert.equal(rows[0].lev_mas, "")
  assert.equal(rows[0].image, "")
})

test("常规谱面与多张 WORLD'S END 谱面共存时仍只输出一行", () => {
  const rows = lxnsSongToRawSongs({
    id: 100,
    title: "Mixed Song",
    difficulties: [
      { difficulty: 3, level: "13" },
      { difficulty: 5, kanji: "止", star: 1 },
      { difficulty: 5, kanji: "狂", star: 5 },
    ],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].we_kanji, "")
  assert.equal(rows[0].lev_mas, "13")
  assert.deepEqual(rows[0].world_end, [
    { kanji: "止", star: "1" },
    { kanji: "狂", star: "5" },
  ])
  assert.ok(rows.every((row) => row.id === "100" && row.title === "Mixed Song"))
})

test("parseLxnsCatalog 展开曲目列表", () => {
  const rows = parseLxnsCatalog({
    songs: [
      { id: 1, title: "A", difficulties: [{ difficulty: 0, level: "1" }] },
      { id: 8001, title: "A", difficulties: [{ difficulty: 5, kanji: "光", star: 3 }] },
    ],
    genres: [],
    versions: [],
  })

  assert.equal(rows.length, 2)
  assert.equal(rows[0].lev_bas, "1")
  assert.deepEqual(rows[1].world_end, [{ kanji: "光", star: "3" }])
})

test("谱面更新时间按难度及 WORLD'S END 图表分别保存", () => {
  const rows = lxnsSongToRawSongs({
    id: 101,
    title: "Timestamped song",
    release_date: "2020-01-01",
    difficulties: [
      { difficulty: 0, level: "3" },
      { difficulty: 3, level: "12+" },
      { difficulty: 4, level: "15.0", release_date: "2024-02-03" },
      { difficulty: 5, kanji: "止", star: 1, release_date: "2025-04-06" },
    ],
  })

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0].level_updated_at, {
    lev_bas: Date.parse("2020-01-01T02:00:00.000Z"),
    lev_mas: Date.parse("2020-01-01T02:00:00.000Z"),
    lev_ult: Date.parse("2024-02-03T02:00:00.000Z"),
    "we:止|1": Date.parse("2025-04-06T02:00:00.000Z"),
  })
})

test("parseLxnsCatalog 拒绝异常数据", () => {
  assert.throws(() => parseLxnsCatalog(null), /CHN 曲库数据格式异常/)
  assert.throws(() => parseLxnsCatalog({ songs: "nope" }), /CHN 曲库数据格式异常/)
  assert.throws(
    () => parseLxnsCatalog({ songs: [{ id: 1, title: "", difficulties: [] }] }),
    /CHN 曲库数据格式异常/,
  )
  assert.throws(() => parseLxnsCatalog({ songs: [{ id: 1, title: "A" }] }), /CHN 曲库数据格式异常/)
})
