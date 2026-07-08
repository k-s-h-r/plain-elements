# Popover MVP 要件・設計・残タスク

## 位置づけ

Popover は Tooltip に続く interactive popup primitive である。Tooltip と異なり、リンク、ボタン、フォーム入力などの操作可能な内容を持てる。

ライブラリ全体の方針は [Plain Elements ライブラリ計画](./plain-elements-plan.md) を参照する。

参考実装:

- Base UI Popover v1.6.0: https://github.com/mui/base-ui/tree/v1.6.0/packages/react/src/popover

Base UI から次の contract を取り入れる。

- trigger は既定で press/click で開く
- popup は `role="dialog"` を持つ
- trigger は `aria-haspopup="dialog"`、`aria-expanded`、`aria-controls` を持つ
- title / description を popup の accessible name / description へ接続する
- 開いたときは最初の操作可能要素へ focus を移す
- 閉じたときは必要に応じて trigger へ focus を戻す
- `side` / `align` / offset / collision padding と、解決後の配置を data 属性で公開する

React、portal、Floating UI、modal focus trap、animation lifecycle は採用しない。Plain Elements の Light DOM・構造不変・native-first 方針へ合わせる。

## 推奨マークアップ

```html
<pe-popover data-popover-side="bottom" data-popover-offset="8">
  <button type="button" data-popover-trigger>Account</button>

  <div data-popover-content hidden>
    <h2 data-popover-title>Account</h2>
    <p data-popover-description>Manage your current session.</p>
    <a href="/account">Profile</a>
    <button type="button" data-popover-close>Close</button>
  </div>
</pe-popover>
```

layout へ影響させたくない場合:

```css
pe-popover {
  display: contents;
}
```

## Host と parts

`<pe-popover>` は lifecycle host であり、DOM を render しない。

- `[data-popover-content]`: host 内に 1 つ置く popup surface
- `[data-popover-trigger]`: 空値なら同じ host、値があればその ID の host を参照する trigger
- `[data-popover-close]`: popup を閉じる control
- `[data-popover-title]`: popup の `aria-labelledby` source
- `[data-popover-description]`: popup の `aria-describedby` source
- `[data-popover-initial-focus]`: open 時に優先して focus する要素

content が複数ある場合は最初の 1 つを使い、警告する。content がない場合は closed 状態にし、警告する。

外部 trigger:

```html
<button type="button" data-popover-trigger="account-popover">Account</button>

<pe-popover id="account-popover">
  <div data-popover-content hidden>...</div>
</pe-popover>
```

## Native Popover API

content を `popover="auto"` として enhance し、次をブラウザへ委ねる。

- top layer
- native な open / closed state
- 他の auto popover との関係
- platform の light dismiss / Escape behavior

実行環境には native Popover API（`showPopover()`、`hidePopover()`、`:popover-open`）が必要である。MVP は未対応ブラウザ向け fallback を同梱しない。未対応環境では open を行わず警告する。

ライブラリも管理対象 popover の stack を持ち、明示的な outside pointer / Escape 処理を topmost instance のみに適用する。これはイベント理由と state/focus 同期を決定的にするためである。

作者には初期表示のちらつき防止として content の `hidden` を推奨する。upgrade 時に `popover="auto"` を設定した後で `hidden` を外す。closed 表示は native popover state が管理する。

## State と ARIA

状態:

```html
<pe-popover data-state="open">
<button data-popover-trigger data-state="open" aria-expanded="true">
<div data-popover-content data-state="open" data-side="bottom" data-align="center">
```

同じ popover に複数 trigger がある場合、`data-state="open"` と `aria-expanded="true"` は active trigger のみに付く。

content:

- `role="dialog"`
- `tabindex="-1"`
- `popover="auto"`
- title があり明示 label がなければ `aria-labelledby`
- description があり明示 description がなければ `aria-describedby`

trigger:

- `aria-haspopup="dialog"`
- `aria-expanded="true | false"`
- `aria-controls="content-id"`

生成 ID と管理属性は disconnect 時に元へ戻す。

## Focus

open 時:

1. `[data-popover-initial-focus]`
2. `[autofocus]`
3. 最初の visible focusable element
4. popup 自身

touch から開いた場合は、入力要素へ focus して virtual keyboard を即座に開かないよう popup 自身へ focus する。

Escape、close control、programmatic close で popup 内に focus がある場合、active trigger へ戻す。outside dismiss はユーザーが選んだ外部要素の focus を維持する。

focus trap は行わない。Popover は non-modal である。modal interaction が必要なら Dialog を使う。

## Positioning

```html
<pe-popover
  data-popover-side="bottom"
  data-popover-align="center"
  data-popover-offset="0"
  data-popover-align-offset="0"
  data-popover-collision-padding="5"
>
```

Base UI v1.6.0 の Popover defaults に合わせ、既定値は `bottom` / `center` / side offset `0` / collision padding `5` とする。

実装は Tooltip と同じ簡易 positioning である。

- `position: fixed`
- main axis collision 時に反対 side へ flip
- 最終座標を viewport 内へ clamp
- resize / ancestor scroll 時に再計算
- 実配置を content の `data-side` / `data-align` へ同期

## Events と programmatic API

methods:

```ts
popover.open(trigger?): void;
popover.close(): void;
popover.toggle(trigger?): void;
```

events:

- `pe-popover:open`
- `pe-popover:close`

event は bubble / composed で、`detail` に `content`、`trigger`、`reason` を持つ。

reason:

- `trigger`
- `close-control`
- `dismiss`
- `escape`
- `programmatic`
- `native`

## MVP で未対応

- modal mode / focus trap / scroll lock / inert
- portal
- Floating UI 相当の clipping ancestor、sticky、anchor hidden 検出
- CSS Anchor Positioning への切り替え
- animation の mount/unmount lifecycle
- hover で開く Popover
- focus guard を使った portal 時の tab order 維持
- nested / external native popover を含む厳密な dismiss stack coordination

## Acceptance Criteria

- native Popover API を使う
- Shadow DOM、portal、wrapper 生成を行わない
- internal / external trigger が動く
- click、close control、outside pointer、Escape、programmatic API が動く
- focus 初期化と復帰が動く
- role / ARIA / state / title / description が同期される
- positioning、flip、clamp、resolved data 属性が動く
- 動的 trigger と属性変更へ追従する
- disconnect 時に listener / observer / 管理属性を cleanup する
- browser test、typecheck、build が通る
