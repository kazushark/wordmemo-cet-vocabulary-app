function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function memoryStats(entry = {}) {
  const correctCount = count(entry.correctCount);
  const incorrectCount = Object.hasOwn(entry, "incorrectCount")
    ? count(entry.incorrectCount)
    : count(entry.wrongCount);
  const hintCount = count(entry.hintCount);
  const total = correctCount + incorrectCount;

  return {
    correctCount,
    incorrectCount,
    hintCount,
    total,
    accuracy: total ? Math.round((correctCount / total) * 100) : null
  };
}

export function applyMemoryEvent(entry, event, { hinted = false } = {}) {
  const stats = memoryStats(entry);

  if (event === "hint") {
    stats.incorrectCount += 1;
    stats.hintCount += 1;
  } else if (event === "misremembered" && !hinted) {
    stats.correctCount = Math.max(0, stats.correctCount - 1);
    stats.incorrectCount += 1;
  } else if (!hinted && event === "remember") {
    stats.correctCount += 1;
  } else if (!hinted && event === "forgot") {
    stats.incorrectCount += 1;
  }

  return {
    ...entry,
    correctCount: stats.correctCount,
    incorrectCount: stats.incorrectCount,
    hintCount: stats.hintCount
  };
}
