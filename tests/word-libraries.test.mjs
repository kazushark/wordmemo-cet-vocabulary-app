import test from "node:test";
import assert from "node:assert/strict";
import {
  entriesInLibrary,
  libraryCounts,
  nextLibraryId,
  normalizeLibraryEntries,
  WORD_LIBRARY_CAPACITY
} from "../src/word-libraries.js";

test("legacy entries are assigned to libraries in 300-word batches", () => {
  const entries = Array.from({ length: WORD_LIBRARY_CAPACITY + 2 }, (_, index) => ({
    word: `word-${index}`,
    addedAt: index + 1
  }));
  const normalized = normalizeLibraryEntries(entries);

  assert.deepEqual(libraryCounts(normalized), [
    { id: 1, count: 300 },
    { id: 2, count: 2 }
  ]);
  assert.equal(normalized[299].libraryId, 1);
  assert.equal(normalized[300].libraryId, 2);
});

test("new entries open another library only after the latest reaches 300 words", () => {
  const firstLibrary = Array.from({ length: 300 }, (_, index) => ({
    word: `word-${index}`,
    libraryId: 1
  }));

  assert.equal(nextLibraryId(firstLibrary.slice(0, 299)), 1);
  assert.equal(nextLibraryId(firstLibrary), 2);
});

test("library assignments remain stable and can be filtered independently", () => {
  const entries = normalizeLibraryEntries([
    { word: "kept", libraryId: 2 },
    { word: "legacy", addedAt: 1 }
  ]);

  assert.equal(entries[0].libraryId, 2);
  assert.deepEqual(entriesInLibrary(entries, "1").map((entry) => entry.word), ["legacy"]);
  assert.deepEqual(entriesInLibrary(entries, "2").map((entry) => entry.word), ["kept"]);
  assert.equal(entriesInLibrary(entries, "all").length, 2);
});

test("favorite words can be selected across all libraries", () => {
  const entries = [
    { word: "favorite-one", libraryId: 1, favorite: true },
    { word: "regular", libraryId: 1, favorite: false },
    { word: "favorite-two", libraryId: 2, favorite: true }
  ];

  assert.deepEqual(
    entriesInLibrary(entries, "favorites").map((entry) => entry.word),
    ["favorite-one", "favorite-two"]
  );
});
