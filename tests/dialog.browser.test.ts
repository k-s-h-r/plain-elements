import { afterEach, expect, test, vi } from "vitest";
import { DialogElement, type DialogEventDetail } from "../src/dialog";

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => {
    window.setTimeout(resolve, 20);
  });
  await Promise.resolve();
}

function waitForDialogEvent(
  host: DialogElement,
  type: "pe-dialog:open" | "pe-dialog:close"
): Promise<CustomEvent<DialogEventDetail>> {
  return new Promise((resolve) => {
    host.addEventListener(
      type,
      (event) => resolve(event as CustomEvent<DialogEventDetail>),
      { once: true }
    );
  });
}

function waitForClosedDialogSync(
  host: DialogElement
): Promise<CustomEvent<DialogEventDetail>> {
  return waitForDialogEvent(host, "pe-dialog:close");
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const dialog of Array.from(document.querySelectorAll("dialog"))) {
    if (dialog.open) {
      dialog.close();
    }
  }

  document.body.replaceChildren();
});

test("defines pe-dialog custom element", () => {
  expect(customElements.get("pe-dialog")).toBe(DialogElement);
});

test("opens a native dialog from an external trigger and syncs attributes", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings">
        <button type="button" data-dialog-close>Close</button>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const host = document.querySelector<DialogElement>("pe-dialog");
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  expect(trigger).toBeTruthy();
  expect(host).toBeTruthy();
  expect(dialog).toBeTruthy();

  expect(host?.isOpen).toBe(false);

  trigger?.click();

  expect(dialog?.open).toBe(true);
  expect(host?.isOpen).toBe(true);
  expect(host?.dataset.state).toBe("open");
  expect(dialog?.dataset.state).toBe("open");
  expect(trigger?.dataset.state).toBe("open");
  expect(trigger?.getAttribute("aria-controls")).toBe(dialog?.id);
  expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");
});

test("closes a dialog from a close control", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings">
        <button type="button" data-dialog-close value="close">Close</button>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const closeButton =
    document.querySelector<HTMLButtonElement>("[data-dialog-close]");
  const host = document.querySelector<DialogElement>("pe-dialog");
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  expect(host).toBeTruthy();

  const closePromise = waitForClosedDialogSync(host!);

  trigger?.click();
  closeButton?.click();
  await closePromise;

  expect(dialog?.open).toBe(false);
  expect(host?.isOpen).toBe(false);
  expect(dialog?.returnValue).toBe("close");
  expect(dialog?.dataset.state).toBe("closed");
  expect(trigger?.dataset.state).toBe("closed");
  expect(trigger?.getAttribute("aria-expanded")).toBe("false");
});

test("supports an internal empty trigger", async () => {
  document.body.innerHTML = `
    <pe-dialog>
      <button type="button" data-dialog-trigger>Open</button>
      <dialog aria-label="Generated ID dialog"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger]"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger?.click();

  expect(dialog?.id).toMatch(/^pe-dialog-surface-/);
  expect(dialog?.open).toBe(true);
  expect(trigger?.getAttribute("aria-controls")).toBe(dialog?.id);
});

test('treats data-dialog-trigger="true" as an internal empty trigger', async () => {
  document.body.innerHTML = `
    <pe-dialog>
      <button type="button" data-dialog-trigger="true">Open</button>
      <dialog aria-label="React-style trigger dialog"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    '[data-dialog-trigger="true"]'
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger?.click();

  expect(dialog?.open).toBe(true);
  expect(trigger?.getAttribute("aria-controls")).toBe(dialog?.id);
});

test("derives aria-labelledby from data-dialog-title", async () => {
  document.body.innerHTML = `
    <pe-dialog id="settings-dialog">
      <dialog>
        <h2 data-dialog-title>Settings</h2>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");
  await Promise.resolve();

  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  const title = document.querySelector<HTMLElement>("[data-dialog-title]");

  expect(title?.id).toMatch(/^pe-dialog-surface-\d+-title-/);
  expect(dialog?.getAttribute("aria-labelledby")).toBe(title?.id);
});

test("derives aria-describedby from data-dialog-description", async () => {
  document.body.innerHTML = `
    <pe-dialog id="settings-dialog">
      <dialog>
        <h2 data-dialog-title>Settings</h2>
        <p data-dialog-description>Update your settings.</p>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");
  await Promise.resolve();

  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  const description = document.querySelector<HTMLElement>(
    "[data-dialog-description]"
  );

  expect(description?.id).toMatch(/^pe-dialog-surface-\d+-description-/);
  expect(dialog?.getAttribute("aria-describedby")).toBe(description?.id);
});

test("keeps authored aria-describedby over data-dialog-description", async () => {
  document.body.innerHTML = `
    <pe-dialog id="settings-dialog">
      <dialog aria-describedby="authored-description">
        <h2 data-dialog-title>Settings</h2>
        <p id="authored-description">Authored description.</p>
        <p data-dialog-description>Generated description should not be used.</p>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");
  await Promise.resolve();

  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  const description = document.querySelector<HTMLElement>(
    "[data-dialog-description]"
  );

  expect(dialog?.getAttribute("aria-describedby")).toBe("authored-description");
  expect(description?.id).toBe("");
});

test("does not rewrite dialog description when an input description changes", async () => {
  document.body.innerHTML = `
    <pe-dialog id="settings-dialog">
      <dialog>
        <h2 data-dialog-title>Settings</h2>
        <p data-dialog-description>Update your settings.</p>
        <label>
          Name
          <input aria-describedby="name-help" value="Plain Elements" />
        </label>
        <p id="name-help">Use a visible name.</p>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");
  await nextMicrotask();

  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  const input = document.querySelector<HTMLInputElement>("input");
  let dialogDescriptionMutations = 0;

  expect(dialog?.getAttribute("aria-describedby")).toBeTruthy();

  const observer = new MutationObserver((records) => {
    dialogDescriptionMutations += records.length;
  });

  observer.observe(dialog!, {
    attributes: true,
    attributeFilter: ["aria-describedby"]
  });

  input?.setAttribute("aria-describedby", "name-help name-extra");
  await nextMicrotask();

  observer.disconnect();

  expect(dialogDescriptionMutations).toBe(0);
});

test("keeps focus on an input inside an open dialog", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog>
        <h2 data-dialog-title>Settings</h2>
        <p data-dialog-description>Update your settings.</p>
        <input value="Plain Elements" />
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  const input = document.querySelector<HTMLInputElement>("input");

  trigger?.click();
  input?.focus();
  await nextMicrotask();

  expect(dialog?.open).toBe(true);
  expect(document.activeElement).toBe(input);
});

test("does not keep generated aria-labelledby after an author adds aria-label", async () => {
  document.body.innerHTML = `
    <pe-dialog id="settings-dialog">
      <dialog>
        <h2 data-dialog-title>Settings</h2>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");
  await nextMicrotask();

  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();

  dialog?.setAttribute("aria-label", "Settings");
  await nextMicrotask();
  await nextMicrotask();

  expect(dialog?.getAttribute("aria-label")).toBe("Settings");
  expect(dialog?.hasAttribute("aria-labelledby")).toBe(false);
});

test("keeps a canceled native cancel request open and does not fire close event", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const host = document.querySelector<DialogElement>("pe-dialog");
  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  const cancelEvents: Array<CustomEvent<DialogEventDetail>> = [];
  const closeEvents: Array<CustomEvent<DialogEventDetail>> = [];

  host?.addEventListener("pe-dialog:cancel", (event) => {
    cancelEvents.push(event as CustomEvent<DialogEventDetail>);
  });
  host?.addEventListener("pe-dialog:close", (event) => {
    closeEvents.push(event as CustomEvent<DialogEventDetail>);
  });
  dialog?.addEventListener("cancel", (event) => event.preventDefault());

  trigger?.click();
  dialog?.dispatchEvent(new Event("cancel", { cancelable: true }));
  await nextMicrotask();

  expect(dialog?.open).toBe(true);
  expect(dialog?.dataset.state).toBe("open");
  expect(cancelEvents).toHaveLength(1);
  expect(cancelEvents[0]?.detail.reason).toBe("cancel");
  expect(cancelEvents[0]?.detail.defaultPrevented).toBe(true);
  expect(closeEvents).toHaveLength(0);
});

test("supports native form method dialog close", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="confirm-dialog">Confirm</button>
    <pe-dialog id="confirm-dialog">
      <dialog aria-label="Confirm">
        <form method="dialog">
          <button value="confirm">Confirm</button>
        </form>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='confirm-dialog']"
  );
  const submit = document.querySelector<HTMLButtonElement>(
    "form[method='dialog'] button"
  );
  const host = document.querySelector<DialogElement>("pe-dialog");
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  expect(host).toBeTruthy();

  const closePromise = waitForClosedDialogSync(host!);

  trigger?.click();
  submit?.click();
  const closeEvent = await closePromise;

  expect(dialog?.open).toBe(false);
  expect(dialog?.returnValue).toBe("confirm");
  expect(dialog?.dataset.state).toBe("closed");
  expect(closeEvent.detail.reason).toBe("form");
});

test("dismisses on backdrop pointer down when opted in", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings" data-dialog-dismiss>
        <p>Dismissable dialog</p>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger?.click();

  dialog?.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0
    })
  );
  await nextMicrotask();

  expect(dialog?.open).toBe(false);
  expect(dialog?.returnValue).toBe("dismiss");
});

test("does not dismiss on backdrop pointer down without opt in", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings">
        <p>Non-dismissable dialog</p>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger?.click();

  dialog?.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0
    })
  );
  await nextMicrotask();

  expect(dialog?.open).toBe(true);
});

test("does not dismiss when pointer down is inside the dialog box", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings" data-dialog-dismiss>
        <p>Dismissable dialog</p>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger?.click();

  const rect = dialog?.getBoundingClientRect();

  dialog?.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: (rect?.left ?? 0) + 8,
      clientY: (rect?.top ?? 0) + 8
    })
  );
  await nextMicrotask();

  expect(dialog?.open).toBe(true);
});

test("dismiss opt in can be added dynamically", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings">
        <p>Dismissable dialog</p>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  dialog?.setAttribute("data-dialog-dismiss", "");
  await nextMicrotask();

  trigger?.click();

  dialog?.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0
    })
  );
  await nextMicrotask();

  expect(dialog?.open).toBe(false);
});

test("supports programmatic open close toggle and no-op states", async () => {
  document.body.innerHTML = `
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const host = document.querySelector<DialogElement>("pe-dialog");
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  host?.open();
  host?.open();
  expect(dialog?.open).toBe(true);

  const firstClosePromise = waitForClosedDialogSync(host!);
  host?.close("done");
  await firstClosePromise;
  host?.close("ignored");
  expect(dialog?.open).toBe(false);
  expect(dialog?.returnValue).toBe("done");

  host?.toggle();
  expect(dialog?.open).toBe(true);

  const secondClosePromise = waitForClosedDialogSync(host!);
  host?.toggle();
  await secondClosePromise;
  expect(dialog?.open).toBe(false);
});

test("dispatches custom events with dialog and trigger details", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings">
        <button type="button" data-dialog-close>Close</button>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const closeButton =
    document.querySelector<HTMLButtonElement>("[data-dialog-close]");
  const host = document.querySelector<DialogElement>("pe-dialog");
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  expect(host).toBeTruthy();

  const openPromise = waitForDialogEvent(host!, "pe-dialog:open");
  const closePromise = waitForDialogEvent(host!, "pe-dialog:close");

  trigger?.click();
  const openEvent = await openPromise;

  closeButton?.click();
  const closeEvent = await closePromise;

  expect(openEvent.detail.dialog).toBe(dialog);
  expect(openEvent.detail.trigger).toBe(trigger);
  expect(openEvent.detail.reason).toBe("trigger");
  expect(closeEvent.detail.dialog).toBe(dialog);
  expect(closeEvent.detail.trigger).toBe(trigger);
  expect(closeEvent.detail.reason).toBe("close-control");
});

test("restores focus to the opening trigger after close", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings">
        <button type="button" data-dialog-close>Close</button>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const closeButton =
    document.querySelector<HTMLButtonElement>("[data-dialog-close]");
  const host = document.querySelector<DialogElement>("pe-dialog");

  expect(host).toBeTruthy();

  const closePromise = waitForClosedDialogSync(host!);

  trigger?.click();
  closeButton?.click();
  await closePromise;

  expect(document.activeElement).toBe(trigger);
});

test("uses only the active trigger for open state", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings A</button>
    <button type="button" data-dialog-trigger="settings-dialog">Settings B</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      "[data-dialog-trigger='settings-dialog']"
    )
  );

  triggers[0]?.click();

  expect(triggers.map((trigger) => trigger.dataset.state)).toEqual([
    "open",
    "closed"
  ]);
  expect(triggers.map((trigger) => trigger.getAttribute("aria-expanded"))).toEqual([
    "true",
    "false"
  ]);
});

test("binds a dynamically added external trigger", async () => {
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

  await nextMicrotask();
  await nextMicrotask();

  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger.click();

  expect(dialog?.open).toBe(true);
  expect(trigger.dataset.state).toBe("open");
});

test("restores trigger attributes when it stops being managed", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-dialog-trigger="settings-dialog"
      data-state="idle"
      aria-controls="authored-target"
      aria-expanded="false"
      aria-haspopup="menu"
    >
      Settings
    </button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger?.click();

  expect(dialog?.open).toBe(true);
  expect(trigger?.dataset.state).toBe("open");
  expect(trigger?.getAttribute("aria-controls")).toBe(dialog?.id);
  expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");

  trigger?.removeAttribute("data-dialog-trigger");
  await nextMicrotask();

  expect(trigger?.dataset.state).toBe("idle");
  expect(trigger?.getAttribute("aria-controls")).toBe("authored-target");
  expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  expect(trigger?.getAttribute("aria-haspopup")).toBe("menu");
});

test("restores internal trigger attributes when the dialog target is removed", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  document.body.innerHTML = `
    <pe-dialog>
      <button type="button" data-dialog-trigger>Open</button>
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger]"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger?.click();

  expect(dialog?.open).toBe(true);
  expect(trigger?.dataset.state).toBe("open");
  expect(trigger?.getAttribute("aria-controls")).toBe(dialog?.id);
  expect(trigger?.getAttribute("aria-expanded")).toBe("true");
  expect(trigger?.getAttribute("aria-haspopup")).toBe("dialog");

  dialog?.remove();
  await nextMicrotask();

  expect(trigger?.dataset.state).toBeUndefined();
  expect(trigger?.getAttribute("aria-controls")).toBeNull();
  expect(trigger?.getAttribute("aria-expanded")).toBeNull();
  expect(trigger?.getAttribute("aria-haspopup")).toBeNull();
});

test("warns and ignores an empty external trigger", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  document.body.innerHTML = `
    <button type="button" data-dialog-trigger>Ignored</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");
  await nextMicrotask();

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger]"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  trigger?.click();

  expect(dialog?.open).toBe(false);
  expect(warn).toHaveBeenCalledWith(
    "[pe-dialog] Empty [data-dialog-trigger] outside <pe-dialog> is ignored."
  );
});

test("warns for a trigger that references a missing enhanced dialog", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="missing-dialog">Missing</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");
  await nextMicrotask();

  expect(warn).toHaveBeenCalledWith(
    '[pe-dialog] [data-dialog-trigger="missing-dialog"] does not match an enhanced dialog.'
  );
});

test("syncs state when the dialog is closed through a native close request", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  const host = document.querySelector<DialogElement>("pe-dialog");

  trigger?.click();

  const closePromise = waitForClosedDialogSync(host!);
  dialog?.requestClose();
  const closeEvent = await closePromise;

  expect(dialog?.open).toBe(false);
  expect(dialog?.dataset.state).toBe("closed");
  expect(host?.dataset.state).toBe("closed");
  expect(trigger?.getAttribute("aria-expanded")).toBe("false");
  expect(closeEvent.detail.reason).toBe("cancel");
});

test("does not swallow showModal failures", async () => {
  document.body.innerHTML = `
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings"></dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const host = document.querySelector<DialogElement>("pe-dialog");
  const dialog = document.querySelector<HTMLDialogElement>("dialog");
  const showModal = vi
    .spyOn(HTMLDialogElement.prototype, "showModal")
    .mockImplementation(() => {
      throw new Error("showModal failed");
    });

  expect(() => host?.open()).toThrow("showModal failed");
  expect(dialog?.open).toBe(false);

  showModal.mockRestore();
});

test("cleans up listeners and observers when disconnected", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog aria-label="Settings">
        <button type="button" data-dialog-close>Close</button>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='settings-dialog']"
  );
  const host = document.querySelector<DialogElement>("pe-dialog");
  const dialog = document.querySelector<HTMLDialogElement>("dialog");

  host?.remove();
  await nextMicrotask();

  trigger?.click();

  expect(dialog?.open).toBe(false);
  expect(trigger?.dataset.state).toBeUndefined();
  expect(trigger?.getAttribute("aria-controls")).toBeNull();
  expect(trigger?.getAttribute("aria-expanded")).toBeNull();
  expect(trigger?.getAttribute("aria-haspopup")).toBeNull();

  const dynamicTrigger = document.createElement("button");
  dynamicTrigger.type = "button";
  dynamicTrigger.dataset.dialogTrigger = "settings-dialog";
  document.body.append(dynamicTrigger);
  await nextMicrotask();

  expect(dynamicTrigger.dataset.state).toBeUndefined();
});

test("does not change authored DOM structure during initialization", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="settings-dialog">Settings</button>
    <pe-dialog id="settings-dialog">
      <dialog>
        <h2 data-dialog-title>Settings</h2>
        <button type="button" data-dialog-close>Close</button>
      </dialog>
    </pe-dialog>
  `;

  const host = document.querySelector("pe-dialog");
  const beforeElements = Array.from(host?.querySelectorAll("*") ?? []);

  await customElements.whenDefined("pe-dialog");
  await nextMicrotask();

  const afterElements = Array.from(host?.querySelectorAll("*") ?? []);

  expect(afterElements).toEqual(beforeElements);
  expect(afterElements.map((element) => element.tagName)).toEqual([
    "DIALOG",
    "H2",
    "BUTTON"
  ]);
});

test("restores focus to a nested dialog trigger without closing the parent", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="parent-dialog">Parent</button>
    <pe-dialog id="parent-dialog">
      <dialog data-dialog-dismiss>
        <h2 data-dialog-title>Parent</h2>
        <button type="button" data-dialog-trigger="child-dialog">Child</button>
        <pe-dialog id="child-dialog">
          <dialog data-dialog-dismiss>
            <h2 data-dialog-title>Child</h2>
            <button type="button" data-dialog-close>Close child</button>
          </dialog>
        </pe-dialog>
        <button type="button" data-dialog-close>Close parent</button>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const parentTrigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='parent-dialog']"
  );
  const childTrigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='child-dialog']"
  );
  const parentHost = document.querySelector<DialogElement>("#parent-dialog");
  const childHost = document.querySelector<DialogElement>("#child-dialog");
  const parentDialog = parentHost?.querySelector<HTMLDialogElement>("dialog");
  const childDialog = childHost?.querySelector<HTMLDialogElement>("dialog");
  const childClose =
    childDialog?.querySelector<HTMLButtonElement>("[data-dialog-close]");

  parentTrigger?.click();
  childTrigger?.click();

  expect(parentDialog?.open).toBe(true);
  expect(childDialog?.open).toBe(true);
  expect(parentHost?.dataset.state).toBe("open");

  parentDialog?.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      cancelable: true,
      clientX: 0,
      clientY: 0
    })
  );
  await nextMicrotask();

  expect(parentDialog?.open).toBe(true);
  expect(childDialog?.open).toBe(true);

  const childClosePromise = waitForClosedDialogSync(childHost!);
  childClose?.click();
  await childClosePromise;

  expect(childDialog?.open).toBe(false);
  expect(parentDialog?.open).toBe(true);
  expect(parentHost?.dataset.state).toBe("open");
  expect(document.activeElement).toBe(childTrigger);
});

test("exposes nested dialog geometry and state attributes", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="parent-dialog">Parent</button>
    <pe-dialog id="parent-dialog">
      <dialog data-dialog-dismiss>
        <h2 data-dialog-title>Parent</h2>
        <button type="button" data-dialog-trigger="child-dialog">Child</button>
        <pe-dialog id="child-dialog">
          <dialog data-dialog-dismiss>
            <h2 data-dialog-title>Child</h2>
            <button type="button" data-dialog-close>Close child</button>
          </dialog>
        </pe-dialog>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const parentTrigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='parent-dialog']"
  );
  const childTrigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='child-dialog']"
  );
  const parentDialog = document.querySelector<HTMLDialogElement>(
    "#parent-dialog > dialog"
  );
  const childDialog = document.querySelector<HTMLDialogElement>(
    "#child-dialog > dialog"
  );
  const childClose =
    childDialog?.querySelector<HTMLButtonElement>("[data-dialog-close]");
  const childHost = document.querySelector<DialogElement>("#child-dialog");

  parentTrigger?.click();
  childTrigger?.click();

  expect(parentDialog?.style.getPropertyValue("--nested-dialogs")).toBe("0");
  expect(childDialog?.style.getPropertyValue("--nested-dialogs")).toBe("1");
  expect(parentDialog?.hasAttribute("data-nested-dialog-open")).toBe(true);
  expect(childDialog?.hasAttribute("data-nested")).toBe(true);
  expect(parentDialog?.hasAttribute("data-nested")).toBe(false);

  const childClosePromise = waitForClosedDialogSync(childHost!);
  childClose?.click();
  await childClosePromise;

  expect(parentDialog?.hasAttribute("data-nested-dialog-open")).toBe(false);
  expect(parentDialog?.style.getPropertyValue("--nested-dialogs")).toBe("0");
  expect(childDialog?.style.getPropertyValue("--nested-dialogs")).toBe("0");
});

test("does not run the queued close sync after disconnect", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="deferred-dialog">Open</button>
    <pe-dialog id="deferred-dialog">
      <dialog aria-label="Deferred sync">
        <button type="button" data-dialog-close>Close</button>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const host = document.querySelector<DialogElement>("pe-dialog")!;
  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='deferred-dialog']"
  )!;
  const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
  const closeSpy = vi.fn();
  host.addEventListener("pe-dialog:close", closeSpy);

  trigger.focus();
  host.open(trigger);
  expect(dialog.open).toBe(true);
  expect(host.dataset.state).toBe("open");

  // close() sets open=false synchronously and fires the native close event as a
  // task; the component's close handler then queues the deferred sync timer.
  const nativeClosed = new Promise<void>((resolve) => {
    dialog.addEventListener("close", () => resolve(), { once: true });
  });
  host.close();
  await nativeClosed;
  expect(dialog.open).toBe(false);

  // Disconnect before the queued timer fires, then move focus away so an
  // unwanted #restoreFocus() would be observable.
  host.remove();
  const outside = document.createElement("button");
  document.body.append(outside);
  outside.focus();

  await new Promise((resolve) => window.setTimeout(resolve, 50));

  // The canceled timer never fires: no close event, no focus restore to the
  // trigger, and the deferred #sync() never flips data-state to "closed".
  expect(closeSpy).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(outside);
  expect(host.dataset.state).toBe("open");
});

test("resumes close sync after reconnect", async () => {
  document.body.innerHTML = `
    <button type="button" data-dialog-trigger="reconnect-dialog">Open</button>
    <pe-dialog id="reconnect-dialog">
      <dialog aria-label="Reconnect">
        <button type="button" data-dialog-close>Close</button>
      </dialog>
    </pe-dialog>
  `;

  await customElements.whenDefined("pe-dialog");

  const host = document.querySelector<DialogElement>("pe-dialog")!;
  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-dialog-trigger='reconnect-dialog']"
  )!;
  const dialog = document.querySelector<HTMLDialogElement>("dialog")!;

  host.remove();
  document.body.append(host);
  await nextMicrotask();

  const closePromise = waitForClosedDialogSync(host);
  trigger.click();
  expect(dialog.open).toBe(true);
  host.close();
  const detail = await closePromise;

  expect(dialog.open).toBe(false);
  expect(detail.detail.reason).toBe("programmatic");
  expect(host.dataset.state).toBe("closed");
});
