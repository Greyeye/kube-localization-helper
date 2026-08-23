const fs = require('fs');
const path = require('path');
const os = require('os');
const { HANDLERS } = require('./engine');
const { discoverLanguages } = require('../contentLanguage');

// Same personal-customization folder as the glossary's user-word-list.json.
const USER_LINT_RULES_DIR = path.join(os.homedir(), '.md-japanese-word-list');

function userLintRulesPath(lang) {
  return path.join(USER_LINT_RULES_DIR, lang, 'user-lint-rules.json');
}

// Every target language we have bundled lint rules for, e.g. ["ja"] today.
function discoverLintLanguages(extensionPath) {
  return discoverLanguages(path.join(extensionPath, 'linter', 'rules'));
}

const REQUIRED_FIELDS = {
  regex: ['pattern', 'message'],
  lineMustMatch: ['ifMatches', 'mustAlsoMatch', 'message'],
  frontmatterKeyForbidden: ['key', 'message'],
  prosePairMustEndWith: ['message'],
  headingAnchorMatchesEnglish: ['message'],
};

// Every diagnostic message is bilingual: { japanese, english }.
function isValidMessage(message) {
  return !!message && typeof message.japanese === 'string' && typeof message.english === 'string';
}

function validateRule(rule) {
  if (!rule || typeof rule !== 'object') return 'rule is not an object';
  if (!rule.id) return 'missing "id"';
  if (!rule.kind || !HANDLERS[rule.kind]) {
    return `unknown kind "${rule.kind}" (expected one of: ${Object.keys(HANDLERS).join(', ')})`;
  }

  if (rule.kind === 'codeSpanSpacing') {
    const hasMessage = isValidMessage(rule.message);
    const hasBeforeAfter = isValidMessage(rule.beforeMessage) && isValidMessage(rule.afterMessage);
    if (!hasMessage && !hasBeforeAfter) {
      return 'codeSpanSpacing rule needs a valid "message", or both "beforeMessage" and "afterMessage" ({japanese, english} objects)';
    }
  } else {
    for (const field of REQUIRED_FIELDS[rule.kind] || []) {
      if (field === 'message') {
        if (!isValidMessage(rule.message)) return 'missing or invalid "message" (expected {japanese, english} strings)';
      } else if (!rule[field]) {
        return `missing "${field}" for kind "${rule.kind}"`;
      }
    }
  }

  if (rule.kind === 'regex') {
    try {
      new RegExp(rule.pattern, rule.flags || 'gu');
    } catch (err) {
      return `invalid pattern: ${err.message}`;
    }
  }
  if (rule.kind === 'lineMustMatch') {
    try {
      new RegExp(rule.ifMatches);
      new RegExp(rule.mustAlsoMatch);
    } catch (err) {
      return `invalid ifMatches/mustAlsoMatch: ${err.message}`;
    }
  }

  return null;
}

// Reads linter/rules/<lang>/*.json plus that language's personal lint rules (if
// present) into a single rule list, keyed by id. Mirrors glossary.js's
// loadGlossary: user rules are loaded last, so they override a built-in rule of
// the same id, and invalid rules are reported via `onError` without aborting
// the rest.
function loadRules(extensionPath, lang, onError) {
  const rulesById = new Map();

  function indexRules(list, sourceLabel) {
    if (!Array.isArray(list)) {
      onError(`Skipping lint rules from ${sourceLabel}: expected a JSON array`);
      return;
    }
    list.forEach(rule => {
      const problem = validateRule(rule);
      if (problem) {
        const label = rule && rule.id ? `"${rule.id}"` : '(unnamed rule)';
        onError(`Skipping lint rule ${label} from ${sourceLabel}: ${problem}`);
        return;
      }
      rulesById.set(rule.id, rule);
    });
  }

  const rulesDir = path.join(extensionPath, 'linter', 'rules', lang);
  try {
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.json'));
    files.forEach(file => {
      const raw = fs.readFileSync(path.join(rulesDir, file), 'utf8');
      indexRules(JSON.parse(raw), file);
    });
  } catch (err) {
    onError(`Failed to load lint rules from linter/rules/${lang}/: ${err.message}`);
  }

  const userPath = userLintRulesPath(lang);
  if (fs.existsSync(userPath)) {
    try {
      const raw = fs.readFileSync(userPath, 'utf8');
      indexRules(JSON.parse(raw), userPath);
    } catch (err) {
      onError(`Failed to load ${userPath}: ${err.message}`);
    }
  }

  return Array.from(rulesById.values());
}

// Loads every discovered language into a Map<lang, rule[]>.
function loadAllRules(extensionPath, onError) {
  const rulesByLang = new Map();
  discoverLintLanguages(extensionPath).forEach(lang => {
    rulesByLang.set(lang, loadRules(extensionPath, lang, onError));
  });
  return rulesByLang;
}

module.exports = { loadRules, loadAllRules, discoverLintLanguages, validateRule };
