import { afterEach, expect, test } from "vitest";
import "../src/collapsible";
import "../src/tabs";
import "../src/dialog";

// Characterization tests: freeze the "absent vs empty-string vs value"
// distinction of authored-attribute restoration before the shared attribute
// helpers (restoreAttribute / captureAttributes / restoreSnapshot) are
// extracted. A snapshot of `null` must restore to *absent*, while an empty
// string must restore to `""`.

async function microtask(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  document.body.replaceChildren();
});

test("collapsible restores an absent authored data-state as absent", async () => {
  document.body.innerHTML = `
    <pe-collapsible>
      <button type="button" data-collapsible-trigger>Toggle</button>
      <div data-collapsible-panel>Panel</div>
    </pe-collapsible>
  `;

  const host = document.querySelector("pe-collapsible") as HTMLElement;
  const trigger = document.querySelector(
    "[data-collapsible-trigger]"
  ) as HTMLElement;

  // Enhancement adds managed attributes.
  expect(trigger.hasAttribute("aria-expanded")).toBe(true);
  expect(host.hasAttribute("data-state")).toBe(true);

  host.remove();
  await microtask();

  // The host had no authored data-state, so it must be fully removed.
  expect(host.hasAttribute("data-state")).toBe(false);
});

test("collapsible restores an empty authored aria-controls as empty string", async () => {
  document.body.innerHTML = `
    <pe-collapsible>
      <button type="button" data-collapsible-trigger aria-controls="">Toggle</button>
      <div data-collapsible-panel>Panel</div>
    </pe-collapsible>
  `;

  const host = document.querySelector("pe-collapsible") as HTMLElement;
  const trigger = document.querySelector(
    "[data-collapsible-trigger]"
  ) as HTMLElement;

  // Enhancement overwrites aria-controls with the generated panel id.
  expect(trigger.getAttribute("aria-controls")).not.toBe("");
  expect(trigger.getAttribute("aria-controls")).toBeTruthy();

  host.remove();
  await microtask();

  // The authored value was an empty string, which must be restored verbatim
  // (present but empty), not removed.
  expect(trigger.hasAttribute("aria-controls")).toBe(true);
  expect(trigger.getAttribute("aria-controls")).toBe("");
});

test("tabs restores an absent authored role on the list as absent", async () => {
  document.body.innerHTML = `
    <pe-tabs data-tabs-value="a">
      <div data-tabs-list>
        <button data-tabs-trigger="a">A</button>
        <button data-tabs-trigger="b">B</button>
      </div>
      <div data-tabs-content="a">Panel A</div>
      <div data-tabs-content="b">Panel B</div>
    </pe-tabs>
  `;

  const host = document.querySelector("pe-tabs") as HTMLElement;
  const list = document.querySelector("[data-tabs-list]") as HTMLElement;

  expect(list.getAttribute("role")).toBe("tablist");

  host.remove();
  await microtask();

  expect(list.hasAttribute("role")).toBe(false);
});

test("tabs restores an empty authored role on the list as empty string", async () => {
  document.body.innerHTML = `
    <pe-tabs data-tabs-value="a">
      <div data-tabs-list role="">
        <button data-tabs-trigger="a">A</button>
        <button data-tabs-trigger="b">B</button>
      </div>
      <div data-tabs-content="a">Panel A</div>
      <div data-tabs-content="b">Panel B</div>
    </pe-tabs>
  `;

  const host = document.querySelector("pe-tabs") as HTMLElement;
  const list = document.querySelector("[data-tabs-list]") as HTMLElement;

  expect(list.getAttribute("role")).toBe("tablist");

  host.remove();
  await microtask();

  expect(list.hasAttribute("role")).toBe(true);
  expect(list.getAttribute("role")).toBe("");
});
