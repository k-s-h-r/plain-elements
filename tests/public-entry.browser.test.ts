import { expect, test } from "vitest";
import * as api from "../src/index";
import "../src/index";

// Characterization test: freezes the public surface (custom element
// registration + exported classes) before internal refactoring. If an
// extraction accidentally drops a registration or export, this fails.

const REGISTERED_ELEMENTS = [
  "pe-accordion",
  "pe-collapsible",
  "pe-dialog",
  "pe-popover",
  "pe-tabs",
  "pe-tooltip"
] as const;

test("registers every custom element by importing the package entry", () => {
  for (const name of REGISTERED_ELEMENTS) {
    expect(customElements.get(name), name).toBeTypeOf("function");
  }
});

test("exports the public element classes from the package entry", () => {
  expect(api.AccordionElement).toBe(customElements.get("pe-accordion"));
  expect(api.CollapsibleElement).toBe(customElements.get("pe-collapsible"));
  expect(api.DialogElement).toBe(customElements.get("pe-dialog"));
  expect(api.PopoverElement).toBe(customElements.get("pe-popover"));
  expect(api.TabsElement).toBe(customElements.get("pe-tabs"));
  expect(api.TooltipElement).toBe(customElements.get("pe-tooltip"));
});

test("registered elements extend HTMLElement", () => {
  for (const name of REGISTERED_ELEMENTS) {
    const ctor = customElements.get(name);
    expect(ctor, name).toBeDefined();
    expect(
      ctor && Object.create(ctor.prototype) instanceof HTMLElement,
      name
    ).toBe(true);
  }
});
