import assert from "node:assert/strict"
import { test } from "node:test"
import { lxnsSongToRawSongs, parseLxnsCatalog } from "./lxns-catalog.mjs"

test("常规曲目转换为单行，包含五个难度等级", () => {
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

test("仅含 WORLD'S END 的条目只输出 WE 行", () => {
  const rows = lxnsSongToRawSongs({
    id: 8020,
    title: "B.B.K.K.B.K.K.",
    artist: "nora2r",
    genre: "其他游戏",
    difficulties: [{ difficulty: 5, level: "0", kanji: "戻", star: 4, origin_id: 3 }],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].we_kanji, "戻")
  assert.equal(rows[0].we_star, "4")
  assert.equal(rows[0].lev_bas, "")
  assert.equal(rows[0].lev_mas, "")
  assert.equal(rows[0].image, "")
})

test("常规谱面与多张 WORLD'S END 谱面共存时逐张拆行", () => {
  const rows = lxnsSongToRawSongs({
    id: 100,
    title: "Mixed Song",
    difficulties: [
      { difficulty: 3, level: "13" },
      { difficulty: 5, kanji: "止", star: 1 },
      { difficulty: 5, kanji: "狂", star: 5 },
    ],
  })

  assert.equal(rows.length, 3)
  assert.equal(rows[0].we_kanji, "")
  assert.equal(rows[0].lev_mas, "13")
  assert.deepEqual(
    rows.slice(1).map((row) => [row.we_kanji, row.we_star]),
    [
      ["止", "1"],
      ["狂", "5"],
    ],
  )
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
  assert.equal(rows[1].we_kanji, "光")
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
