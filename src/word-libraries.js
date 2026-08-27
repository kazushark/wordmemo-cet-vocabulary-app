export const WORD_LIBRARY_CAPACITY = 300;

function validLibraryId(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export function normalizeLibraryEntries(entries) {
  const counts = new Map();
  const normalized = entries.map((entry) => {
    const libraryId = validLibraryId(entry.libraryId);
    if (libraryId) counts.set(libraryId, (counts.get(libraryId) || 0) + 1);
    return libraryId === entry.libraryId ? entry : { ...entry, libraryId };
  });

  const unassigned = normalized
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !entry.libraryId)
    .sort((left, right) => {
      const timeDifference = Number(left.entry.addedAt || 0) - Number(right.entry.addedAt || 0);
      return timeDifference || right.index - left.index;
    });

  unassigned.forEach(({ index }) => {
    let libraryId = 1;
    while ((counts.get(libraryId) || 0) >= WORD_LIBRARY_CAPACITY) libraryId += 1;
    normalized[index] = { ...normalized[index], libraryId };
    counts.set(libraryId, (counts.get(libraryId) || 0) + 1);
  });

  return normalized;
}

export function nextLibraryId(entries) {
  const counts = libraryCounts(entries);
  if (!counts.length) return 1;
  const latest = counts[counts.length - 1];
  return latest.count >= WORD_LIBRARY_CAPACITY ? latest.id + 1 : latest.id;
}

export function libraryCounts(entries) {
  const counts = new Map();
  entries.forEach((entry) => {
    const libraryId = validLibraryId(entry.libraryId) || 1;
    counts.set(libraryId, (counts.get(libraryId) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((left, right) => left.id - right.id);
}

export function entriesInLibrary(entries, libraryId) {
  if (libraryId === "all") return entries;
  if (libraryId === "favorites") return entries.filter((entry) => Boolean(entry.favorite));
  const target = validLibraryId(libraryId);
  return target ? entries.filter((entry) => (validLibraryId(entry.libraryId) || 1) === target) : [];
}
