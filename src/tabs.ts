import {
  captureAttributes,
  restoreAttribute,
  restoreSnapshot,
  setAttributeIfNeeded,
  type AttributeSnapshot
} from "./internal/dom";
import { dispatchCustomEvent } from "./internal/events";
import { isDocumentLoading } from "./internal/document-loading";
import { createWarnOnce } from "./internal/warnings";

type TabsOrientation = "horizontal" | "vertical";
type TabsActivation = "automatic" | "manual";

export type TabsActivationDirection =
  | "left"
  | "right"
  | "up"
  | "down"
  | "none";


export type TabsEventReason =
  | "click"
  | "keyboard"
  | "programmatic"
  | "attribute"
  | "disabled"
  | "missing";

export type TabsEventDetail = {
  value: string | null;
  previousValue: string | null;
  trigger?: HTMLElement;
  panel?: HTMLElement;
  reason: TabsEventReason;
  activationDirection: TabsActivationDirection;
};

export type TabsSelectOptions = {
  focus?: boolean;
};

type TabEntry = {
  value: string;
  trigger: HTMLElement;
  panel: HTMLElement;
};

let generatedTabId = 0;
let generatedPanelId = 0;
const warn = createWarnOnce("[pe-tabs]");

function isOwnedByHost(element: HTMLElement, host: HTMLElement): boolean {
  return element.closest("pe-tabs") === host;
}

function isDisabled(trigger: HTMLElement): boolean {
  return (
    (trigger instanceof HTMLButtonElement && trigger.disabled) ||
    trigger.getAttribute("aria-disabled") === "true"
  );
}

function dispatchTabsEvent(host: HTMLElement, detail: TabsEventDetail): void {
  dispatchCustomEvent(host, "pe-tabs:change", detail);
}

export class TabsElement extends HTMLElement {
  #list: HTMLElement | null = null;
  #triggers: HTMLElement[] = [];
  #panels: HTMLElement[] = [];
  #indicator: HTMLElement | null = null;
  #entries: TabEntry[] = [];
  #value: string | null = null;
  #initialized = false;
  #refreshQueued = false;
  #listenerCleanup: Array<() => void> = [];
  #observer: MutationObserver | null = null;
  #resizeObserver: ResizeObserver | null = null;
  #snapshots = new Map<HTMLElement, AttributeSnapshot>();
  #hostActivationDirectionSnapshot: string | null = null;

  connectedCallback(): void {
    this.#hostActivationDirectionSnapshot = this.getAttribute(
      "data-activation-direction"
    );

    if (isDocumentLoading()) {
      this.#queueRefresh();
    } else {
      this.#refresh("attribute");
    }

    this.#observe();
  }

  disconnectedCallback(): void {
    this.#cleanupListeners();
    this.#observer?.disconnect();
    this.#observer = null;
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#restoreAll();
    restoreAttribute(
      this,
      "data-activation-direction",
      this.#hostActivationDirectionSnapshot
    );
    this.#list = null;
    this.#triggers = [];
    this.#panels = [];
    this.#indicator = null;
    this.#entries = [];
    this.#value = null;
    this.#initialized = false;
  }

  get value(): string | null {
    return this.#value;
  }

  set value(value: string | null) {
    if (value === null) {
      this.removeAttribute("data-tabs-value");
      return;
    }

    this.select(value);
  }

  select(value: string, options: TabsSelectOptions = {}): void {
    const entry = this.#entries.find((candidate) => candidate.value === value);

    if (!entry || isDisabled(entry.trigger)) {
      warn(`Cannot select unknown or disabled tab "${value}".`);
      return;
    }

    this.#selectEntry(entry, "programmatic", options.focus ?? false, true);
  }

  #refresh(reason: TabsEventReason): void {
    this.#refreshQueued = false;
    this.#cleanupListeners();

    const previousValue = this.#value;
    this.#resolveElements();
    this.#restoreStaleElements();
    this.#enhanceElements();

    const requestedValue = this.getAttribute("data-tabs-value");
    const entry =
      this.#findSelectableEntry(requestedValue) ??
      this.#findSelectableEntry(previousValue) ??
      this.#entries.find((candidate) => !isDisabled(candidate.trigger)) ??
      null;

    const activationDirection = this.#getActivationDirection(
      previousValue,
      entry?.value ?? null
    );
    this.#sync(entry, activationDirection);
    this.#bindListeners();

    const nextValue = entry?.value ?? null;

    if (this.#initialized && previousValue !== nextValue) {
      const previousEntry = this.#entries.find(
        (candidate) => candidate.value === previousValue
      );
      const changeReason: TabsEventReason = previousEntry
        ? isDisabled(previousEntry.trigger)
          ? "disabled"
          : reason
        : previousValue === null
          ? reason
          : "missing";
      dispatchTabsEvent(this, {
        value: nextValue,
        previousValue,
        ...(entry ? { trigger: entry.trigger, panel: entry.panel } : {}),
        reason: changeReason,
        activationDirection
      });
    }

    this.#initialized = true;
  }

  #resolveElements(): void {
    const lists = Array.from(
      this.querySelectorAll<HTMLElement>("[data-tabs-list]")
    ).filter((element) => isOwnedByHost(element, this));

    this.#list = lists[0] ?? null;

    if (!this.#list) {
      if (!isDocumentLoading()) {
        warn("Missing [data-tabs-list] inside <pe-tabs>.");
      }
    } else if (lists.length > 1) {
      warn("Multiple [data-tabs-list] elements found; using the first one.");
    }

    this.#triggers = Array.from(
      this.querySelectorAll<HTMLElement>("[data-tabs-trigger]")
    ).filter((element) => isOwnedByHost(element, this));
    this.#panels = Array.from(
      this.querySelectorAll<HTMLElement>("[data-tabs-content]")
    ).filter((element) => isOwnedByHost(element, this));
    const indicators = Array.from(
      this.querySelectorAll<HTMLElement>("[data-tabs-indicator]")
    ).filter((element) => isOwnedByHost(element, this));
    this.#indicator = indicators[0] ?? null;

    if (indicators.length > 1) {
      warn("Multiple [data-tabs-indicator] elements found; using the first one.");
    }

    const panelsByValue = new Map<string, HTMLElement>();

    for (const panel of this.#panels) {
      const value = panel.getAttribute("data-tabs-content")?.trim() ?? "";

      if (!value) {
        if (!isDocumentLoading()) {
          warn("Every [data-tabs-content] needs a non-empty value.");
        }

        continue;
      }

      if (panelsByValue.has(value)) {
        warn(`Duplicate tab panel value "${value}"; using the first one.`);
        continue;
      }

      panelsByValue.set(value, panel);
    }

    const usedValues = new Set<string>();
    this.#entries = [];

    for (const trigger of this.#triggers) {
      const value = trigger.getAttribute("data-tabs-trigger")?.trim() ?? "";

      if (!value) {
        warn("Every [data-tabs-trigger] needs a non-empty value.");
        continue;
      }

      if (usedValues.has(value)) {
        warn(`Duplicate tab trigger value "${value}"; using the first one.`);
        continue;
      }

      const panel = panelsByValue.get(value);

      if (!panel) {
        if (!isDocumentLoading()) {
          warn(`Tab "${value}" has no matching [data-tabs-content].`);
        }

        continue;
      }

      usedValues.add(value);
      this.#entries.push({ value, trigger, panel });
    }
  }

  #enhanceElements(): void {
    if (this.#list) {
      this.#remember(this.#list, [
        "role",
        "aria-orientation",
        "data-activation-direction"
      ]);
      setAttributeIfNeeded(this.#list, "role", "tablist");
      setAttributeIfNeeded(this.#list, "aria-orientation", this.#orientation());
    }

    for (const trigger of this.#triggers) {
      this.#remember(trigger, [
        "id",
        "role",
        "aria-selected",
        "aria-controls",
        "tabindex",
        "data-state",
        "data-activation-direction"
      ]);
      setAttributeIfNeeded(trigger, "role", "tab");

      if (!trigger.id) {
        generatedTabId += 1;
        trigger.id = `pe-tab-${generatedTabId}`;
      }
    }

    for (const panel of this.#panels) {
      this.#remember(panel, [
        "id",
        "role",
        "aria-labelledby",
        "hidden",
        "inert",
        "tabindex",
        "data-state",
        "data-activation-direction"
      ]);
      setAttributeIfNeeded(panel, "role", "tabpanel");

      if (!panel.id) {
        generatedPanelId += 1;
        panel.id = `pe-tabpanel-${generatedPanelId}`;
      }
    }

    if (this.#indicator) {
      this.#remember(this.#indicator, [
        "role",
        "hidden",
        "style",
        "data-activation-direction"
      ]);
      setAttributeIfNeeded(this.#indicator, "role", "presentation");
    }

    for (const entry of this.#entries) {
      setAttributeIfNeeded(entry.trigger, "aria-controls", entry.panel.id);
      setAttributeIfNeeded(entry.panel, "aria-labelledby", entry.trigger.id);
    }

    const pairedTriggers = new Set(this.#entries.map((entry) => entry.trigger));
    const pairedPanels = new Set(this.#entries.map((entry) => entry.panel));

    for (const trigger of this.#triggers) {
      if (!pairedTriggers.has(trigger)) {
        this.#restoreManagedAttribute(trigger, "aria-controls");
      }
    }

    for (const panel of this.#panels) {
      if (!pairedPanels.has(panel)) {
        this.#restoreManagedAttribute(panel, "aria-labelledby");
      }
    }
  }

  #sync(
    activeEntry: TabEntry | null,
    activationDirection: TabsActivationDirection = "none"
  ): void {
    this.#value = activeEntry?.value ?? null;

    if (activeEntry) {
      setAttributeIfNeeded(this, "data-tabs-value", activeEntry.value);
    } else {
      this.removeAttribute("data-tabs-value");
    }

    for (const trigger of this.#triggers) {
      const active = trigger === activeEntry?.trigger;
      setAttributeIfNeeded(trigger, "aria-selected", String(active));
      setAttributeIfNeeded(trigger, "tabindex", active ? "0" : "-1");
      setAttributeIfNeeded(trigger, "data-state", active ? "active" : "inactive");
      setAttributeIfNeeded(
        trigger,
        "data-activation-direction",
        activationDirection
      );
    }

    for (const panel of this.#panels) {
      const active = panel === activeEntry?.panel;
      setAttributeIfNeeded(panel, "data-state", active ? "active" : "inactive");
      panel.hidden = !active;
      panel.inert = !active;
      setAttributeIfNeeded(panel, "tabindex", active ? "0" : "-1");
      setAttributeIfNeeded(
        panel,
        "data-activation-direction",
        activationDirection
      );
    }

    setAttributeIfNeeded(
      this,
      "data-activation-direction",
      activationDirection
    );

    if (this.#list) {
      setAttributeIfNeeded(
        this.#list,
        "data-activation-direction",
        activationDirection
      );
    }

    if (this.#indicator) {
      setAttributeIfNeeded(
        this.#indicator,
        "data-activation-direction",
        activationDirection
      );
      this.#positionIndicator(activeEntry);
    }
  }

  #selectEntry(
    entry: TabEntry,
    reason: TabsEventReason,
    focus: boolean,
    emit: boolean
  ): void {
    const previousValue = this.#value;
    const activationDirection = this.#getActivationDirection(
      previousValue,
      entry.value
    );
    this.#sync(entry, activationDirection);

    if (focus) {
      entry.trigger.focus();
    }

    if (emit && previousValue !== entry.value) {
      dispatchTabsEvent(this, {
        value: entry.value,
        previousValue,
        trigger: entry.trigger,
        panel: entry.panel,
        reason,
        activationDirection
      });
    }
  }

  #bindListeners(): void {
    for (const entry of this.#entries) {
      const onClick = (): void => {
        if (!isDisabled(entry.trigger)) {
          this.#selectEntry(entry, "click", false, true);
        }
      };
      const onKeyDown = (event: KeyboardEvent): void => {
        this.#onKeyDown(event, entry);
      };

      entry.trigger.addEventListener("click", onClick);
      entry.trigger.addEventListener("keydown", onKeyDown);
      this.#listenerCleanup.push(() => {
        entry.trigger.removeEventListener("click", onClick);
        entry.trigger.removeEventListener("keydown", onKeyDown);
      });
    }

    if (this.#list && this.#indicator) {
      const updateIndicator = (): void => this.#positionIndicator(
        this.#findSelectableEntry(this.#value)
      );
      this.#list.addEventListener("scroll", updateIndicator, { passive: true });
      window.addEventListener("resize", updateIndicator);
      this.#listenerCleanup.push(() => {
        this.#list?.removeEventListener("scroll", updateIndicator);
        window.removeEventListener("resize", updateIndicator);
      });

      if (typeof ResizeObserver !== "undefined") {
        this.#resizeObserver?.disconnect();
        this.#resizeObserver = new ResizeObserver(updateIndicator);
        this.#resizeObserver.observe(this.#list);
        for (const entry of this.#entries) {
          this.#resizeObserver.observe(entry.trigger);
        }
      }
    }
  }

  #onKeyDown(event: KeyboardEvent, entry: TabEntry): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }

    if (
      this.#activation() === "manual" &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      this.#selectEntry(entry, "keyboard", false, true);
      return;
    }

    const orientation = this.#orientation();
    const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
    let target: TabEntry | null = null;

    if (event.key === "Home") {
      target = this.#enabledEntries()[0] ?? null;
    } else if (event.key === "End") {
      target = this.#enabledEntries().at(-1) ?? null;
    } else if (event.key === previousKey) {
      target = this.#adjacentEntry(entry, -1);
    } else if (event.key === nextKey) {
      target = this.#adjacentEntry(entry, 1);
    } else {
      return;
    }

    event.preventDefault();

    if (!target) {
      return;
    }

    if (this.#activation() === "automatic") {
      this.#selectEntry(target, "keyboard", true, true);
    } else {
      target.trigger.focus();
    }
  }

  #enabledEntries(): TabEntry[] {
    return this.#entries.filter((entry) => !isDisabled(entry.trigger));
  }

  #adjacentEntry(entry: TabEntry, offset: -1 | 1): TabEntry | null {
    const entries = this.#enabledEntries();
    const index = entries.indexOf(entry);

    if (index === -1 || entries.length === 0) {
      return null;
    }

    const nextIndex = index + offset;

    if (!this.#loops() && (nextIndex < 0 || nextIndex >= entries.length)) {
      return null;
    }

    return entries[(nextIndex + entries.length) % entries.length] ?? null;
  }

  #findSelectableEntry(value: string | null): TabEntry | null {
    if (value === null) {
      return null;
    }

    return (
      this.#entries.find(
        (entry) => entry.value === value && !isDisabled(entry.trigger)
      ) ?? null
    );
  }

  #orientation(): TabsOrientation {
    const value = this.getAttribute("data-tabs-orientation") ?? "horizontal";

    if (value === "horizontal" || value === "vertical") {
      return value;
    }

    warn(`Invalid data-tabs-orientation="${value}"; using "horizontal".`);
    return "horizontal";
  }

  #activation(): TabsActivation {
    const value = this.getAttribute("data-tabs-activation") ?? "automatic";

    if (value === "automatic" || value === "manual") {
      return value;
    }

    warn(`Invalid data-tabs-activation="${value}"; using "automatic".`);
    return "automatic";
  }

  #loops(): boolean {
    const value = this.getAttribute("data-tabs-loop") ?? "true";

    if (value === "true") {
      return true;
    }

    if (value === "false") {
      return false;
    }

    warn(`Invalid data-tabs-loop="${value}"; using "true".`);
    return true;
  }

  #getActivationDirection(
    previousValue: string | null,
    nextValue: string | null
  ): TabsActivationDirection {
    if (previousValue === null || nextValue === null || previousValue === nextValue) {
      return "none";
    }

    const previousIndex = this.#entries.findIndex(
      (entry) => entry.value === previousValue
    );
    const nextIndex = this.#entries.findIndex((entry) => entry.value === nextValue);

    if (previousIndex === -1 || nextIndex === -1) {
      return "none";
    }

    if (this.#orientation() === "vertical") {
      return nextIndex > previousIndex ? "down" : "up";
    }

    return nextIndex > previousIndex ? "right" : "left";
  }

  #positionIndicator(activeEntry: TabEntry | null): void {
    if (!this.#indicator || !this.#list || !activeEntry) {
      if (this.#indicator) {
        this.#indicator.hidden = true;
      }
      return;
    }

    const listRect = this.#list.getBoundingClientRect();
    const tabRect = activeEntry.trigger.getBoundingClientRect();
    const left =
      tabRect.left - listRect.left + this.#list.scrollLeft - this.#list.clientLeft;
    const top =
      tabRect.top - listRect.top + this.#list.scrollTop - this.#list.clientTop;
    const style = this.#indicator.style;
    style.setProperty("--active-tab-left", `${left}px`);
    style.setProperty(
      "--active-tab-right",
      `${this.#list.scrollWidth - left - tabRect.width}px`
    );
    style.setProperty("--active-tab-top", `${top}px`);
    style.setProperty(
      "--active-tab-bottom",
      `${this.#list.scrollHeight - top - tabRect.height}px`
    );
    style.setProperty("--active-tab-width", `${tabRect.width}px`);
    style.setProperty("--active-tab-height", `${tabRect.height}px`);
    this.#indicator.hidden = tabRect.width <= 0 || tabRect.height <= 0;
  }

  #observe(): void {
    this.#observer?.disconnect();
    this.#observer = new MutationObserver((records) => {
      if (records.some((record) => this.#shouldRefresh(record))) {
        this.#queueRefresh();
      }
    });
    this.#observer.observe(this, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-tabs-list",
        "data-tabs-trigger",
        "data-tabs-content",
        "data-tabs-indicator",
        "data-tabs-value",
        "data-tabs-orientation",
        "data-tabs-activation",
        "data-tabs-loop",
        "disabled",
        "aria-disabled"
      ]
    });
  }

  #shouldRefresh(record: MutationRecord): boolean {
    if (record.type === "childList") {
      return true;
    }

    if (record.target === this && record.attributeName === "data-tabs-value") {
      return this.getAttribute("data-tabs-value") !== this.#value;
    }

    return record.attributeName !== "data-tabs-value";
  }

  #queueRefresh(): void {
    if (this.#refreshQueued) {
      return;
    }

    this.#refreshQueued = true;
    queueMicrotask(() => {
      if (this.isConnected) {
        this.#refresh("attribute");
      }
    });
  }

  #remember(element: HTMLElement, names: string[]): void {
    const snapshot = this.#snapshots.get(element);

    if (!snapshot) {
      this.#snapshots.set(element, captureAttributes(element, names));
      return;
    }

    for (const name of names) {
      if (!(name in snapshot)) {
        snapshot[name] = element.getAttribute(name);
      }
    }
  }

  #restoreManagedAttribute(element: HTMLElement, name: string): void {
    restoreAttribute(element, name, this.#snapshots.get(element)?.[name] ?? null);
  }

  #restoreStaleElements(): void {
    const current = new Set<HTMLElement>([
      ...(this.#list ? [this.#list] : []),
      ...this.#triggers,
      ...this.#panels,
      ...(this.#indicator ? [this.#indicator] : [])
    ]);

    for (const [element, snapshot] of this.#snapshots) {
      if (!current.has(element)) {
        restoreSnapshot(element, snapshot);
        this.#snapshots.delete(element);
      }
    }
  }

  #restoreAll(): void {
    for (const [element, snapshot] of this.#snapshots) {
      restoreSnapshot(element, snapshot);
    }

    this.#snapshots.clear();
  }

  #cleanupListeners(): void {
    for (const cleanup of this.#listenerCleanup.splice(0)) {
      cleanup();
    }

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pe-tabs": TabsElement;
  }

  interface GlobalEventHandlersEventMap {
    "pe-tabs:change": CustomEvent<TabsEventDetail>;
  }
}

if (!customElements.get("pe-tabs")) {
  customElements.define("pe-tabs", TabsElement);
}
