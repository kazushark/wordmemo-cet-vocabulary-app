export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

const STUDY_RATIOS = [3, 2, 2];

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function studyPriority(entry) {
  const correct = count(entry.correctCount);
  const incorrect = Object.hasOwn(entry, "incorrectCount")
    ? count(entry.incorrectCount)
    : count(entry.wrongCount);
  const attempts = correct + incorrect;

  if (!attempts && !count(entry.reviewCount)) return "new";
  if (attempts && incorrect / attempts >= 0.5) return "difficult";
  return "regular";
}

function proportionalQuotas(amount) {
  const ratioTotal = STUDY_RATIOS.reduce((sum, ratio) => sum + ratio, 0);
  const exact = STUDY_RATIOS.map((ratio) => (amount * ratio) / ratioTotal);
  const quotas = exact.map(Math.floor);
  let remaining = amount - quotas.reduce((sum, quota) => sum + quota, 0);
  const remainderOrder = exact
    .map((value, index) => ({ index, remainder: value - quotas[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);

  for (let index = 0; index < remaining; index += 1) {
    quotas[remainderOrder[index].index] += 1;
  }
  return quotas;
}

export function selectStudyEntries(entries, amount, random = Math.random) {
  const normalized = entries.map((entry) => (typeof entry === "string" ? { word: entry } : entry));
  const limit = Math.min(amount, normalized.length);
  const buckets = { new: [], difficult: [], regular: [] };

  normalized.forEach((entry) => buckets[studyPriority(entry)].push(entry));
  buckets.new = shuffle(buckets.new, random);
  buckets.difficult = shuffle(buckets.difficult, random).sort((left, right) => {
    const leftCorrect = count(left.correctCount);
    const leftIncorrect = count(left.incorrectCount ?? left.wrongCount);
    const rightCorrect = count(right.correctCount);
    const rightIncorrect = count(right.incorrectCount ?? right.wrongCount);
    return rightIncorrect / (rightCorrect + rightIncorrect) - leftIncorrect / (leftCorrect + leftIncorrect);
  });
  buckets.regular = shuffle(buckets.regular, random);

  const groups = [buckets.new, buckets.difficult, buckets.regular];
  const quotas = proportionalQuotas(limit);
  const selectedGroups = groups.map((group, index) => group.splice(0, quotas[index]));
  let remaining = limit - selectedGroups.reduce((sum, group) => sum + group.length, 0);

  for (let index = 0; index < groups.length && remaining > 0; index += 1) {
    const additions = groups[index].splice(0, remaining);
    selectedGroups[index].push(...additions);
    remaining -= additions.length;
  }

  return selectedGroups.flat();
}

export function createSession(entries, amount, random = Math.random) {
  const cards = selectStudyEntries(entries, amount, random)
    .map((entry) => ({
      word: entry.word,
      forgotten: false,
      rememberedStreak: 0
    }));
  return {
    total: cards.length,
    completed: 0,
    queue: cards,
    current: null,
    phase: "prompt",
    hinted: false,
    lastAnswer: null,
    answerComplete: false,
    corrected: false,
    pendingRequeue: null
  };
}

export function answerCard(card, answer) {
  if (answer === "forgot") {
    return {
      complete: false,
      requeue: {
        ...card,
        forgotten: true,
        rememberedStreak: 0
      }
    };
  }

  if (!card.forgotten) {
    return { complete: true, requeue: null };
  }

  const rememberedStreak = card.rememberedStreak + 1;
  return rememberedStreak >= 3
    ? { complete: true, requeue: null }
    : {
        complete: false,
        requeue: { ...card, rememberedStreak }
      };
}

export function reinsert(queue, card, random = Math.random) {
  const result = [...queue];
  const index = Math.floor(random() * (result.length + 1));
  result.splice(index, 0, card);
  return result;
}
