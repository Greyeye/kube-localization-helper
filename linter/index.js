const vscode = require('vscode');
const fs = require('fs');
const { runRules, extractHeadingAnchorFlags } = require('./engine');
const { loadAllRules } = require('./loadRules');
const { detectContentLanguage } = require('../contentLanguage');

const DEBOUNCE_MS = 350;

const SEVERITY_MAP = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
  hint: vscode.DiagnosticSeverity.Hint,
};

// Every rule message is bilingual ({<target language>, english}); show both.
function formatMessage(message) {
  return `${message.japanese}\n${message.english}`;
}

// The sibling content/en/... file for a content/<lang>/... document, if any.
function findEnglishSiblingPath(fsPath, lang) {
  const normalized = fsPath.replace(/\\/g, '/');
  const marker = `/content/${lang}/`;
  const idx = normalized.indexOf(marker);
  if (idx === -1) return null;
  return normalized.slice(0, idx) + '/content/en/' + normalized.slice(idx + marker.length);
}

// Only the heading-anchor rule needs this; reading a small sibling file per lint
// pass is cheap, so no caching. Missing/unreadable sibling just means "no
// evidence" — the rule doesn't flag anything for that document.
function getEnglishHeadingAnchorFlags(document, lang) {
  const enPath = findEnglishSiblingPath(document.uri.fsPath, lang);
  if (!enPath || !fs.existsSync(enPath)) return [];
  try {
    return extractHeadingAnchorFlags(fs.readFileSync(enPath, 'utf8'));
  } catch {
    return [];
  }
}

function toDiagnostic(document, finding) {
  const range = new vscode.Range(document.positionAt(finding.start), document.positionAt(finding.end));
  const diagnostic = new vscode.Diagnostic(
    range,
    formatMessage(finding.message),
    SEVERITY_MAP[finding.severity] || vscode.DiagnosticSeverity.Warning
  );
  diagnostic.source = 'kube-localization-helper';
  diagnostic.code = finding.ruleId;
  return diagnostic;
}

function createLinter(context) {
  const rulesByLang = loadAllRules(context.extensionPath, message => vscode.window.showErrorMessage(message));
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('kube-localization-helper-lint');

  // These rules encode kubernetes/website-specific per-language translation
  // conventions, not general Markdown style, so only lint files actually under
  // a content/<lang>/ tree for a language we have rules for.
  function resolveLang(document) {
    if (document.languageId !== 'markdown') return null;
    const lang = detectContentLanguage(document.uri.fsPath);
    return lang && rulesByLang.has(lang) ? lang : null;
  }

  function lintDocument(document) {
    const lang = resolveLang(document);
    if (!lang) {
      diagnosticCollection.delete(document.uri);
      return;
    }
    const enHeadingHasAnchor = getEnglishHeadingAnchorFlags(document, lang);
    const findings = runRules(document.getText(), rulesByLang.get(lang), { enHeadingHasAnchor });
    diagnosticCollection.set(document.uri, findings.map(f => toDiagnostic(document, f)));
  }

  const debounceTimers = new Map();
  function scheduleLint(document) {
    const key = document.uri.toString();
    clearTimeout(debounceTimers.get(key));
    debounceTimers.set(key, setTimeout(() => lintDocument(document), DEBOUNCE_MS));
  }

  function activate() {
    vscode.workspace.textDocuments.forEach(lintDocument);

    context.subscriptions.push(
      diagnosticCollection,
      vscode.workspace.onDidOpenTextDocument(lintDocument),
      vscode.workspace.onDidChangeTextDocument(event => scheduleLint(event.document)),
      vscode.workspace.onDidCloseTextDocument(document => diagnosticCollection.delete(document.uri))
    );
  }

  return { activate };
}

module.exports = { createLinter };
