import { afterEach, expect, test, vi } from "vitest";
import { CollapsibleElement } from "../src/collapsible";
import { DialogElement } from "../src/dialog";
import { PopoverElement } from "../src/popover";
import { TabsElement } from "../src/tabs";
import { TooltipElement } from "../src/tooltip";
import "../src/index";

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test("does not warn when a host upgrades before its authored children are parsed", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(document, "readyState", "get").mockReturnValue("loading");

  const host = document.createElement("pe-dialog");
  host.id = "settings-dialog";
  document.body.append(host);

  await nextMicrotask();

  expect(warn).not.toHaveBeenCalledWith(
    "[pe-dialog] Missing <dialog> inside <pe-dialog>."
  );

  host.innerHTML = '<dialog aria-label="Settings"></dialog>';

  await nextMicrotask();

  expect(warn).not.toHaveBeenCalledWith(
    "[pe-dialog] Missing <dialog> inside <pe-dialog>."
  );
  expect(host).toBeInstanceOf(DialogElement);
});

test("defers external trigger validation until DOMContentLoaded during parse", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(document, "readyState", "get").mockReturnValue("loading");

  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="missing-dialog">Missing</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await nextMicrotask();

  expect(warn).not.toHaveBeenCalledWith(
    '[pe-dialog] [data-dialog-trigger="missing-dialog"] does not match an enhanced dialog.'
  );

  vi.spyOn(document, "readyState", "get").mockReturnValue("interactive");
  document.dispatchEvent(new Event("DOMContentLoaded"));
  await nextMicrotask();

  expect(warn).toHaveBeenCalledWith(
    '[pe-dialog] [data-dialog-trigger="missing-dialog"] does not match an enhanced dialog.'
  );
});

test("does not warn for valid authored markup while the document is still loading", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(document, "readyState", "get").mockReturnValue("loading");

  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
    <pe-popover id="filters-popover">
      <div data-popover-content aria-label="Filters" hidden>Filters</div>
    </pe-popover>
    <pe-tooltip id="save-tip">
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content>Saved.</span>
    </pe-tooltip>
    <pe-tabs>
      <div data-tabs-list>
        <button type="button" data-tabs-trigger="a" data-tabs-value="a">A</button>
      </div>
      <div data-tabs-content="a">Panel</div>
    </pe-tabs>
    <pe-collapsible>
      <button type="button" data-collapsible-trigger>Toggle</button>
      <div data-collapsible-panel>Panel</div>
    </pe-collapsible>
  `;

  await nextMicrotask();

  expect(warn).not.toHaveBeenCalled();
  expect(document.querySelector("pe-dialog")).toBeInstanceOf(DialogElement);
  expect(document.querySelector("pe-popover")).toBeInstanceOf(PopoverElement);
  expect(document.querySelector("pe-tooltip")).toBeInstanceOf(TooltipElement);
  expect(document.querySelector("pe-tabs")).toBeInstanceOf(TabsElement);
  expect(document.querySelector("pe-collapsible")).toBeInstanceOf(
    CollapsibleElement
  );
});

test("still warns for a genuinely missing dialog after the document has loaded", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  const host = document.createElement("pe-dialog");
  document.body.append(host);

  await nextMicrotask();

  expect(warn).toHaveBeenCalledWith(
    "[pe-dialog] Missing <dialog> inside <pe-dialog>."
  );
});
