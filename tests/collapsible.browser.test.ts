import { afterEach, expect, test } from "vitest";
import { userEvent } from "vitest/browser";
import {
  CollapsibleElement,
  type CollapsibleEventDetail
} from "../src/collapsible";

async function nextTask(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 20));
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

function panelHeightVar(panel: HTMLElement): string {
  return panel.style.getPropertyValue("--collapsible-panel-height");
}

function renderCollapsible(attributes = ""): CollapsibleElement {
  document.body.innerHTML = `
    <pe-collapsible ${attributes}>
      <button type="button" data-collapsible-trigger>Details</button>
      <div data-collapsible-panel>Collapsible content</div>
    </pe-collapsible>
  `;

  return document.querySelector<CollapsibleElement>("pe-collapsible")!;
}

afterEach(() => {
  document.body.replaceChildren();
});

test("defines pe-collapsible and wires trigger and panel ARIA", () => {
  const host = renderCollapsible();
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const panel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;

  expect(customElements.get("pe-collapsible")).toBe(CollapsibleElement);
  expect(host.isOpen).toBe(false);
  expect(host.dataset.state).toBe("closed");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
  expect(panel.id).toMatch(/^pe-collapsible-panel-/);
  expect(panel.hidden).toBe(true);
});

test("toggles from the trigger and emits composed events", () => {
  const host = renderCollapsible();
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const events: Array<CustomEvent<CollapsibleEventDetail>> = [];
  document.addEventListener(
    "pe-collapsible:open",
    (event) => {
      events.push(event as CustomEvent<CollapsibleEventDetail>);
    },
    { once: true }
  );

  trigger.click();

  expect(host.isOpen).toBe(true);
  expect(host.hasAttribute("data-collapsible-open")).toBe(true);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(
    host.querySelector<HTMLElement>("[data-collapsible-panel]")?.hidden
  ).toBe(false);
  expect(events[0]?.detail.reason).toBe("trigger");
  expect(events[0]?.detail.trigger).toBe(trigger);
  expect(events[0]?.composed).toBe(true);
  expect(events[0]?.bubbles).toBe(true);
});

test("supports isOpen getter and open, close, and toggle methods", () => {
  const host = renderCollapsible();

  host.open();
  expect(host.isOpen).toBe(true);
  host.close();
  expect(host.isOpen).toBe(false);
  host.open();
  expect(host.isOpen).toBe(true);
  host.toggle();
  expect(host.isOpen).toBe(false);
});

test("responds to external open attribute changes", async () => {
  const host = renderCollapsible();
  const events: CollapsibleEventDetail[] = [];
  host.addEventListener("pe-collapsible:open", (event) => {
    events.push((event as CustomEvent<CollapsibleEventDetail>).detail);
  });

  host.setAttribute("data-collapsible-open", "");
  await nextTask();

  expect(host.isOpen).toBe(true);
  expect(events[0]?.reason).toBe("attribute");
});

test("emits composed close events with reason and detail", async () => {
  const host = renderCollapsible("data-collapsible-open");
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const panel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;
  const closes: Array<CustomEvent<CollapsibleEventDetail>> = [];
  host.addEventListener("pe-collapsible:close", (event) => {
    closes.push(event as CustomEvent<CollapsibleEventDetail>);
  });

  expect(host.isOpen).toBe(true);

  // Close from the trigger.
  trigger.click();

  expect(host.isOpen).toBe(false);
  const fromTrigger = closes.at(-1)!;
  expect(fromTrigger.detail.open).toBe(false);
  expect(fromTrigger.detail.reason).toBe("trigger");
  expect(fromTrigger.detail.trigger).toBe(trigger);
  expect(fromTrigger.detail.panel).toBe(panel);
  expect(fromTrigger.composed).toBe(true);
  expect(fromTrigger.bubbles).toBe(true);

  // Close via close(trigger).
  host.open();
  host.close(trigger);

  expect(closes.at(-1)?.detail.reason).toBe("programmatic");
  expect(closes.at(-1)?.detail.trigger).toBe(trigger);

  // Close via close() (no trigger in detail).
  host.open();
  host.close();

  expect(closes.at(-1)?.detail.reason).toBe("programmatic");
  expect(closes.at(-1)?.detail.trigger).toBeUndefined();

  // Close by removing the open attribute.
  host.open();
  host.removeAttribute("data-collapsible-open");
  await nextTask();

  expect(host.isOpen).toBe(false);
  expect(closes.at(-1)?.detail.reason).toBe("attribute");
});

test("passes the trigger through open and close detail", () => {
  const host = renderCollapsible();
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const opens: Array<CustomEvent<CollapsibleEventDetail>> = [];
  const closes: Array<CustomEvent<CollapsibleEventDetail>> = [];
  host.addEventListener("pe-collapsible:open", (event) => {
    opens.push(event as CustomEvent<CollapsibleEventDetail>);
  });
  host.addEventListener("pe-collapsible:close", (event) => {
    closes.push(event as CustomEvent<CollapsibleEventDetail>);
  });

  host.open(trigger);
  expect(opens.at(-1)?.detail.reason).toBe("programmatic");
  expect(opens.at(-1)?.detail.trigger).toBe(trigger);

  host.close(trigger);
  expect(closes.at(-1)?.detail.reason).toBe("programmatic");
  expect(closes.at(-1)?.detail.trigger).toBe(trigger);
});

test("ignores user interaction while disabled", async () => {
  const host = renderCollapsible("data-collapsible-disabled");
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;

  trigger.click();

  expect(host.isOpen).toBe(false);
  expect(host.hasAttribute("data-disabled")).toBe(true);
  expect(trigger.getAttribute("aria-disabled")).toBe("true");

  host.disabled = false;
  await nextTask();
  trigger.click();

  expect(host.isOpen).toBe(true);
});

test("does not toggle from the keyboard while disabled", async () => {
  const host = renderCollapsible("data-collapsible-disabled");
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const events: string[] = [];
  host.addEventListener("pe-collapsible:open", () => events.push("open"));
  host.addEventListener("pe-collapsible:close", () => events.push("close"));

  // The keydown guard cancels activation keys so the browser never
  // synthesizes the follow-up click while disabled.
  const disabledEnter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  });
  trigger.dispatchEvent(disabledEnter);
  expect(disabledEnter.defaultPrevented).toBe(true);

  trigger.focus();
  await userEvent.keyboard("{Enter}");

  expect(host.isOpen).toBe(false);

  await userEvent.keyboard(" ");

  expect(host.isOpen).toBe(false);
  expect(events).toEqual([]);

  host.disabled = false;
  await nextTask();

  const enabledEnter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  });
  trigger.dispatchEvent(enabledEnter);
  expect(enabledEnter.defaultPrevented).toBe(false);

  trigger.focus();
  await userEvent.keyboard("{Enter}");

  expect(host.isOpen).toBe(true);
  expect(events).toEqual(["open"]);
});

test("uses hidden until found and opens for beforematch", () => {
  const host = renderCollapsible("data-collapsible-hidden-until-found");
  const panel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;
  const events: CollapsibleEventDetail[] = [];
  host.addEventListener("pe-collapsible:open", (event) => {
    events.push((event as CustomEvent<CollapsibleEventDetail>).detail);
  });

  expect(panel.getAttribute("hidden")).toBe("until-found");
  expect(panel.hasAttribute("data-starting-style")).toBe(true);

  panel.dispatchEvent(new Event("beforematch"));

  expect(host.isOpen).toBe(true);
  expect(panel.hidden).toBe(false);
  expect(panel.hasAttribute("data-starting-style")).toBe(false);
  expect(events[0]?.reason).toBe("beforematch");
});

test("tracks dynamic markup and restores managed attributes", async () => {
  const host = renderCollapsible();
  const oldPanel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;
  oldPanel.remove();
  const panel = document.createElement("section");
  panel.dataset.collapsiblePanel = "";
  panel.textContent = "Replacement";
  host.append(panel);
  await nextTask();

  host.open();

  expect(panel.hidden).toBe(false);
  expect(panel.dataset.state).toBe("open");

  host.remove();

  expect(panel.id).toBe("");
  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(panel.hasAttribute("data-state")).toBe(false);
});

test("does not manage nested collapsibles from the outer host", async () => {
  document.body.innerHTML = `
    <pe-collapsible data-collapsible-open>
      <button data-collapsible-trigger>Outer</button>
      <div data-collapsible-panel>
        <pe-collapsible>
          <button data-collapsible-trigger>Inner</button>
          <div data-collapsible-panel>Inner panel</div>
        </pe-collapsible>
      </div>
    </pe-collapsible>
  `;

  const hosts = document.querySelectorAll<CollapsibleElement>("pe-collapsible");
  const outerHost = hosts[0]!;
  const innerHost = hosts[1]!;
  const outerTrigger = outerHost.querySelector<HTMLElement>(
    "[data-collapsible-trigger]"
  )!;
  const innerTrigger = innerHost.querySelector<HTMLElement>(
    "[data-collapsible-trigger]"
  )!;

  expect(outerHost.isOpen).toBe(true);
  expect(innerHost.isOpen).toBe(false);

  innerTrigger.click();
  await nextTask();

  expect(outerHost.isOpen).toBe(true);
  expect(innerHost.isOpen).toBe(true);

  outerTrigger.click();
  await nextTask();

  expect(outerHost.isOpen).toBe(false);
  expect(innerHost.isOpen).toBe(true);

  outerTrigger.click();
  await nextTask();

  expect(outerHost.isOpen).toBe(true);
  expect(innerHost.isOpen).toBe(true);
});

test("exposes panel size variables when open", async () => {
  const host = renderCollapsible();
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const panel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;

  trigger.click();

  expect(panel.style.getPropertyValue("--collapsible-panel-height")).toMatch(
    /^\d+px$/
  );
  expect(panel.style.getPropertyValue("--collapsible-panel-width")).toMatch(
    /^\d+px$/
  );

  await waitForFrame(() => panelHeightVar(panel) === "auto");

  expect(panel.style.getPropertyValue("--collapsible-panel-height")).toBe("auto");
  expect(panel.style.getPropertyValue("--collapsible-panel-width")).toBe("auto");
});

test("clears panel dimensions after open so content can grow", async () => {
  document.body.innerHTML = `
    <style>
      [data-collapsible-panel] {
        height: var(--collapsible-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-collapsible-panel][data-starting-style],
      [data-collapsible-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-collapsible>
      <button type="button" data-collapsible-trigger>Details</button>
      <div data-collapsible-panel><p>Initial</p></div>
    </pe-collapsible>
  `;
  const host = document.querySelector<CollapsibleElement>("pe-collapsible")!;
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const panel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;

  trigger.click();
  await waitForFrame(() => panelHeightVar(panel) === "auto");

  const initialHeight = Number.parseFloat(getComputedStyle(panel).height);
  panel.insertAdjacentHTML("beforeend", "<p>More content after open</p>");
  await new Promise((resolve) => window.setTimeout(resolve, 20));

  expect(Number.parseFloat(getComputedStyle(panel).height)).toBeGreaterThan(
    initialHeight
  );
});

test("animates a close transition after open dimensions return to auto", async () => {
  document.body.innerHTML = `
    <style>
      [data-collapsible-panel] {
        height: var(--collapsible-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-collapsible-panel][data-starting-style],
      [data-collapsible-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-collapsible>
      <button type="button" data-collapsible-trigger>Details</button>
      <div data-collapsible-panel><p>Collapsible content</p></div>
    </pe-collapsible>
  `;
  const host = document.querySelector<CollapsibleElement>("pe-collapsible")!;
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const panel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;

  trigger.click();
  await waitForFrame(() => panelHeightVar(panel) === "auto");

  expect(panel.style.getPropertyValue("--collapsible-panel-height")).toBe("auto");

  trigger.click();
  await nextFrame(2);

  expect(panel.hasAttribute("data-ending-style")).toBe(true);
  expect(panel.getAnimations().length).toBeGreaterThan(0);
  expect(Number.parseFloat(getComputedStyle(panel).height)).toBeGreaterThan(0);

  await waitForFrame(() => panel.hidden === true);

  expect(panel.hidden).toBe(true);
  expect(panel.hasAttribute("data-ending-style")).toBe(false);
});

test("animates an open transition from zero height", async () => {
  document.body.innerHTML = `
    <style>
      [data-collapsible-panel] {
        height: var(--collapsible-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-collapsible-panel][data-starting-style],
      [data-collapsible-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-collapsible data-collapsible-hidden-until-found>
      <button type="button" data-collapsible-trigger>Details</button>
      <div data-collapsible-panel>Collapsible content</div>
    </pe-collapsible>
  `;
  const host = document.querySelector<CollapsibleElement>("pe-collapsible")!;
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const panel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;

  trigger.click();

  expect(panel.hasAttribute("data-starting-style")).toBe(true);
  expect(getComputedStyle(panel).height).toBe("0px");

  await waitForFrame(
    () =>
      !panel.hasAttribute("data-starting-style") &&
      Number.parseFloat(getComputedStyle(panel).height) > 0 &&
      panel.getAnimations().length > 0
  );

  expect(panel.hasAttribute("data-starting-style")).toBe(false);
  expect(Number.parseFloat(getComputedStyle(panel).height)).toBeGreaterThan(0);
  expect(panel.getAnimations().length).toBeGreaterThan(0);
});

test("restores motion styles when close interrupts open animation", async () => {
  document.body.innerHTML = `
    <style>
      [data-collapsible-panel] {
        height: var(--collapsible-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-collapsible-panel][data-starting-style],
      [data-collapsible-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-collapsible data-collapsible-hidden-until-found>
      <button type="button" data-collapsible-trigger>Details</button>
      <div data-collapsible-panel>Collapsible content</div>
    </pe-collapsible>
  `;
  const host = document.querySelector<CollapsibleElement>("pe-collapsible")!;
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const panel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;

  trigger.click();
  trigger.click();
  await nextFrame(1);

  expect(panel.style.getPropertyValue("transition-duration")).toBe("");
  expect(panel.hasAttribute("data-ending-style")).toBe(true);

  await waitForFrame(() => panel.getAttribute("hidden") === "until-found");

  expect(panel.getAttribute("hidden")).toBe("until-found");
  expect(panel.hasAttribute("data-starting-style")).toBe(true);

  trigger.click();
  await waitForFrame(
    () => !panel.hasAttribute("hidden") && panel.getAnimations().length > 0
  );

  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(panel.getAnimations().length).toBeGreaterThan(0);
});

test("waits for a close transition before hiding the panel", async () => {
  document.body.innerHTML = `
    <style>
      [data-collapsible-panel] {
        height: var(--collapsible-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-collapsible-panel][data-starting-style],
      [data-collapsible-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-collapsible data-collapsible-open>
      <button type="button" data-collapsible-trigger>Details</button>
      <div data-collapsible-panel>Collapsible content</div>
    </pe-collapsible>
  `;
  const host = document.querySelector<CollapsibleElement>("pe-collapsible")!;
  const trigger = host.querySelector<HTMLElement>("[data-collapsible-trigger]")!;
  const panel = host.querySelector<HTMLElement>("[data-collapsible-panel]")!;

  trigger.click();
  await waitForFrame(() => panel.hasAttribute("data-ending-style"));

  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(panel.hasAttribute("data-ending-style")).toBe(true);

  await waitForFrame(() => panel.hidden && !panel.hasAttribute("data-ending-style"));

  expect(panel.hidden).toBe(true);
  expect(panel.hasAttribute("data-ending-style")).toBe(false);
});
