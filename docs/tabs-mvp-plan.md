# Tabs MVP 要件・設計・残タスク

## 位置づけ

Tabs は、関連する複数の content panel から 1 つを選択表示する UI primitive である。native HTML だけでは tab pattern の ARIA 関係と keyboard interaction を満たせないため、`<pe-tabs>` が Light DOM 上の既存要素を enhance する。

ライブラリ全体の方針は [Plain Elements ライブラリ計画](./plain-elements-plan.md) を参照する。

参考実装:

- Base UI Tabs v1.6.0: https://github.com/mui/base-ui/tree/v1.6.0/packages/react/src/tabs

Base UI から activation mode、focus loop、disabled / missing fallback、activation direction、indicator geometry を取り入れる。React の controlled props、conditional rendering、hydration 処理は採用しない。

## 推奨マークアップ

```html
<pe-tabs data-tabs-value="profile">
  <div data-tabs-list aria-label="Account settings">
    <button type="button" data-tabs-trigger="profile">Profile</button>
    <button type="button" data-tabs-trigger="security">Security</button>
    <span data-tabs-indicator></span>
  </div>

  <section data-tabs-content="profile">...</section>
  <section data-tabs-content="security">...</section>
</pe-tabs>
```

trigger と panel は、`data-tabs-trigger` / `data-tabs-content` の同じ non-empty value で対応付ける。作者の要素を移動、生成、削除しない。

## Parts

- `<pe-tabs>`: lifecycle と selected value の境界
- `[data-tabs-list]`: 1 つの tab list
- `[data-tabs-trigger="value"]`: tab trigger
- `[data-tabs-content="value"]`: 対応 panel
- `[data-tabs-indicator]`: 任意の visual indicator。複数ある場合は最初を使う

nested `<pe-tabs>` 内の parts は外側 host が管理しない。

## Value と選択

選択値は host の `data-tabs-value` と `value` property に同期する。

初期選択順:

1. `data-tabs-value` に一致する enabled tab
2. 以前の選択値に一致する enabled tab
3. 最初の enabled tab
4. enabled tab がなければ `null`

公開 API:

```ts
tabs.value: string | null;
tabs.select(value: string, options?: { focus?: boolean }): void;
```

unknown または disabled value は `select()` できず、警告する。

## ARIA と focus

list:

- `role="tablist"`
- `aria-orientation="horizontal | vertical"`

trigger:

- `role="tab"`
- `aria-selected="true | false"`
- `aria-controls="panel-id"`
- active trigger は `tabindex="0"`
- inactive trigger は `tabindex="-1"`

panel:

- `role="tabpanel"`
- `aria-labelledby="trigger-id"`
- active panel は visible、`inert=false`、`tabindex="0"`
- inactive panel は `hidden`、`inert`、`tabindex="-1"`

trigger / panel に ID がなければ生成し、disconnect 時に元へ戻す。

## Keyboard interaction

horizontal:

- Left / Right: 前後の enabled tab へ移動

vertical:

- Up / Down: 前後の enabled tab へ移動

共通:

- Home / End: 最初 / 最後の enabled tab
- manual activation 時の Enter / Space: focused tab を選択
- `data-tabs-loop="true"` が既定。`false` なら端で停止

disabled 判定:

- native `<button disabled>`
- `aria-disabled="true"`

disabled tab は初期選択、roving focus、Home / End、programmatic selection から除外する。active tab が disabled になった場合は最初の enabled tab へ fallback する。

## Orientation と activation

```html
<pe-tabs
  data-tabs-orientation="vertical"
  data-tabs-activation="manual"
  data-tabs-loop="false"
>
```

- orientation: `horizontal`（既定）/ `vertical`
- activation: `automatic`（既定）/ `manual`

automatic は arrow navigation と同時に選択する。manual は focus だけを移し、Enter / Space で選択する。

## Styling state と indicator

trigger / panel:

- `data-state="active | inactive"`

host / list / trigger / panel / indicator:

- `data-activation-direction="left | right | up | down | none"`

indicator には active trigger の list 内座標を CSS variables で公開する。

- `--active-tab-left`
- `--active-tab-right`
- `--active-tab-top`
- `--active-tab-bottom`
- `--active-tab-width`
- `--active-tab-height`

resize、list scroll、selection change で再計算する。indicator の見た目は利用側の CSS で定義する。

## Events

```txt
pe-tabs:change
```

event は bubble / composed で、detail は以下を持つ。

```ts
{
  value: string | null;
  previousValue: string | null;
  trigger?: HTMLElement;
  panel?: HTMLElement;
  reason: "click" | "keyboard" | "programmatic" | "attribute" | "disabled" | "missing";
  activationDirection: "left" | "right" | "up" | "down" | "none";
}
```

## Dynamic DOM と cleanup

- childList と関連 data 属性、disabled の変更を監視する
- 動的に追加・削除された trigger / panel / indicator を再解決する
- active tab の削除時は enabled tab へ fallback し、`reason: "missing"` を通知する
- listener、MutationObserver、ResizeObserver は disconnect 時に破棄する
- role、ARIA、ID、tabindex、hidden、inert、style、state 属性は authored value へ戻す

## MVP で未対応

- external trigger / panel
- panel の mount / unmount
- transition lifecycle 用 starting / ending state
- indicator の portal
- RTL 専用の logical arrow reversal

## Test coverage

`tests/tabs.browser.test.ts` で以下を検証する。

- custom element registration
- ARIA と ID 関係
- click / automatic / manual activation
- horizontal / vertical keyboard
- disabled skip と fallback
- loop 無効
- indicator CSS variables
- programmatic / attribute selection
- dynamic DOM、nested host、disconnect restoration
