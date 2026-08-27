export function normalizeWord(word) {
  return word.trim().toLowerCase().replace(/\s+/g, " ");
}

export function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + substitutionCost
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

export function findClosestWords(input, words, limit = 5) {
  const normalized = normalizeWord(input);
  if (normalized.length < 3 || normalized.includes(" ")) return [];
  const threshold = normalized.length <= 5 ? 1 : 2;

  return words
    .filter((word) => Math.abs(word.length - normalized.length) <= threshold)
    .map((word) => ({ word, distance: editDistance(normalized, word), prefix: commonPrefixLength(normalized, word) }))
    .filter((item) => item.distance <= threshold)
    .sort((left, right) => left.distance - right.distance || right.prefix - left.prefix || left.word.localeCompare(right.word))
    .slice(0, limit)
    .map((item) => item.word);
}

function commonPrefixLength(left, right) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) {
    index += 1;
  }
  return index;
}
