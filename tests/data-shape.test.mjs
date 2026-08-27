import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("generated vocabulary keeps multiple translation senses", async () => {
  const vocabulary = JSON.parse(await readFile(new URL("../public/data/vocabulary.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(vocabulary.words.charge.senses));
  assert.equal(vocabulary.words.charge.senses.length >= 2, true);
  assert.match(vocabulary.words.charge.translation, /v\. 索价；控告/);
  assert.match(vocabulary.words.charge.translation, /n\. 费用/);
});

test("generated vocabulary includes ECDICT supplements and lemma forms", async () => {
  const vocabulary = JSON.parse(await readFile(new URL("../public/data/vocabulary.json", import.meta.url), "utf8"));
  assert.equal(Boolean(vocabulary.words.awakening), true);
  assert.match(vocabulary.words.awakening.translation, /唤醒|觉醒/);
  assert.equal(vocabulary.lemmas.awakened, "awaken");
  assert.equal(Boolean(vocabulary.words.awaken), true);
});
