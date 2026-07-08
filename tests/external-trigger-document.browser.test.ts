import { afterEach, expect, test } from "vitest";
import { DialogElement } from "../src/dialog";
import { PopoverElement } from "../src/popover";
import { TooltipElement } from "../src/tooltip";

// Characterization tests for D9: external trigger detection via document-level
// observers must survive dynamic trigger changes, removal, unrelated DOM churn,
// and multiple coexisting instances.

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 20));
  await Promise.resolve();
}

afterEach(() => {
  document.body.replaceChildren();
});

test("dialog detects a dynamically added external trigger and syncs attributes", async () => {
  document.body.innerHTML = `
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.dataset.dialogTrigger = "settings-dialog";
  trigger.textContent = "Settings";
  document.body.prepend(trigger);

  await settle();

  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger.click();

  expect(dialog?.open).toBe(true);
  expect(trigger.dataset.state).toBe("open");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(trigger.getAttribute("aria-controls")).toBe(dialog?.id);
});

test("dialog restores an external trigger when it stops being managed", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-dialog-trigger="settings-dialog"
      data-state="idle"
      aria-controls="authored"
      aria-expanded="false"
    >Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );

  trigger?.click();
  expect(trigger?.dataset.state).toBe("open");

  trigger?.removeAttribute("data-dialog-trigger");
  await settle();

  expect(trigger?.dataset.state).toBe("idle");
  expect(trigger?.getAttribute("aria-controls")).toBe("authored");
  expect(trigger?.getAttribute("aria-expanded")).toBe("false");
});

test("popover keeps external triggers working after unrelated DOM churn", async () => {
  document.body.innerHTML = `
    <button type="button" data-popover-trigger="filters-popover">Filters</button>
    <pe-popover id="filters-popover">
      <div data-popover-content aria-label="Filters" hidden>Content</div>
    </pe-popover>
  `;

  await customElements.whenDefined("pe-popover");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-popover-trigger='filters-popover']"
  );
  const content = document.querySelector<HTMLElement>("[data-popover-content]");

  for (let index = 0; index < 5; index += 1) {
    const node = document.createElement("div");
    node.textContent = `noise-${index}`;
    document.body.append(node);
    await settle();
    node.remove();
    await settle();
  }

  trigger?.click();
  await settle();

  expect(content?.matches(":popover-open")).toBe(true);
  expect(trigger?.getAttribute("aria-controls")).toBe(content?.id);
});

test("tooltip detects removal of an external trigger and restores authored attributes", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-tooltip-trigger="save-tip"
      aria-describedby="authored"
    >Save</button>
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.focus();
  await settle();
  expect(trigger?.getAttribute("aria-describedby")).toBe(
    `authored ${content?.id}`
  );

  trigger?.removeAttribute("data-tooltip-trigger");
  await settle();

  expect(trigger?.getAttribute("aria-describedby")).toBe("authored");
});

test("multiple dialog instances keep distinct external triggers after DOM churn", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="dialog-a">A</button>
    <button type="button" data-dialog-trigger="dialog-b">B</button>
    <pe-dialog id="dialog-a"><dialog aria-label="A"></dialog></pe-dialog>
    <pe-dialog id="dialog-b"><dialog aria-label="B"></dialog></pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const triggerA = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='dialog-a']"
  );
  const triggerB = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='dialog-b']"
  );
  const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog"));

  document.body.append(document.createElement("section"));
  await settle();
  document.body.querySelector("section")?.remove();
  await settle();

  triggerA?.click();
  expect(dialogs[0]?.open).toBe(true);
  expect(dialogs[1]?.open).toBe(false);

  triggerB?.click();
  expect(dialogs[1]?.open).toBe(true);
});

test("multiple popover instances bind dynamically added external triggers independently", async () => {
  document.body.innerHTML = `
    <pe-popover id="popover-a">
      <div data-popover-content aria-label="A" hidden>A</div>
    </pe-popover>
    <pe-popover id="popover-b">
      <div data-popover-content aria-label="B" hidden>B</div>
    </pe-popover>
  `;

  await customElements.whenDefined("pe-popover");

  const triggerA = document.createElement("button");
  triggerA.type = "button";
  triggerA.dataset.popoverTrigger = "popover-a";
  triggerA.textContent = "Open A";

  const triggerB = document.createElement("button");
  triggerB.type = "button";
  triggerB.dataset.popoverTrigger = "popover-b";
  triggerB.textContent = "Open B";

  document.body.prepend(triggerB);
  document.body.prepend(triggerA);
  await settle();

  const contents = Array.from(
    document.querySelectorAll<HTMLElement>("[data-popover-content]")
  );

  triggerA.click();
  await settle();
  expect(contents[0]?.matches(":popover-open")).toBe(true);
  expect(contents[1]?.matches(":popover-open")).toBe(false);

  triggerB.click();
  await settle();
  expect(contents[1]?.matches(":popover-open")).toBe(true);
});

test("multiple tooltip hosts keep external triggers after unrelated DOM churn", async () => {
  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger="tip-a">A</button>
    <button type="button" data-tooltip-trigger="tip-b">B</button>
    <pe-tooltip id="tip-a"><span data-tooltip-content>A</span></pe-tooltip>
    <pe-tooltip id="tip-b"><span data-tooltip-content>B</span></pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const triggerA = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='tip-a']"
  );
  const triggerB = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='tip-b']"
  );
  const contents = Array.from(
    document.querySelectorAll<HTMLElement>("[data-tooltip-content]")
  );

  for (let index = 0; index < 4; index += 1) {
    const wrapper = document.createElement("div");
    wrapper.textContent = "carousel-slide";
    document.body.append(wrapper);
    await settle();
    wrapper.remove();
    await settle();
  }

  triggerA?.focus();
  await settle();
  expect(contents[0]?.dataset.state).toBe("open");
  expect(contents[1]?.dataset.state).not.toBe("open");

  triggerB?.focus();
  await settle();
  expect(contents[1]?.dataset.state).toBe("open");
});
