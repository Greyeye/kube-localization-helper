const fs = require('fs');
const path = require('path');
const os = require('os');
const { detectContentLanguage } = require('./contentLanguage');

const USER_DATA_DIR = path.join(os.homedir(), '.kube-localization-helper');

function userWordListPath(lang) {
  return path.join(USER_DATA_DIR, lang, 'user-word-list.json');
}

function userLintRulesPath(lang) {
  return path.join(USER_DATA_DIR, lang, 'user-lint-rules.json');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'term';
}

function ensureUserFile(filePath, defaultContent = '[]\n') {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, defaultContent, 'utf8');
  }
}

function saveWordToUserList(filePath, entry) {
  ensureUserFile(filePath, '[]\n');
  let list = [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];
  } catch {
    list = [];
  }

  const normId = entry.id.toLowerCase();
  const normEnglish = entry.english.toLowerCase();
  const existingIndex = list.findIndex(
    item => (item.id && item.id.toLowerCase() === normId) || (item.english && item.english.toLowerCase() === normEnglish)
  );

  let isNew = true;
  if (existingIndex >= 0) {
    list[existingIndex] = { ...list[existingIndex], ...entry };
    isNew = false;
  } else {
    list.push(entry);
  }

  fs.writeFileSync(filePath, JSON.stringify(list, null, 2) + '\n', 'utf8');
  return { isNew, count: list.length, entry };
}

async function resolveLanguage(vscode, glossariesByLang) {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && activeEditor.document) {
    const detected = detectContentLanguage(activeEditor.document.uri.fsPath);
    if (detected) return detected;
  }

  const knownLangs = Array.from(glossariesByLang.keys());
  if (!knownLangs.includes('ja')) knownLangs.push('ja');
  if (!knownLangs.includes('ko')) knownLangs.push('ko');

  const selected = await vscode.window.showQuickPick(
    [...knownLangs, '$(add) Other language code...'],
    { placeHolder: 'Select target language' }
  );
  if (!selected) return null;

  if (selected.startsWith('$(add)')) {
    const custom = await vscode.window.showInputBox({
      prompt: 'Enter language code (e.g. pt-br, zh-cn, de)',
      validateInput: v =>
        v && /^[a-z]{2,3}(-[a-z0-9]+)?$/i.test(v.trim())
          ? null
          : 'Invalid language code format (e.g. ja, ko, pt-br, zh-cn)'
    });
    return custom ? custom.trim().toLowerCase() : null;
  }
  return selected;
}

function registerCommands(context, vscode, options = {}) {
  const { glossariesByLang, reloadGlossary, refreshDecorations } = options;

  const openWordListDisposable = vscode.commands.registerCommand(
    'kube-localization-helper.openPersonalWordList',
    async () => {
      const lang = await resolveLanguage(vscode, glossariesByLang);
      if (!lang) return;

      const filePath = userWordListPath(lang);
      ensureUserFile(filePath, '[]\n');

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }
  );

  const addWordDisposable = vscode.commands.registerCommand(
    'kube-localization-helper.addPersonalWord',
    async () => {
      const lang = await resolveLanguage(vscode, glossariesByLang);
      if (!lang) return;

      const activeEditor = vscode.window.activeTextEditor;
      let defaultEnglish = '';
      if (activeEditor && !activeEditor.selection.isEmpty) {
        defaultEnglish = activeEditor.document.getText(activeEditor.selection).trim();
      }

      const english = await vscode.window.showInputBox({
        prompt: `[${lang}] English term`,
        value: defaultEnglish,
        placeHolder: 'e.g. Worker Node',
        validateInput: v => (v && v.trim() ? null : 'English term is required')
      });
      if (!english || !english.trim()) return;

      const translation = await vscode.window.showInputBox({
        prompt: `[${lang}] Target translation for "${english.trim()}" (leave empty for "Do Not Translate")`,
        placeHolder: 'e.g. 워커 노드 (leave blank if term remains in English)'
      });
      if (translation === undefined) return;

      const trimmedEnglish = english.trim();
      const trimmedTranslation = translation.trim();

      const entry = {
        id: slugify(trimmedEnglish),
        english: trimmedEnglish,
        translate: trimmedTranslation.length > 0,
        translation: trimmedTranslation.length > 0 ? trimmedTranslation : null,
      };

      const filePath = userWordListPath(lang);
      saveWordToUserList(filePath, entry);

      if (reloadGlossary) {
        reloadGlossary(lang);
      }
      if (refreshDecorations) {
        refreshDecorations();
      }

      const targetMsg = entry.translate ? `"${entry.translation}"` : 'Do Not Translate';
      const action = await vscode.window.showInformationMessage(
        `[${lang}] Saved "${entry.english}" → ${targetMsg} to personal word list.`,
        'Open Word List'
      );
      if (action === 'Open Word List') {
        const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        await vscode.window.showTextDocument(doc);
      }
    }
  );

  const openLintRulesDisposable = vscode.commands.registerCommand(
    'kube-localization-helper.openPersonalLintRules',
    async () => {
      const lang = await resolveLanguage(vscode, glossariesByLang);
      if (!lang) return;

      const filePath = userLintRulesPath(lang);
      ensureUserFile(filePath, '[]\n');

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
      await vscode.window.showTextDocument(doc);
    }
  );

  context.subscriptions.push(openWordListDisposable, addWordDisposable, openLintRulesDisposable);
}

module.exports = {
  USER_DATA_DIR,
  userWordListPath,
  userLintRulesPath,
  slugify,
  ensureUserFile,
  saveWordToUserList,
  registerCommands,
};
