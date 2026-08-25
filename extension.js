const vscode = require('vscode');
const { loadAllGlossaries, loadGlossary } = require('./glossary');
const { createHoverProvider } = require('./hoverProvider');
const { createDecorationManager } = require('./decorations');
const { createLinter } = require('./linter');
const { registerCommands } = require('./commands');

function activate(context) {
  const glossariesByLang = loadAllGlossaries(context.extensionPath, message =>
    vscode.window.showErrorMessage(message)
  );

  const decorationManager = createDecorationManager(glossariesByLang);
  decorationManager.activate(context);

  context.subscriptions.push(createHoverProvider(glossariesByLang));
  createLinter(context).activate();

  registerCommands(context, vscode, {
    glossariesByLang,
    reloadGlossary: lang => {
      glossariesByLang.set(
        lang,
        loadGlossary(context.extensionPath, lang, message =>
          vscode.window.showErrorMessage(message)
        )
      );
    },
    refreshDecorations: () => decorationManager.refreshAll(),
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
