# Collapsible MVP 要件・設計・残タスク

## 位置づけ

Collapsible は、1 つの独立した content region を任意の trigger で開閉する disclosure primitive である。Accordion と異なり、作者が `<details>` / `<summary>` の content model に制約されたくない場合に使う。

ライブラリ全体の方針は [Plain Elements ライブラリ計画](./plain-elements-plan.md) を参照する。

参考実装:

- Base UI Collapsible v1.6.0: https://github.com/mui/base-ui/tree/v1.6.0/packages/react/src/collapsible

Base UI から open / disabled state、trigger-panel ARIA、`hidden="until-found"`、beforematch、panel size CSS variables、change reasons を取り入れる。React の render、controlled hook、conditional mount、animation orchestration は採用しない。

## Accordion との使い分け

Accordion は native `<details>` / `<summary>` が要件を満たす related disclosure group に使う。

Collapsible は以下の場合に使う。

- 1 つの独立した disclosure
- trigger と panel を同じ `<details>` 内に置けない layout
- panel を `<section>` など内容に合う element にしたい
- button と panel の関係を programmatic に管理したい

native HTML で要件を満たせる場合は Accordion を優先する。

## 推奨マークアップ

```html
<pe-collapsible>
  <button type="button" data-collapsible-trigger>
    Project details
  </button>

  <section data-collapsible-panel aria-label="Project details">
    ...
  </section>
</pe-collapsible>
```

`<button>` は native interactive element として keyboard、focus、accessible name を持つ。panel は通常の flow content であり、内容に合う `<div>` / `<section>` などを作者が選ぶ。

## Parts

- `<pe-collapsible>`: lifecycle と open state の境界
- `[data-collapsible-trigger]`: 1 つ以上の trigger
- `[data-collapsible-panel]`: 1 つの panel。複数ある場合は最初を使う

parts は host 内に置く。nested `<pe-collapsible>` の parts は外側 host が管理しない。

## Open state

初期 open:

```html
<pe-collapsible data-collapsible-open>...</pe-collapsible>
```

state は以下へ同期する。

- host: `data-collapsible-open`、`data-state="open | closed"`
- trigger: `data-state="open | closed"`、`aria-expanded`
- panel: `data-state="open | closed"`、`hidden`

panel に ID がなければ生成し、trigger の `aria-controls` から参照する。

## Disabled

root disabled:

```html
<pe-collapsible data-collapsible-disabled>...</pe-collapsible>
```

trigger disabled:

```html
<button data-collapsible-trigger data-collapsible-disabled>...</button>
```

disabled 判定:

- root / trigger の `data-collapsible-disabled`
- native `<button disabled>`
- authored `aria-disabled="true"`

user click を無視し、`data-disabled` と `aria-disabled` を同期する。programmatic API と beforematch open は disabled によって禁止しない。

## Find in page

```html
<pe-collapsible data-collapsible-hidden-until-found>
  ...
</pe-collapsible>
```

または panel に `data-collapsible-hidden-until-found` を付ける。

closed panel を `hidden="until-found"` にし、`beforematch` で開く。未対応ブラウザでは通常の hidden content として degrade し、trigger からの開閉は維持する。この機能は Baseline 2025 の必須機能ではなく optional progressive enhancement とする。

## Programmatic API

```ts
collapsible.open: boolean;
collapsible.disabled: boolean;
collapsible.show(trigger?): void;
collapsible.hide(trigger?): void;
collapsible.toggle(trigger?): void;
```

`open` は `data-collapsible-open` を反映する。attribute を外部から変更した場合も state を同期する。

## Events

```txt
pe-collapsible:open
pe-collapsible:close
```

event は bubble / composed で、detail は以下を持つ。

```ts
{
  open: boolean;
  panel: HTMLElement;
  trigger?: HTMLElement;
  reason: "trigger" | "programmatic" | "attribute" | "beforematch";
}
```

## Panel size CSS variables

open panel の expanded size を測定し、inline CSS variables として公開する。

- `--collapsible-panel-height`
- `--collapsible-panel-width`

作者はこれらを transition / animation に使える。panel は `data-starting-style` / `data-ending-style` と animation lifecycle を管理し、finite CSS transitions / animations の完了後に `hidden` を適用する。

```css
[data-collapsible-panel] {
  height: var(--collapsible-panel-height);
  overflow: hidden;
  transition: height 150ms ease-out;
}

[data-collapsible-panel][data-starting-style],
[data-collapsible-panel][data-ending-style] {
  height: 0;
}
```

開くときは `data-starting-style` 適用中だけ `transition-duration: 0s` を一時的に上書きする。閉じた `hidden="until-found"` panel は `data-starting-style` を保持する。

## Dynamic DOM と cleanup

- childList と関連 data 属性、native disabled の変更を監視する
- trigger / panel の追加、削除、置換を再解決する
- listener と MutationObserver を disconnect 時に破棄する
- trigger / panel の ID、ARIA、hidden、style、state 属性を authored value へ戻す
- host の open state は public state として維持する

## MVP で未対応

- host 外の external trigger
- 複数 panel
- panel の mount / unmount
- cancelable before-change event

## Test coverage

`tests/collapsible.browser.test.ts` で以下を検証する。

- custom element registration
- trigger / panel ARIA と生成 ID
- trigger interaction と custom events
- property / methods / attribute control
- disabled interaction
- hidden-until-found / beforematch
- dynamic DOM、nested host、disconnect restoration
