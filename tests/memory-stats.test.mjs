import test from "node:test";
import assert from "node:assert/strict";
import { applyMemoryEvent, memoryStats } from "../src/memory-stats.js";

test("direct answers count once and calculate accuracy", () => {
  let entry = applyMemoryEvent({}, "remember");
  entry = applyMemoryEvent(entry, "forgot");

  assert.deepEqual(memoryStats(entry), {
    correctCount: 1,
    incorrectCount: 1,
    hintCount: 0,
    total: 2,
    accuracy: 50
  });
});

test("a hinted card is one incorrect result regardless of the following answer", () => {
  let entry = applyMemoryEvent({}, "hint");
  entry = applyMemoryEvent(entry, "remember", { hinted: true });
  entry = applyMemoryEvent(entry, "forgot", { hinted: true });

  assert.deepEqual(memoryStats(entry), {
    correctCount: 0,
    incorrectCount: 1,
    hintCount: 1,
    total: 1,
    accuracy: 0
  });
});

test("legacy wrong counts are retained when statistics are first updated", () => {
  const entry = applyMemoryEvent({ wrongCount: 2 }, "remember");
  const stats = memoryStats(entry);

  assert.equal(stats.correctCount, 1);
  assert.equal(stats.incorrectCount, 2);
  assert.equal(stats.accuracy, 33);
});

test("misremembered changes a direct correct answer into one incorrect result", () => {
  let entry = applyMemoryEvent({}, "remember");
  entry = applyMemoryEvent(entry, "misremembered");

  assert.deepEqual(memoryStats(entry), {
    correctCount: 0,
    incorrectCount: 1,
    hintCount: 0,
    total: 1,
    accuracy: 0
  });
});

test("misremembered does not double count an answer that already used a hint", () => {
  let entry = applyMemoryEvent({}, "hint");
  entry = applyMemoryEvent(entry, "remember", { hinted: true });
  entry = applyMemoryEvent(entry, "misremembered", { hinted: true });

  assert.equal(memoryStats(entry).incorrectCount, 1);
});
