const vscode = require('vscode');
const { findEntryAtLine } = require('./glossary');
const { detectContentLanguage } = require('./contentLanguage');

// Purely decorative per-language flag for the hover header; falls back to a
// neutral globe for any language without one, rather than special-casing.
const FLAG_BY_LANG = {
  ja: '🇯🇵',
  ko: '🇰🇷',
};

function buildHoverMarkdown(entry, lang) {
  const markdown = new vscode.MarkdownString();
  const flag = FLAG_BY_LANG[lang] || '🌐';

  // 1. Header & Primary Translation
  if (entry.translate && entry.translation) {
    markdown.appendMarkdown(`### ${flag} **${entry.translation}** \`(${entry.english})\`\n\n`);
  } else {
    markdown.appendMarkdown(`### 🚫 **Do Not Translate** \`(${entry.english})\`\n\n`);
  }

  // 2. Definition
  if (entry.definition && entry.definition.english) {
    markdown.appendMarkdown(`**Definition:** ${entry.definition.english}\n\n`);
    if (entry.definition.translation) {
      markdown.appendMarkdown(`**Definition (translated):** ${entry.definition.translation}\n\n`);
    }
  }

  // 3. Translation Sample
  if (entry.translation_sample) {
    markdown.appendMarkdown(`**Sample:** \`${entry.translation_sample}\`\n\n`);
  }

  // 4. Contextual Rules
  if (entry.contextual_rules && entry.contextual_rules.length > 0) {
    markdown.appendMarkdown(`**Contextual Rules:**\n`);
    entry.contextual_rules.forEach(rule => {
      const action = rule.translate ? `➡️ **${rule.translation}**` : `➡️ Keep as **${entry.english}**`;
      markdown.appendMarkdown(`- ${action} *(${rule.when})*\n`);
    });
    markdown.appendMarkdown(`\n`);
  }

  // 5. Notes
  if (entry.notes) {
    markdown.appendMarkdown(`> 💡 **Note:** ${entry.notes}\n`);
  }

  return markdown;
}

// glossariesByLang: Map<lang, {lookupMap, maxPhraseWords}>. The document's
// language is resolved from its path (content/<lang>/...) — a doc outside any
// content/<lang>/ tree, or one whose language has no loaded glossary, gets no
// hover at all.
function createHoverProvider(glossariesByLang) {
  return vscode.languages.registerHoverProvider('markdown', {
    provideHover(document, position) {
      const lang = detectContentLanguage(document.uri.fsPath);
      const glossary = lang && glossariesByLang.get(lang);
      if (!glossary) return;

      const lineText = document.lineAt(position.line).text;
      const found = findEntryAtLine(lineText, position.character, glossary.lookupMap, glossary.maxPhraseWords);
      if (!found) return;

      const { entry, start, end } = found;
      const range = new vscode.Range(position.line, start, position.line, end);
      return new vscode.Hover(buildHoverMarkdown(entry, lang), range);
    }
  });
}

module.exports = { createHoverProvider };
