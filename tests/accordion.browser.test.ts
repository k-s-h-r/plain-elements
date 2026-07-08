import { afterEach, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import {
  AccordionElement,
  type AccordionEventDetail
} from "../src/accordion";

async function nextTask(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 20));
}

async function nextFrame(count = 1): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

// Deterministically wait until an animation-driven condition holds instead of
// racing a fixed timeout. Resolves as soon as the condition is true (or after
// the frame cap, so a genuine regression still surfaces via the assertion).
async function waitForFrame(
  condition: () => boolean,
  maxFrames = 120
): Promise<void> {
  for (let index = 0; index < maxFrames && !condition(); index += 1) {
    await nextFrame(1);
  }
}

function panelHeightVar(panel: HTMLElement): string {
  return panel.style.getPropertyValue("--accordion-panel-height");
}

function renderAccordion(): AccordionElement {
  document.body.innerHTML = `
    <pe-accordion>
      <details data-accordion-item data-accordion-value="shipping">
        <summary>Shipping</summary>
        <p>Shipping content</p>
      </details>
      <details data-accordion-item data-accordion-value="returns">
        <summary>Returns</summary>
        <p>Returns content</p>
      </details>
    </pe-accordion>
  `;

  return document.querySelector<AccordionElement>("pe-accordion")!;
}

function renderManagedAccordion(single = false): AccordionElement {
  document.body.innerHTML = `
    <pe-accordion
      ${single ? "data-accordion-single" : ""}
      data-accordion-hidden-until-found
    >
      <div data-accordion-item data-accordion-value="shipping">
        <h3>
          <button type="button" data-accordion-trigger>Shipping</button>
        </h3>
        <div data-accordion-panel>Shipping content</div>
      </div>
      <div data-accordion-item data-accordion-value="returns">
        <h3>
          <button type="button" data-accordion-trigger>Returns</button>
        </h3>
        <div data-accordion-panel>Returns content</div>
      </div>
    </pe-accordion>
  `;

  return document.querySelector<AccordionElement>("pe-accordion")!;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test("defines pe-accordion and reflects native details state", () => {
  const host = renderAccordion();
  const details = host.querySelector<HTMLDetailsElement>("details")!;
  const summary = details.querySelector<HTMLElement>("summary")!;

  expect(customElements.get("pe-accordion")).toBe(AccordionElement);
  expect(host.dataset.state).toBe("closed");
  expect(details.dataset.state).toBe("closed");
  expect(summary.dataset.state).toBe("closed");
  expect(summary.hasAttribute("role")).toBe(false);
  expect(summary.hasAttribute("aria-expanded")).toBe(false);
  expect(details.dataset.index).toBe("0");
  expect(summary.dataset.index).toBe("0");
});

test("keeps native summary behavior and emits open and close events", async () => {
  const host = renderAccordion();
  const details = host.querySelector<HTMLDetailsElement>("details")!;
  const summary = details.querySelector<HTMLElement>("summary")!;
  const events: Array<CustomEvent<AccordionEventDetail>> = [];

  host.addEventListener("pe-accordion:open", (event) => {
    events.push(event as CustomEvent<AccordionEventDetail>);
  });
  host.addEventListener("pe-accordion:close", (event) => {
    events.push(event as CustomEvent<AccordionEventDetail>);
  });

  summary.click();
  await nextTask();

  expect(details.open).toBe(true);
  expect(details.dataset.state).toBe("open");
  expect(summary.dataset.state).toBe("open");
  expect(host.dataset.state).toBe("open");
  expect(events[0]?.type).toBe("pe-accordion:open");
  expect(events[0]?.detail.reason).toBe("trigger");
  expect(events[0]?.detail.value).toBe("shipping");
  expect(events[0]?.detail.trigger).toBe(summary);
  expect(events[0]?.detail.summary).toBe(summary);
  expect(events[0]?.detail.panel).toBeNull();

  summary.click();
  await nextTask();

  expect(details.open).toBe(false);
  expect(events[1]?.type).toBe("pe-accordion:close");
});

test("uses authored details name for native single-open behavior", async () => {
  const host = renderAccordion();
  const details = host.querySelectorAll<HTMLDetailsElement>("details");
  details.forEach((item) => {
    item.name = "faq";
  });

  details[0]!.open = true;
  await nextTask();
  details[1]!.open = true;
  await nextTask();

  expect(details[0]?.open).toBe(false);
  expect(details[0]?.dataset.state).toBe("closed");
  expect(details[1]?.open).toBe(true);
  expect(details[1]?.dataset.state).toBe("open");
});

test("supports programmatic open, close, and toggle", async () => {
  const host = renderAccordion();
  const returns = host.querySelector<HTMLDetailsElement>(
    "[data-accordion-value='returns']"
  )!;
  const details: AccordionEventDetail[] = [];
  host.addEventListener(
    "pe-accordion:open",
    (event) => {
      details.push((event as CustomEvent<AccordionEventDetail>).detail);
    },
    { once: true }
  );

  host.open("returns");
  await nextTask();

  expect(returns.open).toBe(true);
  expect(details[0]?.reason).toBe("programmatic");

  host.toggle(returns);
  await nextTask();
  expect(returns.open).toBe(false);

  host.open(returns);
  await nextTask();
  host.close("returns");
  await nextTask();
  expect(returns.open).toBe(false);
});

test("gets and sets the open value array", async () => {
  const host = renderAccordion();

  host.value = ["shipping", "returns"];
  await nextTask();

  expect(host.value).toEqual(["shipping", "returns"]);

  host.value = ["returns"];
  await nextTask();

  expect(host.value).toEqual(["returns"]);
});

test("supports root and item disabled interaction", async () => {
  const host = renderAccordion();
  const items = host.querySelectorAll<HTMLDetailsElement>("details");
  const summaries = host.querySelectorAll<HTMLElement>("summary");
  host.setAttribute("data-accordion-disabled", "");
  await nextTask();

  summaries[0]?.click();
  await nextTask();

  expect(items[0]?.open).toBe(false);
  expect(summaries[0]?.getAttribute("aria-disabled")).toBe("true");
  expect(host.hasAttribute("data-disabled")).toBe(true);

  host.removeAttribute("data-accordion-disabled");
  items[1]?.setAttribute("data-accordion-disabled", "");
  await nextTask();
  summaries[0]?.click();
  summaries[1]?.click();
  await nextTask();

  expect(items[0]?.open).toBe(true);
  expect(items[1]?.open).toBe(false);
  expect(summaries[1]?.getAttribute("aria-disabled")).toBe("true");
});

test("does not toggle a disabled native item from the keyboard", async () => {
  const host = renderAccordion();
  const details = host.querySelectorAll<HTMLDetailsElement>("details");
  const summaries = host.querySelectorAll<HTMLElement>("summary");
  host.setAttribute("data-accordion-disabled", "");
  await nextTask();

  const disabledEnter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  });
  summaries[0]!.dispatchEvent(disabledEnter);
  expect(disabledEnter.defaultPrevented).toBe(true);

  summaries[0]!.focus();
  await userEvent.keyboard("{Enter}");

  expect(details[0]!.open).toBe(false);

  await userEvent.keyboard(" ");

  expect(details[0]!.open).toBe(false);

  host.removeAttribute("data-accordion-disabled");
  await nextTask();

  const enabledEnter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  });
  summaries[0]!.dispatchEvent(enabledEnter);
  expect(enabledEnter.defaultPrevented).toBe(false);

  summaries[0]!.focus();
  await userEvent.keyboard("{Enter}");

  expect(details[0]!.open).toBe(true);
});

test("does not toggle a disabled managed item from the keyboard", async () => {
  const host = renderManagedAccordion();
  const items = host.querySelectorAll<HTMLDivElement>("[data-accordion-item]");
  const triggers = host.querySelectorAll<HTMLButtonElement>(
    "[data-accordion-trigger]"
  );
  const opened: string[] = [];
  host.addEventListener("pe-accordion:open", () => opened.push("open"));

  items[0]!.setAttribute("data-accordion-disabled", "");
  await nextTask();

  const disabledEnter = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true
  });
  triggers[0]!.dispatchEvent(disabledEnter);
  expect(disabledEnter.defaultPrevented).toBe(true);

  triggers[0]!.focus();
  await userEvent.keyboard("{Enter}");
  await userEvent.keyboard(" ");
  await nextTask();

  expect(host.value).toEqual([]);
  expect(opened).toEqual([]);

  host.setAttribute("data-accordion-disabled", "");
  items[0]!.removeAttribute("data-accordion-disabled");
  await nextTask();

  triggers[1]!.focus();
  await userEvent.keyboard("{Enter}");
  await nextTask();

  expect(host.value).toEqual([]);
  expect(opened).toEqual([]);

  host.removeAttribute("data-accordion-disabled");
  await nextTask();
  triggers[0]!.focus();
  await userEvent.keyboard("{Enter}");
  await nextTask();

  expect(host.value).toEqual(["shipping"]);
  expect(opened).toEqual(["open"]);
});

test("tracks dynamically added items", async () => {
  const host = renderAccordion();
  const details = document.createElement("details");
  details.dataset.accordionItem = "";
  details.dataset.accordionValue = "warranty";
  details.innerHTML = "<summary>Warranty</summary><p>Warranty content</p>";
  host.append(details);
  await nextTask();

  host.open("warranty");
  await nextTask();

  expect(details.open).toBe(true);
  expect(details.dataset.state).toBe("open");
  expect(details.querySelector("summary")?.getAttribute("data-state")).toBe(
    "open"
  );
});

test("restores authored state attributes on disconnect", () => {
  const host = renderAccordion();
  const details = host.querySelector<HTMLDetailsElement>("details")!;
  const summary = details.querySelector<HTMLElement>("summary")!;

  host.remove();

  expect(details.hasAttribute("data-state")).toBe(false);
  expect(summary.hasAttribute("data-state")).toBe(false);
  expect(host.hasAttribute("data-state")).toBe(false);
});

test("does not manage nested accordions from the outer host", async () => {
  document.body.innerHTML = `
    <pe-accordion>
      <details data-accordion-item open>
        <summary>Outer</summary>
        <pe-accordion>
          <details data-accordion-item open>
            <summary>Inner</summary>
            <p>Inner content</p>
          </details>
        </pe-accordion>
      </details>
    </pe-accordion>
  `;

  const hosts = document.querySelectorAll<AccordionElement>("pe-accordion");
  const outerHost = hosts[0]!;
  const innerHost = hosts[1]!;
  const outerSummary = outerHost.querySelector<HTMLElement>("summary")!;
  const innerSummary = innerHost.querySelector<HTMLElement>("summary")!;

  expect(outerHost.dataset.state).toBe("open");
  expect(innerHost.dataset.state).toBe("open");

  innerSummary.click();
  await nextTask();

  expect(innerHost.dataset.state).toBe("closed");
  expect(outerHost.dataset.state).toBe("open");

  outerSummary.click();
  await nextTask();

  expect(outerHost.dataset.state).toBe("closed");
  expect(innerHost.dataset.state).toBe("closed");
});

test("enhances managed div items with explicit trigger and panel parts", () => {
  const host = renderManagedAccordion();
  const item = host.querySelector<HTMLDivElement>("[data-accordion-item]")!;
  const trigger = item.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = item.querySelector<HTMLElement>("[data-accordion-panel]")!;

  expect(host.dataset.state).toBe("closed");
  expect(item.dataset.state).toBe("closed");
  expect(trigger.dataset.state).toBe("closed");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
  expect(panel.dataset.state).toBe("closed");
  expect(panel.getAttribute("hidden")).toBe("until-found");
  expect(panel.hasAttribute("data-starting-style")).toBe(true);
});

test("does not infer missing managed trigger or panel parts", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  document.body.innerHTML = `
    <pe-accordion>
      <div data-accordion-item>
        <button type="button">Unmarked trigger</button>
        <div data-accordion-panel>Panel</div>
      </div>
      <div data-accordion-item>
        <button type="button" data-accordion-trigger>Trigger</button>
        <div>Unmarked panel</div>
      </div>
    </pe-accordion>
  `;
  const host = document.querySelector<AccordionElement>("pe-accordion")!;
  const triggers = host.querySelectorAll<HTMLButtonElement>("button");

  expect(host.dataset.state).toBe("closed");
  expect(triggers[0]?.hasAttribute("aria-expanded")).toBe(false);
  expect(triggers[1]?.hasAttribute("aria-expanded")).toBe(false);
  expect(warn).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});

test("opens and closes managed items and exposes panel size variables", async () => {
  const host = renderManagedAccordion();
  const item = host.querySelector<HTMLDivElement>("[data-accordion-item]")!;
  const trigger = item.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = item.querySelector<HTMLElement>("[data-accordion-panel]")!;
  const events: Array<CustomEvent<AccordionEventDetail>> = [];

  host.addEventListener("pe-accordion:open", (event) => {
    events.push(event as CustomEvent<AccordionEventDetail>);
  });
  host.addEventListener("pe-accordion:close", (event) => {
    events.push(event as CustomEvent<AccordionEventDetail>);
  });

  trigger.click();

  expect(item.hasAttribute("data-accordion-open")).toBe(true);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(panel.style.getPropertyValue("--accordion-panel-height")).toMatch(
    /^\d+px$/
  );
  expect(panel.style.getPropertyValue("--accordion-panel-width")).toMatch(
    /^\d+px$/
  );
  expect(events[0]?.detail.item).toBe(item);
  expect(events[0]?.detail.trigger).toBe(trigger);
  expect(events[0]?.detail.summary).toBe(trigger);
  expect(events[0]?.detail.panel).toBe(panel);
  expect(events[0]?.detail.reason).toBe("trigger");

  await waitForFrame(() => panelHeightVar(panel) === "auto");

  expect(panel.style.getPropertyValue("--accordion-panel-height")).toBe("auto");
  expect(panel.style.getPropertyValue("--accordion-panel-width")).toBe("auto");

  trigger.click();
  await waitForFrame(() => panel.getAttribute("hidden") === "until-found");

  expect(item.hasAttribute("data-accordion-open")).toBe(false);
  expect(panel.getAttribute("hidden")).toBe("until-found");
  expect(events[1]?.detail.reason).toBe("trigger");
});

test("supports managed multiple-open and explicit single-open behavior", async () => {
  const multipleHost = renderManagedAccordion();
  const multipleTriggers = multipleHost.querySelectorAll<HTMLButtonElement>(
    "[data-accordion-trigger]"
  );

  multipleTriggers[0]?.click();
  multipleTriggers[1]?.click();
  await nextTask();

  expect(multipleHost.value).toEqual(["shipping", "returns"]);

  const singleHost = renderManagedAccordion(true);
  const singleTriggers = singleHost.querySelectorAll<HTMLButtonElement>(
    "[data-accordion-trigger]"
  );

  singleTriggers[0]?.click();
  singleTriggers[1]?.click();
  await nextTask();

  expect(singleHost.value).toEqual(["returns"]);
});

test("supports managed methods and external open attributes", async () => {
  const host = renderManagedAccordion();
  const items = host.querySelectorAll<HTMLDivElement>("[data-accordion-item]");
  const reasons: string[] = [];
  host.addEventListener("pe-accordion:open", (event) => {
    reasons.push((event as CustomEvent<AccordionEventDetail>).detail.reason);
  });

  host.open("returns");
  await nextTask();
  expect(host.value).toEqual(["returns"]);
  expect(reasons[0]).toBe("programmatic");

  host.close(items[1]!);
  items[0]?.setAttribute("data-accordion-open", "");
  await nextTask();

  expect(host.value).toEqual(["shipping"]);
  expect(reasons[1]).toBe("attribute");
});

test("opens a managed hidden-until-found panel for beforematch", () => {
  const host = renderManagedAccordion();
  const item = host.querySelector<HTMLDivElement>("[data-accordion-item]")!;
  const trigger = item.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = item.querySelector<HTMLElement>("[data-accordion-panel]")!;
  let detail: AccordionEventDetail | undefined;
  host.addEventListener(
    "pe-accordion:open",
    (event) => {
      detail = (event as CustomEvent<AccordionEventDetail>).detail;
    },
    { once: true }
  );

  panel.dispatchEvent(new Event("beforematch"));

  expect(item.hasAttribute("data-accordion-open")).toBe(true);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(panel.hasAttribute("data-starting-style")).toBe(false);
  expect(detail?.reason).toBe("beforematch");
});

test("supports disabled managed items", async () => {
  const host = renderManagedAccordion();
  const items = host.querySelectorAll<HTMLDivElement>("[data-accordion-item]");
  const triggers = host.querySelectorAll<HTMLButtonElement>(
    "[data-accordion-trigger]"
  );
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;
  const panelId = panel.id;
  items[0]?.setAttribute("data-accordion-disabled", "");
  await nextTask();

  triggers[0]?.click();
  triggers[1]!.disabled = true;
  await nextTask();
  triggers[1]?.click();

  expect(host.value).toEqual([]);
  expect(panel.id).toBe(panelId);
  expect(triggers[0]?.getAttribute("aria-disabled")).toBe("true");
  expect(triggers[1]?.getAttribute("aria-disabled")).toBe("true");
});

test("animates a managed open transition from zero height", async () => {
  document.body.innerHTML = `
    <style>
      [data-accordion-panel] {
        height: var(--accordion-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-accordion-panel][data-starting-style],
      [data-accordion-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-accordion data-accordion-hidden-until-found>
      <div data-accordion-item data-accordion-value="shipping">
        <button type="button" data-accordion-trigger>Shipping</button>
        <div data-accordion-panel>Shipping content</div>
      </div>
    </pe-accordion>
  `;
  const host = document.querySelector<AccordionElement>("pe-accordion")!;
  const trigger = host.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;

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

  await waitForFrame(() => panelHeightVar(panel) === "auto");

  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(Number.parseFloat(getComputedStyle(panel).height)).toBeGreaterThan(0);
});

test("restores motion styles when close interrupts open animation", async () => {
  document.body.innerHTML = `
    <style>
      [data-accordion-panel] {
        height: var(--accordion-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-accordion-panel][data-starting-style],
      [data-accordion-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-accordion data-accordion-hidden-until-found>
      <div data-accordion-item data-accordion-value="shipping">
        <button type="button" data-accordion-trigger>Shipping</button>
        <div data-accordion-panel>Shipping content</div>
      </div>
    </pe-accordion>
  `;
  const host = document.querySelector<AccordionElement>("pe-accordion")!;
  const trigger = host.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;

  trigger.click();
  trigger.click();
  await nextFrame(1);

  expect(panel.style.transition).toBe("");
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

test("animates a managed close transition after open dimensions return to auto", async () => {
  document.body.innerHTML = `
    <style>
      [data-accordion-panel] {
        height: var(--accordion-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-accordion-panel][data-starting-style],
      [data-accordion-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-accordion>
      <div data-accordion-item data-accordion-value="shipping">
        <button type="button" data-accordion-trigger>Shipping</button>
        <div data-accordion-panel><p>Shipping content</p></div>
      </div>
    </pe-accordion>
  `;
  const host = document.querySelector<AccordionElement>("pe-accordion")!;
  const trigger = host.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;

  trigger.click();
  await waitForFrame(() => panelHeightVar(panel) === "auto");

  expect(panel.style.getPropertyValue("--accordion-panel-height")).toBe("auto");

  trigger.click();
  await nextFrame(2);

  expect(panel.hasAttribute("data-ending-style")).toBe(true);
  expect(panel.getAnimations().length).toBeGreaterThan(0);
  expect(Number.parseFloat(getComputedStyle(panel).height)).toBeGreaterThan(0);

  await waitForFrame(() => panel.hidden === true);

  expect(panel.hidden).toBe(true);
  expect(panel.hasAttribute("data-ending-style")).toBe(false);
});

test("waits for a managed close transition before hiding the panel", async () => {
  document.body.innerHTML = `
    <style>
      [data-accordion-panel] {
        height: var(--accordion-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-accordion-panel][data-starting-style],
      [data-accordion-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-accordion>
      <div data-accordion-item data-accordion-open>
        <button type="button" data-accordion-trigger>Shipping</button>
        <div data-accordion-panel><p>Shipping content</p></div>
      </div>
    </pe-accordion>
  `;
  const host = document.querySelector<AccordionElement>("pe-accordion")!;
  const trigger = host.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;

  trigger.click();
  await nextFrame(2);

  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(panel.hasAttribute("data-ending-style")).toBe(true);

  await waitForFrame(() => panel.hidden === true);

  expect(panel.hidden).toBe(true);
  expect(panel.hasAttribute("data-ending-style")).toBe(false);
});

test("reopens smoothly when close is interrupted before ending-style applies", async () => {
  document.body.innerHTML = `
    <style>
      [data-accordion-panel] {
        height: var(--accordion-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-accordion-panel][data-starting-style],
      [data-accordion-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-accordion>
      <div data-accordion-item data-accordion-value="shipping">
        <button type="button" data-accordion-trigger>Shipping</button>
        <div data-accordion-panel><p>Shipping content</p></div>
      </div>
    </pe-accordion>
  `;
  const host = document.querySelector<AccordionElement>("pe-accordion")!;
  const trigger = host.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;

  trigger.click();
  await waitForFrame(() => panelHeightVar(panel) === "auto");
  trigger.click();
  trigger.click();
  await nextFrame(2);

  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(
    panel.getAnimations().length > 0 ||
      Number.parseFloat(getComputedStyle(panel).height) > 0
  ).toBe(true);
});

test("reopens smoothly during a close transition", async () => {
  document.body.innerHTML = `
    <style>
      [data-accordion-panel] {
        height: var(--accordion-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-accordion-panel][data-starting-style],
      [data-accordion-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-accordion>
      <div data-accordion-item data-accordion-value="shipping">
        <button type="button" data-accordion-trigger>Shipping</button>
        <div data-accordion-panel><p>Shipping content</p></div>
      </div>
    </pe-accordion>
  `;
  const host = document.querySelector<AccordionElement>("pe-accordion")!;
  const trigger = host.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;

  trigger.click();
  await waitForFrame(() => panelHeightVar(panel) === "auto");
  trigger.click();
  await nextFrame(2);
  trigger.click();
  await nextFrame(2);

  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(panel.hasAttribute("data-ending-style")).toBe(false);
  expect(
    panel.getAnimations().length > 0 ||
      Number.parseFloat(getComputedStyle(panel).height) > 10
  ).toBe(true);
});

test("does not hide immediately on rapid close after open", async () => {
  document.body.innerHTML = `
    <style>
      [data-accordion-panel] {
        height: var(--accordion-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-accordion-panel][data-starting-style],
      [data-accordion-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-accordion>
      <div data-accordion-item data-accordion-value="shipping">
        <button type="button" data-accordion-trigger>Shipping</button>
        <div data-accordion-panel><p>Shipping content</p></div>
      </div>
    </pe-accordion>
  `;
  const host = document.querySelector<AccordionElement>("pe-accordion")!;
  const trigger = host.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;

  trigger.click();
  trigger.click();
  await nextFrame(2);

  expect(panel.hidden).toBe(false);
  expect(
    panel.hasAttribute("data-ending-style") ||
      panel.getAnimations().length > 0 ||
      Number.parseFloat(getComputedStyle(panel).height) > 0
  ).toBe(true);
});

test("cancels a pending managed hide when the panel reopens", async () => {
  document.body.innerHTML = `
    <style>
      [data-accordion-panel] {
        height: var(--accordion-panel-height);
        overflow: hidden;
        transition: height 60ms linear;
      }

      [data-accordion-panel][data-starting-style],
      [data-accordion-panel][data-ending-style] {
        height: 0;
      }
    </style>
    <pe-accordion>
      <div data-accordion-item data-accordion-open>
        <button type="button" data-accordion-trigger>Shipping</button>
        <div data-accordion-panel><p>Shipping content</p></div>
      </div>
    </pe-accordion>
  `;
  const host = document.querySelector<AccordionElement>("pe-accordion")!;
  const trigger = host.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;

  trigger.click();
  trigger.click();
  await waitForFrame(
    () =>
      !panel.hasAttribute("data-ending-style") && !panel.hasAttribute("hidden")
  );

  expect(host.value).toEqual([]);
  expect(
    host
      .querySelector<HTMLDivElement>("[data-accordion-item]")
      ?.hasAttribute("data-accordion-open")
  ).toBe(true);
  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(panel.hasAttribute("data-ending-style")).toBe(false);
});

test("restores managed ARIA, hidden, state, and style on disconnect", () => {
  const host = renderManagedAccordion();
  const trigger = host.querySelector<HTMLButtonElement>(
    "[data-accordion-trigger]"
  )!;
  const panel = host.querySelector<HTMLElement>("[data-accordion-panel]")!;

  expect(panel.getAttribute("style")).toBeNull();
  host.open("shipping");
  host.remove();

  expect(trigger.hasAttribute("aria-controls")).toBe(false);
  expect(trigger.hasAttribute("aria-expanded")).toBe(false);
  expect(trigger.hasAttribute("data-state")).toBe(false);
  expect(panel.hasAttribute("id")).toBe(false);
  expect(panel.hasAttribute("hidden")).toBe(false);
  expect(panel.style.getPropertyValue("--accordion-panel-height")).toBe("");
  expect(panel.style.getPropertyValue("--accordion-panel-width")).toBe("");
  expect(panel.hasAttribute("data-state")).toBe(false);
});
