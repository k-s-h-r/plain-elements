# Tooltip MVP 要件・設計・残タスク

## 位置づけ

この文書は Tooltip 固有の仕様、現状、残タスクを定義する。

ライブラリ全体の方針は [Plain Elements ライブラリ計画](./plain-elements-plan.md) を参照する。Tooltip は Dialog に続く実装対象であり、以下を検証する。

- Light DOM
- 作者が書いた HTML 構造を変更しない
- 外部 trigger 対応
- hover / focus / Escape の基本 interaction
- `aria-describedby` と `role="tooltip"` の同期
- 最小限の位置計算
- 安定した `data-*` スタイリング API

現状の Tooltip は CMS、LP、一般サイト上の軽い説明 tooltip としては使える初回版である。ただし、Base UI 級の production primitive としては未完成である。

参考実装:

- Base UI Tooltip: https://github.com/mui/base-ui/tree/v1.6.0/packages/react/src/tooltip

Base UI からは、特に `side` / `align` / `sideOffset` / `alignOffset` / `collisionPadding` のような positioning contract と、実際に採用された `side` / `align` を data 属性へ反映する考え方を取り入れる。

hover 中に trigger から content へ pointer を移動しても閉じない挙動は、Base UI が内部で使う Floating UI の [`safePolygon`](https://floating-ui.com/docs/useHover#safepolygon) を参考に実装している。

## 推奨マークアップ

内部 trigger:

```html
<pe-tooltip>
  <button type="button" data-tooltip-trigger>
    Save
  </button>

  <span data-tooltip-content hidden>
    Saves this draft without publishing.
  </span>
</pe-tooltip>
```

外部 trigger:

```html
<button type="button" data-tooltip-trigger="publish-tip">
  Publish
</button>

<pe-tooltip id="publish-tip" data-tooltip-side="bottom" data-tooltip-align="end">
  <span data-tooltip-content hidden>
    Makes the current version visible to visitors.
  </span>
</pe-tooltip>
```

layout へ影響させたくない場合は、全体計画の方針通り CSS で以下を指定する。

```css
pe-tooltip {
  display: contents;
}
```

## Host

`<pe-tooltip>` は Tooltip の lifecycle host である。

ライブラリが管理する content は必ず `<pe-tooltip>` の内側に置く。単独の `[data-tooltip-content]` はこのライブラリによって enhance されない。

MVP では host は tooltip content を 1 つだけ持つ。

```html
<pe-tooltip>
  <button data-tooltip-trigger>Save</button>
  <span data-tooltip-content hidden>...</span>
</pe-tooltip>
```

host 内に `[data-tooltip-content]` が複数ある場合は、最初の 1 つを使い、development で警告する。

host 内に `[data-tooltip-content]` がない場合は、host の `data-state` を `closed` にし、それ以外は何もせず、development で警告する。

外部 trigger や programmatic API から参照する場合、作者は `<pe-tooltip id="...">` を書く。Dialog の `<dialog id="...">` と同様、公開 ID は host に置く。

## Content

tooltip content は以下で選択する。

```html
<span data-tooltip-content hidden>...</span>
```

要件:

- 作者が content に `id` を書く必要はない
- `aria-describedby` 用に、content に `id` がない場合はコンポーネントが `pe-tooltip-content-*` を生成して付与する
- 初期表示のちらつきを防ぐため、作者は content に `hidden` を書くことを推奨する
- コンポーネントは upgrade 直後に content へ `hidden` を付与し、`connectedCallback` で `closed` 状態へ同期する
- コンポーネントは content に `role="tooltip"` を同期する
- closed 状態では content に `hidden` を付与する
- open 状態では content から `hidden` を外す
- open 状態では content に `pointer-events: auto` を付与し、hover で到達可能にする

## Trigger

外部 trigger は host ID で選択する。

```html
<button data-tooltip-trigger="save-tip">Save</button>

<pe-tooltip id="save-tip">
  <span data-tooltip-content hidden>...</span>
</pe-tooltip>
```

内部 trigger も許可する。

```html
<pe-tooltip>
  <button data-tooltip-trigger>Save</button>
  <span data-tooltip-content hidden>...</span>
</pe-tooltip>
```

解決ルール:

1. `data-tooltip-trigger` を持たない要素は trigger ではない。
2. `[data-tooltip-trigger="some-id"]` は、`<pe-tooltip id="some-id">` を参照する。
3. `[data-tooltip-trigger]` と `[data-tooltip-trigger=""]` は空 trigger とする。
4. 空 trigger は `<pe-tooltip>` の子孫である場合のみ動作する。その host の content を参照する。
5. `<pe-tooltip>` の外にある空 trigger は無視し、development で警告する。
6. 同じ tooltip に対して複数 trigger を許可する。
7. trigger が存在しないことは許可する。
8. 初期化後に追加された trigger も拾う。
9. `[data-tooltip-trigger="some-id"]` が enhance 済み `<pe-tooltip id="some-id">` に一致しない場合は bind せず、development で警告する。

推奨 trigger 要素は native の `<button type="button">` である。`data-tooltip-trigger` を button 以外の要素に付ける場合、keyboard support、focusability、accessible role/name は作者責任とする。

## State 属性

コンポーネントは状態を以下へ同期する。

```html
<pe-tooltip data-state="closed">
<button data-tooltip-trigger="save-tip" data-state="closed">
<span data-tooltip-content data-state="closed">
```

許可される state:

- `open`
- `closed`

## ARIA 同期

各 trigger へ以下を同期する。

```html
aria-describedby="pe-tooltip-content-1"
```

`aria-describedby` は `role="tooltip"` を持つ content 要素の ID を指す。作者向けの host `id` とは別に、コンポーネントが content 用 ID を生成する。

作者が既に `aria-describedby` を書いている場合、コンポーネントは既存 token を残し、tooltip content の ID を追加する。

content へは以下を同期する。

```html
role="tooltip"
```

Tooltip は説明テキストであり、focusable / interactive な UI を含める用途にはしない。リンク、ボタン、フォームなどを含める必要がある場合は Popover として設計する。

## Interaction

MVP の基本 interaction:

- pointer hover で開く
- focus で開く
- pointer leave で閉じる
- blur で閉じる
- Escape で閉じる
- touch pointer の hover open は無視する
- content 上に pointer がある間は閉じない

現状では open delay / close delay は `data-tooltip-delay` / `data-tooltip-close-delay` で指定できる。hover open にのみ open delay を適用し、focus と programmatic open は即時である。

### Safe hover area

trigger と content の間に gap がある場合、pointer がその gap を横切っても tooltip を閉じない。Base UI の hoverable popup / Floating UI の `safePolygon` と同様、以下の安全領域を使う。

1. **矩形ブリッジ** — trigger と content の間を結ぶ矩形（rect bridge）
2. **カーソルポリゴン** — `pointerleave` 時点の座標から content 方向へ伸びる三角形

`pointerleave` 後は `document` の `pointermove` で pointer が安全領域内かを追跡する。安全領域を出たら閉じる。

閉じる条件の要点:

- `pointerType` が `mouse` のときだけ safe hover area を有効にする
- trigger または content から、配置された `data-side` と**反対側**へ離れた場合は即座に閉じる
  - 例: `data-side="top"` なら trigger の下辺から離脱したら閉じる
- trigger / content の `relatedTarget` が互いの要素内なら、safe hover area は開始しない
- trigger または content に再入ったら追跡を止める

双方向を扱う:

- trigger → content
- content → trigger

browser test で、gap 横断と繰り返し hover を確認している。

### まだ safe hover area に無いもの

Base UI / Floating UI 本家と比べ、現状は以下を省略している。

- `requireIntent` 相当の cursor speed 判定
- `blockPointerEvents` による背面要素への誤 hover 防止
- nested tooltip / delay group との連携（`data-tooltip-delay-group` / `data-tooltip-skip-delay` で sibling tooltip を連携）

そのため、trigger の横方向へ大きく外れても矩形ブリッジの水平範囲内なら一時的に開いたままになることがある。意図しない方向への離脱は、`data-side` 反対側からの離脱判定で主に防ぐ。

## Positioning

MVP では以下の属性を提供する。

```html
<pe-tooltip
  data-tooltip-side="top"
  data-tooltip-align="center"
  data-tooltip-offset="8"
  data-tooltip-align-offset="0"
  data-tooltip-collision-padding="4"
>
```

属性:

- `data-tooltip-side`: `top` / `right` / `bottom` / `left`
- `data-tooltip-align`: `start` / `center` / `end`
- `data-tooltip-offset`: main axis の trigger との距離
- `data-tooltip-align-offset`: cross axis の追加 offset
- `data-tooltip-collision-padding`: viewport clamp / flip 判定用 padding

コンポーネントは実際に採用した配置を content に公開する。

```html
<span data-tooltip-content data-side="top" data-align="center">
```

現状の配置は簡易実装である。

- fixed positioning を使う
- preferred side が viewport の main axis に衝突する場合、反対側へ flip を試す
- 最終座標は viewport 内へ clamp する

## まだ完璧ではない点

Tooltip は現時点では production primitive として完璧ではない。特に以下が未対応である。

- scroll container / clipping ancestor を考慮した collision detection
- 複数 fallback placement
- RTL
- `inline-start` / `inline-end`
- `visualViewport`
- transform / containing block の複雑なケース
- trigger / content resize 時の自動再配置
- delay group
- safe hover area の cursor speed intent 判定（`requireIntent`）
- safe hover area の `blockPointerEvents`
- disabled API
- HTML 属性による initial open / controlled state 方針
- touch / long press 方針

## 次の優先タスク

優先度高:

- `data-tooltip-delay` / `data-tooltip-close-delay` を追加する。
- `ResizeObserver` で trigger / content のサイズ変化時に再配置する。
- positioning test を増やす。特に viewport edge、scroll、resize、dynamic content を確認する。

優先度中:

- collision fallback を強化する。
- `data-tooltip-disabled` を追加する。
- `data-side` / `data-align` を使った animation example を追加する。

優先度低:

- provider / delay group 相当を検討する。
- cursor tracking を検討する。
- CSS Anchor Positioning / Popover API の採用可否を再検討する。

## 完了条件

Tooltip を production primitive と呼ぶには、少なくとも以下を満たす必要がある。

- open / close delay がある
- trigger / content resize で再配置される
- viewport edge で破綻しない
- scroll container 内で破綻しにくい
- keyboard / pointer interaction の仕様が明文化され、browser test で守られている
- trigger と content の gap を横断する hover が browser test で守られている
- interactive content を持つべきでないことが docs / example で明確である
