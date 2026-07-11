# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-07-11

### Fixed

- Treat `data-dialog-trigger`, `data-tooltip-trigger`, and `data-popover-trigger` values of `"true"` as empty marker attributes so internal triggers work from React JSX boolean attributes ([#4](https://github.com/k-s-h-r/plain-elements/issues/4)).

## [0.1.0] - 2026-07-08

Initial release.

### Added

- `<pe-dialog>` — modal behavior over a native `<dialog>` (trigger wiring, dismiss, forms, focus management, events).
- `<pe-popover>` — interactive non-modal popup using the native Popover API with anchored positioning.
- `<pe-tooltip>` — hover/focus tooltip with sides, alignment, delays, and safe pointer paths.
- `<pe-tabs>` — tab list with keyboard navigation, orientation, and activation modes.
- `<pe-accordion>` — native `<details>`/`<summary>` disclosures with an optional managed mode for measured animations.
- `<pe-collapsible>` — independent disclosure region for a single panel with find-in-page support.
- ESM build with per-component subpath exports (`plain-elements/dialog`, etc.) and an IIFE bundle for script-tag usage.
- TypeScript type definitions for all public APIs and event details.

[0.1.1]: https://github.com/k-s-h-r/plain-elements/releases/tag/v0.1.1
[0.1.0]: https://github.com/k-s-h-r/plain-elements/releases/tag/v0.1.0
