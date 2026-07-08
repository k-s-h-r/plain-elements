import { afterEach, expect, test, vi } from "vitest";
import { TabsElement, type TabsEventDetail } from "../src/tabs";

function collectChanges(host: TabsElement): TabsEventDetail[] {
  const details: TabsEventDetail[] = [];
  host.addEventListener("pe-tabs:change", (event) => {
    details.push((event as CustomEvent<TabsEventDetail>).detail);
  });
  return details;
}

function triggerFor(host: TabsElement, value: string): HTMLButtonElement {
  return host.querySelector<HTMLButtonElement>(
    `[data-tabs-trigger='${value}']`
  )!;
}

async function nextMicrotask(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 20));
}

function renderTabs(attributes = ""): TabsElement {
  document.body.innerHTML = `
    <pe-tabs ${attributes}>
      <div data-tabs-list aria-label="Account">
        <button data-tabs-trigger="profile">Profile</button>
        <button data-tabs-trigger="security">Security</button>
        <button data-tabs-trigger="billing">Billing</button>
      </div>
      <section data-tabs-content="profile">Profile panel</section>
      <section data-tabs-content="security">Security panel</section>
      <section data-tabs-content="billing">Billing panel</section>
    </pe-tabs>
  `;

  return document.querySelector<TabsElement>("pe-tabs")!;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

test("defines pe-tabs and applies the tab ARIA pattern", () => {
  const host = renderTabs();
  const list = host.querySelector<HTMLElement>("[data-tabs-list]")!;
  const triggers = host.querySelectorAll<HTMLElement>("[data-tabs-trigger]");
  const panels = host.querySelectorAll<HTMLElement>("[data-tabs-content]");

  expect(customElements.get("pe-tabs")).toBe(TabsElement);
  expect(list.getAttribute("role")).toBe("tablist");
  expect(list.getAttribute("aria-orientation")).toBe("horizontal");
  expect(host.value).toBe("profile");
  expect(host.dataset.tabsValue).toBe("profile");
  expect(triggers[0]?.getAttribute("role")).toBe("tab");
  expect(triggers[0]?.getAttribute("aria-selected")).toBe("true");
  expect(triggers[0]?.getAttribute("tabindex")).toBe("0");
  expect(triggers[1]?.getAttribute("aria-selected")).toBe("false");
  expect(triggers[1]?.getAttribute("tabindex")).toBe("-1");
  expect(triggers[0]?.getAttribute("aria-controls")).toBe(panels[0]?.id);
  expect(panels[0]?.getAttribute("aria-labelledby")).toBe(triggers[0]?.id);
  expect(panels[0]?.hidden).toBe(false);
  expect(panels[0]?.inert).toBe(false);
  expect(panels[0]?.getAttribute("tabindex")).toBe("0");
  expect(panels[1]?.hidden).toBe(true);
  expect(panels[1]?.inert).toBe(true);
  expect(panels[1]?.getAttribute("tabindex")).toBe("-1");
});

test("selects a tab by click and emits a composed change event", () => {
  const host = renderTabs();
  const trigger = host.querySelector<HTMLElement>(
    "[data-tabs-trigger='security']"
  )!;
  const received: Array<CustomEvent<TabsEventDetail>> = [];

  document.addEventListener(
    "pe-tabs:change",
    (event) => {
      received.push(event as CustomEvent<TabsEventDetail>);
    },
    { once: true }
  );

  trigger.click();

  expect(host.value).toBe("security");
  expect(trigger.dataset.state).toBe("active");
  expect(
    host.querySelector<HTMLElement>("[data-tabs-content='profile']")?.hidden
  ).toBe(true);
  expect(
    host.querySelector<HTMLElement>("[data-tabs-content='security']")?.hidden
  ).toBe(false);
  expect(received[0]?.detail.reason).toBe("click");
  expect(received[0]?.detail.previousValue).toBe("profile");
});

test("uses automatic roving focus and wraps while skipping disabled tabs", () => {
  const host = renderTabs();
  const profile = host.querySelector<HTMLElement>(
    "[data-tabs-trigger='profile']"
  )!;
  const security = host.querySelector<HTMLButtonElement>(
    "[data-tabs-trigger='security']"
  )!;
  const billing = host.querySelector<HTMLElement>(
    "[data-tabs-trigger='billing']"
  )!;
  security.disabled = true;

  profile.focus();
  profile.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));

  expect(document.activeElement).toBe(billing);
  expect(host.value).toBe("billing");

  billing.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));

  expect(document.activeElement).toBe(profile);
  expect(host.value).toBe("profile");
});

test("supports vertical manual activation", () => {
  const host = renderTabs(
    'data-tabs-orientation="vertical" data-tabs-activation="manual"'
  );
  const profile = host.querySelector<HTMLElement>(
    "[data-tabs-trigger='profile']"
  )!;
  const security = host.querySelector<HTMLElement>(
    "[data-tabs-trigger='security']"
  )!;

  profile.focus();
  profile.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));

  expect(document.activeElement).toBe(security);
  expect(host.value).toBe("profile");

  security.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", cancelable: true })
  );

  expect(host.value).toBe("security");
  expect(
    host.querySelector("[data-tabs-list]")?.getAttribute("aria-orientation")
  ).toBe("vertical");
});

test("can disable arrow-key focus looping", () => {
  const host = renderTabs('data-tabs-loop="false"');
  const profile = host.querySelector<HTMLElement>(
    "[data-tabs-trigger='profile']"
  )!;

  profile.focus();
  profile.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));

  expect(document.activeElement).toBe(profile);
  expect(host.value).toBe("profile");
});

test("falls back when the active tab becomes disabled", async () => {
  const host = renderTabs();
  const profile = host.querySelector<HTMLButtonElement>(
    "[data-tabs-trigger='profile']"
  )!;
  const events: TabsEventDetail[] = [];
  host.addEventListener("pe-tabs:change", (event) => {
    events.push((event as CustomEvent<TabsEventDetail>).detail);
  });

  profile.disabled = true;
  await nextMicrotask();

  expect(host.value).toBe("security");
  expect(events[0]?.reason).toBe("disabled");
});

test("exposes activation direction and positions an optional indicator", async () => {
  const host = renderTabs();
  const list = host.querySelector<HTMLElement>("[data-tabs-list]")!;
  const indicator = document.createElement("span");
  indicator.dataset.tabsIndicator = "";
  list.append(indicator);
  await nextMicrotask();

  const security = host.querySelector<HTMLElement>(
    "[data-tabs-trigger='security']"
  )!;
  security.click();

  expect(host.dataset.activationDirection).toBe("right");
  expect(security.dataset.activationDirection).toBe("right");
  expect(indicator.getAttribute("role")).toBe("presentation");
  expect(indicator.style.getPropertyValue("--active-tab-width")).not.toBe("");
});

test("supports programmatic and attribute selection", async () => {
  const host = renderTabs();
  const security = host.querySelector<HTMLElement>(
    "[data-tabs-trigger='security']"
  )!;

  host.select("security", { focus: true });

  expect(host.value).toBe("security");
  expect(document.activeElement).toBe(security);

  host.setAttribute("data-tabs-value", "billing");
  await nextMicrotask();

  expect(host.value).toBe("billing");
});

test("refreshes for dynamic tabs and restores managed attributes", async () => {
  const host = renderTabs();
  const list = host.querySelector<HTMLElement>("[data-tabs-list]")!;
  const trigger = document.createElement("button");
  const panel = document.createElement("section");
  trigger.dataset.tabsTrigger = "activity";
  trigger.textContent = "Activity";
  panel.dataset.tabsContent = "activity";
  panel.textContent = "Activity panel";
  list.append(trigger);
  host.append(panel);
  await nextMicrotask();

  trigger.click();

  expect(host.value).toBe("activity");
  expect(panel.hidden).toBe(false);

  host.remove();

  expect(list.hasAttribute("role")).toBe(false);
  expect(trigger.hasAttribute("role")).toBe(false);
  expect(trigger.hasAttribute("aria-selected")).toBe(false);
  expect(trigger.id).toBe("");
  expect(panel.hasAttribute("hidden")).toBe(false);
});

test("does not manage nested tab sets from the outer host", () => {
  document.body.innerHTML = `
    <pe-tabs data-tabs-value="outer">
      <div data-tabs-list>
        <button data-tabs-trigger="outer">Outer</button>
        <button data-tabs-trigger="other">Other</button>
      </div>
      <div data-tabs-content="outer">
        <pe-tabs data-tabs-value="inner-a">
          <div data-tabs-list>
            <button data-tabs-trigger="inner-a">Inner A</button>
            <button data-tabs-trigger="inner-b">Inner B</button>
          </div>
          <div data-tabs-content="inner-a">Inner A panel</div>
          <div data-tabs-content="inner-b">Inner B panel</div>
        </pe-tabs>
      </div>
      <div data-tabs-content="other">Other panel</div>
    </pe-tabs>
  `;

  const hosts = document.querySelectorAll<TabsElement>("pe-tabs");
  const outerHost = hosts[0]!;
  const innerHost = hosts[1]!;
  const innerTriggerA = innerHost.querySelector<HTMLButtonElement>(
    "[data-tabs-trigger='inner-a']"
  )!;
  const innerTriggerB = innerHost.querySelector<HTMLButtonElement>(
    "[data-tabs-trigger='inner-b']"
  )!;
  const outerTriggerOther = outerHost.querySelector<HTMLButtonElement>(
    "[data-tabs-trigger='other']"
  )!;

  expect(outerHost.value).toBe("outer");
  expect(innerHost.value).toBe("inner-a");

  innerTriggerB.click();
  expect(innerHost.value).toBe("inner-b");
  expect(outerHost.value).toBe("outer");

  innerTriggerB.focus();
  innerTriggerB.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  expect(document.activeElement).toBe(innerTriggerA);
  expect(innerHost.value).toBe("inner-a");
  expect(outerHost.value).toBe("outer");

  outerTriggerOther.click();
  expect(outerHost.value).toBe("other");
  expect(innerHost.value).toBe("inner-a");
});

test("moves focus to the first and last enabled tab with Home and End", async () => {
  const host = renderTabs();
  const profile = triggerFor(host, "profile");
  const security = triggerFor(host, "security");
  const billing = triggerFor(host, "billing");
  profile.disabled = true;
  await nextMicrotask();

  billing.focus();
  billing.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));

  // Home targets the first enabled tab, skipping the disabled first tab.
  expect(document.activeElement).toBe(security);
  expect(host.value).toBe("security");

  security.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));

  expect(document.activeElement).toBe(billing);
  expect(host.value).toBe("billing");
});

test("selects with Space in manual activation", () => {
  const host = renderTabs('data-tabs-activation="manual"');
  const profile = triggerFor(host, "profile");
  const security = triggerFor(host, "security");

  profile.focus();
  profile.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));

  expect(document.activeElement).toBe(security);
  expect(host.value).toBe("profile");

  security.dispatchEvent(
    new KeyboardEvent("keydown", { key: " ", cancelable: true })
  );

  expect(host.value).toBe("security");
});

test("automatic arrow keys change the value with reason keyboard", () => {
  const host = renderTabs();
  const changes = collectChanges(host);
  const profile = triggerFor(host, "profile");

  profile.focus();
  profile.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));

  expect(host.value).toBe("security");
  expect(document.activeElement).toBe(triggerFor(host, "security"));
  expect(changes.at(-1)?.reason).toBe("keyboard");
  expect(changes.at(-1)?.activationDirection).toBe("right");
});

test("rebinds click and keyboard listeners after reconnect", async () => {
  const host = renderTabs();
  host.remove();
  document.body.append(host);
  await nextMicrotask();

  const profile = triggerFor(host, "profile");
  const security = triggerFor(host, "security");

  security.click();
  expect(host.value).toBe("security");

  security.focus();
  security.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));

  expect(host.value).toBe("profile");
  expect(document.activeElement).toBe(profile);
});

test("treats aria-disabled tabs like disabled ones", async () => {
  const host = renderTabs();
  const security = triggerFor(host, "security");
  const billing = triggerFor(host, "billing");
  security.setAttribute("aria-disabled", "true");
  await nextMicrotask();

  const profile = triggerFor(host, "profile");
  profile.focus();
  profile.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));

  // Arrow navigation skips the aria-disabled tab.
  expect(document.activeElement).toBe(billing);
  expect(host.value).toBe("billing");

  security.click();
  expect(host.value).toBe("billing");
});

test("emits programmatic, attribute, and missing change reasons", async () => {
  const host = renderTabs();
  const changes = collectChanges(host);

  host.value = "security";
  expect(host.value).toBe("security");
  expect(changes.at(-1)?.reason).toBe("programmatic");

  host.setAttribute("data-tabs-value", "billing");
  await nextMicrotask();
  expect(host.value).toBe("billing");
  expect(changes.at(-1)?.reason).toBe("attribute");

  // Removing the selected tab forces a fallback with reason "missing".
  triggerFor(host, "billing").remove();
  host.querySelector("[data-tabs-content='billing']")?.remove();
  await nextMicrotask();

  expect(host.value).toBe("profile");
  expect(changes.at(-1)?.reason).toBe("missing");
});

test("reports left activation direction on horizontal tabs", () => {
  const host = renderTabs();

  host.select("billing");
  host.select("profile");

  expect(host.dataset.activationDirection).toBe("left");
});

test("reports up activation direction on vertical tabs", () => {
  const host = renderTabs('data-tabs-orientation="vertical"');

  host.select("billing");
  host.select("profile");

  expect(host.dataset.activationDirection).toBe("up");
});

test("dispatches a composed, bubbling change event", () => {
  const host = renderTabs();
  let event: CustomEvent<TabsEventDetail> | undefined;
  document.addEventListener(
    "pe-tabs:change",
    (received) => {
      event = received as CustomEvent<TabsEventDetail>;
    },
    { once: true }
  );

  triggerFor(host, "security").click();

  expect(event?.composed).toBe(true);
  expect(event?.bubbles).toBe(true);
});

test("falls back and warns for invalid configuration attributes", () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const host = renderTabs(
    'data-tabs-orientation="diagonal" data-tabs-activation="eager" data-tabs-loop="maybe"'
  );
  const list = host.querySelector<HTMLElement>("[data-tabs-list]")!;
  const profile = triggerFor(host, "profile");

  expect(list.getAttribute("aria-orientation")).toBe("horizontal");

  // Invalid loop falls back to true, so arrow navigation wraps.
  profile.focus();
  profile.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));

  expect(host.value).toBe("billing");
  expect(warnSpy).toHaveBeenCalled();
});

test("select ignores unknown and disabled values with a warning", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const host = renderTabs();

  host.select("nonexistent");
  expect(host.value).toBe("profile");

  const security = triggerFor(host, "security");
  security.disabled = true;
  await nextMicrotask();

  host.select("security");
  expect(host.value).toBe("profile");
  expect(warnSpy).toHaveBeenCalled();
});
