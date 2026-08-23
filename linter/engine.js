// The rule DSL's execution engine. Every handler is a pure function
// (text, rule, context) => Array<{ruleId, message, severity, start, end}>,
// operating on absolute character offsets into the full document text.
// No vscode dependency — unit-testable with plain strings.

const { isJapanese, hasJapanese, isLatinAlnum, overlapsAny, computeContext } = require('./preprocess');

function makeDiagnostic(rule, start, end, messageOverride) {
  return {
    ruleId: rule.id,
    message: messageOverride || rule.message,
    severity: rule.severity || 'warning',
    start,
    end,
  };
}

function forEachLine(text, cb) {
  let offset = 0;
  const lines = text.split('\n');
  lines.forEach((lineText, index) => {
    cb(lineText, offset, offset + lineText.length, index);
    offset += lineText.length + 1;
  });
}

// kind: "regex" — flag every match of `pattern`. Always skips front matter and
// fenced code blocks; skips inline code spans too unless `includeInlineCode: true`.
function regexHandler(text, rule, context) {
  const baseFlags = rule.flags || 'gu';
  const flags = baseFlags.includes('g') ? baseFlags : baseFlags + 'g';
  const re = new RegExp(rule.pattern, flags);
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    const start = m.index;
    const end = m.index + m[0].length;
    const excluded =
      overlapsAny(start, end, context.frontMatter) ||
      overlapsAny(start, end, context.codeFences) ||
      overlapsAny(start, end, context.tableRows) ||
      (rule.includeInlineCode !== true && overlapsAny(start, end, context.inlineCode));
    if (excluded) continue;
    out.push(makeDiagnostic(rule, start, end));
  }
  return out;
}

// kind: "lineMustMatch" — any line matching `ifMatches` must also match
// `mustAlsoMatch` in full, else it's flagged. E.g. "## heading" lines must end
// in "{#anchor}".
function lineMustMatchHandler(text, rule, context) {
  const ifRe = new RegExp(rule.ifMatches);
  const mustRe = new RegExp(rule.mustAlsoMatch);
  const out = [];
  forEachLine(text, (lineText, start, end) => {
    if (!lineText.trim()) return;
    if (
      overlapsAny(start, end, context.frontMatter) ||
      overlapsAny(start, end, context.codeFences) ||
      overlapsAny(start, end, context.tableRows)
    ) {
      return;
    }
    if (ifRe.test(lineText) && !mustRe.test(lineText)) {
      out.push(makeDiagnostic(rule, start, end));
    }
  });
  return out;
}

const HEADING_LINE_RE = /^#{2,6}\s/;
const HEADING_HAS_ANCHOR_RE = /\{#[\w-]+\}\s*$|\{\{[%<]/;

// Pure: the anchor-presence (or "manages its own anchor via shortcode") flag for
// every ##-###### heading in a document, in order. Used to compare a ja document
// against its English counterpart — the English side's headings are extracted
// with the same function, since the rule only cares whether *that* heading had
// an explicit anchor to translate.
function extractHeadingAnchorFlags(text) {
  const flags = [];
  forEachLine(text, lineText => {
    if (HEADING_LINE_RE.test(lineText)) {
      flags.push(HEADING_HAS_ANCHOR_RE.test(lineText));
    }
  });
  return flags;
}

// kind: "headingAnchorMatchesEnglish" — a ja heading is only flagged if the
// corresponding English heading (matched by position: 1st heading vs. 1st
// heading, 2nd vs. 2nd, etc., via context.enHeadingHasAnchor) actually has an
// explicit {#id} anchor. Not every English heading has one, so requiring it
// unconditionally on the ja side would be wrong — this only flags a *real*
// omission.
//
// Position-based matching only makes sense when both documents have the same
// number of headings — real translations in this repo frequently lag the
// English source (whole sections added upstream and not yet translated), and
// comparing by raw index in that case pairs up unrelated headings. So if the
// counts don't match, this rule stays silent for the *entire* document rather
// than risk a wrong pairing; a partial translation isn't the moment to nitpick
// anchor completeness anyway. Likewise, if there's no English sibling at all,
// context.enHeadingHasAnchor is empty and nothing is flagged (no evidence, no
// warning).
function headingAnchorMatchesEnglishHandler(text, rule, context) {
  const out = [];
  const enHasAnchor = context.enHeadingHasAnchor || [];
  if (enHasAnchor.length === 0) return out;

  const jaHeadingCount = countHeadings(text);
  if (jaHeadingCount !== enHasAnchor.length) return out;

  let index = 0;
  forEachLine(text, (lineText, start, end) => {
    if (!HEADING_LINE_RE.test(lineText)) return;
    if (enHasAnchor[index] === true && !HEADING_HAS_ANCHOR_RE.test(lineText)) {
      out.push(makeDiagnostic(rule, start, end));
    }
    index++;
  });
  return out;
}

function countHeadings(text) {
  let count = 0;
  forEachLine(text, lineText => {
    if (HEADING_LINE_RE.test(lineText)) count++;
  });
  return count;
}

// kind: "frontmatterKeyForbidden" — flags `key: ...` if present in front matter.
function frontmatterKeyForbiddenHandler(text, rule, context) {
  const out = [];
  const fm = context.frontMatter[0];
  if (!fm) return out;
  const block = text.slice(fm.start, fm.end);
  const re = new RegExp(`^${rule.key}:.*$`, 'm');
  const m = re.exec(block);
  if (m) {
    const start = fm.start + m.index;
    out.push(makeDiagnostic(rule, start, start + m[0].length));
  }
  return out;
}

// kind: "codeSpanSpacing" — a Latin/digit character fused directly against a
// code span's outer boundary (either side) needs a space, matching normal
// English word spacing. The opposite convention (no space against Japanese)
// is covered by the "regex" no-space-latin-japanese rule instead, since that
// one already treats backticks as a Latin-like boundary character.
function codeSpanSpacingHandler(text, rule, context) {
  const out = [];
  context.inlineCode.forEach(span => {
    const before = text[span.start - 1];
    const after = text[span.end];
    if (isLatinAlnum(before)) {
      out.push(makeDiagnostic(rule, span.start - 1, span.start, rule.beforeMessage || rule.message));
    }
    if (isLatinAlnum(after)) {
      out.push(makeDiagnostic(rule, span.end, span.end + 1, rule.afterMessage || rule.message));
    }
  });
  return out;
}

const SKIP_LINE_RE = /^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>)/;

// Table rows are excluded separately via context.tableRows (a bare "|" anywhere
// on the line), since that's shared with every other rule kind too.
function isProseLine(lineText) {
  return lineText.trim() !== '' && !SKIP_LINE_RE.test(lineText);
}

// kind: "prosePairMustEndWith" — heuristic: a prose line immediately followed
// by another prose line (no blank line between) should end in one of
// `endMarkers`, otherwise it looks like a hard-wrapped mid-sentence line break.
// Only applies to lines that contain Japanese text at all — see hasJapanese
// below.
function prosePairMustEndWithHandler(text, rule, context) {
  const out = [];
  const endMarkers = rule.endMarkers || ['。', '、', ':', '：'];
  const lines = [];
  forEachLine(text, (lineText, start, end) => lines.push({ lineText, start, end }));

  for (let i = 0; i < lines.length - 1; i++) {
    const current = lines[i];
    const next = lines[i + 1];
    if (
      overlapsAny(current.start, current.end, context.frontMatter) ||
      overlapsAny(current.start, current.end, context.codeFences) ||
      overlapsAny(current.start, current.end, context.tableRows) ||
      overlapsAny(next.start, next.end, context.tableRows)
    ) {
      continue;
    }
    if (!isProseLine(current.lineText) || !isProseLine(next.lineText)) continue;

    // The "don't hard-wrap mid-sentence" convention is specific to Japanese
    // prose. A line with no Japanese at all — an English aside, a quoted
    // string, a term left untranslated — isn't subject to it.
    if (!hasJapanese(current.lineText)) continue;

    const trimmed = current.lineText.replace(/\s+$/, '');
    if (!trimmed) continue;
    const lastChar = trimmed[trimmed.length - 1];
    if (!endMarkers.includes(lastChar)) {
      const flagStart = current.start + trimmed.length - 1;
      out.push(makeDiagnostic(rule, flagStart, flagStart + 1));
    }
  }
  return out;
}

const HANDLERS = {
  regex: regexHandler,
  lineMustMatch: lineMustMatchHandler,
  frontmatterKeyForbidden: frontmatterKeyForbiddenHandler,
  codeSpanSpacing: codeSpanSpacingHandler,
  prosePairMustEndWith: prosePairMustEndWithHandler,
  headingAnchorMatchesEnglish: headingAnchorMatchesEnglishHandler,
};

// Rules with an unknown `kind` are silently skipped here — loadRules.js is
// responsible for validating and reporting those before they reach this point.
// `extra` carries cross-file context a handler might need (currently just
// enHeadingHasAnchor, supplied by the vscode adapter since only it touches the
// filesystem) merged on top of the plain single-document context.
function runRules(text, rules, extra) {
  const context = Object.assign(computeContext(text), extra);
  const diagnostics = [];
  for (const rule of rules) {
    const handler = HANDLERS[rule.kind];
    if (!handler) continue;
    diagnostics.push(...handler(text, rule, context));
  }
  return diagnostics;
}

module.exports = { runRules, isJapanese, extractHeadingAnchorFlags, HANDLERS };
