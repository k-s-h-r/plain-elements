# Accordion MVP 要件・設計・残タスク

## 位置づけ

Accordion は、関連する複数の disclosure item をまとめる primitive である。Plain Elements は native `<details>` / `<summary>` を標準構造とし、アニメーション制御が必須の場合に managed `<div>` 構造も提供する。

ライブラリ全体の方針は [Plain Elements ライブラリ計画](./plain-elements-plan.md) を参照する。

参考実装:

- Base UI Accordion v1.6.0: https://github.com/mui/base-ui/tree/v1.6.0/packages/react/src/accordion

Base UI の value array、root / item disabled、item index、change event、panel size CSS variables、animation lifecycle を対応対象とする。React の mount 制御と非推奨の accordion roving focus は採用しない。

## 2 つの HTML 構造

### Native 構造（推奨）

`<details>` は HTML の disclosure element であり、直接の `<summary>` child が label と activation control になる。

```html
<details data-accordion-item name="faq">
  <summary>Shipping</summary>
  <p>Shipping information.</p>
</details>
```

この構造だけで pointer / keyboard activation、focus、open state、accessibility semantics、対応ブラウザでの find-in-page 展開を持つ。`data-accordion-trigger` と `data-accordion-panel` は不要であり、Plain Elements は generic trigger / panel 用の ARIA を追加しない。

Native 構造の開閉アニメーションには CSS の `::details-content` を使う。`<details>` から `open` が外れると内容全体が native に非表示となるため、inner panel の高さ変数による close animation は提供しない。

### Managed 構造（animation-first）

`::details-content` を利用できない対象ブラウザでも open / close animation が必須の場合は、明示的な trigger と panel を持つ `<div>` item を使う。

```html
<div data-accordion-item data-accordion-value="shipping">
  <h3>
    <button type="button" data-accordion-trigger>Shipping</button>
  </h3>
  <div data-accordion-panel hidden>Shipping information.</div>
</div>
```

Managed item では次を必須とする。

- item は `div[data-accordion-item]`
- item ごとに `<button data-accordion-trigger>` がちょうど 1 件
- item ごとに `[data-accordion-panel]` がちょうど 1 件

不足・重複・button 以外の trigger がある item は管理せず警告する。Native item と Managed item は同じ `<pe-accordion>` 内で混在させない。

## 推奨マークアップ

Native single-open:

```html
<pe-accordion>
  <details data-accordion-item data-accordion-value="shipping" name="faq">
    <summary>Shipping</summary>
    <p>...</p>
  </details>
  <details data-accordion-item data-accordion-value="returns" name="faq">
    <summary>Returns</summary>
    <p>...</p>
  </details>
</pe-accordion>
```

Managed single-open with find-in-page progressive enhancement:

```html
<pe-accordion data-accordion-single data-accordion-hidden-until-found>
  <div data-accordion-item data-accordion-value="shipping">
    <h3>
      <button type="button" data-accordion-trigger>Shipping</button>
    </h3>
    <div data-accordion-panel hidden="until-found">...</div>
  </div>
  <div data-accordion-item data-accordion-value="returns">
    <h3>
      <button type="button" data-accordion-trigger>Returns</button>
    </h3>
    <div data-accordion-panel hidden="until-found">...</div>
  </div>
</pe-accordion>
```

`hidden` は upgrade 前の closed panel の表示を防ぐためにも作者が初期 HTML に付ける。find-in-page を使う場合は `hidden="until-found"` を指定する。

## Parts

共通:

- `<pe-accordion>`: lifecycle と aggregate state の境界
- `[data-accordion-item]`: managed item marker
- `data-accordion-value`: optional programmatic identifier

Native:

- `details[data-accordion-item]`: item と native open state
- direct `<summary>` child: native trigger

Managed:

- `div[data-accordion-item]`: item と `data-accordion-open` state
- `<button data-accordion-trigger>`: trigger
- `[data-accordion-panel]`: panel

marker のない item は管理しない。nested `<pe-accordion>` の item と、nested item の parts は外側 host が管理しない。

## Single / multiple behavior

Native 構造は排他制御を `details[name]` に委ねる。

- 同じ `name`: 1 つを開くとブラウザが同じ group の他 item を閉じる
- `name` なし: 複数 item を同時に開ける

Managed 構造は default で multiple-open とし、host の `data-accordion-single` で single-open にする。初期 HTML に複数の `data-accordion-open` がある場合は最初の item を残す。user、programmatic、attribute、beforematch のいずれで開いた場合も single-open を維持する。

## State と styling hooks

host:

- 1 件以上 open: `data-state="open"`
- 全件 closed: `data-state="closed"`

item / trigger:

- `data-state="open | closed"`
- `data-index="0..."`
- disabled 時は `data-disabled`

Managed panel:

- `data-state="open | closed"`
- `data-index="0..."`
- open animation 開始時は `data-starting-style`
- close animation 中は `data-ending-style`
- `--accordion-panel-height`
- `--accordion-panel-width`

Native の `open` 属性と Managed の `data-accordion-open` はそれぞれ public state である。

## Managed animation lifecycle

Managed panel を開くときは次の順序で処理する。

1. `hidden` を外す
2. expanded size を測定して CSS variables を設定する
3. `data-starting-style` を付けて初期 style を確定する
4. 次の animation frame で `data-starting-style` を外す

閉じるときは `data-ending-style` を付け、panel 自身の finite CSS animations / transitions の完了後に `hidden` を設定する。animation がなければ直ちに hidden にする。終了待ち中に再度開かれた場合は pending hide を無効化する。

```css
[data-accordion-panel] {
  height: var(--accordion-panel-height);
  overflow: hidden;
  transition: height 150ms ease;
}

[data-accordion-panel][data-starting-style],
[data-accordion-panel][data-ending-style] {
  height: 0;
}
```

開くときは `data-starting-style` 適用中だけ `transition-duration: 0s` を一時的に上書きし、次フレームで外して enter transition を開始する。閉じた `hidden="until-found"` panel は Base UI と同様に `data-starting-style` を保持して高さ 0 の collapsed 状態を維持する。

## Disabled

```html
<pe-accordion data-accordion-disabled>...</pe-accordion>

<details data-accordion-item data-accordion-disabled>...</details>

<div data-accordion-item data-accordion-disabled>...</div>
```

root または item の `data-accordion-disabled` は user interaction を無視する。trigger は focusable のままとし、`aria-disabled="true"` と `data-disabled` を同期する。Managed trigger に authored native `disabled` がある場合も disabled として扱う。

programmatic API と beforematch open は disabled item も変更できる。disabled は user interaction の制限であり、controlled state の禁止ではない。

## Find in page

Native 構造はブラウザの `<details>` find-in-page 展開を利用する。

Managed 構造では host または panel に `data-accordion-hidden-until-found` を指定すると、closed panel を `hidden="until-found"` にする。`beforematch` では panel を同期的かつアニメーションなしで開き、`aria-expanded` と single-open state を更新する。アニメーションを省略するのは、ブラウザが検索結果へ scroll する前に最終 layout を確定するためである。

未対応ブラウザでは通常の hidden content として degrade し、trigger からの開閉は維持する。

## Programmatic API

```ts
accordion.value: string[];
accordion.disabled: boolean;
accordion.open(valueOrItem): void;
accordion.close(valueOrItem): void;
accordion.toggle(valueOrItem): void;
```

target element は `HTMLDetailsElement | HTMLDivElement`。`value` getter は open item の `data-accordion-value` 配列を返し、setter は両構造の state を同期する。

## Events

```txt
pe-accordion:open
pe-accordion:close
```

event は bubble / composed で、detail は以下を持つ。

```ts
{
  item: HTMLDetailsElement | HTMLDivElement;
  trigger: HTMLElement;
  summary: HTMLElement;
  panel: HTMLElement | null;
  value: string | null;
  index: number;
  reason: "trigger" | "programmatic" | "attribute" | "beforematch" | "native";
}
```

Native item の `panel` は `null`。native `toggle` event も隠さない。

既存 API 互換のため `summary` は `trigger` の alias として維持する。Native item では従来どおり `<summary>`、Managed item では trigger button を指す。新規コードは `trigger` を使う。

## Dynamic DOM と cleanup

- item と Managed parts の追加、削除、関連属性変更を監視する
- Native item の direct summary と Managed item の明示 parts を再解決する
- listener、ResizeObserver、MutationObserver、pending animation を disconnect 時に破棄する
- managed `data-state`、`data-disabled`、`data-index`、ARIA、panel ID / hidden / style を authored value へ戻す
- Native `open` / `name` と Managed `data-accordion-open` は public state として維持する

## MVP で未対応

- Native inner panel の size CSS variables と JavaScript animation orchestration
- Native 構造の JavaScript による `multiple` option
- Managed 構造の複数 group
- arrow key roving focus。APG 更新と Base UI v1.6.0 に合わせて採用しない
- cancelable before-change event

## Test coverage

`tests/accordion.browser.test.ts` で以下を検証する。

- Native semantics と `details[name]`
- Managed parts、ARIA、hidden、size CSS variables
- Native / Managed の state hooks、events、programmatic API、value array
- Managed single / multiple、external open attribute、beforematch
- Managed open / close animation lifecycle
- root / item disabled
- dynamic DOM、nested host、disconnect restoration
