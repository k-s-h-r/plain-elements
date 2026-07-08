# Plain Elements ライブラリ計画

## 目的

親アプリケーション側から自由にスタイルを当てられる、アクセシブルな UI primitive ライブラリを Web Components で作る。

対象コンポーネントの例:

- Dialog
- Tooltip
- Accordion
- Collapsible
- Tabs
- Popover
- Menu

コンポーネント別メモ:

- [Dialog MVP 要件・設計・タスク](./dialog-mvp-plan.md)
- [Tooltip MVP 要件・設計・残タスク](./tooltip-mvp-plan.md)
- [Popover MVP 要件・設計・残タスク](./popover-mvp-plan.md)
- [Tabs MVP 要件・設計・残タスク](./tabs-mvp-plan.md)
- [Accordion MVP 要件・設計・残タスク](./accordion-mvp-plan.md)
- [Collapsible MVP 要件・設計・残タスク](./collapsible-mvp-plan.md)

ライブラリは npm package と ESM / IIFE バンドルとして提供する。利用者はパッケージを読み込み、自分で用意した HTML と CSS に振る舞いを追加する。コンポーネントは保守と挙動の検証がしやすいよう、小さく、明示的で、読みやすく保つ。

## 対象利用シーン

主な利用シーンは CMS、LP、コーポレートサイト、メディアサイト、静的サイトなどの一般的な Web サイトである。

ただし、Web アプリケーションでの利用も明確に対象に含める。簡易スクリプト集ではなく、安定した公開 API とテストを備えた UI primitive ライブラリを目指す。

重視すること:

- HTML に直接書いた構造を progressive enhancement できる。
- build step のない環境でも使える配布形態を検討する。
- Tailwind、通常 CSS、既存の design system と自然に共存できる。
- CMS が出力する HTML に対しても後から振る舞いを付与できる。
- React / Vue / Svelte などの framework を前提にしない。
- Web アプリでも使えるように、ARIA、keyboard interaction、event、programmatic API、テスト品質を犠牲にしない。
- 見た目は利用側で定義し、ライブラリはアクセシビリティと interaction の土台を提供する。

避けること:

- 単なるコピペ用の簡易 widget に寄せすぎること。
- Web アプリで必要になる状態同期、イベント、動的 DOM への追従を軽視すること。
- framework adapter を前提にした API にすること。
- Shadow DOM や内部 render によって作者の HTML/CSS 制御を奪うこと。

## 基本方針

### Native-first

十分に使えるプラットフォーム機能がある場合は、それを優先して使う。

例:

- Dialog は native `<dialog>` と `HTMLDialogElement.showModal()` を使う。
- Tooltip / Popover 系は Popover API や CSS Anchor Positioning を検討する。
- Accordion は `<details>` / `<summary>` を標準とし、animation-first の用途だけ明示的な button / panel 構造を使う。

ライブラリは、ブラウザが既に持っているアクセシビリティや interaction model を無理に再実装しない。足りない部分だけを薄く補う。

### Light DOM

Shadow DOM は使わない。

理由:

- 親アプリケーションから自由にスタイルを当てられるようにするため
- Tailwind、通常の CSS selector、design token、アプリ側 CSS を `::part` なしで使えるようにするため

### HTML 構造を変更しない

ライブラリは、作者が書いた要素を作成、ラップ、移動、並べ替え、削除してはならない。

初期化時に許可される変更:

- `data-*` 属性の追加・更新
- `aria-*` 属性の追加・更新
- 明示的に仕様化された範囲での ID 補完。例: Dialog の `[data-dialog-title]`
- event listener の登録
- コンポーネント上必要な `tabindex` の更新
- 位置計算が必要なコンポーネントでの最小限の inline style 更新

禁止される変更:

- wrapper 要素の追加
- content を `body` へ移動すること
- portal の作成
- trigger や content 要素の自動生成
- `innerHTML` の書き換え

公開契約:

> HTML 構造は利用側で定義する。ライブラリは既存要素に属性と振る舞いを付与するだけにする。

### Web Components は lifecycle 境界として使う

Custom Element は DOM を隠すためではなく、lifecycle と同期のために使う。

Custom Element の責務:

- `connectedCallback` で初期化する
- `disconnectedCallback` で listener と observer を破棄する
- subtree が変わったら対象要素を再解決する
- 必要に応じて外部 trigger を再解決する
- 状態を属性へ同期する

Custom Element は DOM を render しない。

作者は `<pe-dialog>` や `<pe-tabs>` のような host 要素を自分で書く。つまり host は作者が置く lifecycle 境界であり、ライブラリが追加する wrapper ではない。

Custom Element はデフォルトで `inline` なので、layout へ影響させたくない host では以下を推奨する。

```css
pe-dialog,
pe-tooltip,
pe-popover {
  display: contents;
}
```

`display: contents` は古いブラウザや支援技術の組み合わせで accessibility tree 上の差異が報告されてきたため、厳密な AT サポート要件があるプロダクトでは対象環境で検証する。

## Public API 方針

### 属性

コンポーネントの public API は `data-*` を中心にする。

例:

```html
<button data-dialog-trigger="settings-dialog">Settings</button>
<pe-dialog id="settings-dialog">
  <dialog>...</dialog>
</pe-dialog>
```

状態は `data-state` で公開する。

```html
<pe-dialog data-state="open">
<button data-dialog-trigger="settings-dialog" data-state="open">
```

CSS は class 名ではなく、安定した `data-*` と native selector を基準に書けるようにする。

### イベント

native event は隠さない。コンポーネントごとに、必要な場合だけ custom event を追加する。

例:

```txt
pe-dialog:open
pe-dialog:close
pe-dialog:cancel
```

custom event は原則として:

- bubble する
- composed にする
- `detail` に関連する native element と trigger を含める

### Programmatic API

host element は必要最小限の method を公開してよい。

例:

```ts
dialog.open(trigger?: HTMLElement): void;
dialog.close(returnValue?: string): void;
dialog.toggle(trigger?: HTMLElement): void;
```

method は DOM 構造を変更しない。状態遷移と属性同期だけを行う。

## 配布形式

ESM と IIFE の両方を出力する。

### ESM

bundler、modern framework、`type="module"` が許可される Web サイト向け。

```html
<script type="module" src="/dist/plain-elements.js"></script>
```

Dialog だけを使う場合:

```html
<script type="module" src="/dist/dialog.js"></script>
```

npm package として使う場合:

```js
import "plain-elements";
import "plain-elements/dialog";
```

ESM 版も読み込まれた時点で custom element を define する。利用者は import した値を直接使わなくてもよい。

### IIFE

CMS、LP、タグ貼り付け型の一般 Web サイトなど、`type="module"` が使いにくい環境向け。

```html
<script src="/dist/plain-elements.iife.js"></script>
```

IIFE 版は読み込まれた時点で custom element を define する。HTML 側は通常通り書く。

```html
<button type="button" data-dialog-trigger="contact-dialog">
  Contact
</button>

<pe-dialog>
  <dialog id="contact-dialog" data-dialog-dismiss>
    <h2 data-dialog-title>Contact</h2>
    <button type="button" data-dialog-close>Close</button>
  </dialog>
</pe-dialog>
```

IIFE 版は CMS での導入しやすさを優先し、基本的には global API へ依存しない。必要になった場合のみ `window.PlainElements` の公開内容を検討する。

## 開発環境方針

初期実装では以下を採用する。

- 実装言語: TypeScript
- 開発サーバー: Vite
- ライブラリ build: Vite library mode。ESM と IIFE を出力する
- 型定義生成: `tsc`
- テスト: Vitest Browser Mode
- ブラウザ実行 provider: Playwright
- 実利用確認: Vite で配信する plain HTML example
- Storybook: 後回し

理由:

- Dialog は native `<dialog>`、`showModal()`、focus、Escape、MutationObserver を扱うため、`jsdom` ではなく実ブラウザでテストする必要がある。
- Vite はライブラリ開発中に `index.html` や example page から実ソースを直接 import できる。
- Vitest Browser Mode は unit test に近い書き味で、実ブラウザの DOM/API を検証できる。
- Playwright は CI や headed debugging に使いやすい。
- Storybook は variation 管理には有用だが、初期 Dialog の native top layer / focus 検証では plain HTML example の方が単純で実利用に近い。

基本コマンド:

```txt
npm run dev
npm run build
npm run test
npm run test:headed
npm run typecheck
```

サンプルページは `examples/` に置く。最初の Dialog example は Vite dev server で `/examples/dialog.html` として確認する。

## 実装順と現状

1. Dialog — 実装済み
   - native `<dialog>` を使う。
   - 外部 trigger、Light DOM、構造不変、lifecycle、DOM 変更検知の設計を固めた。

2. Tooltip — 実装済み
   - hover / focus / Escape、safe hover area、ARIA、簡易 positioning を実装した。

3. Popover — 実装済み
   - native Popover API を使う。
   - interactive content、light dismiss、focus、ARIA、簡易 positioning を実装した。

4. Tabs — 実装済み
   - tablist / tab / tabpanel の ARIA 関係を同期する。
   - roving tabindex、orientation、automatic / manual activation を実装した。

5. Accordion — 実装済み
   - 標準構造は native `<details>` / `<summary>` を使う。
   - `details[name]` の排他制御を尊重し、状態 hook、event、programmatic API を追加した。
   - animation-first 用の managed div item に trigger / panel ARIA、hidden-until-found、size CSS variables、animation lifecycle を追加した。

6. Collapsible — 実装済み
   - custom trigger と panel の ARIA 関係、open / disabled state を同期する。
   - `hidden="until-found"`、beforematch、size CSS variables、programmatic API を実装した。

## 共通実装候補

Dialog MVP 後、重複が見えたら以下を `src/core` に切り出す。

```txt
src/
  core/
    dom.ts
    events.ts
    ids.ts
    warnings.ts
  components/
    dialog.ts
    tabs.ts
    accordion.ts
    tooltip.ts
  index.ts
```

ただし、最初から過度に抽象化しない。1 つ目の Dialog は 1 ファイルで読みやすく実装し、2 つ目以降で本当に共通化できるものだけ切り出す。

## 横断 Acceptance Criteria

- Shadow DOM を使わない。
- 初期化で作者の HTML 構造を変更しない。
- public styling API は `data-*` を中心にする。
- native semantics がある場合は尊重し、不要な `role` を追加しない。
- listener と observer は `disconnectedCallback` で cleanup する。
- 動的に追加された関連要素を扱える。
- DOM 構造が属性以外で変化しないことをテストする。

## Open Decisions

- 生成 ID を default で有効にするか、明示 ID を強く要求するか。
- development warning を production build から取り除く仕組み。
- 将来 `commandfor` / Invoker Commands と共存・移行するか。
- portal を将来 opt-in として提供するか。
