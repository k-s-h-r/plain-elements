# Plain Elements

Unstyled, accessible UI primitives delivered as framework-agnostic Web Components.

Plain Elements adds behavior — not markup or styling — to the HTML you already write. Each component is a Custom Element that operates in the **Light DOM** (no Shadow DOM) and follows **progressive enhancement**: it handles lifecycle, listeners, observers, and state synchronization, while you keep full control of your DOM structure and CSS.

- **Styleless** — you style everything with your own CSS. No design opinions ship with the library.
- **Accessible** — native semantics, ARIA, keyboard interaction, and focus management are handled for you.
- **Native-first** — built on platform APIs (`<dialog>`, the Popover API, `<details>`/`<summary>`) instead of reimplementing them.
- **Framework-agnostic** — plain custom elements, usable with any framework or none.

Documentation: <https://plain-elements.com/>

## Components

| Component | Element | Description |
|-----------|---------|-------------|
| Dialog | `<pe-dialog>` | Modal behavior over a native `<dialog>` (dismiss, forms, events). |
| Popover | `<pe-popover>` | Interactive non-modal popup using the native Popover API. |
| Tooltip | `<pe-tooltip>` | Hover/focus tooltip with sides, alignment, and delays. |
| Tabs | `<pe-tabs>` | Tab list with keyboard navigation and activation modes. |
| Accordion | `<pe-accordion>` | Native disclosure behavior with optional managed animation. |
| Collapsible | `<pe-collapsible>` | Independent disclosure region for a single panel. |

## Installation

```bash
npm install plain-elements
```

Or build from source:

```bash
npm ci
npm run build
```

The build produces ES modules and an IIFE bundle in `dist/`. For static HTML or CMS pages, copy the IIFE build to your assets folder and load it with a script tag:

```html
<script src="/assets/plain-elements.iife.js" defer></script>
```

Place the script in `<head>` with `defer`, or before `</body>`. Both avoid parser-blocking and work with authored markup in the page body.

## Usage

Importing the package registers every custom element:

```ts
import "plain-elements";
```

Or register only the components you need via subpath imports:

```ts
import "plain-elements/dialog";
import "plain-elements/popover";
import "plain-elements/tooltip";
import "plain-elements/tabs";
import "plain-elements/accordion";
import "plain-elements/collapsible";
```

Enhance your existing markup — for example, a collapsible region:

```html
<pe-collapsible>
  <button type="button" data-collapsible-trigger>Details</button>
  <div data-collapsible-panel>Additional details.</div>
</pe-collapsible>
```

Hosts use `display: contents` so they do not affect layout. Style the native elements and your own controls directly:

```css
pe-dialog,
pe-popover,
pe-tabs,
pe-accordion,
pe-collapsible,
pe-tooltip {
  display: contents;
}
```

See the [Quick start guide](https://plain-elements.com/getting-started/) for the anatomy of each component.

## Development

```bash
npm ci                 # install pinned dependencies
npm run dev            # start the demo dev server
npm test               # run browser tests (Vitest + Playwright Chromium)
npm run typecheck      # TypeScript strict type checking
npm run build          # build ESM, IIFE, and type definitions
```

Playwright's Chromium is required for the tests. Install it once with:

```bash
npx playwright install chromium
```

## License

[MIT](./LICENSE) © k-s-h-r
