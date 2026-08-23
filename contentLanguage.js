// Path-based language detection, shared by the glossary, hover, decorations, and
// linter. No hardcoded language list — kubernetes-website adds content/<lang>/
// folders over time (bn, de, ja, ko, pt-br, zh-cn, ...), so this just extracts
// whatever segment follows "content/". Whether we actually *have* word lists or
// lint rules for that language is a separate check the caller makes against its
// own loaded data.
const fs = require('fs');

function detectContentLanguage(fsPath) {
  const normalized = fsPath.replace(/\\/g, '/');
  const m = /\/content\/([A-Za-z][A-Za-z-]*)\//.exec(normalized);
  return m ? m[1] : null;
}

// The languages we have local data for: the subdirectory names under a base dir
// like words/ or linter/rules/. Used by both loaders (they scan independently,
// since a language can have word lists before it has lint rules, or vice versa).
function discoverLanguages(baseDir) {
  try {
    return fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

module.exports = { detectContentLanguage, discoverLanguages };
