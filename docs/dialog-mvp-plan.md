# Dialog MVP 要件・設計・タスク

## 位置づけ

この文書は Dialog MVP 固有の仕様と実装タスクを定義する。

ライブラリ全体の方針は [Plain Elements ライブラリ計画](./plain-elements-plan.md) を参照する。Dialog はその最初の実装対象であり、以下を検証する。

- Baseline 機能を優先する Native-first 方針
- Light DOM
- 作者が書いた HTML 構造を変更しない
- 外部 trigger 対応
- 初期化、破棄、DOM 変更検知のための Web Component lifecycle
- 安定した `data-*` スタイリング API

参考実装:

- Base UI Dialog: https://github.com/mui/base-ui/tree/v1.6.0/packages/react/src/dialog

Base UI は `Root` / `Trigger` / `Popup` / `Backdrop` / `Title` / `Description` / `Close` / `Portal` / `Viewport` という parts に分かれている。Plain Elements では作者の HTML 構造を変えないため parts を component として render しないが、以下の考え方は取り入れる価値がある。

- trigger と popup/dialog の関係を明示し、active trigger を覚える。
- title だけでなく description も明示パーツとして扱い、`aria-describedby` を補完できるようにする。
- open / close の reason をイベント detail に含める。
- outside press dismissal を細かく制御できるようにする。
- nested dialog の扱いを仕様化する。
- open / closed だけでなく transition 用 data 属性を将来検討する。

## Dialog 固有の Native-first 方針

Dialog のモーダル挙動は、必ずネイティブの `<dialog>` 要素と `HTMLDialogElement.showModal()` で実現する。

Dialog 実装では以下を再実装しない。

- top layer の挙動
- モーダルの focus 管理
- `showModal()` による背景 inert
- Escape キーで閉じる挙動
- `form method="dialog"`
- `::backdrop`

ライブラリが追加するのは、trigger 解決、属性同期、event 発火、軽い focus 復帰、DOM 変更検知だけにする。

外側クリックで閉じる挙動は native `<dialog>` の一貫した標準挙動としては扱わない。MVP では `data-dialog-dismiss` による明示 opt-in の補助として提供する。将来 `closedby` の実用性が十分になった場合は、native 属性との関係を再検討する。

Base UI 由来の以下は、native `<dialog>` と役割が重なるため、そのまま取り込まない。

- custom focus trap
- custom modal inert / aria-hidden 管理
- custom scroll lock
- portal による body 直下への移動
- separate backdrop element の自動生成

ただし、native `<dialog>` では足りない API 設計、状態理由、nested 管理、description 補完は参考にする。

## 推奨マークアップ

```html
<button data-dialog-trigger="settings-dialog">
  Settings
</button>

<pe-dialog id="settings-dialog">
  <dialog data-dialog-dismiss>
    <header>
      <h2 data-dialog-title>Settings</h2>
      <button type="button" data-dialog-close value="close">Close</button>
    </header>

    <p data-dialog-description>
      Update your personal settings.
    </p>

    <div>
      ...
    </div>
  </dialog>
</pe-dialog>
```

layout へ影響させたくない場合は、全体計画の方針通り CSS で以下を指定する。

```css
pe-dialog {
  display: contents;
}
```

ネイティブの form close 挙動が必要な場合は `form method="dialog"` を使う。ただし、dialog 内に別の form を入れる必要がある場合、dialog 全体をその form で包まない。HTML の form はネストできない。

```html
<pe-dialog id="confirm-dialog">
  <dialog aria-labelledby="confirm-title">
    <h2 id="confirm-title">Confirm</h2>

    <p>Continue?</p>

    <form method="dialog">
      <button value="cancel">Cancel</button>
      <button value="confirm">Confirm</button>
    </form>
  </dialog>
</pe-dialog>
```

## Host

`<pe-dialog>` は Dialog の lifecycle host である。

ライブラリが管理する dialog は必ず `<pe-dialog>` の内側に置く。単独の `<dialog id="x">` は通常のネイティブ dialog であり、このライブラリによって enhance されない。

MVP では host は native dialog target を 1 つだけ持つ。

```html
<pe-dialog id="example">
  <dialog>...</dialog>
</pe-dialog>
```

host 内に `<dialog>` が複数ある場合は、最初の 1 つを使い、development で警告する。

host 内に `<dialog>` がない場合は、host の `data-state` を `closed` にし、それ以外は何もせず、development で警告する。

## Native Dialog Target

native dialog target は以下である。

```html
<dialog>...</dialog>
```

`<pe-dialog>` の内側に置く。作者は `<dialog>` に公開 `id` を書く必要はない。

外部 trigger や programmatic API から参照する場合、作者は `<pe-dialog id="...">` を書く。

要件:

- 実際の `<dialog>` 要素であること
- `<dialog>` に `id` がない場合、コンポーネントは `aria-controls` 用に `pe-dialog-surface-*` を生成して付与する
- 内部の空 trigger または host の programmatic method だけを使う場合のみ、host の `id` 省略を許可する

生成 surface ID は作者が書いた host `id` の代替ではない。静的 HTML の外部 trigger は初期化前の生成 ID を参照できない。外部 trigger を使う場合、作者は host に明示的な `id` を書く。

生成 surface ID は、dialog 要素に書き込まれた後は安定する。

```txt
pe-dialog-surface-1
pe-dialog-surface-2
```

作者が後から生成済みの surface `id` を削除した場合、次回 refresh 時に新しい ID を生成してよい。

ライブラリは `closedby` を設定・変更しない。ネイティブ dialog の dismiss 方針は作者が管理する。

## Trigger

外部 trigger は host ID で選択する。

```html
<button data-dialog-trigger="settings-dialog">Settings</button>

<pe-dialog id="settings-dialog">
  <dialog>...</dialog>
</pe-dialog>
```

trigger は同一 document 内のどこに置いてもよい。

内部 trigger も許可する。

```html
<pe-dialog>
  <button data-dialog-trigger>Open</button>
  <dialog>...</dialog>
</pe-dialog>
```

解決ルール:

1. `data-dialog-trigger` を持たない要素は trigger ではない。
2. `[data-dialog-trigger="some-id"]` は、`<pe-dialog id="some-id">` を制御する。
3. `[data-dialog-trigger]` と `[data-dialog-trigger=""]` は空 trigger とする。
4. 空 trigger は `<pe-dialog>` の子孫である場合のみ動作する。その host の dialog target を制御する。
5. `<pe-dialog>` の外にある空 trigger は無視し、development で警告する。
6. 同じ dialog に対して複数 trigger を許可する。
7. trigger が存在しないことは許可する。
8. 初期化後に追加された trigger も拾う。
9. `[data-dialog-trigger="some-id"]` が enhance 済み `<pe-dialog id="some-id">` に一致しない場合は bind せず、development で警告する。

MVP では `commandfor` は使わない。trigger wiring は `data-dialog-trigger` を通じてライブラリが管理する。

推奨 trigger 要素は native の `<button type="button">` である。`data-dialog-trigger` を button 以外の要素に付ける場合、keyboard support、focusability、accessible role/name は作者責任とする。

Base UI は trigger に `aria-haspopup="dialog"`、`aria-expanded`、`aria-controls` を付ける。Plain Elements でも `aria-haspopup="dialog"`、`aria-controls`、`aria-expanded` を同期する。

将来、複数 trigger や controlled state を強化する場合は、Base UI のように active trigger を ID で管理する設計を検討する。現在は最後に開いた trigger 要素の参照だけを保持している。

## Close Control

close control は以下で選択する。

```html
<button data-dialog-close value="cancel">Cancel</button>
```

ルール:

- dialog 内の close control はその dialog を閉じる。
- `<pe-dialog>` 内かつ `<dialog>` 外の close control も、その host dialog を閉じる。
- close control は自身の `value` を `dialog.close(value)` に渡してよい。
- `value` がない場合は `dialog.close()` を呼ぶ。
- 推奨 close control は `<button type="button">` である。
- `[data-dialog-close]` に対しては、意図しない navigation や form submit を避けるため、ライブラリが `event.preventDefault()` を呼んでから close する。native form close semantics を使いたい作者は、`data-dialog-close` なしで `form method="dialog"` を使う。

作者は `data-dialog-close` なしで native の `form method="dialog"` を使ってもよい。その場合も、native `close` event が発火したらコンポーネントは状態を同期する。

## Outside Click Dismiss

外側クリックで閉じたい場合は、native `<dialog>` に `data-dialog-dismiss` を付ける。

```html
<pe-dialog>
  <dialog id="settings-dialog" data-dialog-dismiss>
    ...
  </dialog>
</pe-dialog>
```

ルール:

- `data-dialog-dismiss` がある dialog だけ、backdrop 上の pointer down で閉じる。
- dialog の矩形内での pointer down では閉じない。
- close 時の `returnValue` は `"dismiss"` とする。
- この機能は opt-in とする。`data-dialog-dismiss` がない dialog は外側クリックで閉じない。
- Escape キーによる close は native `<dialog>` の挙動に任せる。

## State 属性

コンポーネントは状態を以下へ同期する。

```html
<pe-dialog data-state="closed">
<dialog data-state="closed">
<button data-dialog-trigger="settings-dialog" data-state="closed">
```

許可される state:

- `open`
- `closed`

state は `dialog.open` から導出する。

将来、close animation を作者が扱いやすくする場合は、Base UI の `data-starting-style` / `data-ending-style` 相当を検討する。ただし native `<dialog>` は close 後に top layer から外れるため、animation を正しく扱うには `close` を遅延させるのか、`closedby` / `requestClose()` とどう整合させるのかを先に決める必要がある。

## ARIA 同期

各 trigger へ以下を同期する。

```html
aria-controls="pe-dialog-surface-1"
aria-expanded="true|false"
aria-haspopup="dialog"
```

`aria-controls` は `role` を持つ `<dialog>` 要素の ID を指す。作者向けの host `id` とは別に、コンポーネントが surface 用 ID を生成する。

native `<dialog>` は既に dialog semantics を持つため、コンポーネントは `role="dialog"` を設定しない。

native modal dialog は `showModal()` で開かれたときに modal behavior を持つため、コンポーネントは `aria-modal` を必須にしない。

作者は accessible name を用意する責任を持つ。

作者が明示的に `aria-label` または `aria-labelledby` を書いた場合、コンポーネントはそれを尊重し、上書きしない。

```html
<dialog id="settings-dialog" aria-labelledby="settings-title">
  <h2 id="settings-title">Settings</h2>
</dialog>
```

または:

```html
<dialog id="settings-dialog" aria-label="Settings">
</dialog>
```

`aria-label` も `aria-labelledby` もない場合、dialog 内の最初の `[data-dialog-title]` を使って `aria-labelledby` を補完する。

```html
<dialog id="settings-dialog">
  <h2 data-dialog-title>Settings</h2>
</dialog>
```

初期化後:

```html
<dialog id="settings-dialog" aria-labelledby="settings-dialog-title-1">
  <h2 id="settings-dialog-title-1" data-dialog-title>Settings</h2>
</dialog>
```

`[data-dialog-title]` が複数ある場合は最初の 1 つを使い、development で警告する。dialog が `aria-label`、`aria-labelledby`、`[data-dialog-title]` のいずれも持たない場合も development で警告する。

Base UI には `Dialog.Description` があり、popup に `aria-describedby` を同期する。Plain Elements でも `[data-dialog-description]` を明示パーツとして扱う。

```html
<dialog id="settings-dialog">
  <h2 data-dialog-title>Settings</h2>
  <p data-dialog-description>
    Update your personal settings.
  </p>
</dialog>
```

初期化後:

```html
<dialog
  id="settings-dialog"
  aria-labelledby="settings-dialog-title-1"
  aria-describedby="settings-dialog-description-1"
>
```

ルール:

- 作者が `aria-describedby` を書いている場合は尊重し、上書きしない。
- `aria-describedby` がなく、`[data-dialog-description]` がある場合だけ補完する。
- `[data-dialog-description]` が複数ある場合は最初の 1 つを使い、development で警告する。
- description は必須にしない。短い confirm dialog では不要な場合がある。

## Focus 復帰

ライブラリは modal focus trap を再実装しない。native `<dialog>.showModal()` がその挙動を担う。

MVP では軽い focus 復帰を行う。

- trigger から dialog が開かれた場合、その trigger を記憶する。
- native `close` event の後、記憶した trigger がまだ接続されていて、focus が意図的に別の場所へ移動されていない場合、その trigger へ focus を戻す。
- programmatic に trigger なしで開かれた場合、focus 復帰は強制しない。

これは trigger 関係の調整であり、custom focus trap ではない。

## Event

native event はそのまま利用可能にする。

- `cancel`
- `close`
- 対応ブラウザでの `toggle`
- 対応ブラウザでの `beforetoggle`

host はアプリケーション統合用に custom event を dispatch する。

```txt
pe-dialog:open
pe-dialog:close
pe-dialog:cancel
```

event ルール:

- bubble する。
- composed にする。
- `pe-dialog:open` は `showModal()` 成功後に発火する。
- `pe-dialog:close` は native `close` 後に発火する。
- `pe-dialog:cancel` は native `cancel` 後に発火する。
- custom event の `detail` には `{ dialog, trigger?, reason }` を含める。

Base UI は open state change に reason を持たせる。Plain Elements でも `detail.reason` を同期する。

候補:

- `trigger`
- `close-control`
- `form`
- `cancel`
- `dismiss`
- `programmatic`
- `native`

現状の MVP は Escape と `requestClose()` を個別に判定せず、native `cancel` 経由の close reason を `cancel` として扱う。

event 対応表:

| Native action | Native event | Custom event | 備考 |
| --- | --- | --- | --- |
| `open()` または trigger click が成功 | 保証される native event なし | `pe-dialog:open` | `showModal()` が return し、state sync が終わった後に発火する。 |
| native close、`dialog.close()`、`form method="dialog"` | `close` | `pe-dialog:close` | state sync と focus 復帰の後に発火する。 |
| Escape または `requestClose()` request | `cancel` | `pe-dialog:cancel` | native `cancel` が prevent されても発火する。detail に `{ reason: "cancel", defaultPrevented: event.defaultPrevented }` を含める。 |
| close request が cancel された | `cancel` のみ | `pe-dialog:close` は発火しない | `preventDefault()` により dialog が開いたままなら、state を `open` に戻す。 |
| ブラウザが `toggle` / `beforetoggle` に対応 | `toggle` / `beforetoggle` | 必須 custom event なし | 補助 signal としてのみ使う。正しさをこれらに依存しない。 |

将来 `pe-dialog:before-open` / `pe-dialog:before-close` の cancelable event を追加するかは open decision とする。Base UI の `onOpenChange` は event details で cancel できる設計を持つが、native `<dialog>` の `cancel` / `close` と二重の cancel point を作ると分かりにくくなるため、導入は慎重に行う。

## Public Method

host element は以下を公開する。

```ts
open(trigger?: HTMLElement): void
close(returnValue?: string): void
toggle(trigger?: HTMLElement): void
```

挙動:

- `open()` は dialog が閉じている場合のみ `dialog.showModal()` を呼ぶ。
- `open()` は dialog が既に開いている場合 no-op とする。
- `close()` は dialog が開いている場合のみ `dialog.close(returnValue)` を呼ぶ。
- `close()` は dialog が既に閉じている場合 no-op とする。
- `toggle()` は閉じていれば開き、開いていれば閉じる。

`showModal()` が例外を投げた場合、黙って握りつぶさない。development では context 付きで警告し、再 throw するか error event を dispatch する。初期 MVP では再 throw でよい。

Base UI は imperative action として `close()` と `unmount()` を公開する。Plain Elements は DOM を mount/unmount しないため `unmount()` は不要である。close animation を将来サポートする場合でも、まずは native dialog の open/closed と CSS transition の関係を整理する。

## Modal / Non-modal / Alert Dialog

Base UI は `modal=true`、`modal=false`、`modal="trap-focus"` を持ち、Alert Dialog や Drawer と root logic を共有している。

Plain Elements の Dialog MVP は必ず modal dialog として扱い、`showModal()` を使う。

今後検討する派生:

- `pe-dialog` は modal のままにする。
- non-modal は native `dialog.show()` を使う別 component または明示 opt-in にする。
- alert dialog は `data-dialog-alert` または別 component として、`role="alertdialog"`、description 必須、dismiss 制限を検討する。
- drawer は dialog とは別 component にする。見た目は CSS で実現できても、dismiss / nested / scroll lock の期待値が違う。

Native-first 方針では、これらを 1 つの巨大な Dialog API にまとめすぎない。

## Nested Dialog

Base UI は nested dialog count を持ち、親 dialog の backdrop や dismiss の扱いを調整している。

Native `<dialog>.showModal()` は top layer に積まれるため、基本的な stacking と focus はブラウザに任せられる。ただし、Plain Elements 側でも以下は仕様化が必要である。

- 親 dialog 内の trigger から子 dialog を開いた場合、子が閉じた後の focus 復帰先は子の trigger とする。
- 子 dialog が開いている間、親 dialog の `data-state` は `open` のままとする。
- 親の `data-dialog-dismiss` が子 dialog の操作で誤発火しないことを test する。
- 外部 trigger が複数 dialog にまたがる場合、active trigger 復帰が破綻しないことを test する。
- 将来必要なら `data-nested` や `data-nested-dialog-open` 相当を公開する。

MVP 実装は nested dialog 専用 state を持っていない。native の top layer に頼りつつ、子 dialog close 後の focus 復帰と、子 dialog open 中に親の dismiss が誤発火しない基本ケースを browser test で固定する。

## DOM 変更検知

`<pe-dialog>` は自身の subtree について以下を observe する。

- dialog target の置き換え
- `[data-dialog-close]` の追加・削除
- `data-dialog-dismiss` の追加・削除
- 内部 `[data-dialog-trigger]` の追加・削除
- dialog target の `id` 属性変更

外部 trigger 検知は、全 dialog instance で共有する document-level observer にしてもよいし、MVP では単純な per-instance document observer でもよい。

MVP では、明らかに問題になるまで単純な per-instance logic を優先する。

- `document.documentElement` で child list changes と `data-dialog-trigger` attribute changes を observe する。
- 次の microtask または animation frame で trigger を再解決する。
- mutation record ごとに同期的な全 query を行わない。
- 実装が複雑にならないなら、release 前に共有 document observer を優先する。最初の spike では per-instance observer を許容するが、examples/tests に複数 dialog が出た時点で再検討する。

Base UI は shared store と trigger map を持つ。Plain Elements では framework store は使わないが、dialog instance が増える場合は document observer と trigger registry を共有した方がよい。

## Styling Contract

MVP では、任意の example を除き、必須 CSS は提供しない。

公開 styling API:

```css
pe-dialog[data-state="open"] {}
pe-dialog dialog[data-state="open"] {}
[data-dialog-trigger][data-state="open"] {}
pe-dialog dialog::backdrop {}
```

例:

```css
pe-dialog {
  display: contents;
}

pe-dialog dialog {
  border: 0;
  padding: 0;
}

pe-dialog dialog::backdrop {
  background: rgb(0 0 0 / 0.5);
}
```

## 実装構成

Dialog MVP はまず以下の単一ファイルで実装する。

```txt
src/
  dialog.ts
  index.ts
tests/
  dialog.browser.test.ts
examples/
  dialog.html
```

共有 helper は、Tabs など 2 つ目以降のコンポーネントで重複が見えてから切り出す。

## 現状で足りない部分

Dialog は native `<dialog>` に寄せているため、Base UI が独自実装している focus trap、modal inert、scroll lock、backdrop render の大半は不要である。一方で、production primitive としては以下がまだ足りない。

- close animation / transition state の方針が未定である。
- non-modal dialog、alert dialog、drawer との境界が未整理である。
- document-level observer が instance ごとで、dialog 数が増えた場合の効率が悪い可能性がある。
- initial open / controlled state を HTML 属性で扱うか未定である。
- `cancel` / `close` / `requestClose()` / `closedby` の関係を、対応ブラウザ差を含めてまだ十分に検証していない。

## 次の優先タスク

優先度高:

- `cancel` / `close` / `requestClose()` / `closedby` の関係を、対応ブラウザ差を含めて検証する。
- initial open / controlled state を HTML 属性で扱うか決める。
- document-level external trigger observer を共有 registry にするか判断する。

優先度中:

- `data-dialog-alert` または `pe-alert-dialog` の方針を決める。
- close animation を支援するか、native close 即時反映を明確な方針として維持するか決める。
- `requestClose()` と `closedby` のブラウザ挙動を調査し、native 属性との関係を文書化する。

優先度低:

- non-modal dialog を扱うか検討する。扱う場合は `show()` を使う別 component または明示 opt-in にする。
- drawer を Dialog 派生にするか、別 primitive とするか決める。
- transition 用 `data-starting-style` / `data-ending-style` 相当を検討する。

## 完了条件

Dialog を production primitive と呼ぶには、少なくとも以下を満たす必要がある。

- trigger / dialog / close control / description の ARIA contract が文書化され、実装されている。
- open / close / cancel の理由が custom event detail から分かる。
- nested dialog の focus 復帰と dismiss が破綻しない。
- native `<dialog>` の close paths、`form method="dialog"`、`requestClose()`、Escape、cancel prevention が browser test で守られている。
- `data-dialog-dismiss` の仕様が top layer / nested dialog を含めて明確である。
- non-modal、alert dialog、drawer を同じ component に含めるか分離するかの方針が決まっている。
- document observer と trigger 解決が複数 dialog でも過剰に重くならない。

## TypeScript API Sketch

```ts
class DialogElement extends HTMLElement {
  #dialog: HTMLDialogElement | null = null;
  #triggers = new Set<HTMLElement>();
  #closeControls = new Set<HTMLElement>();
  #lastTrigger: HTMLElement | null = null;
  #cleanup: Array<() => void> = [];

  connectedCallback(): void;
  disconnectedCallback(): void;

  open(trigger?: HTMLElement): void;
  close(returnValue?: string): void;
  toggle(trigger?: HTMLElement): void;

  private sync(): void;
  private resolveDialog(): void;
  private resolveTriggers(): void;
  private resolveCloseControls(): void;
}

customElements.define("pe-dialog", DialogElement);
```

## Acceptance Criteria

### Behavior

- 外部 `[data-dialog-trigger="id"]` を click すると、対応する native dialog が開く。
- 内部の空 `[data-dialog-trigger]` を click すると、host dialog が開く。
- `<pe-dialog>` 外の空 trigger は無視され、development で警告される。
- enhance 済み dialog と一致しない ID を持つ trigger は bind されず、development で警告される。
- `[data-dialog-close]` を click すると dialog が閉じる。
- native `form method="dialog"` で dialog が閉じ、state が同期される。
- Escape により native behavior で dialog が閉じ、state が同期される。
- native `cancel.preventDefault()` が行われた場合、dialog は開いたままで、`pe-dialog:close` は発火しない。
- 同じ dialog に対する複数 trigger の state が同期される。
- 動的に追加された trigger が手動再初期化なしで動作する。
- programmatic `open()`、`close()`、`toggle()` が動作し、既に目的 state の場合は no-op になる。
- `showModal()` の失敗は握りつぶされない。
- host が削除されたら event listener と observer が cleanup される。

### DOM Contract

- 初期化で wrapper 要素を追加しない。
- 初期化で要素を移動しない。
- 初期化で要素を削除しない。
- 初期化で child HTML を書き換えない。
- 文書化された属性だけを追加・更新する。

### Accessibility

- trigger に `aria-controls` が付く。
- trigger に `aria-expanded` が付く。
- trigger に `aria-haspopup="dialog"` が付く。
- dialog に `aria-label` / `aria-labelledby` がない場合、`[data-dialog-title]` から `aria-labelledby` が補完される。
- dialog に `aria-describedby` がない場合、`[data-dialog-description]` から `aria-describedby` が補完される。
- connected な trigger から開かれた dialog が閉じた後、trigger へ focus が戻る。
- native dialog semantics が保たれる。
- dialog accessible name は文書化され、development で警告される。

### Styling

- `data-state` が host、dialog、trigger に同期される。
- 実体が native `<dialog>` なので、`::backdrop` styling が利用できる。
- `pe-dialog { display: contents; }` は推奨として文書化するが、ライブラリが自動注入しない。
- `data-dialog-dismiss` がある dialog は外側クリックで閉じる。

### Events

- `pe-dialog:open` が open 成功後に発火する。
- `pe-dialog:close` が native close 後に発火する。
- `pe-dialog:cancel` が native cancel 後に発火し、prevented cancel でも発火する。
- custom event detail は native dialog、reason、分かる場合は関連 trigger を含む。

## タスク

1. プロジェクト構成を初期化する。
   - `package.json` を追加する。
   - TypeScript build setup を追加する。
   - source entry file を追加する。
   - basic test runner または browser-based test setup を追加する。

2. `DialogElement` を実装する。
   - `pe-dialog` を define する。
   - `<dialog>` を解決する。
   - 文書化された範囲でのみ missing dialog ID を生成する。
   - 内部・外部 trigger を解決する。
   - close control を解決する。
   - `data-dialog-dismiss` の外側クリック close を実装する。
   - `open`、`close`、`toggle` を実装する。
   - focus 復帰のために最後の trigger を記録する。

3. state と ARIA 同期を実装する。
   - `data-state` を同期する。
   - `aria-controls` を同期する。
   - `aria-expanded` を同期する。
   - `aria-haspopup` を同期する。
   - `[data-dialog-title]` から `aria-labelledby` を補完する。
   - `[data-dialog-description]` から `aria-describedby` を補完する。
   - native `close`、`cancel`、対応ブラウザでの `toggle` を listen する。
   - 必要な場合に close 後の focus 復帰を行う。

4. DOM 変更検知を実装する。
   - host subtree を observe する。
   - 外部 trigger の追加・削除を observe する。
   - refresh work を debounce する。
   - disconnect 時に observer を cleanup する。
   - release 前に共有 document observation を再検討する。

5. development warning を追加する。
   - dialog target がない。
   - dialog target が複数ある。
   - accessible name がない。
   - trigger が存在しない dialog ID を参照している。
   - host 外の空 trigger。

6. test を追加する。
   - 外部 trigger が dialog を開く。
   - 内部 trigger が dialog を開く。
   - 外部の空 trigger が無視される。
   - close control が dialog を閉じる。
   - `data-dialog-dismiss` がある場合だけ外側クリックで閉じる。
   - native close が state を同期する。
   - `cancel.preventDefault()` が state を open のまま保つ。
   - programmatic method が open、close、toggle、no-op cases を扱う。
   - custom event が期待される detail で発火する。
   - custom event detail に reason が含まれる。
   - ARIA と `data-state` が同期される。
   - `data-dialog-title` が accessible name に使われる。
   - `data-dialog-description` が accessible description に使われる。
   - focus が opening trigger に戻る。
   - nested dialog の focus 復帰と dismiss が破綻しない。
   - 複数 trigger が同期される。
   - 動的 trigger が動作する。
   - DOM 構造が属性以外で変化しない。

7. example を追加する。
   - minimal dialog
   - external trigger dialog
   - form dialog
   - dialog 内に通常 form を含む例
   - `::backdrop` で styling した dialog

8. Dialog MVP 後に全体 API へ反映する。
   - `pe-tabs` も同じ host/data contract に従うか決める。
   - `pe-tooltip` が Popover API を default に使うか決める。

## Dialog 固有の Open Decisions

- Dialog の生成 ID を default で有効にするか、明示 ID を必須に寄せるか。
- Dialog open 前の custom event を cancelable にするか。
- Dialog の document-level external trigger observation を global shared にするか。
- `closedby` を完全に作者管理のままにするか、example/helper で任意補助を提供するか。
