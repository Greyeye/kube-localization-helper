const vscode = require('vscode');
const { findMatchesInLine } = require('./glossary');
const { detectContentLanguage } = require('./contentLanguage');

const DEBOUNCE_MS = 200;

// Applies a dotted-underline decoration to every glossary match in visible markdown
// editors, refreshed on activation, editor changes, and (debounced) text edits.
// glossariesByLang: Map<lang, {lookupMap, maxPhraseWords}> — the editor's document
// language is resolved from its path (content/<lang>/...); no match means no
// decorations, even if the editor previously had some.
function createDecorationManager(glossariesByLang) {
  const decorationType = vscode.window.createTextEditorDecorationType({
    textDecoration: 'underline dotted',
  });

  function updateDecorations(editor) {
    if (!editor || editor.document.languageId !== 'markdown') return;
    const document = editor.document;

    const lang = detectContentLanguage(document.uri.fsPath);
    const glossary = lang && glossariesByLang.get(lang);
    if (!glossary) {
      editor.setDecorations(decorationType, []);
      return;
    }

    const decorations = [];
    for (let line = 0; line < document.lineCount; line++) {
      const matches = findMatchesInLine(document.lineAt(line).text, glossary.lookupMap, glossary.maxPhraseWords);
      matches.forEach(({ start, end }) => {
        decorations.push(new vscode.Range(line, start, line, end));
      });
    }
    editor.setDecorations(decorationType, decorations);
  }

  const debounceTimers = new Map();
  function scheduleUpdate(editor) {
    if (!editor) return;
    const key = editor.document.uri.toString();
    clearTimeout(debounceTimers.get(key));
    debounceTimers.set(key, setTimeout(() => updateDecorations(editor), DEBOUNCE_MS));
  }

  function activate(context) {
    vscode.window.visibleTextEditors.forEach(updateDecorations);

    context.subscriptions.push(
      decorationType,
      vscode.window.onDidChangeActiveTextEditor(editor => updateDecorations(editor)),
      vscode.window.onDidChangeVisibleTextEditors(editors => editors.forEach(updateDecorations)),
      vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document);
        if (editor) scheduleUpdate(editor);
      })
    );
  }

  return { activate };
}

module.exports = { createDecorationManager };
