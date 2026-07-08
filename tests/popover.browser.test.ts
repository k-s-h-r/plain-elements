import { afterEach, expect, test, vi } from "vitest";
import {
  PopoverElement,
  type PopoverEventDetail
} from "../src/popover";

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

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitForPopoverOpen(content: HTMLElement): Promise<void> {
  await waitForFrame(() => content.matches(":popover-open"));
}

async function waitForPopoverClosed(content: HTMLElement): Promise<void> {
  await waitForFrame(() => !content.matches(":popover-open"));
}

async function waitForActiveElement(element: Element): Promise<void> {
  await waitForFrame(() => document.activeElement === element);
}

function setupBasicPopover(): {
  host: PopoverElement;
  trigger: HTMLButtonElement;
  content: HTMLElement;
} {
  document.body.innerHTML = `
    <pe-popover>
      <button type="button" data-popover-trigger>Open</button>
      <div data-popover-content hidden>
        <h2 data-popover-title>Account</h2>
        <input aria-label="Name">
        <button type="button" data-popover-close>Close</button>
      </div>
    </pe-popover>
  `;

  return {
    host: document.querySelector("pe-popover") as PopoverElement,
    trigger: document.querySelector("[data-popover-trigger]") as HTMLButtonElement,
    content: document.querySelector("[data-popover-content]") as HTMLElement
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test("defines pe-popover custom element", () => {
  expect(customElements.get("pe-popover")).toBe(PopoverElement);
});

test("enhances content as a closed native popover without changing structure", () => {
  document.body.innerHTML = `
    <pe-popover>
      <button data-popover-trigger>Open</button>
      <section data-popover-content aria-label="Example" hidden><p>Content</p></section>
    </pe-popover>
  `;

  const host = document.querySelector("pe-popover") as PopoverElement;
  const content = document.querySelector("[data-popover-content]") as HTMLElement;

  expect(host.children).toHaveLength(2);
  expect(content.parentElement).toBe(host);
  expect(host.dataset.state).toBe("closed");
  expect(content.dataset.state).toBe("closed");
  expect(content.getAttribute("popover")).toBe("manual");
  expect(content.getAttribute("role")).toBe("dialog");
  expect(content.getAttribute("tabindex")).toBe("-1");
  expect(content.hasAttribute("hidden")).toBe(false);
  expect(content.matches(":popover-open")).toBe(false);
});

test("opens from an internal trigger and synchronizes ARIA and state", async () => {
  const { host, trigger, content } = setupBasicPopover();
  const openEvent = new Promise<CustomEvent<PopoverEventDetail>>((resolve) => {
    host.addEventListener(
      "pe-popover:open",
      (event) => resolve(event as CustomEvent<PopoverEventDetail>),
      { once: true }
    );
  });

  expect(host.isOpen).toBe(false);

  trigger.click();
  const event = await openEvent;

  expect(content.matches(":popover-open")).toBe(true);
  expect(host.isOpen).toBe(true);
  expect(host.dataset.state).toBe("open");
  expect(content.dataset.state).toBe("open");
  expect(trigger.dataset.state).toBe("open");
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
  expect(trigger.getAttribute("aria-controls")).toBe(content.id);
  expect(event.detail.reason).toBe("trigger");
});

test("stays closed when beforetoggle cancels opening", async () => {
  const { host, trigger, content } = setupBasicPopover();
  const onOpen = vi.fn();

  content.addEventListener("beforetoggle", (event) => {
    if ((event as ToggleEvent).newState === "open") {
      event.preventDefault();
    }
  });
  host.addEventListener("pe-popover:open", onOpen);

  trigger.click();
  await waitForPopoverClosed(content);

  expect(content.matches(":popover-open")).toBe(false);
  expect(host.dataset.state).toBe("closed");
  expect(content.dataset.state).toBe("closed");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(onOpen).not.toHaveBeenCalled();
});

test("closes when the active trigger is pressed again", async () => {
  const { host, trigger, content } = setupBasicPopover();

  trigger.click();
  await waitForPopoverOpen(content);

  const closeEvent = new Promise<CustomEvent<PopoverEventDetail>>((resolve) => {
    host.addEventListener(
      "pe-popover:close",
      (event) => resolve(event as CustomEvent<PopoverEventDetail>),
      { once: true }
    );
  });

  trigger.click();
  const event = await closeEvent;
  await waitForPopoverClosed(content);

  expect(content.matches(":popover-open")).toBe(false);
  expect(event.detail.reason).toBe("trigger");
});

test("does not reopen when the active trigger is pressed again while open", async () => {
  const { host, trigger, content } = setupBasicPopover();
  let openCount = 0;

  host.addEventListener("pe-popover:open", () => {
    openCount += 1;
  });

  trigger.click();
  await waitForPopoverOpen(content);
  expect(openCount).toBe(1);

  trigger.click();
  await waitForPopoverClosed(content);

  expect(openCount).toBe(1);
  expect(content.matches(":popover-open")).toBe(false);
});

test("closes when the trigger is pressed again after active trigger tracking resets", async () => {
  const { trigger, content } = setupBasicPopover();

  trigger.click();
  await waitForPopoverOpen(content);
  expect(content.matches(":popover-open")).toBe(true);

  trigger.removeAttribute("data-popover-trigger");
  await flushMicrotasks();
  trigger.setAttribute("data-popover-trigger", "");
  await flushMicrotasks();

  trigger.click();
  await waitForPopoverClosed(content);

  expect(content.matches(":popover-open")).toBe(false);
});

test("closes when the trigger is double-clicked while open", async () => {
  const { trigger, content } = setupBasicPopover();

  trigger.click();
  trigger.click();
  await waitForPopoverClosed(content);

  expect(content.matches(":popover-open")).toBe(false);
});

test("closes when the trigger receives a pointerdown before click while open", async () => {
  const { trigger, content } = setupBasicPopover();

  trigger.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 })
  );
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await waitForPopoverOpen(content);
  expect(content.matches(":popover-open")).toBe(true);

  trigger.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 })
  );
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await waitForPopoverClosed(content);
  expect(content.matches(":popover-open")).toBe(false);
});

test("supports an external trigger that points to the host id", async () => {
  document.body.innerHTML = `
    <button type="button" data-popover-trigger="filters-popover">Filters</button>
    <pe-popover id="filters-popover">
      <div data-popover-content aria-label="Filters" hidden>
        <button type="button">Apply</button>
      </div>
    </pe-popover>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-popover-content]") as HTMLElement;

  trigger.click();
  await waitForPopoverOpen(content);

  expect(content.matches(":popover-open")).toBe(true);
  expect(trigger.getAttribute("aria-controls")).toBe(content.id);
});

test("moves focus inside on open and restores it after the close control", async () => {
  const { host, trigger, content } = setupBasicPopover();
  const input = content.querySelector("input") as HTMLInputElement;
  const close = content.querySelector("[data-popover-close]") as HTMLButtonElement;

  trigger.focus();
  trigger.click();
  await waitForActiveElement(input);

  expect(document.activeElement).toBe(input);

  const closeEvent = new Promise<CustomEvent<PopoverEventDetail>>((resolve) => {
    host.addEventListener(
      "pe-popover:close",
      (event) => resolve(event as CustomEvent<PopoverEventDetail>),
      { once: true }
    );
  });
  close.click();
  const event = await closeEvent;
  await waitForPopoverClosed(content);

  expect(content.matches(":popover-open")).toBe(false);
  expect(document.activeElement).toBe(trigger);
  expect(event.detail.reason).toBe("close-control");
});

test("data-popover-initial-focus overrides the default target", async () => {
  document.body.innerHTML = `
    <pe-popover>
      <button data-popover-trigger>Open</button>
      <div data-popover-content aria-label="Fields" hidden>
        <input id="first">
        <input id="preferred" data-popover-initial-focus>
      </div>
    </pe-popover>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const preferred = document.querySelector("#preferred") as HTMLInputElement;

  trigger.click();
  await waitForActiveElement(preferred);

  expect(document.activeElement).toBe(preferred);
});

test("focuses the popup itself when opened by touch", async () => {
  const { trigger, content } = setupBasicPopover();

  trigger.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" })
  );
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  await waitForPopoverOpen(content);

  expect(content.matches(":popover-open")).toBe(true);
  expect(document.activeElement).toBe(content);
});

test("closes on Escape and reports the reason", async () => {
  const { host, trigger, content } = setupBasicPopover();
  const closeEvent = new Promise<CustomEvent<PopoverEventDetail>>((resolve) => {
    host.addEventListener(
      "pe-popover:close",
      (event) => resolve(event as CustomEvent<PopoverEventDetail>),
      { once: true }
    );
  });

  trigger.click();
  await waitForPopoverOpen(content);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

  const event = await closeEvent;
  await waitForPopoverClosed(content);

  expect(content.matches(":popover-open")).toBe(false);
  expect(event.detail.reason).toBe("escape");
  expect(document.activeElement).toBe(trigger);
});

test("keeps nested popover triggers and content owned by the nearest host", async () => {
  document.body.innerHTML = `
    <pe-popover class="outer-popover">
      <button type="button" class="outer-trigger" data-popover-trigger>Outer</button>
      <div class="outer-content" data-popover-content aria-label="Outer" hidden>Outer panel</div>

      <pe-popover class="inner-popover">
        <button type="button" class="inner-trigger" data-popover-trigger>Inner</button>
        <div class="inner-content" data-popover-content aria-label="Inner" hidden>Inner panel</div>
      </pe-popover>
    </pe-popover>
  `;

  const outerHost = document.querySelector<PopoverElement>(".outer-popover");
  const innerHost = document.querySelector<PopoverElement>(".inner-popover");
  const outerContent = document.querySelector<HTMLElement>(".outer-content");
  const innerContent = document.querySelector<HTMLElement>(".inner-content");
  const innerTrigger = document.querySelector<HTMLElement>(".inner-trigger");

  innerTrigger?.click();
  await waitForPopoverOpen(innerContent!);

  expect(outerHost?.dataset.state).toBe("closed");
  expect(outerContent?.matches(":popover-open")).toBe(false);
  expect(innerHost?.dataset.state).toBe("open");
  expect(innerContent?.matches(":popover-open")).toBe(true);
});

test("light dismiss closes only the topmost managed popover", async () => {
  document.body.innerHTML = `
    <pe-popover id="parent">
      <button data-popover-trigger>Parent</button>
      <div class="parent-content" data-popover-content aria-label="Parent" hidden>
        <pe-popover id="child">
          <button data-popover-trigger>Child</button>
          <div class="child-content" data-popover-content aria-label="Child" hidden>
            Child content
          </div>
        </pe-popover>
      </div>
    </pe-popover>
    <button id="outside">Outside</button>
  `;

  const hosts = Array.from(document.querySelectorAll<PopoverElement>("pe-popover"));
  const parentContent = document.querySelector(".parent-content") as HTMLElement;
  const childContent = document.querySelector(".child-content") as HTMLElement;

  hosts[0]?.open();
  hosts[1]?.open();
  await waitForFrame(
    () =>
      parentContent.matches(":popover-open") &&
      childContent.matches(":popover-open")
  );

  expect(parentContent.matches(":popover-open")).toBe(true);
  expect(childContent.matches(":popover-open")).toBe(true);

  hosts[0]?.setAttribute("data-popover-align", "start");
  await flushMicrotasks();

  document.querySelector("#outside")?.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 })
  );
  await waitForFrame(
    () =>
      parentContent.matches(":popover-open") &&
      !childContent.matches(":popover-open")
  );

  expect(parentContent.matches(":popover-open")).toBe(true);
  expect(childContent.matches(":popover-open")).toBe(false);
  expect(hosts[1]?.dataset.state).toBe("closed");
});

test("does not restore focus to the trigger after outside dismiss", async () => {
  const { host, trigger, content } = setupBasicPopover();
  const outside = document.createElement("button");
  outside.textContent = "Outside";
  document.body.append(outside);

  trigger.click();
  await waitForPopoverOpen(content);
  const closeEvent = new Promise<CustomEvent<PopoverEventDetail>>((resolve) => {
    host.addEventListener(
      "pe-popover:close",
      (event) => resolve(event as CustomEvent<PopoverEventDetail>),
      { once: true }
    );
  });
  outside.focus();
  outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
  const event = await closeEvent;

  expect(content.matches(":popover-open")).toBe(false);
  expect(document.activeElement).toBe(outside);
  expect(event.detail.reason).toBe("dismiss");
});

test("connects title and description to the dialog", () => {
  document.body.innerHTML = `
    <pe-popover>
      <button data-popover-trigger>Open</button>
      <div data-popover-content hidden>
        <h2 data-popover-title>Details</h2>
        <p data-popover-description>More information.</p>
      </div>
    </pe-popover>
  `;

  const content = document.querySelector("[data-popover-content]") as HTMLElement;
  const title = document.querySelector("[data-popover-title]") as HTMLElement;
  const description = document.querySelector(
    "[data-popover-description]"
  ) as HTMLElement;

  expect(title.id).not.toBe("");
  expect(description.id).not.toBe("");
  expect(content.getAttribute("aria-labelledby")).toBe(title.id);
  expect(content.getAttribute("aria-describedby")).toBe(description.id);
});

test("preserves an explicit accessible name", () => {
  document.body.innerHTML = `
    <pe-popover>
      <button data-popover-trigger>Open</button>
      <div data-popover-content aria-label="Quick settings" hidden>
        <h2 data-popover-title>Ignored as the label source</h2>
      </div>
    </pe-popover>
  `;

  const content = document.querySelector("[data-popover-content]") as HTMLElement;

  expect(content.getAttribute("aria-label")).toBe("Quick settings");
  expect(content.hasAttribute("aria-labelledby")).toBe(false);
});

test("uses only the active trigger for open state", async () => {
  document.body.innerHTML = `
    <button data-popover-trigger="shared">One</button>
    <button data-popover-trigger="shared">Two</button>
    <pe-popover id="shared">
      <div data-popover-content aria-label="Shared" hidden><button data-popover-close>Close</button></div>
    </pe-popover>
  `;

  const triggers = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-popover-trigger]")
  );

  triggers[1]?.click();
  await waitForFrame(() => triggers[1]?.dataset.state === "open");

  expect(triggers[0]?.dataset.state).toBe("closed");
  expect(triggers[0]?.getAttribute("aria-expanded")).toBe("false");
  expect(triggers[1]?.dataset.state).toBe("open");
  expect(triggers[1]?.getAttribute("aria-expanded")).toBe("true");
});

test("positions, aligns, and flips content near a viewport edge", async () => {
  document.body.innerHTML = `
    <pe-popover
      data-popover-side="top"
      data-popover-align="start"
      data-popover-offset="12"
      data-popover-align-offset="3"
      data-popover-collision-padding="5"
    >
      <button
        data-popover-trigger
        style="position: fixed; left: 20px; top: 1px; width: 80px; height: 30px"
      >Open</button>
      <div
        data-popover-content
        aria-label="Positioned"
        hidden
        style="width: 140px; height: 50px; box-sizing: border-box"
      >Content</div>
    </pe-popover>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-popover-content]") as HTMLElement;

  trigger.click();
  await waitForPopoverOpen(content);

  expect(content.dataset.side).toBe("bottom");
  expect(content.dataset.align).toBe("start");
  expect(Number.parseFloat(content.style.left)).toBeCloseTo(23, 0);
  expect(Number.parseFloat(content.style.top)).toBeCloseTo(43, 0);
});

test("repositions while open when placement attributes change", async () => {
  const { host, trigger, content } = setupBasicPopover();

  trigger.click();
  await waitForPopoverOpen(content);
  host.setAttribute("data-popover-side", "right");
  await waitForFrame(() => content.dataset.side === "right");

  expect(content.dataset.side).toBe("right");
});

test("exposes positioning CSS variables while open", async () => {
  document.body.innerHTML = `
    <pe-popover data-popover-side="bottom" data-popover-offset="8">
      <button
        type="button"
        data-popover-trigger
        style="position: fixed; left: 40px; top: 40px; width: 96px; height: 32px"
      >
        Open
      </button>
      <div
        data-popover-content
        aria-label="Positioned"
        hidden
        style="width: 180px; height: 72px; box-sizing: border-box"
      >
        Content
      </div>
    </pe-popover>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-popover-content]") as HTMLElement;

  trigger.click();
  await waitForPopoverOpen(content);

  expect(content.style.getPropertyValue("--anchor-width")).toBe("96px");
  expect(content.style.getPropertyValue("--anchor-height")).toBe("32px");
  expect(content.style.getPropertyValue("--available-height")).not.toBe("");
  expect(content.style.getPropertyValue("--positioner-width")).toBe("180px");
  expect(content.style.getPropertyValue("--positioner-height")).toBe("72px");
  expect(content.style.getPropertyValue("--transform-origin")).toContain("px");

  trigger.click();
  await waitForPopoverClosed(content);
  await waitForFrame(
    () =>
      content.style.getPropertyValue("--anchor-width") === "" &&
      content.style.getPropertyValue("--positioner-height") === ""
  );

  expect(content.style.getPropertyValue("--anchor-width")).toBe("");
  expect(content.style.getPropertyValue("--positioner-height")).toBe("");
});

test("defers hide until the exit animation finishes", async () => {
  document.body.innerHTML = `
    <style>
      [data-popover-content] {
        transition: opacity 40ms linear;
      }
      [data-popover-content][data-ending-style] {
        opacity: 0;
      }
    </style>
    <pe-popover>
      <button type="button" data-popover-trigger>Open</button>
      <div data-popover-content hidden>Content</div>
    </pe-popover>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-popover-content]") as HTMLElement;

  trigger.click();
  await waitForPopoverOpen(content);

  trigger.click();
  await new Promise((resolve) => window.requestAnimationFrame(resolve));
  expect(content.hasAttribute("data-ending-style")).toBe(true);

  await new Promise((resolve) => window.setTimeout(resolve, 60));
  await waitForPopoverClosed(content);

  expect(content.matches(":popover-open")).toBe(false);
  expect(content.hasAttribute("data-ending-style")).toBe(false);
});

test("updates positioner dimensions when content resizes while open", async () => {
  const { trigger, content } = setupBasicPopover();

  trigger.click();
  await waitForPopoverOpen(content);

  const initialHeight = content.style.getPropertyValue("--positioner-height");
  const paragraph = document.createElement("p");
  paragraph.textContent = "Extra line that makes the popover taller.";
  content.append(paragraph);
  await waitForFrame(
    () =>
      content.style.getPropertyValue("--positioner-height") !== initialHeight
  );

  const nextHeight = content.style.getPropertyValue("--positioner-height");
  expect(Number.parseFloat(nextHeight)).toBeGreaterThan(
    Number.parseFloat(initialHeight)
  );
});

test("does not continuously rewrite positioning styles while open", async () => {
  const { trigger, content } = setupBasicPopover();

  trigger.click();
  await waitForFrame(() => !content.hasAttribute("data-starting-style"));

  content.style.setProperty("--transform-origin", "13px 17px");
  await waitForFrame(
    () => content.style.getPropertyValue("--transform-origin") === "13px 17px",
    5
  );

  expect(content.style.getPropertyValue("--transform-origin")).toBe("13px 17px");
});

test("keeps positioning variables stable during the enter transition", async () => {
  document.body.innerHTML = `
    <style>
      [data-popover-content]:popover-open {
        transition: transform 200ms linear;
      }
      [data-popover-content][data-starting-style] {
        transform: scale(0.8);
      }
    </style>
    <pe-popover data-popover-side="bottom" data-popover-offset="8">
      <button
        type="button"
        data-popover-trigger
        style="position: fixed; right: 40px; top: 40px; width: 96px; height: 32px"
      >
        Open
      </button>
      <div
        data-popover-content
        aria-label="Animated"
        hidden
        style="width: 180px; height: 72px; box-sizing: border-box"
      >
        Content
      </div>
    </pe-popover>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-popover-content]") as HTMLElement;

  trigger.click();
  await waitForPopoverOpen(content);
  const initialOrigin = content.style.getPropertyValue("--transform-origin");
  await waitForFrame(() => content.getAnimations().length > 0);

  expect(content.getAnimations().length).toBeGreaterThan(0);
  expect(content.style.getPropertyValue("--transform-origin")).toBe(initialOrigin);
});

test("binds triggers added after connection", async () => {
  document.body.innerHTML = `
    <pe-popover id="dynamic">
      <div data-popover-content aria-label="Dynamic" hidden><button>Inside</button></div>
    </pe-popover>
  `;

  const trigger = document.createElement("button");
  trigger.setAttribute("data-popover-trigger", "dynamic");
  document.body.prepend(trigger);
  await flushMicrotasks();

  const content = document.querySelector("[data-popover-content]") as HTMLElement;
  trigger.click();
  await waitForPopoverOpen(content);

  expect(content.matches(":popover-open")).toBe(true);
});

test("programmatic API dispatches open and close events", async () => {
  const { host, trigger, content } = setupBasicPopover();
  const reasons: string[] = [];

  host.addEventListener("pe-popover:open", (event) => {
    reasons.push((event as CustomEvent<PopoverEventDetail>).detail.reason);
  });
  host.addEventListener("pe-popover:close", (event) => {
    reasons.push((event as CustomEvent<PopoverEventDetail>).detail.reason);
  });

  host.open(trigger);
  await waitForPopoverOpen(content);
  host.close();
  await waitForPopoverClosed(content);

  expect(content.matches(":popover-open")).toBe(false);
  expect(reasons).toEqual(["trigger", "programmatic"]);
});

test("restores managed attributes when disconnected", async () => {
  document.body.innerHTML = `
    <button
      data-popover-trigger="restored"
      data-state="authored"
      aria-expanded="mixed"
    >Open</button>
    <pe-popover id="restored">
      <div data-popover-content hidden style="color: red">
        <h2 data-popover-title>Title</h2>
      </div>
    </pe-popover>
  `;

  const host = document.querySelector("pe-popover") as PopoverElement;
  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-popover-content]") as HTMLElement;
  const title = document.querySelector("[data-popover-title]") as HTMLElement;

  host.remove();

  expect(trigger.dataset.state).toBe("authored");
  expect(trigger.getAttribute("aria-expanded")).toBe("mixed");
  expect(trigger.hasAttribute("aria-controls")).toBe(false);
  expect(content.hasAttribute("popover")).toBe(false);
  expect(content.hasAttribute("hidden")).toBe(true);
  expect(content.getAttribute("style")).toBe("color: red");
  expect(content.hasAttribute("id")).toBe(false);
  expect(title.hasAttribute("id")).toBe(false);
});

test("positions an authored arrow after flipping the popover", async () => {
  document.body.innerHTML = `
    <pe-popover
      data-popover-side="top"
      data-popover-align="start"
      data-popover-offset="8"
    >
      <button
        type="button"
        data-popover-trigger
        style="position: fixed; left: 100px; top: 1px; width: 80px; height: 30px"
      >Open</button>
      <div
        data-popover-content
        aria-label="Arrow popover"
        hidden
        style="width: 120px; height: 40px; box-sizing: border-box"
      >
        <span
          data-popover-arrow
          style="display: block; width: 10px; height: 10px"
        ></span>
        Content
      </div>
    </pe-popover>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const arrow = document.querySelector("[data-popover-arrow]") as HTMLElement;

  trigger.click();
  await waitForFrame(() => arrow.dataset.side === "bottom");

  expect(arrow.getAttribute("aria-hidden")).toBe("true");
  expect(arrow.dataset.state).toBe("open");
  expect(arrow.dataset.side).toBe("bottom");
  expect(arrow.dataset.align).toBe("start");
  expect(arrow.style.position).toBe("absolute");
  expect(Number.parseFloat(arrow.style.left)).toBeCloseTo(32, 0);
  expect(arrow.hasAttribute("data-uncentered")).toBe(false);
});

test("positions a dynamically added popover arrow while open", async () => {
  document.body.innerHTML = `
    <pe-popover data-popover-side="bottom" data-popover-arrow-padding="12">
      <button
        type="button"
        data-popover-trigger
        style="position: fixed; left: 1px; top: 100px; width: 10px; height: 20px"
      >Open</button>
      <div
        data-popover-content
        aria-label="Dynamic arrow"
        hidden
        style="width: 120px; height: 40px; box-sizing: border-box"
      >Content</div>
    </pe-popover>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-popover-content]") as HTMLElement;

  trigger.click();
  await waitForPopoverOpen(content);

  const arrow = document.createElement("span");
  arrow.setAttribute("data-popover-arrow", "");
  arrow.style.cssText = "display: block; width: 10px; height: 10px";
  content.prepend(arrow);
  await waitForFrame(() => arrow.dataset.side === "bottom");

  expect(arrow.dataset.side).toBe("bottom");
  expect(arrow.style.left).toBe("12px");
  expect(arrow.hasAttribute("data-uncentered")).toBe(true);

  arrow.removeAttribute("data-popover-arrow");
  await waitForFrame(() => !arrow.hasAttribute("data-side"));

  expect(arrow.hasAttribute("aria-hidden")).toBe(false);
  expect(arrow.hasAttribute("data-side")).toBe(false);
  expect(arrow.getAttribute("style")).toBe(
    "display: block; width: 10px; height: 10px;"
  );
});

test("restores authored popover arrow attributes when disconnected", async () => {
  document.body.innerHTML = `
    <pe-popover data-popover-side="right">
      <button data-popover-trigger>Open</button>
      <div data-popover-content aria-label="Restored arrow" hidden>
        <span
          data-popover-arrow
          data-state="authored"
          data-side="authored"
          data-align="authored"
          data-uncentered="authored"
          aria-hidden="false"
          style="color: red"
        ></span>
      </div>
    </pe-popover>
  `;

  const host = document.querySelector("pe-popover") as PopoverElement;
  const arrow = document.querySelector("[data-popover-arrow]") as HTMLElement;

  host.remove();

  expect(arrow.dataset.state).toBe("authored");
  expect(arrow.dataset.side).toBe("authored");
  expect(arrow.dataset.align).toBe("authored");
  expect(arrow.getAttribute("data-uncentered")).toBe("authored");
  expect(arrow.getAttribute("aria-hidden")).toBe("false");
  expect(arrow.getAttribute("style")).toBe("color: red");
});
