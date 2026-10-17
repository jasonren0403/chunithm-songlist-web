export function normalizeTitle(title) {
  return title.normalize('NFKC').trim().replace(/\s+/g, '').toLocaleLowerCase()
}

export function getSupersededCoverHashes(region, previousCatalog, currentSongImages) {
  const currentSongs = new Map(currentSongImages.map(({ key, image }) => [key, image]))
  const currentHashes = new Set(currentSongImages.map(({ image }) => image))
  const oldHashes = new Set()
  const deletedSongHashes = new Set()
  const imagePrefix = `images/${region}/`

  for (const song of previousCatalog) {
    const previousImage = song.image
    const currentImage = currentSongs.get(normalizeTitle(song.title))
    if (!previousImage.startsWith(imagePrefix)) continue

    const oldHash = previousImage.slice(imagePrefix.length)
    if (!/^[\w.-]+$/.test(oldHash) || oldHash === '.' || oldHash === '..') continue

    if (!currentImage) {
      deletedSongHashes.add(oldHash)
      continue
    }
    if (oldHash === currentImage || currentHashes.has(oldHash)) {
      continue
    }

    oldHashes.add(oldHash)
  }

  return new Set([...oldHashes].filter((image) => !deletedSongHashes.has(image)))
}
