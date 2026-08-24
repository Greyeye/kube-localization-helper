# Kubernetes Localization Helper 기여 가이드

[English](CONTRIBUTING.md) | [日本語](CONTRIBUTING.ja.md) | [한국어](CONTRIBUTING.ko.md)

**Kubernetes Localization Helper** 프로젝트에 관심을 가져주셔서 감사합니다!

이 확장 프로그램은 쿠버네티스 공식 문서(SIG Docs)를 번역하는 기여자들이 표준화된 기술 용어를 준수하고 일관된 스타일로 번역할 수 있도록 돕기 위해 개발되었습니다. 다음과 같은 기여를 적극 환영합니다:
- 📖 용어집(Glossary) 항목 추가 및 보완
- 🌐 새로운 타깃 언어 지원 추가(`pt-br`, `zh-cn`, `de`, `es`, `bn` 등)
- 📏 린터 규칙 추가 및 개선 (JSON DSL 또는 커스텀 핸들러)
- 🐛 버그 수정, 단위 테스트 추가 및 문서 개선

---

## 목차

1. [아키텍처 개요](#아키텍처-개요)
2. [새로운 타깃 언어 추가 방법](#새로운-타깃-언어-추가-방법)
3. [용어집 단어 추가 및 수정 방법](#용어집-단어-추가-및-수정-방법)
4. [린터 규칙 추가 방법 (JSON DSL)](#린터-규칙-추가-방법-json-dsl)
5. [새로운 린터 엔진 핸들러 추가 방법 (JavaScript)](#새로운-린터-엔진-핸들러-추가-방법-javascript)
6. [테스트 및 검증](#테스트-및-검증)
7. [풀 리퀘스트(PR) 제출 방법](#풀-리퀘스트pr-제출-방법)

---

## 아키텍처 개요

본 저장소는 외부 npm 런타임 패키지 없이 가볍고 모듈화되어 있으며, 단위 테스트가 용이하도록 설계되었습니다:

```text
kube-localization-helper/
├── contentLanguage.js     # 경로 기반 언어 감지 (예: content/<lang>/...)
├── glossary.js            # 용어집 로더, 토크나이저, 최장 일치 알고리즘
├── hoverProvider.js       # VS Code 호버 프로바이더 및 마크다운 포매터
├── decorations.js         # 에디터 내 용어 점선 밑줄 하이라이트
├── words.schema.json      # words/<lang>/*.json 용 JSON 스키마
├── words/                 # 언어별 용어집 데이터
│   ├── ja/*.json          # 카테고리별 일본어 용어 데이터
│   └── ko/*.json          # 카테고리별 한국어 용어 데이터
├── linter/
│   ├── index.js           # VS Code 진단 어댑터 및 영문 원본 문서 탐색
│   ├── preprocess.js      # 순수 텍스트 전처리 분석 (프론트매터, 코드 블록, 인라인 코드, 표)
│   ├── engine.js          # 순수 규칙 실행 엔진 (VS Code 의존성 없음)
│   ├── loadRules.js       # 규칙 로더 및 유효성 검증
│   ├── rules.schema.json  # linter/rules/<lang>/*.json 용 JSON 스키마
│   └── rules/             # 언어별 린터 규칙
│       └── ja/*.json      # 일본어 Tier 1 & Tier 2 규칙
└── test/                  # `node --test` 기반 단위 테스트
```

### 핵심 설계 원칙
- **핵심 로직과 VS Code API 분리**: 전처리 분석, 구문 매칭, 용어집 색인, 규칙 엔진은 문자열과 오프셋을 다루는 순수 자바스크립트 함수로 구현되어 있습니다. `hoverProvider.js`, `decorations.js`, `linter/index.js`만 VS Code API와 통신합니다.
- **동적 언어 발견**: 디렉토리 구조(`words/<lang>/` 및 `linter/rules/<lang>/`)를 탐색하여 언어를 자동으로 로드하므로 새 폴더를 생성하기만 하면 즉시 활성화됩니다.
- **외부 런타임 의존성 제로**: Node.js 표준 라이브러리(`fs`, `path`, `os`, `assert`, `test`)만을 사용합니다.

---

## 새로운 타깃 언어 추가 방법

새로운 언어(예: 브라질 포르투갈어 `pt-br`, 중국어 간체 `zh-cn`, 독일어 `de` 등)를 추가하는 단계는 다음과 같습니다:

### 1단계: 언어 디렉토리 생성
`kubernetes/website`의 `content/<lang>/` 폴더명과 일치하는 언어 코드로 디렉토리를 생성합니다:

```bash
mkdir -p words/<lang>
```
*(예: `words/pt-br/`, `words/zh-cn/`, `words/de/`)*

### 2단계: 용어집 JSON 파일 추가
`words/<lang>/` 디렉토리 아래에 분야별 JSON 파일을 생성합니다 (예: `fundamental.json`, `architecture.json`, `workload.json`):

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
모든 JSON 파일은 반드시 [`words.schema.json`](./words.schema.json) 규격을 준수해야 합니다.

### 3단계: 국기 이모지 등록 (선택 사항)
`hoverProvider.js`의 `FLAG_BY_LANG`에 해당 언어 코드와 국기 이모지를 매핑합니다:

```javascript
const FLAG_BY_LANG = {
  ja: '🇯🇵',
  ko: '🇰🇷',
  'pt-br': '🇧🇷',
  'zh-cn': '🇨🇳',
};
```
*(등록되지 않은 언어는 자동으로 🌐 아이콘으로 표시됩니다)*

### 4단계: 린터 규칙 추가 (선택 사항)
`linter/rules/<lang>/` 디렉토리를 생성하고 언어별 스타일 린터 규칙을 추가합니다 (자세한 내용은 [린터 규칙 추가 방법](#린터-규칙-추가-방법-json-dsl) 참조).

### 5단계: 단위 테스트 추가
`test/glossary.test.js`에 새 언어 파일이 오류 없이 로드되는지 확인하는 테스트를 추가합니다:

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

## 용어집 단어 추가 및 수정 방법

`words/<lang>/` 하위의 모든 용어 파일은 [`words.schema.json`](./words.schema.json) 스키마를 따릅니다.

### 용어 객체 필드

| 필드 | 타입 | 필수 여부 | 설명 |
|---|---|---|---|
| `id` | `string` | **필수** | 고유 식별자/슬러그 (예: `"persistent-volume-claim"`). |
| `english` | `string` | **필수** | 표준 영문 표기 (예: `"PersistentVolumeClaim"`). |
| `translate` | `boolean` | **필수** | 기본 번역 지침 (번역할 경우 `true`, 원문 영문을 유지할 경우 `false`). |
| `translation` | `string` \| `null` | 선택 | `translate: true`일 때의 표준 번역어. `translate: false`일 경우 `null`. |
| `aliases` | `string[]` | 선택 | 본문 매칭에 사용할 복수형, 약어, 대소문자 변형 목록 (예: `["PVC", "PVCs"]`). |
| `glossary_id` | `string` \| `null` | 선택 | `content/en/docs/reference/glossary/*.md`의 `id:`와 일치하는 ID. 공식 용어집 링크 생성에 사용됩니다. |
| `definition` | `object` | 선택 | `{ "english": "...", "translation": "..." }` 형태의 간결한 정의. |
| `translation_sample` | `string` \| `null` | 선택 | 실제 문맥에서의 번역 예문. |
| `contextual_rules` | `object[]` | 선택 | 문맥별 조건부 번역 규칙(아래 예시 참조). 순서대로 평가되어 첫 번째 일치 항목이 적용됩니다. |
| `notes` | `string` | 선택 | 호버 창에 표시할 팁이나 부가 설명. |

### 용어 정의 예시

#### 1. 영문 원문 유지 용어 (Do Not Translate)
```json
{
  "id": "kubelet",
  "glossary_id": "kubelet",
  "english": "kubelet",
  "translate": false,
  "translation": null,
  "definition": {
    "english": "An agent that runs on each node in the cluster.",
    "translation": "클러스터의 각 노드에서 실행되는 에이전트."
  }
}
```

#### 2. 별칭 및 예문이 포함된 용어
```json
{
  "id": "worker-node",
  "english": "Worker Node",
  "aliases": ["worker nodes", "worker-node", "worker-nodes"],
  "translate": true,
  "translation": "워커 노드",
  "translation_sample": "워커 노드 상에서 파드를 실행한다"
}
```

#### 3. 문맥별 분기 규칙이 있는 용어
```json
{
  "id": "deployment",
  "glossary_id": "deployment",
  "english": "Deployment",
  "aliases": ["deployments", "deploy"],
  "translate": true,
  "translation": "배포",
  "contextual_rules": [
    {
      "when": "쿠버네티스 리소스(kind: Deployment)를 지칭하는 경우",
      "translate": false,
      "translation": "Deployment"
    },
    {
      "when": "소프트웨어를 출시/배포하는 일반적인 동사/명사로 사용된 경우",
      "translate": true,
      "translation": "배포"
    }
  ]
}
```

---

## 린터 규칙 추가 방법 (JSON DSL)

린터 규칙은 `linter/rules/<lang>/*.json` 디렉토리에 위치하며 [`linter/rules.schema.json`](./linter/rules.schema.json)을 준수합니다.

각 규칙은 `id`, `kind`, `severity`, 및 이중 언어 `message`를 가집니다.

### 규칙 종류 (kind)

#### 1. `regex`
정규표현식으로 패턴을 검사합니다. 프론트매터, 코드 블록, 표 행은 자동으로 제외됩니다. 인라인 코드(`...`) 내부는 기본적으로 건너뜁니다 (`includeInlineCode: true` 설정 시 포함 가능).

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
`ifMatches`에 매칭되는 행이 반드시 `mustAlsoMatch` 패턴을 만족해야 함을 검증합니다.

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
프론트매터(`---\n...\n---`) 내에 금지된 YAML 키가 포함되어 있는지 검사합니다.

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
인라인 코드 스팬 주변과 인접한 영문 텍스트 사이의 공백 규칙을 검사합니다.

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
마침표나 지정된 종료 문자(`endMarkers`)로 끝나지 않은 연속된 본문 줄을 검사하여 의도치 않은 중간 줄바꿈을 방지합니다.

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
번역 문서의 제목과 영문 원본(`content/en/...`) 제목을 비교하여, 영문 원문에 앵커(`{#anchor}`)가 정의되어 있을 때 번역본에서 누락된 경우에만 경고합니다.

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

## 새로운 린터 엔진 핸들러 추가 방법 (JavaScript)

기존 규칙 종류(kind)로 표현할 수 없는 독자적인 검사 로직이 필요한 경우:

1. **텍스트 분석 헬퍼 추가** (필요시): `linter/preprocess.js`
2. **핸들러 함수 구현**: `linter/engine.js`
   ```javascript
   function customHandler(text, rule, context) {
     const out = [];
     // start 및 end 오프셋 계산
     out.push(makeDiagnostic(rule, start, end));
     return out;
   }
   ```
3. **`HANDLERS` 맵 등록**: `linter/engine.js`
   ```javascript
   const HANDLERS = {
     regex: regexHandler,
     // ...
     custom: customHandler,
   };
   ```
4. **유효성 검사 로직 업데이트**: `linter/loadRules.js`
   - `REQUIRED_FIELDS`에 필수 필드 추가
   - 필요시 `validateRule()` 확장
5. **JSON 스키마 업데이트**: `linter/rules.schema.json`
6. **단위 테스트 추가**: `test/linter.test.js`

---

## 테스트 및 검증

변경 사항을 제출하기 전 항상 전체 테스트를 실행해 주세요:

```bash
npm test
```

### 테스트 작성 방법
Node.js 내장 테스트 러너(`node:test` 및 `node:assert/strict`)를 사용하여 `test/` 아래에 테스트를 작성합니다.

예시:
```javascript
test('my-new-rule flags improper formatting', () => {
  const rule = {
    id: 'my-new-rule',
    kind: 'regex',
    pattern: 'foo_bar',
    message: { japanese: '경고 메시지', english: 'Warning message' }
  };
  const findings = runRules('This contains foo_bar here.', [rule]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'my-new-rule');
});
```

---

## 풀 리퀘스트(PR) 제출 방법

### 1. 커밋 메시지 및 Conventional Commits
본 프로젝트는 **Conventional Commits** 규격과 **Release Please** 도구를 사용하여 시맨틱 버저닝(SemVer)과 `CHANGELOG.md` 갱신을 완전 자동화하고 있습니다.

커밋 메시지(또는 PR 제목)에는 아래의 표준 접두사를 사용해 주세요:

| 접두사 | 설명 | SemVer 영향 |
|---|---|---|
| `feat:` | 새 기능, 새 언어 용어집 추가, 새 린터 규칙 | 마이너 (`0.x.0`) |
| `fix:` | 버그 수정, 기존 용어/규칙 오탈자 및 오류 수정 | 패치 (`0.0.x`) |
| `docs:` | 문서 수정 전용 (`README` 등) | 없음 / 패치 |
| `chore:` / `refactor:` / `test:` | 유지보수, 테스트 추가, 리팩터링 | 없음 / 패치 |
| `feat!:` / `BREAKING CHANGE:` | 하위 호환성을 깨는 변경 | 메이저 (`x.0.0`) |

#### 커밋 예시:
```bash
git commit -m "feat(glossary): add initial pt-br terminology"
git commit -m "fix(linter): adjust colon-spacing regex to ignore URLs"
git commit -m "docs: improve contribution guide for custom handlers"
```

> **참고:** PR에서 `package.json`이나 `CHANGELOG.md`를 수동으로 수정할 필요가 **없습니다**. 변경 사항이 `main` 브랜치에 머지되면 릴리스 봇(`release-please`)이 커밋을 자동으로 분석하여 버전을 올리고 마켓플레이스에 배포합니다.

### 2. PR 워크플로
1. 저장소를 포크하고 새 브랜치를 생성합니다:
   ```bash
   git checkout -b feature/add-portuguese-glossary
   ```
2. 변경 사항을 작성하고 `npm test`로 검증합니다.
3. Conventional Commit 형식으로 커밋합니다.
4. 포크한 저장소에 푸시한 후 `main` 브랜치로 Pull Request를 생성합니다.
5. GitHub Actions CI(Node 22/24 테스트 및 VSIX 패키지 빌드 검증)가 통과하는지 확인합니다.
