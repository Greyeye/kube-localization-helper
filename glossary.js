const fs = require('fs');
const path = require('path');
const os = require('os');
const { discoverLanguages } = require('./contentLanguage');

const USER_WORD_LIST_DIR = path.join(os.homedir(), '.md-japanese-word-list');

function userWordListPath(lang) {
  return path.join(USER_WORD_LIST_DIR, lang, 'user-word-list.json');
}

// Every target language we have bundled word lists for, e.g. ["ja"] today.
function discoverGlossaryLanguages(extensionPath) {
  return discoverLanguages(path.join(extensionPath, 'words'));
}

function tokenizeLine(lineText) {
  const tokens = [];
  const tokenRe = /[\w-]+/g;
  let m;
  while ((m = tokenRe.exec(lineText))) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

// Reads words/<lang>/*.json plus that language's personal word list (if present)
// into a single lookup map keyed by lowercase english/alias. `onError(message)` is
// called for any file that fails to load, without aborting the rest.
function loadGlossary(extensionPath, lang, onError) {
  const lookupMap = new Map();
  let maxPhraseWords = 1;

  function indexGlossary(glossary) {
    glossary.forEach(entry => {
      const keys = [entry.english, ...(entry.aliases || [])];
      keys.forEach(key => {
        const norm = key.toLowerCase();
        lookupMap.set(norm, entry);
        maxPhraseWords = Math.max(maxPhraseWords, norm.split(/\s+/).length);
      });
    });
  }

  const wordsDir = path.join(extensionPath, 'words', lang);
  try {
    const files = fs.readdirSync(wordsDir).filter(f => f.endsWith('.json'));
    files.forEach(file => {
      const rawData = fs.readFileSync(path.join(wordsDir, file), 'utf8');
      indexGlossary(JSON.parse(rawData));
    });
  } catch (err) {
    onError(`Failed to load glossary from words/${lang}/: ${err.message}`);
  }

  // User overrides are loaded last, so they win on id/english/alias collision.
  const userPath = userWordListPath(lang);
  if (fs.existsSync(userPath)) {
    try {
      const rawData = fs.readFileSync(userPath, 'utf8');
      indexGlossary(JSON.parse(rawData));
    } catch (err) {
      onError(`Failed to load ${userPath}: ${err.message}`);
    }
  }

  return { lookupMap, maxPhraseWords };
}

// Loads every discovered language into a Map<lang, {lookupMap, maxPhraseWords}>.
function loadAllGlossaries(extensionPath, onError) {
  const glossariesByLang = new Map();
  discoverGlossaryLanguages(extensionPath).forEach(lang => {
    glossariesByLang.set(lang, loadGlossary(extensionPath, lang, onError));
  });
  return glossariesByLang;
}

// Longest glossary phrase (up to maxPhraseWords tokens) that covers `character` on the line.
// Returns { entry, start, end } (character offsets), or null.
function findEntryAtLine(lineText, character, lookupMap, maxPhraseWords) {
  const tokens = tokenizeLine(lineText);
  const idx = tokens.findIndex(t => character >= t.start && character <= t.end);
  if (idx === -1) return null;

  for (let w = Math.min(maxPhraseWords, tokens.length); w >= 1; w--) {
    const firstStart = Math.max(0, idx - w + 1);
    for (let s = firstStart; s <= idx && s + w - 1 < tokens.length; s++) {
      const end = s + w - 1;
      if (end < idx) continue;
      const phrase = tokens.slice(s, end + 1).map(t => t.text).join(' ').toLowerCase();
      const entry = lookupMap.get(phrase);
      if (entry) {
        return { entry, start: tokens[s].start, end: tokens[end].end };
      }
    }
  }
  return null;
}

// Every non-overlapping glossary match on a line, preferring the longest phrase at each position.
// Returns Array<{ start, end }> (character offsets).
function findMatchesInLine(lineText, lookupMap, maxPhraseWords) {
  const tokens = tokenizeLine(lineText);
  const ranges = [];
  let i = 0;
  while (i < tokens.length) {
    let matched = false;
    for (let w = Math.min(maxPhraseWords, tokens.length - i); w >= 1; w--) {
      const end = i + w - 1;
      const phrase = tokens.slice(i, end + 1).map(t => t.text).join(' ').toLowerCase();
      if (lookupMap.has(phrase)) {
        ranges.push({ start: tokens[i].start, end: tokens[end].end });
        i = end + 1;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return ranges;
}

module.exports = {
  loadGlossary,
  loadAllGlossaries,
  discoverGlossaryLanguages,
  tokenizeLine,
  findEntryAtLine,
  findMatchesInLine,
};
