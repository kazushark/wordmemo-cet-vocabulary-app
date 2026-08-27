import { answerCard, createSession, reinsert } from "./study-engine.js";
import { applyMemoryEvent, memoryStats } from "./memory-stats.js";
import { entriesInLibrary, libraryCounts, nextLibraryId, normalizeLibraryEntries } from "./word-libraries.js";
import { findClosestWords, normalizeWord } from "./word-match.js";

const STORAGE_KEY = "wordmemo.library.v1";
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ui = {
  lookupForm: $("#lookup-form"),
  lookupWord: $("#lookup-word"),
  dataStatus: $("#data-status"),
  wordCount: $("#word-count"),
  reviewedCount: $("#reviewed-count"),
  recentWords: $("#recent-words"),
  offlineCount: $("#offline-count"),
  editor: $("#editor-dialog"),
  editorForm: $("#editor-form"),
  editorWord: $("#editor-word"),
  editorFavorite: $("#editor-favorite"),
  matchLabel: $("#match-label"),
  matchMessage: $("#match-message"),
  wordSuggestions: $("#word-suggestions"),
  wordSuggestionOptions: $("#word-suggestion-options"),
  sensePicker: $("#sense-picker"),
  senseOptions: $("#sense-options"),
  editorPhonetic: $("#editor-phonetic"),
  editorTranslation: $("#editor-translation"),
  editorExample: $("#editor-example"),
  editorExampleZh: $("#editor-example-zh"),
  rootPreview: $("#root-preview"),
  filterWord: $("#filter-word"),
  libraryList: $("#library-list"),
  studyLibrary: $("#study-library"),
  studyAmount: $("#study-amount"),
  amountLimit: $("#amount-limit"),
  startStudy: $("#start-study"),
  studyView: $("#view-study"),
  studySetup: $("#study-setup"),
  practiceCard: $("#practice-card"),
  promptStage: $("#prompt-stage"),
  answerStage: $("#answer-stage"),
  completion: $("#completion"),
  sessionProgress: $("#session-progress"),
  queueStatus: $("#queue-status"),
  studyWord: $("#study-word"),
  studyFavorite: $("#study-favorite"),
  hintBox: $("#hint-box"),
  hintSentence: $("#hint-sentence"),
  answerStatus: $("#answer-status"),
  answerWord: $("#answer-word"),
  answerTranslation: $("#answer-translation"),
  answerExample: $("#answer-example"),
  answerExampleZh: $("#answer-example-zh"),
  answerRoots: $("#answer-roots"),
  answerCorrectCount: $("#answer-correct-count"),
  answerIncorrectCount: $("#answer-incorrect-count"),
  answerHintCount: $("#answer-hint-count"),
  answerAccuracy: $("#answer-accuracy"),
  markMisremembered: $("#mark-misremembered"),
  completionText: $("#completion-text"),
  toast: $("#toast")
};

let library = loadLibrary();
let dictionary = {};
let lemmaMap = {};
let affixForms = new Set();
let editingWord = "";
let editingReference = null;
let editingReferenceWord = "";
let editingFavorite = false;
let session = null;
let toastTimeout = null;

initialize();

async function initialize() {
  bindEvents();
  saveLibrary();
  renderLibrary();
  updateCounts();
  try {
    const [vocabularyResponse, affixResponse] = await Promise.all([
      fetch("/public/data/vocabulary.json"),
      fetch("/public/data/root-affixes.json")
    ]);
    const vocabulary = await vocabularyResponse.json();
    dictionary = vocabulary.words;
    lemmaMap = vocabulary.lemmas || {};
    affixForms = new Set((await affixResponse.json()).map(({ form }) => form));
    ui.dataStatus.textContent = `离线词库已就绪：${vocabulary.meta.wordCount} 个词条，${vocabulary.meta.sentenceCount} 个带例句，支持 ${vocabulary.meta.lemmaCount || 0} 个词形映射。`;
    ui.offlineCount.textContent = String(vocabulary.meta.wordCount);
  } catch (error) {
    ui.dataStatus.textContent = "离线词库载入失败，仍可手动添加释义和例句。";
  }
}

function bindEvents() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => activateView(button.dataset.view));
  });
  $$("[data-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      ui.lookupWord.value = button.dataset.suggestion;
      lookupWord(button.dataset.suggestion);
    });
  });
  ui.lookupForm.addEventListener("submit", (event) => {
    event.preventDefault();
    lookupWord(ui.lookupWord.value);
  });
  ui.lookupWord.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    lookupWord(ui.lookupWord.value);
  });
  ui.editorForm.addEventListener("submit", saveEditor);
  ui.editorForm.addEventListener("keydown", handleEditorEnter);
  ui.editorFavorite.addEventListener("click", toggleEditorFavorite);
  $("#close-editor").addEventListener("click", () => ui.editor.close());
  ui.filterWord.addEventListener("input", renderLibrary);
  ui.studyLibrary.addEventListener("change", updateStudySelection);
  ui.startStudy.addEventListener("click", startStudy);
  $("#remember-button").addEventListener("click", () => recordAnswer("remember"));
  $("#forget-button").addEventListener("click", () => recordAnswer("forgot"));
  $("#hint-button").addEventListener("click", revealHint);
  ui.studyFavorite.addEventListener("click", toggleStudyFavorite);
  ui.markMisremembered.addEventListener("click", correctRememberedAnswer);
  $("#next-card").addEventListener("click", continueSession);
  $("#study-again").addEventListener("click", resetStudy);
}

function activateView(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  if (name === "library") renderLibrary();
  if (name === "study") updateCounts();
}

function lookupWord(rawWord) {
  const word = normalizeWord(rawWord);
  if (!/^[a-z]+(?:[ '-][a-z]+)*$/.test(word)) {
    showToast("请输入英文单词或英文词组。");
    return;
  }
  openEditor(word);
}

function memorySentence(word) {
  return {
    en: `I marked "${word}" as a new expression to use in my next essay.`,
    zh: `我把“${word}”标记为下一篇作文中要尝试使用的新表达。`
  };
}

function openEditor(word, entryToEdit = null) {
  editingWord = word;
  const resolved = resolveDictionaryWord(word);
  const matched = resolved.entry;
  editingReference = matched;
  editingReferenceWord = resolved.word;
  const existing = entryToEdit || library.find((entry) => entry.word === word);
  editingFavorite = Boolean(existing?.favorite);
  renderFavoriteButton(ui.editorFavorite, editingFavorite, "该单词");
  const sentence = existing
    ? { en: existing.example, zh: existing.exampleTranslation }
    : matched?.sentence || memorySentence(word);
  ui.editorWord.textContent = word;
  ui.editorPhonetic.value = existing?.phonetic || matched?.phonetic || "";
  ui.editorTranslation.value = existing?.translation || matched?.translation || "";
  renderWordSuggestions(word, Boolean(matched) || Boolean(existing));
  renderSenseOptions(matched?.senses || [], existing?.translation || matched?.translation || "");
  ui.editorExample.value = sentence.en;
  ui.editorExampleZh.value = sentence.zh;
  ui.matchLabel.textContent = matched ? "MATCH FOUND" : "NO MATCH";
  ui.matchMessage.textContent = matched
    ? resolved.word === word
      ? "已自动匹配离线词库资料。可勾选多个义项，也可以改写以下所有字段。"
      : `未找到精确词条，已按原形 ${resolved.word} 匹配释义。可确认、改写后入库。`
    : "离线资料未精确匹配到该词。请先查看相近词建议；若都不是，再自行填写释义。";
  const roots = buildRootHint(word);
  ui.rootPreview.textContent = roots ? `构词提示（实验性）：${roots}` : "暂无可用的构词提示。";
  ui.editorForm.querySelector(".primary").textContent = existing ? "保存修改" : "确认加入学习库";
  ui.editor.showModal();
  if (!matched && !existing) ui.editorTranslation.focus();
}

function resolveDictionaryWord(word) {
  if (dictionary[word]) return { word, entry: dictionary[word] };
  const lemma = lemmaMap[word];
  if (lemma && dictionary[lemma]) return { word: lemma, entry: dictionary[lemma] };
  return { word, entry: null };
}

function renderWordSuggestions(word, hasMatch) {
  ui.wordSuggestionOptions.replaceChildren();
  ui.wordSuggestions.classList.add("hidden");
  if (hasMatch) return;

  const suggestions = findClosestWords(word, Object.keys(dictionary));
  if (!suggestions.length) return;

  suggestions.forEach((suggestion) => {
    const button = element("button", "", suggestion);
    button.type = "button";
    button.addEventListener("click", () => openEditor(suggestion));
    ui.wordSuggestionOptions.append(button);
  });
  ui.wordSuggestions.classList.remove("hidden");
}

function renderSenseOptions(senses, currentTranslation) {
  ui.senseOptions.replaceChildren();
  ui.sensePicker.classList.toggle("hidden", senses.length === 0);
  if (!senses.length) return;
  const selectedText = currentTranslation.trim();
  senses.forEach((sense, index) => {
    const line = formatSense(sense);
    const label = element("label", "sense-option");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = line;
    checkbox.checked = selectedText ? selectedText.includes(line) : true;
    checkbox.addEventListener("change", syncSelectedSenses);
    label.append(checkbox, element("span", "", line));
    ui.senseOptions.append(label);
    if (index === senses.length - 1 && !selectedText) syncSelectedSenses();
  });
}

function syncSelectedSenses() {
  const selected = [...ui.senseOptions.querySelectorAll("input:checked")].map((input) => input.value);
  ui.editorTranslation.value = selected.join("\n");
}

function formatSense(sense) {
  return `${sense.type ? `${sense.type}. ` : ""}${sense.translation}`;
}

function saveEditor(event) {
  event.preventDefault();
  commitEditor();
}

function handleEditorEnter(event) {
  if (event.key !== "Enter" || event.isComposing) return;
  const isTextarea = event.target instanceof HTMLTextAreaElement;
  if (isTextarea && !event.metaKey && !event.ctrlKey) return;
  event.preventDefault();
  commitEditor();
}

function commitEditor() {
  const translation = ui.editorTranslation.value.trim();
  if (!translation) {
    ui.editorTranslation.reportValidity();
    return;
  }
  const index = library.findIndex((entry) => entry.word === editingWord);
  const previous = library[index];
  const previousLatestLibrary = libraryCounts(library).at(-1)?.id || 0;
  const assignedLibraryId = previous?.libraryId || nextLibraryId(library);
  const entry = createEntry(editingWord, editingReference, previous, {
    phonetic: ui.editorPhonetic.value.trim(),
    translation,
    example: ui.editorExample.value.trim() || memorySentence(editingWord).en,
    exampleTranslation: ui.editorExampleZh.value.trim() || memorySentence(editingWord).zh,
    baseWord: editingReferenceWord === editingWord ? "" : editingReferenceWord,
    favorite: editingFavorite,
    libraryId: assignedLibraryId
  });
  if (index >= 0) library[index] = entry;
  else library.unshift(entry);
  saveLibrary();
  ui.editor.close();
  clearLookupInput();
  renderLibrary();
  updateCounts();
  const openedNewLibrary = index < 0 && assignedLibraryId > previousLatestLibrary;
  showToast(
    index >= 0
      ? `${editingWord} 已更新。`
      : openedNewLibrary && assignedLibraryId > 1
        ? `${editingWord} 已加入单词库 ${assignedLibraryId}，新词库已自动开启。`
        : `${editingWord} 已加入单词库 ${assignedLibraryId}。`
  );
}

function clearLookupInput() {
  const clear = () => {
    ui.lookupForm.reset();
    ui.lookupWord.value = "";
    ui.lookupWord.dispatchEvent(new Event("input", { bubbles: true }));
    ui.lookupWord.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const refocus = () => ui.lookupWord.focus({ preventScroll: true });
  clear();
  requestAnimationFrame(() => {
    clear();
    refocus();
  });
  setTimeout(() => {
    clear();
    refocus();
  }, 50);
}

function createEntry(word, reference, previous = null, overrides = {}) {
  const fallbackSentence = memorySentence(word);
  const previousStats = memoryStats(previous || {});
  return {
    word,
    phonetic: overrides.phonetic ?? reference?.phonetic ?? "",
    translation: overrides.translation ?? reference?.translation ?? "",
    example: overrides.example ?? reference?.sentence?.en ?? fallbackSentence.en,
    exampleTranslation: overrides.exampleTranslation ?? reference?.sentence?.zh ?? fallbackSentence.zh,
    roots: buildRootHint(word),
    baseWord: overrides.baseWord ?? previous?.baseWord ?? "",
    senses: reference?.senses || [],
    tags: reference?.tags || ["自定义"],
    addedAt: previous?.addedAt || Date.now(),
    reviewCount: previous?.reviewCount || 0,
    wrongCount: previous?.wrongCount || 0,
    correctCount: previousStats.correctCount,
    incorrectCount: previousStats.incorrectCount,
    hintCount: previousStats.hintCount,
    favorite: overrides.favorite ?? previous?.favorite ?? false,
    libraryId: overrides.libraryId ?? previous?.libraryId ?? 1,
    lastReviewed: previous?.lastReviewed || null
  };
}

function buildRootHint(word) {
  if (!affixForms.size || word.includes(" ")) return "";
  const combinations = [];
  for (let start = 0; start < word.length; start += 1) {
    for (let end = start + 2; end <= word.length; end += 1) {
      const root = word.slice(start, end);
      if (!affixForms.has(root)) continue;
      const prefixPaths = affixPaths(word.slice(0, start), "prefix");
      const suffixPaths = affixPaths(word.slice(end), "suffix");
      prefixPaths.forEach((prefixes) => {
        suffixPaths.forEach((suffixes) => {
          const parts = [...prefixes, root, ...suffixes];
          if (parts.length > 1) combinations.push({ parts, rootLength: root.length });
        });
      });
    }
  }
  combinations.sort((left, right) => left.parts.length - right.parts.length || right.rootLength - left.rootLength);
  return combinations[0]?.parts.join(" + ") || "";
}

function affixPaths(text, type) {
  if (!text) return [[]];
  const paths = [];
  for (let end = 1; end <= text.length; end += 1) {
    const fragment = text.slice(0, end);
    const marked = type === "prefix" ? `${fragment}-` : `-${fragment}`;
    if (!affixForms.has(marked)) continue;
    affixPaths(text.slice(end), type).forEach((remainder) => {
      paths.push([marked, ...remainder]);
    });
  }
  return paths;
}

function loadLibrary() {
  try {
    return normalizeLibraryEntries(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
  } catch (error) {
    return [];
  }
}

function saveLibrary() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

function updateCounts() {
  ui.wordCount.textContent = String(library.length);
  ui.reviewedCount.textContent = String(library.filter((entry) => entry.reviewCount > 0).length);
  renderStudyLibraryOptions();
  updateStudySelection();
  renderRecentWords();
}

function renderStudyLibraryOptions() {
  const selected = ui.studyLibrary.value || "all";
  const counts = libraryCounts(library);
  ui.studyLibrary.replaceChildren();
  const allOption = new Option(`全部词库（${library.length} 词）`, "all");
  const favoriteCount = library.filter((entry) => entry.favorite).length;
  const favoriteOption = new Option(`星标单词（${favoriteCount} 词）`, "favorites");
  ui.studyLibrary.append(allOption, favoriteOption);
  counts.forEach(({ id, count }) => {
    ui.studyLibrary.append(new Option(`单词库 ${id}（${count} 词）`, String(id)));
  });
  ui.studyLibrary.value = [...ui.studyLibrary.options].some((option) => option.value === selected)
    ? selected
    : counts.at(-1)?.id
      ? String(counts.at(-1).id)
      : "all";
}

function updateStudySelection() {
  const entries = selectedStudyEntries();
  const limit = Math.max(entries.length, 1);
  ui.studyAmount.max = String(limit);
  ui.studyAmount.value = String(Math.min(Number(ui.studyAmount.value) || 10, limit));
  ui.amountLimit.textContent = `所选范围共 ${entries.length} 词`;
  ui.startStudy.disabled = entries.length === 0;
}

function selectedStudyEntries() {
  return entriesInLibrary(library, ui.studyLibrary.value || "all");
}

function renderRecentWords() {
  ui.recentWords.replaceChildren();
  if (!library.length) {
    ui.recentWords.className = "empty-message";
    ui.recentWords.textContent = "还没有生词，先记下第一个吧。";
    return;
  }
  ui.recentWords.className = "recent-entries";
  library.slice(0, 3).forEach((entry) => {
    const row = element("div", "recent-word");
    const copy = element("div");
    copy.append(element("strong", "", entry.word), element("p", "", shorten(entry.translation, 30)));
    row.append(copy, element("span", "tag", entry.tags[0] || "自定义"));
    ui.recentWords.append(row);
  });
}

function renderLibrary() {
  const filter = normalizeWord(ui.filterWord?.value || "");
  const entries = library.filter((entry) => entry.word.includes(filter));
  ui.libraryList?.replaceChildren();
  if (!entries.length) {
    ui.libraryList?.append(element("p", "empty-message", filter ? "没有匹配的单词。" : "词库还是空的，请先添加生词。"));
    return;
  }
  entries.forEach((entry) => {
    const row = element("article", "word-entry");
    row.append(element("h3", "", entry.word), element("p", "", entry.translation));
    row.append(element("p", "word-memory", memorySummary(entry)));
    const actions = element("div", "word-actions");
    const edit = element("button", "", "编辑");
    edit.type = "button";
    edit.addEventListener("click", () => openEditor(entry.word, entry));
    const remove = element("button", "delete", "删除");
    remove.type = "button";
    remove.addEventListener("click", () => removeEntry(entry.word));
    actions.append(edit, remove);
    row.append(actions);
    ui.libraryList.append(row);
  });
}

function removeEntry(word) {
  library = library.filter((entry) => entry.word !== word);
  saveLibrary();
  renderLibrary();
  updateCounts();
  showToast(`${word} 已从词库移除。`);
}

function startStudy() {
  const entries = selectedStudyEntries();
  const amount = Math.max(1, Math.min(Number(ui.studyAmount.value) || 1, entries.length));
  session = createSession(entries, amount);
  ui.studyView.classList.add("studying");
  ui.studySetup.classList.add("hidden");
  ui.completion.classList.add("hidden");
  ui.practiceCard.classList.remove("hidden");
  showNextPrompt();
}

function showNextPrompt() {
  session.current = session.queue.shift();
  if (!session.current) {
    finishSession();
    return;
  }
  session.phase = "prompt";
  session.hinted = false;
  session.lastAnswer = null;
  session.answerComplete = false;
  session.corrected = false;
  ui.promptStage.classList.remove("hidden");
  ui.answerStage.classList.add("hidden");
  ui.hintBox.classList.add("hidden");
  $("#hint-button").classList.remove("hidden");
  ui.studyWord.textContent = session.current.word;
  updateSessionProgress();
}

function toggleEditorFavorite() {
  editingFavorite = !editingFavorite;
  renderFavoriteButton(ui.editorFavorite, editingFavorite, "该单词");
}

function toggleStudyFavorite() {
  const entry = entryByWord(session?.current?.word);
  if (!entry) return;
  entry.favorite = !entry.favorite;
  saveLibrary();
  renderStudyLibraryOptions();
  renderFavoriteButton(ui.studyFavorite, entry.favorite, "当前单词");
  showToast(entry.favorite ? `${entry.word} 已收藏。` : `${entry.word} 已取消收藏。`);
}

function renderFavoriteButton(button, favorite, target) {
  button.textContent = favorite ? "★" : "☆";
  button.classList.toggle("active", favorite);
  button.setAttribute("aria-pressed", String(favorite));
  button.setAttribute("aria-label", favorite ? `取消收藏${target}` : `收藏${target}`);
  button.title = favorite ? "取消收藏" : "收藏";
}

function revealHint() {
  const entry = entryByWord(session.current.word);
  if (session.hinted) return;
  session.hinted = true;
  Object.assign(entry, applyMemoryEvent(entry, "hint"));
  saveLibrary();
  ui.hintSentence.textContent = entry.example;
  ui.hintBox.classList.remove("hidden");
  $("#hint-button").classList.add("hidden");
}

function recordAnswer(answer) {
  const result = answerCard(session.current, answer);
  const entry = entryByWord(session.current.word);
  session.pendingRequeue = result.requeue;
  session.lastAnswer = answer;
  session.answerComplete = result.complete;
  session.corrected = false;
  Object.assign(entry, applyMemoryEvent(entry, answer, { hinted: session.hinted }));
  if (answer === "forgot") entry.wrongCount = (Number(entry.wrongCount) || 0) + 1;
  if (result.complete) {
    session.completed += 1;
    entry.reviewCount += 1;
    entry.lastReviewed = Date.now();
  }
  saveLibrary();
  ui.promptStage.classList.add("hidden");
  ui.answerStage.classList.remove("hidden");
  ui.answerWord.textContent = entry.word;
  renderFavoriteButton(ui.studyFavorite, Boolean(entry.favorite), "当前单词");
  ui.answerTranslation.textContent = entry.translation;
  ui.answerExample.textContent = entry.example;
  ui.answerExampleZh.textContent = entry.exampleTranslation;
  ui.answerRoots.textContent = entry.roots ? `构词拆解提示：${entry.roots}` : "本词暂无构词拆解提示。";
  ui.markMisremembered.classList.toggle("hidden", answer !== "remember");
  renderAnswerStats(entry);
  if (answer === "forgot") {
    ui.answerStatus.textContent = "稍后重现：需要连续记得 3 次";
  } else if (result.complete && session.current.forgotten) {
    ui.answerStatus.textContent = "已连续记得 3 次，本轮掌握";
  } else if (result.complete) {
    ui.answerStatus.textContent = "记得，本轮不再出现";
  } else {
    ui.answerStatus.textContent = `已记得 ${result.requeue.rememberedStreak} / 3 次，稍后再确认`;
  }
  updateSessionProgress();
  updateCounts();
}

function correctRememberedAnswer() {
  if (session.lastAnswer !== "remember" || session.corrected) return;
  const entry = entryByWord(session.current.word);
  const result = answerCard(session.current, "forgot");

  session.corrected = true;
  session.pendingRequeue = result.requeue;
  Object.assign(entry, applyMemoryEvent(entry, "misremembered", { hinted: session.hinted }));
  entry.wrongCount = (Number(entry.wrongCount) || 0) + 1;

  if (session.answerComplete) {
    session.completed = Math.max(0, session.completed - 1);
    entry.reviewCount = Math.max(0, (Number(entry.reviewCount) || 0) - 1);
  }

  saveLibrary();
  ui.markMisremembered.classList.add("hidden");
  ui.answerStatus.textContent = "已更正为不记得：稍后重现，并需连续记得 3 次";
  renderAnswerStats(entry);
  updateSessionProgress();
  updateCounts();
}

function renderAnswerStats(entry) {
  const stats = memoryStats(entry);
  ui.answerCorrectCount.textContent = String(stats.correctCount);
  ui.answerIncorrectCount.textContent = String(stats.incorrectCount);
  ui.answerHintCount.textContent = String(stats.hintCount);
  ui.answerAccuracy.textContent = stats.accuracy === null ? "暂无" : `${stats.accuracy}%`;
}

function memorySummary(entry) {
  const stats = memoryStats(entry);
  const accuracy = stats.accuracy === null ? "暂无记录" : `${stats.accuracy}%`;
  return `单词库 ${entry.libraryId || 1} · 正确 ${stats.correctCount} · 未记得 ${stats.incorrectCount}（提示 ${stats.hintCount}） · 正确率 ${accuracy}`;
}

function continueSession() {
  if (session.pendingRequeue) {
    session.queue = reinsert(session.queue, session.pendingRequeue);
    session.pendingRequeue = null;
  }
  showNextPrompt();
}

function updateSessionProgress() {
  ui.sessionProgress.textContent = `本轮完成 ${session.completed} / ${session.total}`;
  const pending = session.queue.length + (session.pendingRequeue ? 1 : 0);
  ui.queueStatus.textContent = `待出现 ${pending} 次`;
}

function finishSession() {
  ui.studyView.classList.remove("studying");
  ui.practiceCard.classList.add("hidden");
  ui.completion.classList.remove("hidden");
  ui.completionText.textContent = `已完成 ${session.total} 个单词的回想；忘记过的词也都完成了三次连续确认。`;
  updateCounts();
}

function resetStudy() {
  session = null;
  ui.studyView.classList.remove("studying");
  ui.completion.classList.add("hidden");
  ui.practiceCard.classList.add("hidden");
  ui.studySetup.classList.remove("hidden");
}

function entryByWord(word) {
  return library.find((entry) => entry.word === word);
}

function element(tagName, className = "", text = "") {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function shorten(value, limit) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function showToast(message) {
  clearTimeout(toastTimeout);
  ui.toast.textContent = message;
  ui.toast.classList.remove("hidden");
  toastTimeout = setTimeout(() => ui.toast.classList.add("hidden"), 2600);
}
