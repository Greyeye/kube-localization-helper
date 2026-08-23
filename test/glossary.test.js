const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadGlossary, loadAllGlossaries, discoverGlossaryLanguages, findEntryAtLine, findMatchesInLine } = require('../glossary');

const lookupMap = new Map([
  ['pod', { english: 'Pod' }],
  ['control plane', { english: 'Control Plane' }],
  ['persistent volume claim', { english: 'Persistent Volume Claim' }],
  ['delete', { english: 'Delete' }],
]);
const maxPhraseWords = 3;

test('findEntryAtLine matches a single-word term', () => {
  const found = findEntryAtLine('The Pod runs here', 5, lookupMap, maxPhraseWords);
  assert.equal(found.entry.english, 'Pod');
});

test('findEntryAtLine matches a multi-word term from either word inside it', () => {
  const line = 'The control plane manages nodes';
  assert.equal(findEntryAtLine(line, 8, lookupMap, maxPhraseWords).entry.english, 'Control Plane'); // cursor in "control"
  assert.equal(findEntryAtLine(line, 16, lookupMap, maxPhraseWords).entry.english, 'Control Plane'); // cursor in "plane"
});

test('findEntryAtLine returns null when cursor is outside any known term', () => {
  const found = findEntryAtLine('The control plane manages nodes', 25, lookupMap, maxPhraseWords); // "manages"
  assert.equal(found, null);
});

test('findEntryAtLine prefers the longest phrase match (3 words)', () => {
  const found = findEntryAtLine('A persistent volume claim binds storage', 5, lookupMap, maxPhraseWords);
  assert.equal(found.entry.english, 'Persistent Volume Claim');
});

test('findEntryAtLine returns null on unrelated text', () => {
  assert.equal(findEntryAtLine('unrelated text with no terms', 5, lookupMap, maxPhraseWords), null);
});

test('findMatchesInLine finds every non-overlapping match, longest phrase first', () => {
  const matches = findMatchesInLine('The Pod runs on a control plane node.', lookupMap, maxPhraseWords);
  const texts = matches.map(m => 'The Pod runs on a control plane node.'.slice(m.start, m.end));
  assert.deepEqual(texts, ['Pod', 'control plane']);
});

test('findMatchesInLine does not split a 3-word phrase into shorter matches', () => {
  const line = 'A persistent volume claim binds storage to a Pod.';
  const matches = findMatchesInLine(line, lookupMap, maxPhraseWords);
  const texts = matches.map(m => line.slice(m.start, m.end));
  assert.deepEqual(texts, ['persistent volume claim', 'Pod']);
});

test('findMatchesInLine returns nothing for a line with no glossary terms', () => {
  assert.deepEqual(findMatchesInLine('unrelated text with no terms', lookupMap, maxPhraseWords), []);
});

test('loadGlossary indexes every bundled words/ja/*.json file with no errors', () => {
  const errors = [];
  const extensionPath = path.join(__dirname, '..');
  const { lookupMap: glossary, maxPhraseWords: maxWords } = loadGlossary(extensionPath, 'ja', msg => errors.push(msg));

  assert.deepEqual(errors, []);
  assert.ok(glossary.size > 0);
  assert.ok(maxWords >= 1);
  assert.equal(glossary.get('pod').translate, false);
  assert.equal(glossary.get('control plane').translation, 'コントロールプレーン');
});

test('loadGlossary indexes every bundled words/ko/*.json file with no errors', () => {
  const errors = [];
  const extensionPath = path.join(__dirname, '..');
  const { lookupMap: glossary, maxPhraseWords: maxWords } = loadGlossary(extensionPath, 'ko', msg => errors.push(msg));

  assert.deepEqual(errors, []);
  assert.ok(glossary.size > 0);
  assert.ok(maxWords >= 1);
  assert.equal(glossary.get('pod').translate, true);
  assert.equal(glossary.get('pod').translation, '파드');
  assert.equal(glossary.get('control plane').translation, '컨트롤 플레인');
});

test('discoverGlossaryLanguages finds every language subfolder under words/', () => {
  const extensionPath = path.join(__dirname, '..');
  const languages = discoverGlossaryLanguages(extensionPath);
  assert.ok(languages.includes('ja'));
  assert.ok(languages.includes('ko'));
});

test('loadAllGlossaries loads every discovered language into a Map', () => {
  const extensionPath = path.join(__dirname, '..');
  const glossariesByLang = loadAllGlossaries(extensionPath, console.error);
  assert.ok(glossariesByLang.has('ja'));
  assert.ok(glossariesByLang.has('ko'));
  assert.ok(glossariesByLang.get('ja').lookupMap.size > 0);
  assert.ok(glossariesByLang.get('ko').lookupMap.size > 0);
  // A language with no words/<lang>/ folder simply isn't in the map.
  assert.equal(glossariesByLang.has('xx-not-real'), false);
});
