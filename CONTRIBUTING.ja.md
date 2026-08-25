# Kubernetes Localization Helper コントリビューションガイド

[English](CONTRIBUTING.md) | [日本語](CONTRIBUTING.ja.md) | [한국어](CONTRIBUTING.ko.md)

**Kubernetes Localization Helper** への貢献にご興味をお持ちいただきありがとうございます！

本拡張機能は、Kubernetes 公式ドキュメント（SIG Docs）の翻訳者が正確な用語を使用し、一貫したスタイルでドキュメントを作成できるように支援するために開発されています。以下のようなコントリビューションを大歓迎します:
- 📖 用語集（Glossary）の追加・修正
- 🌐 新しい対象言語の追加（`pt-br`, `zh-cn`, `de`, `es`, `bn` など）
- 📏 リンタールールの追加・改善（JSON DSL またはカスタムハンドラー）
- 🐛 バグ修正、テストの追加、ドキュメントの改善

---

## 目次

1. [アーキテクチャの概要](#アーキテクチャの概要)
2. [新しい言語の追加方法](#新しい言語の追加方法)
3. [用語の追加・編集方法](#用語の追加編集方法)
4. [リンタールールの追加方法 (JSON DSL)](#リンタールールの追加方法-json-dsl)
5. [新しいリンターハンドラーの実装 (JavaScript)](#新しいリンターハンドラーの実装-javascript)
6. [テストと検証](#テストと検証)
7. [プルリクエストの提出方法](#プルリクエストの提出方法)

---

## アーキテクチャの概要

本リポジトリは、外部依存パッケージを一切持たず、モジュール化され単体テストが容易な構造になっています:

```text
kube-localization-helper/
├── contentLanguage.js     # パスに基づく言語検出 (例: content/<lang>/...)
├── glossary.js            # 用語集ローダー、トークナイザー、最長フレーズマッチ
├── hoverProvider.js       # VS Code ホバープロバイダーおよびマークダウン整形
├── decorations.js         # エディタ上の用語下線ハイライト装飾
├── words.schema.json      # words/<lang>/*.json 用 JSON スキーマ
├── words/                 # 言語別用語集データ
│   ├── ja/*.json          # カテゴリ別日本語用語データ
│   └── ko/*.json          # カテゴリ別韓国語用語データ
├── linter/
│   ├── index.js           # VS Code 診断アダプターおよび原本ドキュメント検索
│   ├── preprocess.js      # 純粋テキスト解析（フロントマター、コードブロック、インラインコード、テーブル行）
│   ├── engine.js          # 純粋ルール実行エンジン（VS Code 依存なし）
│   ├── loadRules.js       # ルールローダーおよびバリデーション
│   ├── rules.schema.json  # linter/rules/<lang>/*.json 用 JSON スキーマ
│   └── rules/             # 言語別リンタールール
│       └── ja/*.json      # 日本語 Tier 1 & Tier 2 ルール
└── test/                  # `node --test` で実行される単体テスト
```

### 設計方針
- **コアロジックと VS Code API の分離**: 前処理、フレーズマッチング、用語インデックス、ルールエンジンは、文字列と文字オフセットを操作する純粋な JavaScript 関数として実装されています。VS Code API と通信するのは `hoverProvider.js`, `decorations.js`, `linter/index.js` のみです。
- **動的な言語検出**: ディレクトリ構造（`words/<lang>/` および `linter/rules/<lang>/`）から言語を自動検出するため、新しいフォルダを作成するだけで自動的に有効化されます。
- **外部依存ゼロ**: Node.js 標準ライブラリ（`fs`, `path`, `os`, `assert`, `test`）のみを使用しています。

---

## 新しい言語の追加方法

新しい言語（例: ブラジルポルトガル語 `pt-br`、簡体字中国語 `zh-cn`、ドイツ語 `de` など）を追加する手順は以下の通りです:

### ステップ 1: 用語ディレクトリの作成
`kubernetes/website` の `content/<lang>/` フォルダ名と一致する言語コードでディレクトリを作成します:

```bash
mkdir -p words/<lang>
```
*(例: `words/pt-br/`, `words/zh-cn/`, `words/de/`)*

### ステップ 2: 用語集 JSON ファイルの追加
`words/<lang>/` 配下にカテゴリ別の JSON ファイルを作成します（例: `fundamental.json`, `architecture.json`, `workload.json`）:

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
JSON ファイルは必ず [`words.schema.json`](./words.schema.json) に準拠させてください。

### ステップ 3: 国旗絵文字の登録 (任意)
`hoverProvider.js` の `FLAG_BY_LANG` に言語コードと国旗絵文字を追加します:

```javascript
const FLAG_BY_LANG = {
  ja: '🇯🇵',
  ko: '🇰🇷',
  'pt-br': '🇧🇷',
  'zh-cn': '🇨🇳',
};
```
*(未設定の場合は自動的に 🌐 が表示されます)*

### ステップ 4: リンタールールの追加 (任意)
`linter/rules/<lang>/` を作成し、言語固有のスタイルルールを追加します（詳細は [リンタールールの追加方法](#リンタールールの追加方法-json-dsl) を参照）。

### ステップ 5: 単体テストの追加
`test/glossary.test.js` に新しい言語が正常に読み込めることを確認するテストを追加します:

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

## 用語の追加・編集方法

`words/<lang>/` 配下のすべての用語ファイルは [`words.schema.json`](./words.schema.json) スキーマに準拠します。

### 用語オブジェクトのプロパティ

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | `string` | **必須** | 一意の識別子・スラッグ（例: `"persistent-volume-claim"`）。 |
| `english` | `string` | **必須** | 正式な英語表記（例: `"PersistentVolumeClaim"`）。 |
| `translate` | `boolean` | **必須** | デフォルトの翻訳指示（翻訳する場合は `true`、英語のまま残す場合は `false`）。 |
| `translation` | `string` \| `null` | 任意 | `translate: true` の場合の訳語。`translate: false` の場合は `null`。 |
| `aliases` | `string[]` | 任意 | 本文中で一致させる別表記・複数形・大文字小文字のバリエーション（例: `["PVC", "PVCs"]`）。 |
| `glossary_id` | `string` \| `null` | 任意 | `content/en/docs/reference/glossary/*.md` の `id:` と一致するID。公式用語集へのリンクを生成します。 |
| `definition` | `object` | 任意 | `{ "english": "...", "translation": "..." }` 形式の簡潔な定義。 |
| `translation_sample` | `string` \| `null` | 任意 | 実際の文脈での翻訳例。 |
| `contextual_rules` | `object[]` | 任意 | 文脈別の条件分岐ルール（後述）。上から順に評価され最初に一致したものが適用されます。 |
| `notes` | `string` | 任意 | ホバーに表示される補足情報やヒント。 |

### 用語の定義例

#### 1. 翻訳しない用語 (Do Not Translate)
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

#### 2. 別名・用例付きの用語
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

#### 3. 文脈別ルールを持つ用語
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
      "when": "Kubernetesリソース（kind: Deployment）を指す場合",
      "translate": false,
      "translation": "Deployment"
    },
    {
      "when": "ソフトウェアをリリースする一般的な動作・動詞として使われる場合",
      "translate": true,
      "translation": "デプロイ"
    }
  ]
}
```

---

## リンタールールの追加方法 (JSON DSL)

リンタールールは `linter/rules/<lang>/*.json` に配置し、[`linter/rules.schema.json`](./linter/rules.schema.json) に準拠します。

各ルールは `id`, `kind`, `severity`, および日英対訳の `message` を持ちます。

### ルールの種類 (kind)

#### 1. `regex`
正規表現でパターンに一致する箇所を検出します。フロントマター、コードブロック、テーブル行は自動的に除外されます。インラインコード（`...`）内はデフォルトで除外されます（`includeInlineCode: true` で対象に含めることも可能）。

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
`ifMatches` に一致する行が、必ず `mustAlsoMatch` にも一致することを検証します。

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
フロントマター（`---\n...\n---`）内に指定された YAML キーが存在しないかを検証します。

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
バッククォートで囲まれたインラインコードと隣接する英数字との間のスペースを検証します。

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
句点や指定された末尾文字（`endMarkers`）で終わらない連続した文章行を検出します（意図しない文中改行の防止）。

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
翻訳ドキュメントと英語原本（`content/en/...`）の見出しを比較し、原本にアンカー（`{#anchor}`）が存在する場合にのみ未設定を警告します。

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

## 新しいリンターハンドラーの実装 (JavaScript)

既存のルール種別（kind）では表現できない独自の検証を行いたい場合:

1. **テキスト解析ヘルパーの追加**（必要な場合）: `linter/preprocess.js`
2. **ハンドラー関数の実装**: `linter/engine.js`
   ```javascript
   function customHandler(text, rule, context) {
     const out = [];
     // start と end の文字オフセットを計算
     out.push(makeDiagnostic(rule, start, end));
     return out;
   }
   ```
3. **`HANDLERS` マップへの登録**: `linter/engine.js`
   ```javascript
   const HANDLERS = {
     regex: regexHandler,
     // ...
     custom: customHandler,
   };
   ```
4. **バリデーションの更新**: `linter/loadRules.js`
   - `REQUIRED_FIELDS` に必須フィールドを追加
   - 必要に応じて `validateRule()` を拡張
5. **JSON スキーマの更新**: `linter/rules.schema.json`
6. **単体テストの追加**: `test/linter.test.js`

---

## テストと検証

変更を送信する前に、必ずテストスイートを実行してください:

```bash
npm test
```

### テストの書き方
Node.js 標準のテストランナー（`node:test` および `node:assert/strict`）を使用して `test/` 配下にテストを追加します。

例:
```javascript
test('my-new-rule flags improper formatting', () => {
  const rule = {
    id: 'my-new-rule',
    kind: 'regex',
    pattern: 'foo_bar',
    message: { japanese: '警告メッセージ', english: 'Warning message' }
  };
  const findings = runRules('This contains foo_bar here.', [rule]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'my-new-rule');
});
```

---

## プルリクエストの提出方法

### 1. コミットメッセージと Conventional Commits
本リポジトリでは、**Conventional Commits** および **Release Please** を使用して、セマンティックバージョニングと `CHANGELOG.md` の更新を完全自動化しています。

コミットメッセージ（または PR のタイトル）には以下の標準プレフィックスを使用してください:

| プレフィックス | 説明 | バージョンへの影響 |
|---|---|---|
| `feat:` | 新機能、新しい言語の用語集追加、新しいリンタールール | マイナー (`0.x.0`) |
| `fix:` | バグ修正、既存の用語やルールの誤字・動作修正 | パッチ (`0.0.x`) |
| `docs:` | ドキュメントのみの変更（`README` など） | なし / パッチ |
| `chore:` / `refactor:` / `test:` | メンテナンス、テストの追加、リファクタリング | なし / パッチ |
| `feat!:` / `BREAKING CHANGE:` | 互換性を壊す変更 | メジャー (`x.0.0`) |

#### コミット例:
```bash
git commit -m "feat(glossary): add initial pt-br terminology"
git commit -m "fix(linter): adjust colon-spacing regex to ignore URLs"
git commit -m "docs: improve contribution guide for custom handlers"
```

> **注意:** PR 内で手動で `package.json` や `CHANGELOG.md` を編集する必要は**ありません**。変更が `main` にマージされると、リリースボット（`release-please`）が自動的にコミットを集約し、バージョンを更新して Marketplace に公開します。

### 2. PR ワークフロー
1. リポジトリをフォークし、フィーチャーブランチを作成:
   ```bash
   git checkout -b feature/add-portuguese-glossary
   ```
2. 変更を行い、`npm test` でテストが通ることを確認。
3. Conventional Commit 形式でコミット。
4. フォーク先にプッシュし、`main` ブランチに対して Pull Request を作成。
5. GitHub Actions CI（Node 22/24 でのテストおよび VSIX パッケージ検証）が成功することを確認してください。
