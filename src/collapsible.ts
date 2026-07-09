import {
  restoreAttribute,
  restoreSnapshot,
  type AttributeSnapshot
} from "./internal/dom";
import { dispatchCustomEvent } from "./internal/events";
import { isDocumentLoading } from "./internal/document-loading";
import {
  getFiniteAnimations,
  setTemporaryStyle,
  waitForAnimations
} from "./internal/motion";
import { createWarnOnce } from "./internal/warnings";

export type CollapsibleEventReason =
  | "trigger"
  | "programmatic"
  | "attribute"
  | "beforematch";

export type CollapsibleEventDetail = {
  open: boolean;
  panel: HTMLElement;
  trigger?: HTMLElement;
  reason: CollapsibleEventReason;
};

let generatedPanelId = 0;
const warn = createWarnOnce("[pe-collapsible]");

function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " " || event.key === "Spacebar";
}

function isOwnedByHost(element: HTMLElement, host: HTMLElement): boolean {
  return element.closest("pe-collapsible") === host;
}

function dispatchCollapsibleEvent(
  host: HTMLElement,
  type: "pe-collapsible:open" | "pe-collapsible:close",
  detail: CollapsibleEventDetail
): void {
  dispatchCustomEvent(host, type, detail);
}

export class CollapsibleElement extends HTMLElement {
  #triggers: HTMLElement[] = [];
  #panel: HTMLElement | null = null;
  #open = false;
  #initialized = false;
  #refreshQueued = false;
  #listenerCleanup: Array<() => void> = [];
  #observer: MutationObserver | null = null;
  #snapshots = new Map<HTMLElement, AttributeSnapshot>();
  #hostStateSnapshot: string | null = null;
  #hostDisabledSnapshot: string | null = null;
  #animationVersion = 0;
  #pendingOpenFrame = 0;
  #closePending = false;
  #lastPanelHeight = 0;
  #lastPanelWidth = 0;
  #restorePendingMotionStyle: (() => void) | null = null;

  connectedCallback(): void {
    this.#hostStateSnapshot = this.getAttribute("data-state");
    this.#hostDisabledSnapshot = this.getAttribute("data-disabled");
    this.#open = this.hasAttribute("data-collapsible-open");

    if (isDocumentLoading()) {
      this.#queueRefresh();
    } else {
      this.#refresh("attribute");
    }

    this.#observe();
  }

  disconnectedCallback(): void {
    this.#animationVersion += 1;
    this.#cancelPendingOpenAnimation();
    this.#cleanupListeners();
    this.#observer?.disconnect();
    this.#observer = null;
    this.#restoreAll();
    restoreAttribute(this, "data-state", this.#hostStateSnapshot);
    restoreAttribute(this, "data-disabled", this.#hostDisabledSnapshot);
    this.#triggers = [];
    this.#panel = null;
    this.#initialized = false;
  }

  get isOpen(): boolean {
    return this.#open;
  }

  get disabled(): boolean {
    return this.hasAttribute("data-collapsible-disabled");
  }

  set disabled(disabled: boolean) {
    this.toggleAttribute("data-collapsible-disabled", disabled);
  }

  open(trigger?: HTMLElement): void {
    this.#setOpen(true, "programmatic", trigger);
  }

  close(trigger?: HTMLElement): void {
    this.#setOpen(false, "programmatic", trigger);
  }

  toggle(trigger?: HTMLElement): void {
    this.#setOpen(!this.#open, "programmatic", trigger);
  }

  #setOpen(
    open: boolean,
    reason: CollapsibleEventReason,
    trigger?: HTMLElement
  ): void {
    if (this.#open === open) {
      return;
    }

    this.#open = open;
    this.toggleAttribute("data-collapsible-open", open);
    this.#sync(true, reason);

    if (this.#panel) {
      dispatchCollapsibleEvent(
        this,
        open ? "pe-collapsible:open" : "pe-collapsible:close",
        { open, panel: this.#panel, trigger, reason }
      );
    }
  }

  #refresh(reason: CollapsibleEventReason): void {
    this.#refreshQueued = false;
    this.#cleanupListeners();

    const previousOpen = this.#open;
    this.#resolveElements();
    this.#restoreStaleElements();
    this.#enhanceElements();
    this.#open = this.hasAttribute("data-collapsible-open");
    this.#sync(false, reason);
    this.#bindListeners();

    if (this.#initialized && previousOpen !== this.#open && this.#panel) {
      dispatchCollapsibleEvent(
        this,
        this.#open ? "pe-collapsible:open" : "pe-collapsible:close",
        { open: this.#open, panel: this.#panel, reason }
      );
    }

    this.#initialized = true;
  }

  #resolveElements(): void {
    this.#triggers = Array.from(
      this.querySelectorAll<HTMLElement>("[data-collapsible-trigger]")
    ).filter((element) => isOwnedByHost(element, this));
    const panels = Array.from(
      this.querySelectorAll<HTMLElement>("[data-collapsible-panel]")
    ).filter((element) => isOwnedByHost(element, this));
    this.#panel = panels[0] ?? null;

    if (this.#triggers.length === 0) {
      if (!isDocumentLoading()) {
        warn("Missing [data-collapsible-trigger] inside <pe-collapsible>.");
      }
    }

    if (!this.#panel) {
      if (!isDocumentLoading()) {
        warn("Missing [data-collapsible-panel] inside <pe-collapsible>.");
      }
    } else if (panels.length > 1) {
      warn("Multiple [data-collapsible-panel] elements found; using the first one.");
    }
  }

  #enhanceElements(): void {
    if (this.#panel) {
      this.#remember(this.#panel, [
        "id",
        "hidden",
        "style",
        "data-state",
        "data-disabled",
        "data-starting-style",
        "data-ending-style"
      ]);

      if (!this.#panel.id) {
        generatedPanelId += 1;
        this.#panel.id = `pe-collapsible-panel-${generatedPanelId}`;
      }
    }

    for (const trigger of this.#triggers) {
      this.#remember(trigger, [
        "aria-controls",
        "aria-expanded",
        "aria-disabled",
        "data-state",
        "data-disabled"
      ]);
    }
  }

  #sync(transition: boolean, reason: CollapsibleEventReason): void {
    const state = this.#open ? "open" : "closed";
    const rootDisabled = this.disabled;
    this.dataset.state = state;

    if (rootDisabled) {
      this.setAttribute("data-disabled", "");
    } else {
      restoreAttribute(this, "data-disabled", this.#hostDisabledSnapshot);
    }

    for (const trigger of this.#triggers) {
      const disabled = rootDisabled || this.#isTriggerDisabled(trigger);
      trigger.dataset.state = state;
      trigger.setAttribute("aria-expanded", String(this.#open));

      if (this.#panel) {
        trigger.setAttribute("aria-controls", this.#panel.id);
      } else {
        this.#restoreManagedAttribute(trigger, "aria-controls");
      }

      if (disabled) {
        trigger.setAttribute("aria-disabled", "true");
        trigger.setAttribute("data-disabled", "");
      } else {
        this.#restoreManagedAttribute(trigger, "aria-disabled");
        this.#restoreManagedAttribute(trigger, "data-disabled");
      }
    }

    if (!this.#panel) {
      return;
    }

    this.#panel.dataset.state = state;

    if (rootDisabled) {
      this.#panel.setAttribute("data-disabled", "");
    } else {
      this.#restoreManagedAttribute(this.#panel, "data-disabled");
    }

    if (this.#open) {
      this.#showPanel(transition && reason !== "beforematch");
    } else {
      this.#hidePanel(transition);
    }
  }

  #showPanel(transition: boolean): void {
    if (!this.#panel) {
      return;
    }

    this.#cancelPendingOpenAnimation();
    const panel = this.#panel;
    const wasHidden = panel.hasAttribute("hidden");
    const wasClosing =
      panel.hasAttribute("data-ending-style") || this.#closePending;
    this.#closePending = false;
    const version = this.#nextAnimationVersion();
    panel.removeAttribute("data-ending-style");
    panel.removeAttribute("hidden");
    panel.removeAttribute("data-starting-style");
    this.#measurePanel(true);

    if (!transition) {
      this.#clearPanelDimensions();
      return;
    }

    if (wasClosing) {
      void panel.offsetHeight;
      this.#scheduleClearPanelDimensions(version);
      return;
    }

    if (!wasHidden) {
      this.#clearPanelDimensions();
      return;
    }

    panel.setAttribute("data-starting-style", "");
    this.#restorePendingMotionStyle = setTemporaryStyle(
      panel,
      "transition-duration",
      "0s"
    );
    void panel.offsetHeight;
    this.#pendingOpenFrame = window.requestAnimationFrame(() => {
      this.#pendingOpenFrame = 0;

      if (!this.#open || this.#animationVersion !== version) {
        return;
      }

      this.#clearPendingMotionStyle();
      panel.removeAttribute("data-starting-style");
      this.#scheduleClearPanelDimensions(version);
    });
  }

  #hidePanel(transition: boolean): void {
    if (!this.#panel) {
      return;
    }

    this.#cancelPendingOpenAnimation();
    const panel = this.#panel;
    const version = this.#nextAnimationVersion();
    panel.removeAttribute("data-starting-style");

    if (!transition || panel.hasAttribute("hidden")) {
      this.#closePending = false;
      this.#finishHidingPanel(version);
      return;
    }

    this.#closePending = true;
    void panel.offsetHeight;
    this.#measurePanel(true);
    void panel.offsetHeight;
    window.requestAnimationFrame(() => {
      if (this.#open || this.#animationVersion !== version) {
        return;
      }

      panel.setAttribute("data-ending-style", "");
      void panel.offsetHeight;
      waitForAnimations(
        panel,
        () => this.#finishHidingPanel(version),
        () => this.#open || this.#animationVersion !== version
      );
    });
  }

  #finishHidingPanel(version: number): void {
    if (!this.#panel || this.#open || this.#animationVersion !== version) {
      return;
    }

    this.#closePending = false;

    if (this.#usesHiddenUntilFound()) {
      this.#panel.setAttribute("hidden", "until-found");
      this.#panel.setAttribute("data-starting-style", "");
    } else {
      this.#panel.hidden = true;
      this.#panel.removeAttribute("data-starting-style");
    }

    this.#panel.removeAttribute("data-ending-style");
  }

  #cancelPendingOpenAnimation(): void {
    if (this.#pendingOpenFrame !== 0) {
      window.cancelAnimationFrame(this.#pendingOpenFrame);
      this.#pendingOpenFrame = 0;
    }

    this.#clearPendingMotionStyle();
  }

  #clearPendingMotionStyle(): void {
    this.#restorePendingMotionStyle?.();
    this.#restorePendingMotionStyle = null;
  }

  #nextAnimationVersion(): number {
    this.#animationVersion += 1;
    return this.#animationVersion;
  }

  #clearPanelDimensions(): void {
    if (!this.#panel) {
      return;
    }

    this.#panel.style.setProperty("--collapsible-panel-height", "auto");
    this.#panel.style.setProperty("--collapsible-panel-width", "auto");
  }

  #scheduleClearPanelDimensions(version: number): void {
    if (!this.#panel) {
      return;
    }

    const panel = this.#panel;

    window.requestAnimationFrame(() => {
      if (!this.#open || this.#animationVersion !== version) {
        return;
      }

      const animations = getFiniteAnimations(panel);

      if (animations.length === 0) {
        this.#clearPanelDimensions();
        return;
      }

      void Promise.allSettled(animations.map((animation) => animation.finished)).then(
        () => {
          if (this.#open && this.#animationVersion === version) {
            this.#clearPanelDimensions();
          }
        }
      );
    });
  }

  #bindListeners(): void {
    for (const trigger of this.#triggers) {
      const onClick = (event: MouseEvent): void => {
        if (this.disabled || this.#isTriggerDisabled(trigger)) {
          event.preventDefault();
          return;
        }

        this.#setOpen(!this.#open, "trigger", trigger);
      };

      const onKeyDown = (event: KeyboardEvent): void => {
        if (!isActivationKey(event)) {
          return;
        }

        // Block keyboard activation while disabled. The trigger keeps its
        // aria-disabled attribute (rather than the native disabled property)
        // so it stays focusable; preventing the default here stops the
        // synthesized click that Enter/Space would otherwise dispatch.
        if (this.disabled || this.#isTriggerDisabled(trigger)) {
          event.preventDefault();
        }
      };

      trigger.addEventListener("click", onClick);
      trigger.addEventListener("keydown", onKeyDown);
      this.#listenerCleanup.push(() => {
        trigger.removeEventListener("click", onClick);
        trigger.removeEventListener("keydown", onKeyDown);
      });
    }

    if (this.#panel) {
      const panel = this.#panel;
      const onBeforeMatch = (): void => {
        this.#setOpen(true, "beforematch");
      };

      panel.addEventListener("beforematch", onBeforeMatch);
      this.#listenerCleanup.push(() => {
        panel.removeEventListener("beforematch", onBeforeMatch);
      });
    }
  }

  #isTriggerDisabled(trigger: HTMLElement): boolean {
    return (
      trigger.hasAttribute("data-collapsible-disabled") ||
      (trigger instanceof HTMLButtonElement && trigger.disabled) ||
      this.#snapshots.get(trigger)?.["aria-disabled"] === "true"
    );
  }

  #usesHiddenUntilFound(): boolean {
    return Boolean(
      this.#panel &&
        (this.hasAttribute("data-collapsible-hidden-until-found") ||
          this.#panel.hasAttribute("data-collapsible-hidden-until-found"))
    );
  }

  #measurePanel(force = false): void {
    if (!this.#panel) {
      return;
    }

    let height = this.#panel.scrollHeight;
    let width = this.#panel.scrollWidth;

    if (force && height === 0 && width === 0 && this.#lastPanelHeight > 0) {
      height = this.#lastPanelHeight;
      width = this.#lastPanelWidth;
    }

    if (!force && height === 0 && width === 0) {
      return;
    }

    if (height > 0 || width > 0) {
      this.#lastPanelHeight = height;
      this.#lastPanelWidth = width;
    }

    this.#panel.style.setProperty(
      "--collapsible-panel-height",
      `${height}px`
    );
    this.#panel.style.setProperty("--collapsible-panel-width", `${width}px`);
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
        "data-collapsible-trigger",
        "data-collapsible-panel",
        "data-collapsible-open",
        "data-collapsible-disabled",
        "data-collapsible-hidden-until-found",
        "disabled"
      ]
    });
  }

  #shouldRefresh(record: MutationRecord): boolean {
    if (record.type === "childList") {
      return true;
    }

    if (
      record.target === this &&
      record.attributeName === "data-collapsible-open"
    ) {
      return this.hasAttribute("data-collapsible-open") !== this.#open;
    }

    return true;
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
    if (this.#snapshots.has(element)) {
      return;
    }

    const snapshot: AttributeSnapshot = {};

    for (const name of names) {
      snapshot[name] = element.getAttribute(name);
    }

    this.#snapshots.set(element, snapshot);
  }

  #restoreManagedAttribute(element: HTMLElement, name: string): void {
    restoreAttribute(element, name, this.#snapshots.get(element)?.[name] ?? null);
  }

  #restoreStaleElements(): void {
    const current = new Set<HTMLElement>([
      ...this.#triggers,
      ...(this.#panel ? [this.#panel] : [])
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
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pe-collapsible": CollapsibleElement;
  }

  interface GlobalEventHandlersEventMap {
    "pe-collapsible:open": CustomEvent<CollapsibleEventDetail>;
    "pe-collapsible:close": CustomEvent<CollapsibleEventDetail>;
  }
}

if (!customElements.get("pe-collapsible")) {
  customElements.define("pe-collapsible", CollapsibleElement);
}
