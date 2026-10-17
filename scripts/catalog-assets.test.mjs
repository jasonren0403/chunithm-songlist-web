import assert from 'node:assert/strict'
import test from 'node:test'
import { getSupersededCoverHashes } from './catalog-assets.mjs'

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
