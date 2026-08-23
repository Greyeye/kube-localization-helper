const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { detectContentLanguage, discoverLanguages } = require('../contentLanguage');

test('detectContentLanguage extracts the language segment from a content/<lang>/ path', () => {
  assert.equal(detectContentLanguage('/repo/kubernetes-website/content/ja/docs/foo.md'), 'ja');
  assert.equal(detectContentLanguage('/repo/kubernetes-website/content/ko/docs/foo.md'), 'ko');
});

test('detectContentLanguage handles hyphenated language codes', () => {
  assert.equal(detectContentLanguage('/repo/kubernetes-website/content/pt-br/docs/foo.md'), 'pt-br');
  assert.equal(detectContentLanguage('/repo/kubernetes-website/content/zh-cn/docs/foo.md'), 'zh-cn');
});

test('detectContentLanguage normalizes Windows-style backslash paths', () => {
  assert.equal(detectContentLanguage('C:\\repo\\kubernetes-website\\content\\ja\\docs\\foo.md'), 'ja');
});

test('detectContentLanguage returns null for paths with no content/<lang>/ segment', () => {
  assert.equal(detectContentLanguage('/repo/md-japanese-hover/README.md'), null);
  assert.equal(detectContentLanguage('/repo/kubernetes-website/content/foo.md'), null);
});

test('discoverLanguages lists every language subfolder under words/', () => {
  const wordsDir = path.join(__dirname, '..', 'words');
  const languages = discoverLanguages(wordsDir);
  assert.ok(languages.includes('ja'));
});

test('discoverLanguages returns an empty array for a missing directory', () => {
  assert.deepEqual(discoverLanguages('/definitely/not/a/real/path'), []);
});
