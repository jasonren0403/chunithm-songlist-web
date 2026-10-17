import assert from 'node:assert/strict'
import test from 'node:test'
import { getSupersededCoverHashes } from './catalog-assets.mjs'
import { mergeRegionalSongs } from '../src/catalog-merge.mjs'

test('remove old cover hashes only when a current song changes its image', () => {
  const previousCatalog = [
    { title: 'Changed song', image: 'images/jpn/changed-old.jpg' },
    { title: 'Unchanged song', image: 'images/jpn/same.jpg' },
    { title: 'Deleted song', image: 'images/jpn/deleted.jpg' },
    { title: 'Shared cover', image: 'images/jpn/shared.jpg' },
  ]
  const currentSongImages = [
    { key: 'changedsong', image: 'new.jpg' },
    { key: 'unchangedsong', image: 'same.jpg' },
    { key: 'sharedcover', image: 'new-shared.jpg' },
    { key: 'anothersong', image: 'shared.jpg' },
  ]

  assert.deepEqual(
    getSupersededCoverHashes('jpn', previousCatalog, currentSongImages),
    new Set(['changed-old.jpg']),
  )
})

test('preserve an old cover if any song using it was removed', () => {
  const previousCatalog = [
    { title: 'Changed song', image: 'images/jpn/shared-old.jpg' },
    { title: 'Deleted song', image: 'images/jpn/shared-old.jpg' },
  ]
  const currentSongImages = [{ key: 'changedsong', image: 'new.jpg' }]

  assert.deepEqual(getSupersededCoverHashes('jpn', previousCatalog, currentSongImages), new Set())
})

test("merge repeated regional rows and retain unique WORLD'S END charts", () => {
  const merged = mergeRegionalSongs(
    {
      image: 'cover.jpg',
      levels: {
        lev_bas: '',
        lev_adv: '',
        lev_exp: '',
        lev_mas: '',
        lev_ult: '',
      },
      worldEnd: [{ kanji: '避', stars: '7' }],
    },
    {
      image: '',
      levels: {
        lev_bas: '',
        lev_adv: '',
        lev_exp: '',
        lev_mas: '',
        lev_ult: '',
      },
      worldEnd: [
        { kanji: '狂', stars: '7' },
        { kanji: '避', stars: '7' },
      ],
    },
  )

  assert.equal(merged.image, 'cover.jpg')
  assert.deepEqual(merged.worldEnd, [
    { kanji: '避', stars: '7' },
    { kanji: '狂', stars: '7' },
  ])
})
