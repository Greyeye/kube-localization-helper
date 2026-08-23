const vscode = require('vscode');
const { loadAllGlossaries } = require('./glossary');
const { createHoverProvider } = require('./hoverProvider');
const { createDecorationManager } = require('./decorations');
const { createLinter } = require('./linter');

function activate(context) {
  const glossariesByLang = loadAllGlossaries(context.extensionPath, message =>
    vscode.window.showErrorMessage(message)
  );

  context.subscriptions.push(createHoverProvider(glossariesByLang));
  createDecorationManager(glossariesByLang).activate(context);
  createLinter(context).activate();
}

function deactivate() {}

module.exports = { activate, deactivate };
