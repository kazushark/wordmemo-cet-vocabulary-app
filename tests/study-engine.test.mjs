import test from "node:test";
import assert from "node:assert/strict";
import { answerCard, createSession, reinsert, selectStudyEntries } from "../src/study-engine.js";

test("a remembered word exits immediately if it has never been forgotten", () => {
  const result = answerCard({ word: "lucid", forgotten: false, rememberedStreak: 0 }, "remember");
  assert.equal(result.complete, true);
  assert.equal(result.requeue, null);
});

test("a forgotten word needs three consecutive remembered answers", () => {
  let result = answerCard({ word: "lucid", forgotten: false, rememberedStreak: 0 }, "forgot");
  assert.equal(result.requeue.rememberedStreak, 0);
  result = answerCard(result.requeue, "remember");
  assert.equal(result.complete, false);
  result = answerCard(result.requeue, "remember");
  assert.equal(result.complete, false);
  result = answerCard(result.requeue, "remember");
  assert.equal(result.complete, true);
});

test("forgetting again resets the remembered streak", () => {
  const card = { word: "lucid", forgotten: true, rememberedStreak: 2 };
  const result = answerCard(card, "forgot");
  assert.equal(result.requeue.rememberedStreak, 0);
});

test("sessions select the requested unique words and reinsert at a random location", () => {
  const session = createSession(["a", "b", "c"], 2, () => 0);
  assert.equal(session.queue.length, 2);
  assert.equal(new Set(session.queue.map((card) => card.word)).size, 2);
  assert.deepEqual(reinsert(["later"], "again", () => 0), ["again", "later"]);
});

test("study selection follows the 3:2:2 new, difficult, regular ratio", () => {
  const entries = [
    ...Array.from({ length: 4 }, (_, index) => ({ word: `new-${index}` })),
    ...Array.from({ length: 3 }, (_, index) => ({
      word: `difficult-${index}`,
      correctCount: 1,
      incorrectCount: 3
    })),
    ...Array.from({ length: 3 }, (_, index) => ({
      word: `regular-${index}`,
      correctCount: 4,
      incorrectCount: 1
    }))
  ];

  const selected = selectStudyEntries(entries, 7, () => 0.5).map((entry) => entry.word);
  assert.equal(selected.filter((word) => word.startsWith("new-")).length, 3);
  assert.equal(selected.filter((word) => word.startsWith("difficult-")).length, 2);
  assert.equal(selected.filter((word) => word.startsWith("regular-")).length, 2);
  assert.ok(selected.slice(0, 3).every((word) => word.startsWith("new-")));
  assert.ok(selected.slice(3, 5).every((word) => word.startsWith("difficult-")));
});

test("study selection fills missing quota from the remaining priority groups", () => {
  const entries = [
    { word: "new", reviewCount: 0 },
    { word: "difficult-1", correctCount: 0, incorrectCount: 2 },
    { word: "difficult-2", correctCount: 1, incorrectCount: 2 },
    { word: "difficult-3", correctCount: 1, incorrectCount: 1 },
    { word: "regular-1", correctCount: 3, incorrectCount: 1 },
    { word: "regular-2", reviewCount: 1 }
  ];

  const selected = selectStudyEntries(entries, 5, () => 0.5);
  assert.equal(selected.length, 5);
  assert.equal(new Set(selected.map((entry) => entry.word)).size, 5);
  assert.equal(selected[0].word, "new");
  assert.ok(selected.slice(1, 4).every((entry) => entry.word.startsWith("difficult-")));
});
