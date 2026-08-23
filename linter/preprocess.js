// Pure text analysis shared by every rule. No vscode dependency, so it's
// unit-testable with plain strings the same way glossary.js is.

const JAPANESE_CHAR = '\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}';
const JAPANESE_CHAR_RE = new RegExp(`[${JAPANESE_CHAR}]`, 'u');
const LATIN_ALNUM_RE = /[A-Za-z0-9]/;

function isJapanese(char) {
  return !!char && JAPANESE_CHAR_RE.test(char);
}

// Whether a string contains any Japanese-script character at all (no `g` flag,
// so this is a plain existence check, not a stateful scan).
function hasJapanese(text) {
  return JAPANESE_CHAR_RE.test(text);
}

function isLatinAlnum(char) {
  return !!char && LATIN_ALNUM_RE.test(char);
}

// The front matter block at the very top of the file: `---\n ... \n---`.
function frontMatterRange(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  return m ? [{ start: 0, end: m[0].length }] : [];
}

// Fenced code blocks: ```...``` (any info string), non-greedy, multiline.
// Allows leading indentation on both fence lines, since fences nested inside
// list items are commonly indented.
function codeFenceRanges(text) {
  const ranges = [];
  const re = /^[ \t]*```.*$[\s\S]*?^[ \t]*```[ \t]*$/gm;
  let m;
  while ((m = re.exec(text))) {
    ranges.push({ start: m.index, end: m.index + m[0].length });
    if (re.lastIndex === m.index) re.lastIndex++;
  }
  return ranges;
}

// Inline code spans: `...`, single backtick pairs, not crossing a line, and not
// inside an already-excluded fenced code block.
function inlineCodeRanges(text, codeFences) {
  const ranges = [];
  const re = /`[^`\n]+`/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (!overlapsAny(start, end, codeFences)) {
      ranges.push({ start, end });
    }
  }
  return ranges;
}

function overlapsAny(start, end, ranges) {
  return ranges.some(r => start < r.end && end > r.start);
}

// GFM table rows/separators (leading pipe is optional, e.g. ":---|:---" or
// "英語 | 日本語"). A bare "|" anywhere on a line is a reliable-enough signal
// that it's tabular markup rather than a prose sentence.
function tableRowRanges(text) {
  const ranges = [];
  let offset = 0;
  text.split('\n').forEach(lineText => {
    if (lineText.includes('|')) {
      ranges.push({ start: offset, end: offset + lineText.length });
    }
    offset += lineText.length + 1;
  });
  return ranges;
}

// Computed once per lint pass, reused by every rule.
function computeContext(text) {
  const frontMatter = frontMatterRange(text);
  const codeFences = codeFenceRanges(text);
  const inlineCode = inlineCodeRanges(text, codeFences);
  const tableRows = tableRowRanges(text);
  return { frontMatter, codeFences, inlineCode, tableRows };
}

module.exports = {
  isJapanese,
  hasJapanese,
  isLatinAlnum,
  frontMatterRange,
  codeFenceRanges,
  inlineCodeRanges,
  tableRowRanges,
  overlapsAny,
  computeContext,
};
