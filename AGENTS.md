# AGENTS.md

このファイルは、リポジトリ全体で作業するコーディングエージェント向けの共通指示です。ユーザーからの明示的な指示がある場合は、そちらを優先してください。

## Project Overview

- Plain Elements は、スタイルを持たないアクセシブルな UI primitive を提供する TypeScript 製 Web Components ライブラリです。
- 実装は framework 非依存で、Light DOM と progressive enhancement を採用します。
- 現在の主要コンポーネントは Dialog、Popover、Tooltip、Tabs、Accordion、Collapsible です。
- ライブラリ本体は `src/`、ブラウザテストは `tests/`、使用例は `examples/` にあります。
- ドキュメントサイトは別リポジトリ(`k-s-h-r/plain-elements-docs`)で管理されています。
- 設計方針とコンポーネント要件は `docs/` の計画書を参照してください。

## Commands

- ルート依存関係を固定バージョンでインストール: `npm ci`
- デモ用開発サーバーを起動: `npm run dev`
- 全ブラウザテストを実行: `npm test`
- 単一テストファイルを実行: `npm test -- tests/dialog.browser.test.ts`
- headed browser でテストを実行: `npm run test:headed`
- 型チェック: `npm run typecheck`
- ESM、IIFE、型定義をビルド: `npm run build`
- Playwright の Chromium が未導入の場合: `npx playwright install chromium`

このリポジトリには lint、format 専用スクリプトはありません。存在しないコマンドを前提にしないでください。

## Architecture and Code Style

- TypeScript の strict mode を維持し、公開 API とイベント detail には明示的な型を付けます。
- 既存コードに合わせ、インデントはスペース2つ、文字列はダブルクォート、文末にはセミコロンを使います。
- platform に十分な機能がある場合は、独自実装より native API を優先します。
- Shadow DOM は使いません。Custom Element は描画ではなく lifecycle、listener、observer、状態同期の境界として使います。
- 利用者が用意した HTML 構造を変更しません。要素の生成、ラップ、移動、並べ替え、削除、`innerHTML` の書き換え、portal の作成は避けてください。
- DOM への変更は、仕様化された `data-*`、`aria-*`、ID、`tabindex`、および位置計算に必要な最小限の inline style に限定します。
- public state は安定した `data-*` 属性で公開し、native event を隠さないでください。追加する custom event は原則として bubble かつ composed にします。
- 接続時に登録した event listener と observer は、切断時に必ず破棄します。動的な DOM 変更と再接続も考慮してください。
- コンポーネントの実装は、保守や挙動の検証がしやすいよう、小さく明示的で読みやすく保ちます。

## Testing

- テストは Vitest Browser Mode と Playwright Chromium を使い、`tests/*.browser.test.ts` に配置します。
- 振る舞いを変更した場合は、正常系だけでなく keyboard、focus、dismiss、動的 DOM、再接続、属性復元を必要に応じて検証します。
- accessibility に関わる `aria-*`、role、focus management、native semantics の後退をテストで防いでください。
- 各テストは DOM と mock を後始末し、実行順序に依存させないでください。
- 実装変更後は最低限 `npm test` と `npm run typecheck` を実行し、配布形式に影響する変更では `npm run build` も実行します。

## Documentation

- public API、属性、イベント、browser support を変更した場合は、ドキュメントリポジトリ(`k-s-h-r/plain-elements-docs`)の対応するページとデモの同期が必要です。
- 実装とドキュメントが食い違う場合は、現行仕様を確認して両方を整合させます。計画書だけを根拠に既存の公開動作を壊さないでください。

## Git Workflow

- 変更は依頼範囲に限定し、無関係な差分を変更・削除しません。
- コミットを求められた場合は、既存履歴に合わせて変更内容を表す短い命令形のメッセージを使います。
- テストと型チェックが失敗した状態で完了扱いにせず、解消できない既存失敗は明示します。

## Boundaries

- `node_modules/` と `dist/` は生成物です。手動編集せず、対応するソースまたはビルド処理を変更してください。
- `package-lock.json` は手動編集せず、npm コマンドで更新します。
- 依存関係の追加、公開 API の互換性を壊す変更、browser support の縮小は、明示的な要件なしに行いません。
- accessibility のための native semantics や keyboard interaction を、見た目や実装の簡略化を理由に削除しません。
