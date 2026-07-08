# API 一貫性の設計判断

Plain Elements は未公開であり、破壊的変更のコストが最も低い今のうちに、横断的な API の揺れを整理する。本ドキュメントは調査で判明した各項目について「統一する / 現状維持する」の判断と理由を記録し、採用した旧 API → 新 API の対応表を残す。

native セマンティクス (例: `<details open>`) を上書きするような統一は行わない。native-first の方針を優先する。

## 判断サマリ

| 項目 | 判断 | 内容 |
|------|------|------|
| 命令的メソッド名 | 統一する | 開く=`open()`、閉じる=`close()`、切替=`toggle()` に統一。状態の読み取りは `readonly isOpen` getter。 |
| `open` getter | 統一する | Dialog / Popover / Tooltip に `readonly isOpen` getter を追加。 |
| `data-state` 値 | 部分的に統一 (ルール化) | 開閉系は `"open"/"closed"`、選択系 (Tabs) は `"active"/"inactive"` を維持し、ルールとして文書化。 |
| 初期 open 指定 | 現状維持 | native セマンティクス優先のため、各コンポーネントの現行属性を維持。 |
| disabled API | 現状維持 | 既存の各コンポーネント仕様を維持。今回のスコープ外。 |
| イベント detail 形状 | 現状維持 | コンポーネント固有情報を含むため統一しない。 |
| `reason` リテラル | 現状維持 (コア命名は共通) | 共通コア値 `trigger`/`programmatic`/`attribute` の命名は揃っている。コンポーネント固有値は維持。 |
| close control 配置 | 現状維持 | Dialog は host 内、Popover は content 内。DOM 構造上の必然性があるため維持。 |

## 詳細と理由

### 1. 命令的メソッド名の統一

**判断: 統一する。**

- 開く操作は `open()`、閉じる操作は `close()`、切り替えは `toggle()` に統一する。
- 状態の読み取りは `readonly isOpen` getter に統一する。書き込み可能な `open` プロパティは提供しない (メソッド `open()` と名前が衝突し、命令的操作と状態読み取りの区別が曖昧になるため)。

理由:

- Dialog / Popover / Tooltip / Managed Accordion は既に `open()/close()/toggle()` を採用しており、Collapsible の `show()/hide()` だけが例外だった。多数派に合わせることで学習コストを下げる。
- 状態を getter と setter の両方に持つと「命令 (副作用) なのか状態代入なのか」が曖昧になる。読み取り専用の `isOpen` に分離することで、状態変更は必ずメソッド経由という一貫したメンタルモデルになる。

未公開のため deprecated alias は残さず削除する。

### 2. `isOpen` getter の追加

**判断: 統一する。**

Dialog / Popover / Tooltip ホストに `readonly isOpen` getter を追加し、全開閉系コンポーネントで状態を同じ API で読めるようにする。内部状態のソースは各コンポーネントの既存の真実源に委譲する:

- Dialog: `<dialog>.open`
- Popover: native Popover API の open 状態 (`:popover-open`)
- Tooltip: `data-state === "open"`
- Collapsible: 内部 open フラグ

### 3. `data-state` 値のルール化

**判断: 開閉系は `"open"/"closed"`、選択系は `"active"/"inactive"`。**

Tabs の trigger/panel は「開閉」ではなく「選択」のセマンティクスであり、`"active"/"inactive"` の方が意味的に正確。無理に `open/closed` へ寄せると意味が崩れる。よって次のルールとして文書化する:

- 開閉状態を表す要素: `data-state="open" | "closed"`
- 選択状態を表す要素 (Tabs): `data-state="active" | "inactive"`

### 4. 現状維持とした項目

- **初期 open 指定**: `data-collapsible-open` / `data-accordion-open` / `<details open>` などは native セマンティクスと progressive enhancement に沿っているため維持する。
- **disabled API**: 既存仕様を維持。統一は別タスクのスコープ。
- **イベント detail 形状**: 各コンポーネント固有の参照 (`dialog` / `content` / `panel` など) を含むため、無理な統一はしない。
- **`reason` リテラル**: 共通コア値 (`trigger` / `programmatic` / `attribute`) の命名は既に揃っている。Dialog 固有の `cancel` / `form` / `close-control` / `native` などは意味的に必要なため維持する。
- **close control 配置**: Dialog の `[data-dialog-close]` は host 内、Popover の `[data-popover-close]` は content (popover) 内という配置は、それぞれの DOM 構造 (native `<dialog>` と Popover API) に由来する必然性があるため維持する。

## 旧 API → 新 API 対応表 (フェーズ 2 実装)

| コンポーネント | 旧 API | 新 API |
|----------------|--------|--------|
| Collapsible | `show(trigger?)` | `open(trigger?)` |
| Collapsible | `hide(trigger?)` | `close(trigger?)` |
| Collapsible | `open` getter/setter (`el.open` / `el.open = true`) | `readonly isOpen` getter + `open()` / `close()` メソッド |
| Dialog | (getter なし) | `readonly isOpen` getter を追加 |
| Popover | (getter なし) | `readonly isOpen` getter を追加 |
| Tooltip | (getter なし) | `readonly isOpen` getter を追加 |

移行例 (Collapsible):

```js
// Before
el.show();
el.hide();
el.open = true;
const state = el.open;

// After
el.open();
el.close();
el.open();
const state = el.isOpen;
```
