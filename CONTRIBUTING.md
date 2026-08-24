# Contributing to Kubernetes Localization Helper

Thank you for your interest in contributing to **Kubernetes Localization Helper**!

This extension is built to help localization teams (SIG Docs) maintain accurate terminology and consistent style when translating Kubernetes documentation. We welcome contributions for:
- 📖 Adding and refining glossary terms
- 🌐 Adding support for new target languages (`pt-br`, `zh-cn`, `de`, `es`, `bn`, etc.)
- 📏 Adding and refining linter rules (via JSON DSL or custom handlers)
- 🐛 Bug fixes, tests, and documentation improvements

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Adding a New Target Language](#adding-a-new-target-language)
3. [Adding or Editing Glossary Terms](#adding-or-editing-glossary-terms)
4. [Adding Linter Rules (JSON DSL)](#adding-linter-rules-json-dsl)
5. [Adding a New Linter Rule Engine Handler (JavaScript)](#adding-a-new-linter-rule-engine-handler-javascript)
6. [Testing & Verification](#testing--verification)
7. [Submitting a Pull Request](#submitting-a-pull-request)

---

## Architecture Overview

The repository is designed to be lightweight, modular, and testable without heavy dependencies:

```text
kube-localization-helper/
├── contentLanguage.js     # Path-based language detection (e.g. content/<lang>/...)
├── glossary.js            # Glossary loaders, tokenizers, longest-phrase matcher
├── hoverProvider.js       # VS Code Hover provider and markdown formatter
├── decorations.js         # Dotted-underline term highlighter in active editors
├── words.schema.json      # JSON Schema for all words/<lang>/*.json files
├── words/                 # Bundled glossaries by language
│   ├── ja/*.json          # Japanese terminology by category
│   └── ko/*.json          # Korean terminology by category
├── linter/
│   ├── index.js           # VS Code diagnostic adapter & sibling doc finder
│   ├── preprocess.js      # Pure text analysis (front matter, code fences, inline code, table rows)
│   ├── engine.js          # Pure rule execution engine (no VS Code dependency)
│   ├── loadRules.js       # Rule loaders & validation
│   ├── rules.schema.json  # JSON Schema for all linter/rules/<lang>/*.json files
│   └── rules/             # Bundled lint rules by language
│       └── ja/*.json      # Japanese Tier 1 & Tier 2 rules
└── test/                  # Unit tests executed via `node --test`
```

### Key Principles
- **Separation of Core Logic & VS Code API**: Preprocessing, phrase matching, glossary indexing, and rule engines are pure JavaScript functions operating on strings and character offsets. Only `hoverProvider.js`, `decorations.js`, and `linter/index.js` interface with VS Code.
- **Dynamic Language Discovery**: Languages are discovered by directory structure (`words/<lang>/` and `linter/rules/<lang>/`), meaning adding a new folder automatically activates that language.
- **Zero External Runtime Dependencies**: Uses Node.js standard libraries (`fs`, `path`, `os`, `assert`, `test`).

---

## Adding a New Target Language

To add support for a new language (e.g., Brazilian Portuguese `pt-br`, Simplified Chinese `zh-cn`, German `de`, etc.):

### Step 1: Create the Word Directory
Create a directory under `words/` using the language code corresponding to `kubernetes/website`'s `content/<lang>/` folder:

```bash
mkdir -p words/<lang>
```
*(Example: `words/pt-br/`, `words/zh-cn/`, `words/de/`)*

### Step 2: Add Glossary Files
Organize terminology into JSON files under `words/<lang>/`. You can split them by domain or category (e.g., `fundamental.json`, `architecture.json`, `workload.json`):

```json
[
  {
    "id": "pod",
    "glossary_id": "pod",
    "english": "Pod",
    "translate": false,
    "translation": null,
    "definition": {
      "english": "The smallest and simplest Kubernetes object.",
      "translation": "O menor e mais simples objeto do Kubernetes."
    }
  },
  {
    "id": "deployment",
    "glossary_id": "deployment",
    "english": "Deployment",
    "aliases": ["Deployments"],
    "translate": true,
    "translation": "Implantação",
    "definition": {
      "english": "An API object that manages a replicated application.",
      "translation": "Um objeto de API que gerencia uma aplicação replicada."
    }
  }
]
```
Ensure your JSON files conform to [`words.schema.json`](./words.schema.json).

### Step 3: Add the Flag Emoji (Optional)
In `hoverProvider.js`, map your language code to a flag emoji in `FLAG_BY_LANG`:

```javascript
const FLAG_BY_LANG = {
  ja: '🇯🇵',
  ko: '🇰🇷',
  'pt-br': '🇧🇷',
  'zh-cn': '🇨🇳',
};
```
*(If omitted, it automatically falls back to 🌐).*

### Step 4: Add Linter Rules (Optional)
Create `linter/rules/<lang>/` and add language-specific style rules (see [Adding Linter Rules](#adding-linter-rules-json-dsl)).

### Step 5: Add Tests
Add unit tests in `test/glossary.test.js` verifying that your language loads properly:

```javascript
test('loadGlossary indexes every bundled words/pt-br/*.json file with no errors', () => {
  const errors = [];
  const extensionPath = path.join(__dirname, '..');
  const { lookupMap } = loadGlossary(extensionPath, 'pt-br', msg => errors.push(msg));
  assert.deepEqual(errors, []);
  assert.ok(lookupMap.size > 0);
});
```

---

## Adding or Editing Glossary Terms

All glossary JSON files under `words/<lang>/` follow the [`words.schema.json`](./words.schema.json) schema.

### Term Object Schema

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | `string` | **Yes** | Stable slug / unique identifier (e.g., `"persistent-volume-claim"`). |
| `english` | `string` | **Yes** | Canonical English display form (e.g., `"PersistentVolumeClaim"`). |
| `translate` | `boolean` | **Yes** | Default translation directive (`true` to translate, `false` to keep in English). |
| `translation` | `string` \| `null` | No | Target language rendering when `translate: true`. `null` when `translate: false`. |
| `aliases` | `string[]` | No | Plural forms, verb forms, or alternative casing to match in Markdown text (e.g., `["PVC", "PVCs"]`). |
| `glossary_id` | `string` \| `null` | No | Matching `id:` from `content/en/docs/reference/glossary/*.md` front matter. Builds link to `https://kubernetes.io/{lang}/docs/reference/glossary/#term-{glossary_id}`. |
| `definition` | `object` | No | `{ "english": "...", "translation": "..." }` short definitions. |
| `translation_sample` | `string` \| `null` | No | Brief sample usage showing how the term is translated in context. |
| `contextual_rules` | `object[]` | No | Conditional translation rules (see below). Checked in order; first match wins. |
| `notes` | `string` | No | Helpful usage notes or tips shown in the hover. |

### Examples

#### 1. Term Kept in English (Do Not Translate)
```json
{
  "id": "kubelet",
  "glossary_id": "kubelet",
  "english": "kubelet",
  "translate": false,
  "translation": null,
  "definition": {
    "english": "An agent that runs on each node in the cluster.",
    "translation": "クラスター内の各ノードで実行されるエージェント。"
  }
}
```

#### 2. Term with Aliases and Sample
```json
{
  "id": "worker-node",
  "english": "Worker Node",
  "aliases": ["worker nodes", "worker-node", "worker-nodes"],
  "translate": true,
  "translation": "ワーカーノード",
  "translation_sample": "ワーカーノード上でPodを実行する"
}
```

#### 3. Term with Contextual Translation Rules
```json
{
  "id": "deployment",
  "glossary_id": "deployment",
  "english": "Deployment",
  "aliases": ["deployments", "deploy"],
  "translate": true,
  "translation": "デプロイ",
  "contextual_rules": [
    {
      "when": "refers to the Kubernetes Deployment resource (kind: Deployment)",
      "translate": false,
      "translation": "Deployment"
    },
    {
      "when": "used as a generic action/verb to release software",
      "translate": true,
      "translation": "デプロイ"
    }
  ]
}
```

---

## Adding Linter Rules (JSON DSL)

Linter rules live under `linter/rules/<lang>/*.json` and conform to [`linter/rules.schema.json`](./linter/rules.schema.json).

Each rule entry has an `id`, `kind`, `severity`, and bilingual `message`.

### Rule Kinds

#### 1. `regex`
Matches regular expressions. Automatically excludes front matter, code fences, and table rows. Excludes inline code spans by default unless `includeInlineCode: true`.

```json
{
  "id": "ascii-punctuation",
  "kind": "regex",
  "pattern": "(?<=[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}])[,.]|[,.](?=[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}])",
  "flags": "gu",
  "severity": "warning",
  "message": {
    "japanese": "日本語の文章の中では、半角の,や.ではなく全角の「、」「。」を使用してください。",
    "english": "Use full-width 、/。 instead of ,/. next to Japanese text."
  }
}
```

#### 2. `lineMustMatch`
Ensures that any line matching `ifMatches` also matches `mustAlsoMatch`.

```json
{
  "id": "heading-style",
  "kind": "lineMustMatch",
  "ifMatches": "^##\\s+",
  "mustAlsoMatch": "\\{#.*\\}$",
  "severity": "warning",
  "message": {
    "japanese": "見出しには明示的なアンカーが必要です。",
    "english": "Headings must end with an explicit {#anchor}."
  }
}
```

#### 3. `frontmatterKeyForbidden`
Flags any prohibited YAML key in the front matter block (`---\n...\n---`).

```json
{
  "id": "reviewers-frontmatter",
  "kind": "frontmatterKeyForbidden",
  "key": "reviewers",
  "severity": "warning",
  "message": {
    "japanese": "日本語訳を提出する前に、メタデータのreviewers:の項目を削除してください。",
    "english": "Remove the reviewers: field from front matter before submitting."
  }
}
```

#### 4. `codeSpanSpacing`
Ensures spacing around inline backtick code spans against adjacent alphanumeric English text.

```json
{
  "id": "code-span-spacing",
  "kind": "codeSpanSpacing",
  "severity": "warning",
  "beforeMessage": {
    "japanese": "このコードスパンの前に半角スペースを入れてください。",
    "english": "Insert a space before this code span — it's directly against English text."
  },
  "afterMessage": {
    "japanese": "このコードスパンの後に半角スペースを入れてください。",
    "english": "Insert a space after this code span — it's directly against English text."
  }
}
```

#### 5. `prosePairMustEndWith`
Flags consecutive non-empty prose lines where the preceding line does not end in one of `endMarkers` (useful for preventing accidental mid-sentence hard wrapping).

```json
{
  "id": "mid-sentence-linebreak",
  "kind": "prosePairMustEndWith",
  "endMarkers": ["。", "、", ":", "："],
  "severity": "information",
  "message": {
    "japanese": "文の途中で改行されていないか確認してください。",
    "english": "Check for an unintended mid-sentence line break."
  }
}
```

#### 6. `headingAnchorMatchesEnglish`
Compares headings in the translated file with headings in the English sibling (`content/en/...`). Only flags a missing `{#anchor}` if the corresponding upstream English heading actually defines one.

```json
{
  "id": "heading-anchor",
  "kind": "headingAnchorMatchesEnglish",
  "severity": "warning",
  "message": {
    "japanese": "対応する英語ページの見出しにアンカー({#id})が設定されていますが、この見出しには設定されていません。",
    "english": "The corresponding English heading has an explicit {#id} anchor, but this translated heading is missing one."
  }
}
```

---

## Adding a New Linter Rule Engine Handler (JavaScript)

If you need a new type of rule check that cannot be expressed with existing rule kinds:

1. **Add preprocessing helpers** (if needed) in `linter/preprocess.js`.
2. **Implement the handler** in `linter/engine.js`:
   ```javascript
   function customHandler(text, rule, context) {
     const out = [];
     // compute start and end offsets
     out.push(makeDiagnostic(rule, start, end));
     return out;
   }
   ```
3. **Register the handler** in `HANDLERS` map in `linter/engine.js`:
   ```javascript
   const HANDLERS = {
     regex: regexHandler,
     // ...
     custom: customHandler,
   };
   ```
4. **Update validation** in `linter/loadRules.js`:
   - Add required fields to `REQUIRED_FIELDS`.
   - Update `validateRule()` if custom fields need regex or type checks.
5. **Update schema** in `linter/rules.schema.json` to include the new kind and its properties.
6. **Add unit tests** in `test/linter.test.js`.

---

## Testing & Verification

Always run the full test suite before submitting changes:

```bash
npm test
```

### Writing Tests
Add test cases in `test/` using the Node.js built-in test runner (`node:test` and `node:assert/strict`).

Example testing a linter rule:
```javascript
test('my-new-rule flags improper formatting', () => {
  const rule = {
    id: 'my-new-rule',
    kind: 'regex',
    pattern: 'foo_bar',
    message: { japanese: '警告', english: 'Warning' }
  };
  const findings = runRules('This contains foo_bar here.', [rule]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'my-new-rule');
});
```

---

## Submitting a Pull Request

1. Fork the repository and create your feature branch:
   ```bash
   git checkout -b feature/add-portuguese-glossary
   ```
2. Make your changes and verify with `npm test`.
3. Commit with a concise, descriptive commit message:
   ```bash
   git commit -m "feat(glossary): add initial pt-br terminology"
   ```
4. Push to your fork and submit a Pull Request to `main`.
