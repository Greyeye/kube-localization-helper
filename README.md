# Kubernetes Localization Helper

[English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

A lightweight, zero-dependency VS Code extension designed for translators and maintainers localizing Kubernetes documentation ([kubernetes/website](https://github.com/kubernetes/website)).

It provides **contextual glossary hovers**, **inline term decorations**, and a **style & convention linter** that activates automatically when working inside any `content/<lang>/` documentation tree.

---

## Features

### 1. 🔍 Interactive Glossary Hover Provider
Hover over any technical term or phrase (e.g. `Deployment`, `Control Plane`, `PersistentVolumeClaim`, `Pod`) in a Markdown document to see:
- **Target Translation**: Official term translation or explicit `🚫 Do Not Translate` directive.
- **Contextual Translation Rules**: Different translations depending on whether the term refers to a Kubernetes resource (`kind: Deployment`), an action/verb, or a generic concept.
- **Bilingual Definitions**: Short definitions in English and the target language.
- **Usage Samples**: Example translated phrases or sentences.
- **Direct Glossary Links**: Links to the official Kubernetes documentation glossary.
- **Multi-Word & Alias Matching**: Automatically identifies multi-word phrases (e.g., `persistent volume claim`) and casing/plural variants.

### 2. ✨ Glossary Text Decorations
- Known glossary terms are subtly marked with a dotted underline (`underline dotted`) in active Markdown editors.
- Gives immediate visual cues while reading or drafting translations.
- Refreshed dynamically and debounced (~200ms) on text changes.

### 3. 📏 Style & Quality Linter
Provides real-time diagnostics (squiggly underlines and entries in the VS Code **Problems** panel) aligned with official localization style guides (such as `content/ja/docs/contribute/localization.md`):

- **Mechanical Rules (Tier 1)**:
  - **Punctuation**: Flags ASCII `,` and `.` when used next to CJK characters (prompts for `、` / `。`).
  - **Full-width / Half-width Normalization**: Detects half-width katakana, full-width alphanumeric characters, and non-standard full-width symbols.
  - **Colon Spacing**: Ensures mid-line colons are followed by a space.
  - **Forbidden Metadata**: Flags prohibited front matter fields (e.g. `reviewers:` in Japanese docs).
  - **Link Prefixes**: Flags redundant language prefixes in internal links (e.g. `](/ja/docs/...)` → `](/docs/...)`).
  - **Common Anti-patterns**: Catches specific prohibited phrasing (e.g. `cronのジョブ` → `cronジョブ`).
  - **Heading Anchor Matching**: Cross-references the English sibling document (`content/en/...`) to ensure translated headings retain explicit `{#anchor}` IDs when present upstream.

- **Heuristic & Boundary Rules (Tier 2)**:
  - **Script Spacing**: Flags unnecessary spaces between Latin alphanumeric text and Japanese characters.
  - **Inline Code Boundary Spacing**: Enforces spacing around backtick code spans (no space against CJK, space required against English words).
  - **Parenthesis / Period Order**: Flags `。)` and suggests `)。`.
  - **Mid-sentence Linebreaks**: Flags unpunctuated line breaks in consecutive prose lines to prevent accidental hard wraps.

### 4. 🌐 Multi-Language Architecture
- **Dynamic Path Detection**: Automatically activates based on document path pattern `/content/<lang>/...` (e.g., `ja`, `ko`, `pt-br`, `zh-cn`, `de`, `bn`).
- **Independent Language Modules**: Word lists and linter rules are loaded dynamically from `words/<lang>/` and `linter/rules/<lang>/`.
- **Zero Lock-in**: Out-of-the-box support for Japanese (`ja`) and Korean (`ko`), with simple JSON schema files for adding any other language.

---

## Supported Languages

| Language Code | Language | Glossary Terms | Style Linter |
| :---: | :---: | :---: | :---: |
| `ja` | Japanese (日本語) | ✅ 13 categories (600+ terms) | ✅ Tier 1 + Tier 2 rules |
| `ko` | Korean (한국어) | ✅ 9 categories (500+ terms) | Ready for rule contributions |
| `<lang>` | Any other target | 🔌 Extensible via `words/<lang>/` | 🔌 Extensible via `linter/rules/<lang>/` |

---

## How It Works

1. **Path-Based Language Detection**: When you open a Markdown file under `.../kubernetes-website/content/<lang>/...`, the extension resolves `<lang>`.
2. **Glossary Loading**: The extension indexes all JSON files under `words/<lang>/` into a fast prefix/word lookup map.
3. **Cross-Document Sibling Verification**: For rules like heading anchors (`{#id}`), the linter locates the corresponding `content/en/...` file in the workspace to verify upstream anchors without false alarms on lagged translations.
4. **Pure Engine Architecture**: Core text processing, AST-like boundaries (front matter, code fences, inline code, table rows), and rule evaluation run without VS Code API dependencies, making them fast and fully testable in standard Node.js.

---

## Personal Customization & Overrides

You can define personal glossary overrides and custom linter rules without modifying the extension repository:

- **Personal Glossary**: `~/.md-japanese-word-list/<lang>/user-word-list.json`
- **Personal Linter Rules**: `~/.md-japanese-word-list/<lang>/user-lint-rules.json`

User rules and terms are loaded last and merge by `id`, allowing you to override built-in terms and rules or add your own workspace-specific conventions.

---

## Development & Testing

This project has **zero external npm runtime dependencies** and uses Node.js's built-in test runner.

### Prerequisites
- Node.js >= 18.0.0
- VS Code >= 1.80.0

### Running the Test Suite
```bash
npm test
```

The test suite runs 40+ unit tests covering glossary lookup, phrase tokenization, multi-word matching, preprocessing boundaries, and all linter rule handlers.

### Running the Extension Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/Greyeye/kube-localization-helper.git
   cd kube-localization-helper
   ```
2. Open the folder in VS Code:
   ```bash
   code .
   ```
3. Press `F5` (or select **Run Extension** in the Run & Debug view). A new Extension Development Host window will open.
4. Open a cloned `kubernetes/website` repository in that window and edit any file under `content/ja/` or `content/ko/`.

---

## Contributing

We welcome contributions! Whether you want to add glossary terms, add support for a new language (such as `pt-br`, `zh-cn`, `de`, `es`), or implement new style linter rules, check out our guide:

👉 **[Contribution Guide (CONTRIBUTING.md)](./CONTRIBUTING.md)**

---

## License

This project is licensed under the [MIT License](./LICENSE).
