import test from "node:test";
import assert from "node:assert/strict";
import { editDistance, findClosestWords, normalizeWord } from "../src/word-match.js";

test("normalizes user input", () => {
  assert.equal(normalizeWord("  AbSuRd  "), "absurd");
});

test("calculates edit distance", () => {
  assert.equal(editDistance("absurb", "absurd"), 1);
  assert.equal(editDistance("charge", "change"), 1);
});

test("suggests the closest vocabulary word for a misspelling", () => {
  const suggestions = findClosestWords("absurb", ["abrupt", "absorb", "absurd", "abuse", "charge"]);
  assert.equal(suggestions[0], "absurd");
});
