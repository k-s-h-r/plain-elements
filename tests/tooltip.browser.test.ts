import { afterEach, expect, test, vi } from "vitest";
import { TooltipElement, type TooltipEventDetail } from "../src/tooltip";

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => {
    window.setTimeout(resolve, 20);
  });
  await Promise.resolve();
}

async function flushTooltipCloseFrame(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function nextFrame(count = 1): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

async function waitForFrame(
  condition: () => boolean,
  maxFrames = 120
): Promise<void> {
  for (let index = 0; index < maxFrames && !condition(); index += 1) {
    await nextFrame(1);
  }
}

async function waitForTooltipState(
  host: TooltipElement,
  state: "open" | "closed"
): Promise<void> {
  await waitForFrame(() => host.dataset.state === state);
}

function waitForTooltipEvent(
  host: TooltipElement,
  type: "pe-tooltip:open" | "pe-tooltip:close"
): Promise<CustomEvent<TooltipEventDetail>> {
  return new Promise((resolve) => {
    host.addEventListener(
      type,
      (event) => resolve(event as CustomEvent<TooltipEventDetail>),
      { once: true }
    );
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test("defines pe-tooltip custom element", () => {
  expect(customElements.get("pe-tooltip")).toBe(TooltipElement);
});

test("hides tooltip content before any interaction", () => {
  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger="save-tip">Save</button>
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  expect(host?.dataset.state).toBe("closed");
  expect(content?.dataset.state).toBe("closed");
  expect(content?.hasAttribute("hidden")).toBe(true);
});

test("shows a tooltip from an external trigger and syncs attributes", async () => {
  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger="save-tip">Save</button>
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  expect(host?.isOpen).toBe(false);

  const openPromise = waitForTooltipEvent(host!, "pe-tooltip:open");
  trigger?.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
  const openEvent = await openPromise;

  expect(host?.isOpen).toBe(true);
  expect(host?.dataset.state).toBe("open");
  expect(content?.dataset.state).toBe("open");
  expect(trigger?.dataset.state).toBe("open");
  expect(trigger?.getAttribute("aria-describedby")).toBe(content?.id);
  expect(content?.getAttribute("role")).toBe("tooltip");
  expect(content?.hasAttribute("hidden")).toBe(false);
  expect(openEvent.detail.reason).toBe("hover");
});

test("hides a tooltip on pointer leave", async () => {
  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger="save-tip">Save</button>
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.dispatchEvent(new PointerEvent("pointerenter", { bubbles: true }));
  const closePromise = waitForTooltipEvent(host!, "pe-tooltip:close");
  trigger?.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
  const closeEvent = await closePromise;

  expect(host?.isOpen).toBe(false);
  expect(host?.dataset.state).toBe("closed");
  expect(content?.dataset.state).toBe("closed");
  expect(trigger?.dataset.state).toBe("closed");
  expect(content?.hasAttribute("hidden")).toBe(true);
  expect(closeEvent.detail.reason).toBe("hover");
});

test("defers hover open until data-tooltip-delay elapses", async () => {
  document.body.innerHTML = `
    <pe-tooltip data-tooltip-delay="40">
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content hidden>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const host = document.querySelector("pe-tooltip") as TooltipElement;

  trigger.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await nextMicrotask();
  expect(host.dataset.state).toBe("closed");

  const openPromise = waitForTooltipEvent(host, "pe-tooltip:open");
  await waitMs(50);
  await openPromise;

  expect(host.dataset.state).toBe("open");
});

test("cancels delayed hover open on pointer leave", async () => {
  document.body.innerHTML = `
    <pe-tooltip data-tooltip-delay="60">
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content hidden>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const host = document.querySelector("pe-tooltip") as TooltipElement;

  trigger.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitMs(20);
  trigger.dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: true, pointerType: "mouse" })
  );
  await waitMs(80);

  expect(host.dataset.state).toBe("closed");
});

test("defers hover close until data-tooltip-close-delay elapses", async () => {
  document.body.innerHTML = `
    <pe-tooltip data-tooltip-close-delay="40">
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content hidden>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const host = document.querySelector("pe-tooltip") as TooltipElement;

  trigger.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForTooltipState(host, "open");
  expect(host.dataset.state).toBe("open");

  const closePromise = waitForTooltipEvent(host, "pe-tooltip:close");
  trigger.dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: true, pointerType: "mouse" })
  );
  await nextMicrotask();
  expect(host.dataset.state).toBe("open");

  await closePromise;
  expect(host.dataset.state).toBe("closed");
});

test("opens on focus without waiting for data-tooltip-delay", async () => {
  document.body.innerHTML = `
    <pe-tooltip data-tooltip-delay="80">
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content hidden>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const host = document.querySelector("pe-tooltip") as TooltipElement;

  const openPromise = waitForTooltipEvent(host, "pe-tooltip:open");
  trigger.focus();
  await openPromise;

  expect(host.dataset.state).toBe("open");
});

test("skips hover open delay for siblings in the same delay group", async () => {
  document.body.innerHTML = `
    <div class="toolbar">
      <pe-tooltip
        data-tooltip-delay="60"
        data-tooltip-delay-group="formatting"
        data-tooltip-skip-delay="300"
        data-tooltip-side="bottom"
      >
        <button type="button" data-tooltip-trigger>Bold</button>
        <span data-tooltip-content hidden>Bold text</span>
      </pe-tooltip>
      <pe-tooltip
        data-tooltip-delay="60"
        data-tooltip-delay-group="formatting"
        data-tooltip-skip-delay="300"
        data-tooltip-side="bottom"
      >
        <button type="button" data-tooltip-trigger>Italic</button>
        <span data-tooltip-content hidden>Italic text</span>
      </pe-tooltip>
    </div>
  `;

  await customElements.whenDefined("pe-tooltip");

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-tooltip-trigger]")
  );
  const hosts = Array.from(
    document.querySelectorAll<TooltipElement>("pe-tooltip")
  );

  triggers[0].dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForTooltipState(hosts[0], "open");

  triggers[1].dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForFrame(
    () => hosts[0].dataset.state === "closed" && hosts[1].dataset.state === "open"
  );
  expect(hosts[0].dataset.state).toBe("closed");
  expect(hosts[1].dataset.state).toBe("open");
});

test("skips hover open delay while a sibling delay group tooltip stays open", async () => {
  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger="bold-tip">Bold</button>
    <button type="button" data-tooltip-trigger="italic-tip">Italic</button>
    <pe-tooltip
      id="bold-tip"
      data-tooltip-delay="80"
      data-tooltip-delay-group="formatting"
      data-tooltip-skip-delay="50"
      data-tooltip-side="bottom"
    >
      <span data-tooltip-content hidden>Bold text</span>
    </pe-tooltip>
    <pe-tooltip
      id="italic-tip"
      data-tooltip-delay="80"
      data-tooltip-delay-group="formatting"
      data-tooltip-skip-delay="50"
      data-tooltip-side="bottom"
    >
      <span data-tooltip-content hidden>Italic text</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const bold = document.querySelector(
    "[data-tooltip-trigger='bold-tip']"
  ) as HTMLButtonElement;
  const italic = document.querySelector(
    "[data-tooltip-trigger='italic-tip']"
  ) as HTMLButtonElement;
  const hosts = Array.from(
    document.querySelectorAll<TooltipElement>("pe-tooltip")
  );

  bold.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForTooltipState(hosts[0], "open");

  await waitMs(120);

  italic.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForTooltipState(hosts[1], "open");
  expect(hosts[1].dataset.state).toBe("open");
});

test("keeps a delay group tooltip open across a gap between sibling triggers", async () => {
  document.body.innerHTML = `
    <div class="toolbar">
      <button type="button" data-tooltip-trigger="bold-tip">Bold</button>
      <button type="button" data-tooltip-trigger="italic-tip">Italic</button>
    </div>
    <pe-tooltip
      id="bold-tip"
      data-tooltip-delay="40"
      data-tooltip-delay-group="formatting"
      data-tooltip-skip-delay="120"
      data-tooltip-side="bottom"
    >
      <span data-tooltip-content hidden>Bold text</span>
    </pe-tooltip>
    <pe-tooltip
      id="italic-tip"
      data-tooltip-delay="40"
      data-tooltip-delay-group="formatting"
      data-tooltip-skip-delay="120"
      data-tooltip-side="bottom"
    >
      <span data-tooltip-content hidden>Italic text</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const bold = document.querySelector(
    "[data-tooltip-trigger='bold-tip']"
  ) as HTMLButtonElement;
  const italic = document.querySelector(
    "[data-tooltip-trigger='italic-tip']"
  ) as HTMLButtonElement;
  const hosts = Array.from(
    document.querySelectorAll<TooltipElement>("pe-tooltip")
  );

  bold.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForTooltipState(hosts[0], "open");

  bold.dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: true, pointerType: "mouse" })
  );
  await waitMs(30);
  expect(hosts[0].dataset.state).toBe("open");

  italic.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForFrame(
    () => hosts[0].dataset.state === "closed" && hosts[1].dataset.state === "open"
  );
  expect(hosts[0].dataset.state).toBe("closed");
  expect(hosts[1].dataset.state).toBe("open");
});

test("does not skip hover open delay outside the skip window", async () => {
  document.body.innerHTML = `
    <pe-tooltip
      data-tooltip-delay="40"
      data-tooltip-delay-group="formatting"
      data-tooltip-skip-delay="30"
      data-tooltip-side="bottom"
    >
      <button type="button" data-tooltip-trigger>Bold</button>
      <span data-tooltip-content hidden>Bold text</span>
    </pe-tooltip>
    <pe-tooltip
      data-tooltip-delay="40"
      data-tooltip-delay-group="formatting"
      data-tooltip-skip-delay="30"
      data-tooltip-side="bottom"
    >
      <button type="button" data-tooltip-trigger>Italic</button>
      <span data-tooltip-content hidden>Italic text</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-tooltip-trigger]")
  );
  const hosts = Array.from(
    document.querySelectorAll<TooltipElement>("pe-tooltip")
  );

  triggers[0].dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForTooltipState(hosts[0], "open");
  triggers[0].dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: true, pointerType: "mouse" })
  );
  await waitForTooltipState(hosts[0], "closed");
  expect(hosts[0].dataset.state).toBe("closed");

  triggers[1].dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await nextMicrotask();
  expect(hosts[1].dataset.state).toBe("closed");

  await waitForTooltipState(hosts[1], "open");
  expect(hosts[1].dataset.state).toBe("open");
});

test("closes when the trigger is clicked while open", async () => {
  document.body.innerHTML = `
    <pe-tooltip>
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content hidden>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>("[data-tooltip-trigger]");
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForTooltipState(host!, "open");
  expect(host?.dataset.state).toBe("open");

  const closePromise = waitForTooltipEvent(host!, "pe-tooltip:close");
  trigger?.click();
  const closeEvent = await closePromise;

  expect(host?.dataset.state).toBe("closed");
  expect(content?.hasAttribute("hidden")).toBe(true);
  expect(closeEvent.detail.reason).toBe("trigger");
});

test("closes when a focused trigger is clicked while open", async () => {
  document.body.innerHTML = `
    <pe-tooltip>
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content hidden>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>("[data-tooltip-trigger]");
  const host = document.querySelector<TooltipElement>("pe-tooltip");

  trigger?.focus();
  await nextMicrotask();
  expect(host?.dataset.state).toBe("open");

  const closePromise = waitForTooltipEvent(host!, "pe-tooltip:close");
  trigger?.click();
  const closeEvent = await closePromise;

  expect(host?.dataset.state).toBe("closed");
  expect(closeEvent.detail.reason).toBe("trigger");
});

test("hides on pointer leave after reopening via hover following a trigger click", async () => {
  document.body.innerHTML = `
    <pe-tooltip>
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content hidden>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>("[data-tooltip-trigger]");
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  trigger?.click();
  await waitForTooltipState(host!, "closed");
  expect(host?.dataset.state).toBe("closed");

  trigger?.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await waitForTooltipState(host!, "open");
  expect(host?.dataset.state).toBe("open");

  const closePromise = waitForTooltipEvent(host!, "pe-tooltip:close");
  trigger?.dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: true, pointerType: "mouse" })
  );
  const closeEvent = await closePromise;
  await waitForTooltipState(host!, "closed");

  expect(host?.dataset.state).toBe("closed");
  expect(content?.hasAttribute("hidden")).toBe(true);
  expect(closeEvent.detail.reason).toBe("hover");
});

test("stays open while crossing the gap on repeated hover attempts", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-tooltip-trigger="save-tip"
      style="position: fixed; left: 200px; top: 200px; width: 80px; height: 40px;"
    >
      Save
    </button>
    <pe-tooltip id="save-tip" data-tooltip-side="top" data-tooltip-offset="12">
      <span
        data-tooltip-content
        style="display: block; width: 160px; height: 32px;"
      >
        Saved changes are published.
      </span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    trigger?.dispatchEvent(
      new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
    );

    const triggerRect = trigger?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const x = (triggerRect?.left ?? 0) + (triggerRect?.width ?? 0) / 2;
    const gapY = ((contentRect?.bottom ?? 0) + (triggerRect?.top ?? 0)) / 2;

    trigger?.dispatchEvent(
      new PointerEvent("pointerleave", {
        bubbles: true,
        clientX: x,
        clientY: (triggerRect?.top ?? 0) - 4,
        pointerType: "mouse"
      })
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: x,
        clientY: gapY,
        pointerType: "mouse"
      })
    );
    await nextMicrotask();

    expect(host?.dataset.state).toBe("open");
    expect(content?.hasAttribute("hidden")).toBe(false);

    content?.dispatchEvent(
      new PointerEvent("pointerenter", {
        bubbles: true,
        clientX: x,
        clientY: (contentRect?.bottom ?? 0) - 1,
        pointerType: "mouse"
      })
    );
    await nextMicrotask();

    expect(host?.dataset.state).toBe("open");

    content?.dispatchEvent(
      new PointerEvent("pointerleave", {
        bubbles: true,
        clientX: x,
        clientY: (contentRect?.bottom ?? 0) + 1,
        pointerType: "mouse"
      })
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        clientX: x,
        clientY: gapY,
        pointerType: "mouse"
      })
    );
    await nextMicrotask();

    expect(host?.dataset.state).toBe("open");

    trigger?.dispatchEvent(
      new PointerEvent("pointerenter", {
        bubbles: true,
        pointerType: "mouse"
      })
    );
    await nextMicrotask();

    expect(host?.dataset.state).toBe("open");

    trigger?.dispatchEvent(
      new PointerEvent("pointerleave", {
        bubbles: true,
        clientX: x,
        clientY: (triggerRect?.bottom ?? 0) + 4,
        pointerType: "mouse"
      })
    );
    const closePromise = waitForTooltipEvent(host!, "pe-tooltip:close");
    await closePromise;

    expect(host?.dataset.state).toBe("closed");
  }
});

test("hides when the pointer leaves the trigger away from the content", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-tooltip-trigger="save-tip"
      style="position: fixed; left: 200px; top: 200px; width: 80px; height: 40px;"
    >
      Save
    </button>
    <pe-tooltip id="save-tip" data-tooltip-side="top" data-tooltip-offset="12">
      <span
        data-tooltip-content
        style="display: block; width: 160px; height: 32px;"
      >
        Saved changes are published.
      </span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );

  const triggerRect = trigger?.getBoundingClientRect();

  trigger?.dispatchEvent(
    new PointerEvent("pointerleave", {
      bubbles: true,
      clientX: (triggerRect?.left ?? 0) + (triggerRect?.width ?? 0) / 2,
      clientY: (triggerRect?.bottom ?? 0) + 1,
      pointerType: "mouse"
    })
  );
  await waitForTooltipState(host!, "closed");

  expect(host?.dataset.state).toBe("closed");
  expect(content?.hasAttribute("hidden")).toBe(true);
});

test("supports an internal empty trigger and generated content id", async () => {
  document.body.innerHTML = `
    <pe-tooltip>
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger]"
  );
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  const openPromise = waitForTooltipEvent(host!, "pe-tooltip:open");
  trigger?.focus();
  const openEvent = await openPromise;

  expect(content?.id).toMatch(/^pe-tooltip-content-/);
  expect(trigger?.getAttribute("aria-describedby")).toBe(content?.id);
  expect(content?.dataset.state).toBe("open");
  expect(openEvent.detail.reason).toBe("focus");
});

test('treats data-tooltip-trigger="true" as an internal empty trigger', async () => {
  document.body.innerHTML = `
    <pe-tooltip>
      <button type="button" data-tooltip-trigger="true">Save</button>
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    '[data-tooltip-trigger="true"]'
  );
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  const openPromise = waitForTooltipEvent(host!, "pe-tooltip:open");
  trigger?.focus();
  const openEvent = await openPromise;

  expect(content?.id).toMatch(/^pe-tooltip-content-/);
  expect(trigger?.getAttribute("aria-describedby")).toBe(content?.id);
  expect(content?.dataset.state).toBe("open");
  expect(openEvent.detail.reason).toBe("focus");
});

test("keeps authored aria-describedby tokens when adding the tooltip id", async () => {
  document.body.innerHTML = `
    <span id="hint">Required</span>
    <button
      type="button"
      data-tooltip-trigger="save-tip"
      aria-describedby="hint"
    >
      Save
    </button>
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.focus();

  expect(trigger?.getAttribute("aria-describedby")).toBe(`hint ${content?.id}`);
});

test("hides on Escape", async () => {
  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger="save-tip">Save</button>
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.focus();
  const closePromise = waitForTooltipEvent(host!, "pe-tooltip:close");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  const closeEvent = await closePromise;

  expect(host?.dataset.state).toBe("closed");
  expect(content?.hasAttribute("hidden")).toBe(true);
  expect(closeEvent.detail.reason).toBe("escape");
});

test("supports programmatic open close toggle and custom events", async () => {
  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger="save-tip">Save</button>
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  expect(host).toBeTruthy();

  const openPromise = waitForTooltipEvent(host!, "pe-tooltip:open");
  host?.open(trigger ?? undefined);
  const openEvent = await openPromise;

  const closePromise = waitForTooltipEvent(host!, "pe-tooltip:close");
  host?.close();
  const closeEvent = await closePromise;

  host?.toggle(trigger ?? undefined);
  expect(host?.dataset.state).toBe("open");

  const toggleClosePromise = waitForTooltipEvent(host!, "pe-tooltip:close");
  host?.toggle();
  await toggleClosePromise;
  expect(host?.dataset.state).toBe("closed");

  expect(openEvent.detail.content).toBe(content);
  expect(openEvent.detail.trigger).toBe(trigger);
  expect(openEvent.detail.reason).toBe("programmatic");
  expect(closeEvent.detail.content).toBe(content);
  expect(closeEvent.detail.trigger).toBe(trigger);
  expect(closeEvent.detail.reason).toBe("programmatic");
});

test("uses only the active trigger for open state", async () => {
  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger="shared-tip">One</button>
    <button type="button" data-tooltip-trigger="shared-tip">Two</button>
    <pe-tooltip id="shared-tip">
      <span data-tooltip-content>Shared tip</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-tooltip-trigger]")
  );
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  triggers[1]?.focus();

  expect(triggers.map((trigger) => trigger.dataset.state)).toEqual([
    "closed",
    "open"
  ]);
  expect(
    triggers.map((trigger) => trigger.getAttribute("aria-describedby"))
  ).toEqual([content?.id, content?.id]);
});

test("keeps nested tooltip triggers and content owned by the nearest host", async () => {
  document.body.innerHTML = `
    <pe-tooltip class="outer-tooltip">
      <button type="button" class="outer-trigger" data-tooltip-trigger>Outer</button>
      <span class="outer-content" data-tooltip-content>Outer tip</span>

      <pe-tooltip class="inner-tooltip">
        <button type="button" class="inner-trigger" data-tooltip-trigger>Inner</button>
        <span class="inner-content" data-tooltip-content>Inner tip</span>
      </pe-tooltip>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const outerHost = document.querySelector<TooltipElement>(".outer-tooltip");
  const innerHost = document.querySelector<TooltipElement>(".inner-tooltip");
  const outerTrigger = document.querySelector<HTMLElement>(".outer-trigger");
  const innerTrigger = document.querySelector<HTMLElement>(".inner-trigger");
  const outerContent = document.querySelector<HTMLElement>(".outer-content");
  const innerContent = document.querySelector<HTMLElement>(".inner-content");

  innerTrigger?.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );

  expect(outerHost?.dataset.state).toBe("closed");
  expect(outerTrigger?.dataset.state).toBe("closed");
  expect(outerContent?.hasAttribute("hidden")).toBe(true);
  expect(innerHost?.dataset.state).toBe("open");
  expect(innerTrigger?.dataset.state).toBe("open");
  expect(innerContent?.hasAttribute("hidden")).toBe(false);
});

test("positions the content with fixed inline coordinates", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-tooltip-trigger="save-tip"
      style="position: fixed; left: 100px; top: 100px; width: 80px; height: 40px;"
    >
      Save
    </button>
    <pe-tooltip id="save-tip" data-tooltip-side="bottom" data-tooltip-align="start" data-tooltip-offset="12">
      <span
        data-tooltip-content
        style="display: block; width: 120px; height: 30px;"
      >
        Saved changes are published.
      </span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.focus();

  expect(content?.dataset.side).toBe("bottom");
  expect(content?.dataset.align).toBe("start");
  expect(content?.style.position).toBe("fixed");
  expect(content?.style.left).toBe("100px");
  expect(content?.style.top).toBe("152px");
});

test("exposes positioning CSS variables while open", async () => {
  document.body.innerHTML = `
    <pe-tooltip data-tooltip-side="bottom" data-tooltip-offset="8">
      <button
        type="button"
        data-tooltip-trigger
        style="position: fixed; left: 40px; top: 40px; width: 96px; height: 32px"
      >
        Open
      </button>
      <span
        data-tooltip-content
        style="display: block; width: 120px; height: 28px; box-sizing: border-box"
      >
        Hint
      </span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const host = document.querySelector("pe-tooltip") as TooltipElement;
  const content = document.querySelector("[data-tooltip-content]") as HTMLElement;

  trigger.focus();
  await waitForTooltipState(host, "open");

  expect(content.style.getPropertyValue("--anchor-width")).toBe("96px");
  expect(content.style.getPropertyValue("--anchor-height")).toBe("32px");
  expect(content.style.getPropertyValue("--available-height")).not.toBe("");
  const originX = Number.parseFloat(
    content.style.getPropertyValue("--transform-origin")
  );
  expect(originX).toBeGreaterThan(40);
  expect(originX).toBeLessThan(80);

  await waitForFrame(() => !content.hasAttribute("data-starting-style"));
  expect(content.hasAttribute("data-starting-style")).toBe(false);

  trigger.dispatchEvent(
    new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse" })
  );
  trigger.blur();
  await waitForTooltipState(host, "closed");
  await waitForFrame(
    () =>
      content.style.getPropertyValue("--anchor-width") === "" &&
      content.style.getPropertyValue("--transform-origin") === ""
  );

  expect(content.style.getPropertyValue("--anchor-width")).toBe("");
  expect(content.style.getPropertyValue("--transform-origin")).toBe("");
});

test("defers hide until the exit animation finishes", async () => {
  document.body.innerHTML = `
    <style>
      [data-tooltip-content] {
        transition: opacity 40ms linear;
      }
      [data-tooltip-content][data-ending-style] {
        opacity: 0;
      }
    </style>
    <pe-tooltip>
      <button type="button" data-tooltip-trigger>Open</button>
      <span data-tooltip-content hidden>Hint</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-tooltip-content]") as HTMLElement;
  const host = document.querySelector("pe-tooltip") as TooltipElement;

  trigger.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await nextMicrotask();

  const closePromise = waitForTooltipEvent(host, "pe-tooltip:close");
  trigger.dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: true, pointerType: "mouse" })
  );
  await flushTooltipCloseFrame();
  expect(content.hasAttribute("data-ending-style")).toBe(true);
  expect(host.dataset.state).toBe("open");

  await closePromise;
  await nextMicrotask();

  expect(host.dataset.state).toBe("closed");
  expect(content.hasAttribute("data-ending-style")).toBe(false);
  expect(content.hasAttribute("hidden")).toBe(true);
});

test("keeps exit animation position while data-ending-style is active", async () => {
  document.body.innerHTML = `
    <style>
      [data-tooltip-content] {
        transition: opacity 40ms linear;
      }
      [data-tooltip-content][data-ending-style] {
        opacity: 0;
      }
    </style>
    <pe-tooltip>
      <button type="button" data-tooltip-trigger>Open</button>
      <span data-tooltip-content hidden>Hint</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-tooltip-content]") as HTMLElement;
  const host = document.querySelector("pe-tooltip") as TooltipElement;

  trigger.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  await nextMicrotask();

  const placedLeft = content.style.left;
  const placedTop = content.style.top;
  expect(Number.parseFloat(placedLeft)).toBeGreaterThan(0);
  expect(Number.parseFloat(placedTop)).toBeGreaterThan(0);

  trigger.dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: true, pointerType: "mouse" })
  );
  await flushTooltipCloseFrame();
  await nextMicrotask();

  expect(content.hasAttribute("data-ending-style")).toBe(true);
  expect(host.dataset.state).toBe("open");
  expect(content.style.left).toBe(placedLeft);
  expect(content.style.top).toBe(placedTop);
});

test("uses the same position on the first and second hover inside a flex row", async () => {
  document.body.innerHTML = `
    <style>
      .row {
        display: flex;
        justify-content: flex-end;
        width: 640px;
      }

      [data-tooltip-content] {
        max-width: min(18rem, calc(100vw - 1rem));
        padding: 6px 8px;
        border: 1px solid black;
      }
    </style>
    <div class="row">
      <pe-tooltip>
        <button type="button" data-tooltip-trigger>Save</button>
        <span data-tooltip-content>
          Saves this draft without publishing.
        </span>
      </pe-tooltip>
    </div>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger]"
  );
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  const firstLeft = content?.getBoundingClientRect().left;

  trigger?.dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: true, pointerType: "mouse" })
  );
  await nextMicrotask();

  trigger?.dispatchEvent(
    new PointerEvent("pointerenter", { bubbles: true, pointerType: "mouse" })
  );
  const secondLeft = content?.getBoundingClientRect().left;

  expect(firstLeft).toBe(secondLeft);
});

test("positions left and right sides", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-tooltip-trigger="left-tip"
      style="position: fixed; left: 300px; top: 100px; width: 80px; height: 40px;"
    >
      Left
    </button>
    <button
      type="button"
      data-tooltip-trigger="right-tip"
      style="position: fixed; left: 100px; top: 100px; width: 80px; height: 40px;"
    >
      Right
    </button>
    <pe-tooltip id="left-tip" data-tooltip-side="left" data-tooltip-offset="12">
      <span
        data-tooltip-content
        style="display: block; width: 120px; height: 30px;"
      >
        Left side.
      </span>
    </pe-tooltip>
    <pe-tooltip id="right-tip" data-tooltip-side="right" data-tooltip-offset="12">
      <span
        data-tooltip-content
        style="display: block; width: 120px; height: 30px;"
      >
        Right side.
      </span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const leftTrigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='left-tip']"
  );
  const rightTrigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='right-tip']"
  );
  const leftContent = document.querySelector<HTMLElement>(
    "pe-tooltip#left-tip [data-tooltip-content]"
  );
  const rightContent = document.querySelector<HTMLElement>(
    "pe-tooltip#right-tip [data-tooltip-content]"
  );

  leftTrigger?.focus();
  rightTrigger?.focus();

  expect(leftContent?.dataset.side).toBe("left");
  expect(leftContent?.style.left).toBe("168px");
  expect(leftContent?.style.top).toBe("105px");
  expect(rightContent?.dataset.side).toBe("right");
  expect(rightContent?.style.left).toBe("192px");
  expect(rightContent?.style.top).toBe("105px");
});

test("flips to the opposite side when the preferred side collides", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-tooltip-trigger="save-tip"
      style="position: fixed; left: 100px; top: 2px; width: 80px; height: 20px;"
    >
      Save
    </button>
    <pe-tooltip id="save-tip" data-tooltip-side="top" data-tooltip-offset="8">
      <span
        data-tooltip-content
        style="display: block; width: 120px; height: 30px;"
      >
        Saved changes are published.
      </span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.focus();

  expect(content?.dataset.side).toBe("bottom");
  expect(content?.style.top).toBe("30px");
});

test("supports align offset on the cross axis", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-tooltip-trigger="save-tip"
      style="position: fixed; left: 100px; top: 100px; width: 80px; height: 40px;"
    >
      Save
    </button>
    <pe-tooltip
      id="save-tip"
      data-tooltip-side="bottom"
      data-tooltip-align="end"
      data-tooltip-offset="12"
      data-tooltip-align-offset="-8"
    >
      <span
        data-tooltip-content
        style="display: block; width: 120px; height: 30px;"
      >
        Saved changes are published.
      </span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.focus();

  expect(content?.dataset.align).toBe("end");
  expect(content?.style.left).toBe("52px");
  expect(content?.style.top).toBe("152px");
});

test("binds a dynamically added external trigger", async () => {
  document.body.innerHTML = `
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.dataset.tooltipTrigger = "save-tip";
  trigger.textContent = "Save";
  document.body.prepend(trigger);

  await nextMicrotask();
  await nextMicrotask();

  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger.focus();

  expect(trigger.dataset.state).toBe("open");
  expect(trigger.getAttribute("aria-describedby")).toBe(content?.id);
});

test("restores managed trigger and content attributes when disconnected", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-tooltip-trigger="save-tip"
      data-state="idle"
      aria-describedby="authored-description"
    >
      Save
    </button>
    <pe-tooltip id="save-tip">
      <span
        data-tooltip-content
        data-state="idle"
        role="note"
        style="color: red;"
      >
        Saved changes are published.
      </span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='save-tip']"
  );
  const host = document.querySelector<TooltipElement>("pe-tooltip");
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.focus();
  host?.remove();
  await nextMicrotask();

  expect(trigger?.dataset.state).toBe("idle");
  expect(trigger?.getAttribute("aria-describedby")).toBe("authored-description");
  expect(content?.dataset.state).toBe("idle");
  expect(content?.getAttribute("role")).toBe("note");
  expect(content?.getAttribute("style")).toBe("color: red;");
  expect(content?.hasAttribute("hidden")).toBe(false);
});

test("warns and ignores an empty external trigger", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger>Ignored</button>
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");
  await nextMicrotask();

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger]"
  );

  trigger?.focus();

  expect(trigger?.dataset.state).toBeUndefined();
  expect(warn).toHaveBeenCalledWith(
    "[pe-tooltip] Empty [data-tooltip-trigger] outside <pe-tooltip> is ignored."
  );
});

test("warns for a trigger that references a missing enhanced tooltip", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  document.body.innerHTML = `
    <button type="button" data-tooltip-trigger="missing-tip">Missing</button>
    <pe-tooltip id="save-tip">
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");
  await nextMicrotask();

  expect(warn).toHaveBeenCalledWith(
    '[pe-tooltip] [data-tooltip-trigger="missing-tip"] does not match an enhanced tooltip.'
  );
});

test("does not change authored DOM structure during initialization", async () => {
  document.body.innerHTML = `
    <pe-tooltip>
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content>Saved changes are published.</span>
    </pe-tooltip>
  `;

  const host = document.querySelector("pe-tooltip");
  const beforeElements = Array.from(host?.querySelectorAll("*") ?? []);

  await customElements.whenDefined("pe-tooltip");
  await nextMicrotask();

  const afterElements = Array.from(host?.querySelectorAll("*") ?? []);

  expect(afterElements).toEqual(beforeElements);
  expect(afterElements.map((element) => element.tagName)).toEqual([
    "BUTTON",
    "SPAN"
  ]);
});

test("upgrades hosts already present in the document", async () => {
  document.body.innerHTML = `
    <pe-tooltip>
      <button type="button" data-tooltip-trigger>Save</button>
      <span data-tooltip-content hidden>Tip</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");
  await nextMicrotask();

  const host = document.querySelector("pe-tooltip");

  expect(host).toBeInstanceOf(TooltipElement);
  expect(host?.dataset.state).toBe("closed");
  expect(host?.querySelector("[data-tooltip-content]")?.hasAttribute("hidden")).toBe(
    true
  );
});

test("positions an authored arrow against the active trigger", async () => {
  document.body.innerHTML = `
    <pe-tooltip data-tooltip-side="bottom" data-tooltip-align="start">
      <button
        type="button"
        data-tooltip-trigger
        style="position: fixed; left: 100px; top: 100px; width: 80px; height: 40px"
      >Save</button>
      <span
        data-tooltip-content
        style="display: block; width: 120px; height: 30px"
      >
        <span
          data-tooltip-arrow
          style="display: block; width: 10px; height: 10px"
        ></span>
        Saved
      </span>
    </pe-tooltip>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const arrow = document.querySelector("[data-tooltip-arrow]") as HTMLElement;

  trigger.focus();

  expect(arrow.getAttribute("aria-hidden")).toBe("true");
  expect(arrow.dataset.state).toBe("open");
  expect(arrow.dataset.side).toBe("bottom");
  expect(arrow.dataset.align).toBe("start");
  expect(arrow.style.position).toBe("absolute");
  expect(Number.parseFloat(arrow.style.left)).toBeCloseTo(35, 0);
  expect(arrow.hasAttribute("data-uncentered")).toBe(false);

  arrow.style.width = "20px";
  await waitForFrame(() => arrow.style.left === "30px");

  expect(arrow.style.left).toBe("30px");
});

test("clamps an arrow to arrow padding and marks it uncentered", async () => {
  document.body.innerHTML = `
    <pe-tooltip
      data-tooltip-side="bottom"
      data-tooltip-arrow-padding="20"
    >
      <button
        type="button"
        data-tooltip-trigger
        style="position: fixed; left: 1px; top: 100px; width: 10px; height: 20px"
      >Tip</button>
      <span
        data-tooltip-content
        style="display: block; width: 120px; height: 30px"
      >
        <span
          data-tooltip-arrow
          style="display: block; width: 10px; height: 10px"
        ></span>
        Hint
      </span>
    </pe-tooltip>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const arrow = document.querySelector("[data-tooltip-arrow]") as HTMLElement;

  trigger.focus();

  expect(arrow.style.left).toBe("20px");
  expect(arrow.hasAttribute("data-uncentered")).toBe(true);
});

test("updates arrow axes and restores authored arrow attributes", async () => {
  document.body.innerHTML = `
    <pe-tooltip data-tooltip-side="bottom">
      <button
        type="button"
        data-tooltip-trigger
        style="position: fixed; left: 100px; top: 100px; width: 80px; height: 40px"
      >Tip</button>
      <span
        data-tooltip-content
        style="display: block; width: 120px; height: 30px"
      >
        <span
          data-tooltip-arrow
          data-state="authored"
          data-side="authored"
          aria-hidden="false"
          style="display: block; width: 10px; height: 10px; left: 2px"
        ></span>
        Hint
      </span>
    </pe-tooltip>
  `;

  const host = document.querySelector("pe-tooltip") as TooltipElement;
  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-tooltip-content]") as HTMLElement;
  const arrow = document.querySelector("[data-tooltip-arrow]") as HTMLElement;

  trigger.focus();
  await waitForFrame(() => !content.hasAttribute("data-starting-style"));
  host.setAttribute("data-tooltip-side", "right");
  await nextMicrotask();

  expect(arrow.dataset.side).toBe("right");
  expect(arrow.style.left).toBe("2px");
  expect(Number.parseFloat(arrow.style.top)).toBeCloseTo(10, 0);

  host.remove();
  await nextMicrotask();

  expect(arrow.dataset.state).toBe("authored");
  expect(arrow.dataset.side).toBe("authored");
  expect(arrow.hasAttribute("data-align")).toBe(false);
  expect(arrow.hasAttribute("data-uncentered")).toBe(false);
  expect(arrow.getAttribute("aria-hidden")).toBe("false");
  expect(arrow.getAttribute("style")).toBe(
    "display: block; width: 10px; height: 10px; left: 2px"
  );
});
