---
name: CHUNITHM Wiki Release Dates
description: Query CHUNITHM JPN and EXP (International Ver.) song and chart release dates from wikis (SilentBlue RemyWiki, WIKIWIKI chunithmwiki, OTOGE DB, and info-chunithm.sega.com) to populate or fix added_at and level_updated_at in catalog-jpn.json and catalog-exp.json.
---

# CHUNITHM Wiki Release Dates

Use this workflow when populating, auditing, or correcting `added_at` and `level_updated_at` timestamps in `public/data/catalog-jpn.json` and `public/data/catalog-exp.json`.

## Timestamp & Schema Conventions

- All timestamps in `catalog-jpn.json`, `catalog-exp.json`, and `catalog-chn.json` are normalized via `canonicalChangeTimestamp` in `scripts/catalog-changes.mjs` to **10:00 UTC+8** (`02:00:00.000Z`) of the release date:
  ```js
  const ms = Date.parse(`${yyyy}-${mm}-${dd}T02:00:00.000Z`)
  ```
- Each song entry in `catalog-jpn.json` and `catalog-exp.json` stores:
  - `added_at`: Unix ms timestamp when the song (or `8xxx` WORLD'S END entry) was first playable in that region.
  - `level_updated_at`:
    - `lev_bas`, `lev_adv`, `lev_exp`, `lev_mas` (when non-empty): standard chart addition date in that region.
    - `lev_ult` (when non-empty): ULTIMA chart addition date in that region.
    - `we:<kanji>|<star>` (for each item in `world_end`): WORLD'S END chart addition date in that region.

## Data Sources & Priority

SEGA's official `music.json` feeds do not contain release dates, and `catalog-exp.json` / `catalog-jpn.json` sync timestamps only reflect when `music.json` was fetched. Combine the following sources to determine true release dates:

### 1. SilentBlue RemyWiki (`https://silentblue.remywiki.com`)

- **JPN version pages**:
  `CHUNITHM:1st`, `CHUNITHM:PLUS`, `CHUNITHM:AIR`, `CHUNITHM:AIR_PLUS`, `CHUNITHM:STAR`, `CHUNITHM:STAR_PLUS`, `CHUNITHM:AMAZON`, `CHUNITHM:AMAZON_PLUS`, `CHUNITHM:CRYSTAL`, `CHUNITHM:CRYSTAL_PLUS`, `CHUNITHM:PARADISE`, `CHUNITHM:PARADISE_LOST`, `CHUNITHM:NEW`, `CHUNITHM:NEW_PLUS`, `CHUNITHM:SUN`, `CHUNITHM:SUN_PLUS`, `CHUNITHM:LUMINOUS`, `CHUNITHM:LUMINOUS_PLUS`, `CHUNITHM:VERSE`, `CHUNITHM:X-VERSE`, `CHUNITHM:X-VERSE-X`, `CHUNITHM:Mate`
- **EXP (Asia / International) version pages**:
  `CHUNITHM:SUPER_STAR`, `CHUNITHM:SUPER_STAR_PLUS`, `CHUNITHM:NEW_(Asia)`, `CHUNITHM:NEW_PLUS_(Asia)`, `CHUNITHM:SUN_(Asia)`, `CHUNITHM:SUN_PLUS_(Asia)`, `CHUNITHM:LUMINOUS_(Asia)`, `CHUNITHM:LUMINOUS_PLUS_(Asia)`, `CHUNITHM:VERSE_(Asia)`, `CHUNITHM:X-VERSE_(Asia)`, `CHUNITHM:X-VERSE-X_(Asia)`, `CHUNITHM:Mate_(Asia)`
- **How to fetch**:
  - RemyWiki is behind Cloudflare and blocks `/api.php` or plain CLI requests.
  - Load the `browser` skill, open any article page on `https://silentblue.remywiki.com/` in a browser tab, and use `tools.browser.evaluate` with `fetch("/" + page)` inside that tab to fetch and parse article HTML via `DOMParser`.
- **Parsing rules for `table.bluetable`**:
  - Include tables under `Song List`, `New Songs`, `New Songs / WORLD'S END Charts`, and `Revived Songs`.
  - Skip tables under `Removed Songs`, `Difficulty Changes`, and `Licensed Songs Status`.
  - **Date header (`<th>`) parsing**: Always parse the human-readable date text (`Month DDth, YYYY`) first, and fall back to `th.id` (`^\d{8}$`) only when the text is `Launch` (some pages have copy-paste typos in `th.id`, such as `<th id="20250319">July 17th, 2025</th>` on `CHUNITHM:VERSE_(Asia)`).
  - Rows with `levels[0] === "-"` and `levels[4] !== "-"` represent ULTIMA-only additions to existing songs.
  - Rows with a black cell (`td[colspan="5"]` or `style*="black"`) represent WORLD'S END additions.
  - Some RemyWiki entries use English/translated titles (e.g., `Hainuwele` for `エテルニタス・ルドロジー`); check the `<a href>` or disambiguate by artist and chart levels when matching.

### 2. OTOGE DB (`zvuc/otoge-db`)

- **Files**:
  - JPN + INTL summary: `https://otoge-db.net/chunithm/data/music-ex.json`
  - INTL details: `https://raw.githubusercontent.com/zvuc/otoge-db/master/chunithm/data/music-ex-intl.json`
- **Strengths**: Keyed directly by SEGA's official `id` (`date_added`, `date_updated`, `date_intl_added`, `date_intl_updated`).
- **Known Pitfalls to Correct**:
  1. **ULTIMA re-ratings overwrite `date_updated`**: `otoge-db` overwrites `date_updated` whenever `lev_ult` changes (for example, `14+ -> 15` constant promotions at version launches like `20241212`, `20250716`, `20251211`, `20260702`). Always prefer RemyWiki's ULTIMA addition date over `otoge-db`'s `date_updated`.
  2. **Sync lag & hidden unlocks in `date_added`**: For Unlock Challenge, Linked VERSE, CAVE of RVESE, and Class Certification songs, SEGA adds them to `music.json` only after general unlock, so `otoge-db` often records a date 1–21 days later than the true in-game release date. Take the earlier date between RemyWiki and `otoge-db` (except for duplicate-title remakes like `id: "2792"` `Help me, ERINNNNNN!!`).
  3. **Overwritten `date_intl_added`**: Check that adding an ULTIMA chart in EXP did not overwrite `date_intl_added` (e.g., `id: "2586"` `唱` was added on `20241017` and got ULTIMA on `20251120`).

### 3. WIKIWIKI `chunithmwiki` (`https://wikiwiki.jp/chunithmwiki/`)

- **Pages**: `<Version> 楽曲一覧(追加日順)` (e.g., `CHUNITHM Mate 楽曲一覧(追加日順)`) and individual song pages (`解禁方法`).
- **Rate limit**: WIKIWIKI returns `HTTP 429` if more than ~5 requests are sent per second; throttle requests when querying directly.

### 4. SEGA International Official News (`https://info-chunithm.sega.com/`)

- Use official `Details of M/D Update` posts to verify WORLD'S END charts omitted from RemyWiki Asia tables.
- When an update post uses images for song tables, cross-check the JP release batch (`date_added` in JPN) against other songs in the same JP batch to identify the corresponding EXP biweekly update date.

## Verification Checklist

After updating `public/data/catalog-jpn.json` and `public/data/catalog-exp.json`:

1. Every song has a finite `added_at` timestamp and non-empty `level_updated_at` matching all present difficulties (`lev_bas`..`lev_ult` and `world_end`).
2. No chart in `level_updated_at` has a timestamp earlier than `added_at` of the same song.
3. Any song with `EXP added_at < JPN added_at` is a genuine International-first release (e.g., WACCA / EZ2ON collabs, International Original Song Contest songs, `Valsqotch`, `HECATONCHEIR`, or KoP simultaneous releases).
4. Run `npm test` and `npm run build` to confirm all tests and schema validations pass.
