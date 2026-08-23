const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runRules, extractHeadingAnchorFlags } = require('../linter/engine');
const { computeContext } = require('../linter/preprocess');
const { loadRules, loadAllRules, discoverLintLanguages, validateRule } = require('../linter/loadRules');

function findingsFor(ruleId, text, rules, extra) {
  return runRules(text, rules, extra).filter(f => f.ruleId === ruleId);
}

function ruleSet(...rules) {
  return rules;
}

function bilingual(english, japanese) {
  return { english, japanese: japanese || english };
}

test('ascii-punctuation flags , and . next to Japanese text, ignores plain English/numbers', () => {
  const rule = {
    id: 'ascii-punctuation',
    kind: 'regex',
    pattern:
      '(?<=[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}])[,.]|[,.](?=[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}])',
    flags: 'gu',
    message: bilingual('use full-width punctuation'),
  };
  const rules = ruleSet(rule);

  assert.equal(findingsFor('ascii-punctuation', 'これはテストです.', rules).length, 1);
  assert.equal(findingsFor('ascii-punctuation', 'Kubernetes is great.', rules).length, 0);
  assert.equal(findingsFor('ascii-punctuation', 'バージョンは1.33です', rules).length, 0);
});

test('ascii-punctuation skips matches inside inline code and code fences', () => {
  const rule = {
    id: 'ascii-punctuation',
    kind: 'regex',
    pattern:
      '(?<=[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}])[,.]|[,.](?=[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}])',
    flags: 'gu',
    message: bilingual('use full-width punctuation'),
  };
  const rules = ruleSet(rule);
  const text = 'これは`foo.bar`です。\n\n```\nこれは.テスト\n```\n';
  assert.equal(findingsFor('ascii-punctuation', text, rules).length, 0);
});

test('halfwidth-katakana flags a whole run of half-width katakana as one finding, not one per character', () => {
  const rule = { id: 'halfwidth-katakana', kind: 'regex', pattern: '[\\uFF61-\\uFF9F]+', message: bilingual('use full-width') };
  const rules = ruleSet(rule);
  assert.equal(findingsFor('halfwidth-katakana', 'ﾃｽﾄです', rules).length, 1); // 3 chars, 1 finding
  assert.equal(findingsFor('halfwidth-katakana', 'テストです', rules).length, 0);

  // The exact word that surfaced this bug: 8 half-width katakana chars should
  // be exactly one finding, not one per character.
  const [finding] = findingsFor('halfwidth-katakana', 'ｲﾝｸﾞﾘｯｼｭ', rules);
  assert.equal(finding.end - finding.start, 8);
});

test('fullwidth-alnum flags a whole run of full-width digits/letters as one finding', () => {
  const rule = {
    id: 'fullwidth-alnum',
    kind: 'regex',
    pattern: '[\\uFF10-\\uFF19\\uFF21-\\uFF3A\\uFF41-\\uFF5A]+',
    message: bilingual('use half-width'),
  };
  assert.equal(findingsFor('fullwidth-alnum', 'バージョン1.33です', ruleSet(rule)).length, 0);
  // full-width "133", no interruption -> one contiguous run -> 1 finding.
  assert.equal(findingsFor('fullwidth-alnum', 'バージョン１３３です', ruleSet(rule)).length, 1);
  // full-width "1", full-width period, full-width "33" -> the period isn't part
  // of this rule's character class, so it splits into 2 separate findings.
  assert.equal(findingsFor('fullwidth-alnum', 'バージョン１．３３です', ruleSet(rule)).length, 2);
});

test('fullwidth-punctuation flags adjacent full-width punctuation as one finding', () => {
  const rule = {
    id: 'fullwidth-punctuation',
    kind: 'regex',
    pattern: '[\\uFF08\\uFF09\\uFF0C\\uFF0E\\uFF0F\\uFF1A\\uFF1B\\uFF0D]+',
    message: bilingual('use half-width'),
  };
  const rules = ruleSet(rule);
  assert.equal(findingsFor('fullwidth-punctuation', 'これは（テスト）です', rules).length, 2); // two separate parens, not adjacent
  assert.equal(findingsFor('fullwidth-punctuation', 'これは（）です', rules).length, 1); // adjacent open+close -> one finding
  assert.equal(findingsFor('fullwidth-punctuation', 'これはテストです（正解）', rules).length, 2);
});

test('colon-spacing requires a space after a mid-line colon but allows end-of-line and URLs', () => {
  const rule = {
    id: 'colon-spacing',
    kind: 'regex',
    pattern: ':(?!\\/\\/)(?![ \\t]|$)',
    flags: 'gum',
    message: bilingual('add a space'),
  };
  const rules = ruleSet(rule);
  assert.equal(findingsFor('colon-spacing', '例:これはコロンです', rules).length, 1);
  assert.equal(findingsFor('colon-spacing', '例: これはコロンです', rules).length, 0);
  assert.equal(findingsFor('colon-spacing', '参照はこちら:', rules).length, 0); // end of line
  assert.equal(findingsFor('colon-spacing', 'https://kubernetes.io/ja/docs/', rules).length, 0); // URL
});

test('heading-anchor only flags a ja heading missing {#id} when the matching English heading has one', () => {
  const rule = { id: 'heading-anchor', kind: 'headingAnchorMatchesEnglish', message: bilingual('missing anchor') };
  const rules = ruleSet(rule);

  // English's 1st heading has an anchor, ja's 1st heading is missing it -> flag.
  assert.equal(
    findingsFor('heading-anchor', '## リファレンス', rules, { enHeadingHasAnchor: [true] }).length,
    1
  );
  // ja already has the anchor -> no flag, even though English has one too.
  assert.equal(
    findingsFor('heading-anchor', '## リファレンス {#reference}', rules, { enHeadingHasAnchor: [true] }).length,
    0
  );
  // English's own heading has no anchor -> nothing to require on the ja side.
  assert.equal(
    findingsFor('heading-anchor', '## リファレンス', rules, { enHeadingHasAnchor: [false] }).length,
    0
  );
  // No English sibling info at all (enHeadingHasAnchor omitted) -> no evidence, don't flag.
  assert.equal(findingsFor('heading-anchor', '## リファレンス', rules).length, 0);
  assert.equal(findingsFor('heading-anchor', 'Not a heading line', rules, { enHeadingHasAnchor: [true] }).length, 0);

  // Position-based matching: 2nd ja heading compares against 2nd English heading.
  const twoHeadings = '## 最初 {#first}\n\n## 二番目\n';
  assert.equal(
    findingsFor('heading-anchor', twoHeadings, rules, { enHeadingHasAnchor: [true, true] }).length,
    1
  );

  // A shortcode-driven ja heading manages its own anchor and is never flagged.
  assert.equal(
    findingsFor('heading-anchor', '## {{% heading "whatsnext" %}}', rules, { enHeadingHasAnchor: [true] }).length,
    0
  );
});

test('heading-anchor stays silent for the whole document when heading counts drift from English', () => {
  // Common in this repo: English gained a section the ja translation doesn't have
  // yet, so the ja doc has fewer headings than English. Position-based pairing
  // would compare unrelated headings, so the rule should skip the file entirely
  // rather than risk a wrong (and confusing) flag.
  const rule = { id: 'heading-anchor', kind: 'headingAnchorMatchesEnglish', message: bilingual('missing anchor') };
  const rules = ruleSet(rule);
  const jaWithFewerHeadings = '## 最初\n\n## 二番目\n';
  const enHeadingHasAnchor = [true, true, true]; // English has 3 headings, ja only has 2
  assert.equal(findingsFor('heading-anchor', jaWithFewerHeadings, rules, { enHeadingHasAnchor }).length, 0);
});

test('extractHeadingAnchorFlags reports anchor presence per heading, in order', () => {
  const text = '## Has anchor {#has-anchor}\n\nsome text\n\n## No anchor\n\n## {{% heading "whatsnext" %}}\n';
  assert.deepEqual(extractHeadingAnchorFlags(text), [true, false, true]);
});

test('reviewers-frontmatter flags reviewers: only inside front matter', () => {
  const rule = {
    id: 'reviewers-frontmatter',
    kind: 'frontmatterKeyForbidden',
    key: 'reviewers',
    message: bilingual('remove reviewers'),
  };
  const rules = ruleSet(rule);
  const withReviewers = '---\ntitle: foo\nreviewers:\n- someone\n---\n\nbody text reviewers: not frontmatter\n';
  const findings = findingsFor('reviewers-frontmatter', withReviewers, rules);
  assert.equal(findings.length, 1);

  const withoutReviewers = '---\ntitle: foo\n---\n\nbody\n';
  assert.equal(findingsFor('reviewers-frontmatter', withoutReviewers, rules).length, 0);
});

test('internal-ja-link flags a literal /ja prefix in a relative doc link', () => {
  const rule = { id: 'internal-ja-link', kind: 'regex', pattern: '\\]\\(/ja/[^)]*\\)', message: bilingual('drop /ja') };
  const rules = ruleSet(rule);
  assert.equal(findingsFor('internal-ja-link', '[リンク](/ja/docs/concepts/)', rules).length, 1);
  assert.equal(findingsFor('internal-ja-link', '[リンク](/docs/concepts/)', rules).length, 0);
});

test('cron-no-job flags the cronのジョブ anti-pattern', () => {
  const rule = { id: 'cron-no-job', kind: 'regex', pattern: 'cronのジョブ', message: bilingual('use cronジョブ') };
  const rules = ruleSet(rule);
  assert.equal(findingsFor('cron-no-job', 'これはcronのジョブです', rules).length, 1);
  assert.equal(findingsFor('cron-no-job', 'これはcronジョブです', rules).length, 0);
});

test('latin-japanese-spacing flags a space between Latin/code and Japanese text in either direction', () => {
  const rule = {
    id: 'latin-japanese-spacing',
    kind: 'regex',
    pattern:
      '(?<=[A-Za-z0-9`])[ \\t]+(?=[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}])|(?<=[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}])[ \\t]+(?=[A-Za-z0-9`])',
    flags: 'gu',
    message: bilingual('remove the space'),
  };
  const rules = ruleSet(rule);
  assert.equal(findingsFor('latin-japanese-spacing', 'Kubernetes クラスター', rules).length, 1);
  assert.equal(findingsFor('latin-japanese-spacing', 'Kubernetesクラスター', rules).length, 0);
  assert.equal(findingsFor('latin-japanese-spacing', 'default ServiceAccount', rules).length, 0); // pure Latin-Latin space, not flagged
  assert.equal(findingsFor('latin-japanese-spacing', 'これは`default` ServiceAccountです', rules).length, 0);
});

test('code-span-spacing requires a space between a code span and adjacent Latin text', () => {
  const rule = {
    id: 'code-span-spacing',
    kind: 'codeSpanSpacing',
    beforeMessage: bilingual('add space before'),
    afterMessage: bilingual('add space after'),
  };
  const rules = ruleSet(rule);
  assert.equal(findingsFor('code-span-spacing', 'これは`default`ServiceAccountです', rules).length, 1); // missing space after
  assert.equal(findingsFor('code-span-spacing', 'これは`default` ServiceAccountです', rules).length, 0); // correct
  assert.equal(findingsFor('code-span-spacing', 'これは`default`です', rules).length, 0); // Japanese after, no space needed
  assert.equal(findingsFor('code-span-spacing', 'see`default`', rules).length, 1); // missing space before (Latin before)
});

test('paren-period-order flags 。) and not )。', () => {
  const rule = { id: 'paren-period-order', kind: 'regex', pattern: '。\\)', message: bilingual('swap order') };
  const rules = ruleSet(rule);
  assert.equal(findingsFor('paren-period-order', '(あいうえお。)', rules).length, 1);
  assert.equal(findingsFor('paren-period-order', '(あいうえお)。', rules).length, 0);
});

test('mid-sentence-linebreak flags a prose line not ending in 。/、/: when followed by more prose', () => {
  const rule = {
    id: 'mid-sentence-linebreak',
    kind: 'prosePairMustEndWith',
    endMarkers: ['。', '、', ':', '：'],
    message: bilingual('check line break'),
  };
  const rules = ruleSet(rule);

  const broken = 'これは長い文章で\nとても長く続きます。\n';
  assert.equal(findingsFor('mid-sentence-linebreak', broken, rules).length, 1);

  const fine = 'これは短い文です。\nこれも別の文です。\n';
  assert.equal(findingsFor('mid-sentence-linebreak', fine, rules).length, 0);

  // Some translated pages break lines at 、 rather than 。 — that's fine too.
  const breaksAtTouten = 'これは長い文章ですが、\nここで改行されています。\n';
  assert.equal(findingsFor('mid-sentence-linebreak', breaksAtTouten, rules).length, 0);

  const followedByHeading = 'これは長い文章で\n## 見出し {#id}\n';
  assert.equal(findingsFor('mid-sentence-linebreak', followedByHeading, rules).length, 0);

  // GFM table rows (bare "|", no leading pipe required) aren't prose either.
  const followedByTableRow = 'これは長い文章で\nよくある表記 | あるべき形\n';
  assert.equal(findingsFor('mid-sentence-linebreak', followedByTableRow, rules).length, 0);
});

test('prosePairMustEndWith defaults to accepting 。, 、, :, and ： when endMarkers is omitted', () => {
  const rule = { id: 'mid-sentence-linebreak', kind: 'prosePairMustEndWith', message: bilingual('check') };
  const rules = ruleSet(rule);
  const breaksAtTouten = 'これは長い文章ですが、\nここで改行されています。\n';
  assert.equal(findingsFor('mid-sentence-linebreak', breaksAtTouten, rules).length, 0);
});

test('mid-sentence-linebreak does not fire on lines with no Japanese at all', () => {
  const rule = {
    id: 'mid-sentence-linebreak',
    kind: 'prosePairMustEndWith',
    endMarkers: ['。', '、', ':', '：'],
    message: bilingual('check line break'),
  };
  const rules = ruleSet(rule);

  // Pure English prose, hard-wrapped like normal English — not a JA violation.
  const englishOnly = 'This is a perfectly normal English sentence that\nwraps across two lines like English does.\n';
  assert.equal(findingsFor('mid-sentence-linebreak', englishOnly, rules).length, 0);

  // A Japanese line followed by a pure-English line: the JA line still gets
  // checked (it has Japanese), but the English line itself never gets flagged
  // even though "wraps." ends in an ASCII period, not 。/、/:.
  const mixed = 'これは日本語の文で終わります。\nThis line is pure English and wraps.\nmore English text continues here\n';
  const findings = findingsFor('mid-sentence-linebreak', mixed, rules);
  assert.equal(findings.length, 0);
});

test('colon-spacing ignores table separator rows like ":---|:---"', () => {
  const rule = {
    id: 'colon-spacing',
    kind: 'regex',
    pattern: ':(?!\\/\\/)(?![ \\t]|$)',
    flags: 'gum',
    message: bilingual('add a space'),
  };
  const rules = ruleSet(rule);
  assert.equal(findingsFor('colon-spacing', ':-----------|:-----------', rules).length, 0);
  assert.equal(findingsFor('colon-spacing', '例:これはコロンです', rules).length, 1); // still fires outside tables
});

test('rules never fire inside front matter or fenced code blocks', () => {
  const rule = { id: 'ascii-punctuation-frontmatter', kind: 'regex', pattern: '[,.]', message: bilingual('x') };
  const text = '---\ntitle: a.b,c\n---\n\n```\nfoo.bar,baz\n```\n\nプレーン,テキスト.\n';
  const findings = runRules(text, [rule]);
  // Only the two matches in the plain prose line should survive.
  assert.equal(findings.length, 2);
});

test('computeContext detects fenced code blocks indented inside a list item', () => {
  const text = '1. Do a thing\n   ```\n   translator: >\n     [name](url)\n   ```\n';
  const ctx = computeContext(text);
  assert.equal(ctx.codeFences.length, 1);
  assert.ok(ctx.codeFences[0].end > ctx.codeFences[0].start);
});

test('validateRule rejects rules with unknown kind or missing required fields', () => {
  assert.ok(validateRule({ id: 'x', kind: 'not-a-kind' }));
  assert.ok(validateRule({ id: 'x', kind: 'regex' })); // missing pattern/message
  assert.ok(validateRule({ id: 'x', kind: 'regex', pattern: 'a', message: 'm' })); // message must be {japanese, english}, not a string
  assert.equal(validateRule({ id: 'x', kind: 'regex', pattern: 'a', message: bilingual('m') }), null);
  assert.ok(validateRule({ kind: 'regex', pattern: 'a', message: bilingual('m') })); // missing id
});

test('validateRule rejects a codeSpanSpacing rule with only one of beforeMessage/afterMessage', () => {
  assert.ok(validateRule({ id: 'x', kind: 'codeSpanSpacing', beforeMessage: bilingual('before') }));
  assert.equal(
    validateRule({
      id: 'x',
      kind: 'codeSpanSpacing',
      beforeMessage: bilingual('before'),
      afterMessage: bilingual('after'),
    }),
    null
  );
});

test('loadRules loads every bundled linter/rules/ja/*.json file with no errors', () => {
  const errors = [];
  const extensionPath = path.join(__dirname, '..');
  const rules = loadRules(extensionPath, 'ja', msg => errors.push(msg));

  assert.deepEqual(errors, []);
  assert.ok(rules.length >= 13); // 9 tier1 + 4 tier2
  assert.ok(rules.some(r => r.id === 'ascii-punctuation'));
  assert.ok(rules.some(r => r.id === 'code-span-spacing'));
});

test('discoverLintLanguages finds every language subfolder under linter/rules/', () => {
  const extensionPath = path.join(__dirname, '..');
  assert.ok(discoverLintLanguages(extensionPath).includes('ja'));
});

test('loadAllRules loads every discovered language into a Map', () => {
  const extensionPath = path.join(__dirname, '..');
  const rulesByLang = loadAllRules(extensionPath, console.error);
  assert.ok(rulesByLang.has('ja'));
  assert.ok(rulesByLang.get('ja').length >= 13);
  assert.equal(rulesByLang.has('xx-not-real'), false);
});

test('findings carry the bilingual message through unchanged', () => {
  const rule = {
    id: 'cron-no-job',
    kind: 'regex',
    pattern: 'cronのジョブ',
    message: { japanese: 'cronジョブと訳してください。', english: 'Translate as cronジョブ.' },
  };
  const [finding] = findingsFor('cron-no-job', 'これはcronのジョブです', ruleSet(rule));
  assert.equal(finding.message.japanese, 'cronジョブと訳してください。');
  assert.equal(finding.message.english, 'Translate as cronジョブ.');
});

test('computeContext finds front matter, code fences, and inline code independently', () => {
  const text = '---\ntitle: t\n---\n\nsome `code` here\n\n```\nfenced\n```\n';
  const ctx = computeContext(text);
  assert.equal(ctx.frontMatter.length, 1);
  assert.equal(ctx.codeFences.length, 1);
  assert.equal(ctx.inlineCode.length, 1);
});
