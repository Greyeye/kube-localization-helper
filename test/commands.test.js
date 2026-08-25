const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  slugify,
  userWordListPath,
  userLintRulesPath,
  ensureUserFile,
  saveWordToUserList,
} = require('../commands');

test('slugify transforms strings into clean kebab-case slugs', () => {
  assert.equal(slugify('Worker Node'), 'worker-node');
  assert.equal(slugify('PersistentVolumeClaim'), 'persistentvolumeclaim');
  assert.equal(slugify('  kube-apiserver  '), 'kube-apiserver');
  assert.equal(slugify('API Group (v1)'), 'api-group-v1');
  assert.equal(slugify('---'), 'term');
});

test('userWordListPath and userLintRulesPath use .kube-localization-helper folder', () => {
  const koWordPath = userWordListPath('ko');
  const jaRulePath = userLintRulesPath('ja');

  assert.equal(koWordPath, path.join(os.homedir(), '.kube-localization-helper', 'ko', 'user-word-list.json'));
  assert.equal(jaRulePath, path.join(os.homedir(), '.kube-localization-helper', 'ja', 'user-lint-rules.json'));
});

test('ensureUserFile creates parent directories and file with default content', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kube-loc-test-'));
  const testFile = path.join(tempDir, 'nested', 'test.json');

  ensureUserFile(testFile, '[]\n');

  assert.ok(fs.existsSync(testFile));
  assert.equal(fs.readFileSync(testFile, 'utf8'), '[]\n');

  // Second call does not overwrite existing content
  fs.writeFileSync(testFile, '[{"id":"existing"}]', 'utf8');
  ensureUserFile(testFile, '[]\n');
  assert.equal(fs.readFileSync(testFile, 'utf8'), '[{"id":"existing"}]');

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('saveWordToUserList adds a new word and updates existing words by id/english', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kube-loc-test-'));
  const testFile = path.join(tempDir, 'user-word-list.json');

  const word1 = {
    id: 'worker-node',
    english: 'Worker Node',
    translate: true,
    translation: '워커 노드',
  };

  const res1 = saveWordToUserList(testFile, word1);
  assert.equal(res1.isNew, true);
  assert.equal(res1.count, 1);

  const content1 = JSON.parse(fs.readFileSync(testFile, 'utf8'));
  assert.equal(content1.length, 1);
  assert.equal(content1[0].english, 'Worker Node');

  // Update existing word
  const word1Updated = {
    id: 'worker-node',
    english: 'Worker Node',
    translate: true,
    translation: '작업자 노드',
  };
  const res2 = saveWordToUserList(testFile, word1Updated);
  assert.equal(res2.isNew, false);
  assert.equal(res2.count, 1);

  const content2 = JSON.parse(fs.readFileSync(testFile, 'utf8'));
  assert.equal(content2.length, 1);
  assert.equal(content2[0].translation, '작업자 노드');

  // Add second distinct word
  const word2 = {
    id: 'kubelet',
    english: 'kubelet',
    translate: false,
    translation: null,
  };
  const res3 = saveWordToUserList(testFile, word2);
  assert.equal(res3.isNew, true);
  assert.equal(res3.count, 2);

  const content3 = JSON.parse(fs.readFileSync(testFile, 'utf8'));
  assert.equal(content3.length, 2);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
