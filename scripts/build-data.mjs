import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sourceDir = join(root, "data/sources/kylebing");
const ecdictDir = join(root, "data/sources/ecdict");
const outputDir = join(root, "public/data");
const dictionaryFiles = [
  ["cet4.json", "CET4"],
  ["cet6.json", "CET6"]
];
const sentenceFiles = [
  ["CET4_1.json", "CET4"],
  ["CET4_2.json", "CET4"],
  ["CET4_3.json", "CET4"],
  ["CET6_1.json", "CET6"],
  ["CET6_2.json", "CET6"],
  ["CET6_3.json", "CET6"]
];

function normalize(value) {
  return value.trim().toLowerCase();
}

function clean(value = "") {
  return value.replace(/\\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

function translationText(translations = []) {
  return translationSenses(translations)
    .map(formatSense)
    .filter(Boolean)
    .join("\n");
}

function translationSenses(translations = []) {
  return translations
    .map((item) => ({
      type: clean(item.type || ""),
      translation: clean(item.translation)
    }))
    .filter((item) => item.translation);
}

function formatSense(item) {
  return `${item.type ? `${item.type}. ` : ""}${item.translation}`;
}

function entryFor(words, raw, tag) {
  const key = normalize(raw.word);
  const entry = words.get(key) ?? {
    word: raw.word,
    translation: "",
    phonetic: "",
    senses: [],
    tags: [],
    sentence: null,
    phrases: []
  };
  if (!entry.tags.includes(tag)) entry.tags.push(tag);
  mergeSenses(entry, translationSenses(raw.translations));
  entry.translation = translationText(entry.senses);
  words.set(key, entry);
  return entry;
}

function csvRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\"") {
      if (quoted && text[index + 1] === "\"") {
        field += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((item) => item.length)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function ecdictSenses(translation = "") {
  return clean(translation)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([a-z.&]+)\s+(.+)$/i);
      return match ? { type: match[1].replace(/\.$/, ""), translation: match[2].trim() } : { type: "", translation: line };
    });
}

function shouldIncludeEcdict(row) {
  const [word, , , translation, , collins, oxford, tag, , frq] = row;
  if (!translation || !/^[a-z][a-z'-]*$/i.test(word)) return false;
  if (/\b(cet4|cet6|ky|toefl|ielts|gre|gk|zk)\b/.test(tag)) return true;
  if (Number(collins) > 0 || Number(oxford) > 0) return true;
  return Number(frq) > 0 && Number(frq) <= 30000;
}

function mergeEcdictEntry(words, row) {
  const [word, phonetic, , translation, , , , tag] = row;
  const key = normalize(word);
  const entry = words.get(key) ?? {
    word,
    translation: "",
    phonetic: "",
    senses: [],
    tags: [],
    sentence: null,
    phrases: []
  };
  entry.phonetic ||= clean(phonetic);
  mergeSenses(entry, ecdictSenses(translation));
  entry.translation = translationText(entry.senses);
  const tags = tag
    ? tag.split(/\s+/).filter(Boolean).map((item) => item.toUpperCase())
    : ["ECDICT"];
  tags.forEach((item) => {
    if (!entry.tags.includes(item)) entry.tags.push(item);
  });
  words.set(key, entry);
}

function buildLemmaMap(lemmaText, words) {
  const lemmas = {};
  lemmaText.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith(";") || !line.includes("->")) return;
    const [left, right] = line.split("->");
    const lemma = normalize(left.split("/")[0] || "");
    if (!words.has(lemma)) return;
    right.split(",").forEach((form) => {
      const normalized = normalize(form);
      if (normalized && normalized !== lemma && words.has(lemma)) {
        lemmas[normalized] = lemma;
      }
    });
  });
  return Object.fromEntries(Object.entries(lemmas).sort(([a], [b]) => a.localeCompare(b)));
}

function mergeSenses(entry, senses) {
  const existing = new Set(entry.senses.map((item) => `${item.type}\t${item.translation}`));
  senses.forEach((sense) => {
    const key = `${sense.type}\t${sense.translation}`;
    if (!existing.has(key)) {
      entry.senses.push(sense);
      existing.add(key);
    }
  });
}

const words = new Map();
for (const [file, tag] of dictionaryFiles) {
  const rows = JSON.parse(await readFile(join(sourceDir, file), "utf8"));
  rows.forEach((raw) => entryFor(words, raw, tag));
}

for (const [file, tag] of sentenceFiles) {
  const rows = JSON.parse(await readFile(join(sourceDir, file), "utf8"));
  rows.forEach((raw) => {
    const entry = entryFor(words, raw, tag);
    entry.phonetic ||= clean(raw.us || raw.uk || "");
    if (!entry.sentence && raw.sentences?.length) {
      entry.sentence = {
        en: clean(raw.sentences[0].sentence),
        zh: clean(raw.sentences[0].translation)
      };
    }
    if (!entry.phrases.length && raw.phrases?.length) {
      entry.phrases = raw.phrases.slice(0, 3).map((phrase) => ({
        en: clean(phrase.phrase),
        zh: clean(phrase.translation)
      }));
    }
  });
}

let ecdictAdded = 0;
try {
  const ecdictText = await readFile(join(ecdictDir, "ecdict.csv"), "utf8");
  const rows = csvRows(ecdictText);
  for (const row of rows.slice(1)) {
    if (!shouldIncludeEcdict(row)) continue;
    const before = words.size;
    mergeEcdictEntry(words, row);
    if (words.size > before) ecdictAdded += 1;
  }
} catch (error) {
  console.warn("Skipped ECDICT full CSV; run the downloader step if supplemental coverage is needed.");
}

let lemmas = {};
try {
  lemmas = buildLemmaMap(await readFile(join(ecdictDir, "lemma.en.txt"), "utf8"), words);
} catch (error) {
  console.warn("Skipped ECDICT lemma map; inflected forms will use exact matches only.");
}

const affixesRaw = await readFile(join(root, "data/sources/excing/roots-and-affixes.csv"), "utf8");
const affixes = affixesRaw
  .trim()
  .split(/\r?\n/)
  .map((row) => row.split("|"))
  .filter(([form, description]) => form && description)
  .map(([form, description]) => ({ form, description }));

const sortedWords = Object.fromEntries([...words.entries()].sort(([a], [b]) => a.localeCompare(b)));
const sentenceCount = [...words.values()].filter((entry) => entry.sentence).length;
const output = {
  meta: {
    vocabularySource: "KyleBing/english-vocabulary",
    affixSource: "excing/find-roots-of-word",
    dictionaryReference: "skywind3000/ECDICT",
    wordCount: words.size,
    sentenceCount,
    ecdictAdded,
    lemmaCount: Object.keys(lemmas).length
  },
  words: sortedWords,
  lemmas
};

await mkdir(outputDir, { recursive: true });
await writeFile(join(outputDir, "vocabulary.json"), JSON.stringify(output));
await writeFile(join(outputDir, "root-affixes.json"), JSON.stringify(affixes));

console.log(
  `Built ${words.size} words (${sentenceCount} with example sentences, ${ecdictAdded} from ECDICT), ${Object.keys(lemmas).length} lemma forms, and ${affixes.length} root/affix records from ${sentenceFiles.map(([file]) => basename(file)).join(", ")}.`
);
