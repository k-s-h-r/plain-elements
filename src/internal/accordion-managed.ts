import type { AccordionEventReason } from "../accordion";
import {
  captureAttributes,
  restoreAttribute,
  restoreSnapshot,
  type AttributeSnapshot
} from "./dom";
import {
  getFiniteAnimations,
  setTemporaryStyle,
  waitForAnimations
} from "./motion";

type ManagedAccordionItemOptions = {
  onOpenChangeRequest: (
    item: ManagedAccordionItem,
    open: boolean,
    reason: AccordionEventReason
  ) => void;
  onChange: (
    item: ManagedAccordionItem,
    reason: AccordionEventReason
  ) => void;
  warn: (message: string) => void;
};

let generatedPanelId = 0;
const generatedPanelIds = new WeakMap<HTMLElement, string>();

function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " " || event.key === "Spacebar";
}

function isOwnedByItem(
  element: HTMLElement,
  item: HTMLElement,
  host: HTMLElement
): boolean {
  return (
    element.closest("pe-accordion") === host &&
    element.closest<HTMLElement>("[data-accordion-item]") === item
  );
}

export class ManagedAccordionItem {
  readonly mode = "managed";
  readonly element: HTMLDivElement;
  readonly trigger: HTMLButtonElement;
  readonly panel: HTMLElement;

  #open: boolean;
  #disabled = false;
  #hiddenUntilFound = false;
  #index = -1;
  #animationVersion = 0;
  #pendingOpenFrame = 0;
  #closePending = false;
  #lastPanelHeight = 0;
  #lastPanelWidth = 0;
  #restorePendingMotionStyle: (() => void) | null = null;
  #onOpenChangeRequest: ManagedAccordionItemOptions["onOpenChangeRequest"];
  #onChange: ManagedAccordionItemOptions["onChange"];
  #elementSnapshot: AttributeSnapshot;
  #triggerSnapshot: AttributeSnapshot;
  #panelSnapshot: AttributeSnapshot;

  private constructor(
    element: HTMLDivElement,
    trigger: HTMLButtonElement,
    panel: HTMLElement,
    options: ManagedAccordionItemOptions
  ) {
    this.element = element;
    this.trigger = trigger;
    this.panel = panel;
    this.#open = element.hasAttribute("data-accordion-open");
    this.#onOpenChangeRequest = options.onOpenChangeRequest;
    this.#onChange = options.onChange;
    this.#elementSnapshot = captureAttributes(element, [
      "data-state",
      "data-disabled",
      "data-index"
    ]);
    this.#triggerSnapshot = captureAttributes(trigger, [
      "data-state",
      "data-disabled",
      "data-index",
      "aria-disabled",
      "aria-controls",
      "aria-expanded"
    ]);
    this.#panelSnapshot = captureAttributes(panel, [
      "id",
      "hidden",
      "style",
      "data-state",
      "data-disabled",
      "data-index",
      "data-starting-style",
      "data-ending-style"
    ]);

    if (!this.panel.id) {
      let panelId = generatedPanelIds.get(this.panel);

      if (!panelId) {
        generatedPanelId += 1;
        panelId = `pe-accordion-panel-${generatedPanelId}`;
        generatedPanelIds.set(this.panel, panelId);
      }

      this.panel.id = panelId;
    }

    this.trigger.addEventListener("click", this.#onTriggerClick);
    this.trigger.addEventListener("keydown", this.#onTriggerKeyDown);
    this.panel.addEventListener("beforematch", this.#onBeforeMatch);
  }

  static create(
    element: HTMLDivElement,
    host: HTMLElement,
    options: ManagedAccordionItemOptions
  ): ManagedAccordionItem | null {
    const triggers = Array.from(
      element.querySelectorAll<HTMLElement>("[data-accordion-trigger]")
    ).filter((candidate) => isOwnedByItem(candidate, element, host));
    const panels = Array.from(
      element.querySelectorAll<HTMLElement>("[data-accordion-panel]")
    ).filter((candidate) => isOwnedByItem(candidate, element, host));

    if (triggers.length !== 1 || !(triggers[0] instanceof HTMLButtonElement)) {
      options.warn(
        "Every div[data-accordion-item] needs exactly one <button data-accordion-trigger>."
      );
      return null;
    }

    if (panels.length !== 1) {
      options.warn(
        "Every div[data-accordion-item] needs exactly one [data-accordion-panel]."
      );
      return null;
    }

    if (triggers[0].type !== "button") {
      options.warn("Managed accordion triggers should use <button type=\"button\">.");
    }

    return new ManagedAccordionItem(element, triggers[0], panels[0]!, options);
  }

  get open(): boolean {
    return this.#open;
  }

  setOpen(open: boolean, reason: AccordionEventReason): void {
    if (this.#open === open) {
      return;
    }

    this.#open = open;
    this.element.toggleAttribute("data-accordion-open", open);
    this.#syncState(true, reason);
    this.#onChange(this, reason);
  }

  setInitialOpen(open: boolean): void {
    this.#open = open;
    this.element.toggleAttribute("data-accordion-open", open);
  }

  sync(
    index: number,
    rootDisabled: boolean,
    hiddenUntilFound: boolean
  ): void {
    this.#index = index;
    this.#hiddenUntilFound = hiddenUntilFound;
    this.#disabled =
      rootDisabled ||
      this.element.hasAttribute("data-accordion-disabled") ||
      this.trigger.disabled ||
      this.#triggerSnapshot["aria-disabled"] === "true";
    this.#syncState(false, "attribute");
  }

  destroy(): void {
    this.#animationVersion += 1;
    this.#cancelPendingOpenAnimation();
    this.trigger.removeEventListener("click", this.#onTriggerClick);
    this.trigger.removeEventListener("keydown", this.#onTriggerKeyDown);
    this.panel.removeEventListener("beforematch", this.#onBeforeMatch);
    this.#clearPanelDimensions();
    restoreSnapshot(this.element, this.#elementSnapshot);
    restoreSnapshot(this.trigger, this.#triggerSnapshot);
    restoreSnapshot(this.panel, this.#panelSnapshot);
  }

  #syncState(transition: boolean, reason: AccordionEventReason): void {
    const state = this.#open ? "open" : "closed";
    this.element.dataset.state = state;
    this.trigger.dataset.state = state;
    this.panel.dataset.state = state;
    this.element.dataset.index = String(this.#index);
    this.trigger.dataset.index = String(this.#index);
    this.panel.dataset.index = String(this.#index);
    this.trigger.setAttribute("aria-expanded", String(this.#open));
    this.trigger.setAttribute("aria-controls", this.panel.id);

    if (this.#disabled) {
      this.element.setAttribute("data-disabled", "");
      this.trigger.setAttribute("data-disabled", "");
      this.trigger.setAttribute("aria-disabled", "true");
      this.panel.setAttribute("data-disabled", "");
    } else {
      restoreAttribute(
        this.element,
        "data-disabled",
        this.#elementSnapshot["data-disabled"] ?? null
      );
      restoreAttribute(
        this.trigger,
        "data-disabled",
        this.#triggerSnapshot["data-disabled"] ?? null
      );
      restoreAttribute(
        this.trigger,
        "aria-disabled",
        this.#triggerSnapshot["aria-disabled"] ?? null
      );
      restoreAttribute(
        this.panel,
        "data-disabled",
        this.#panelSnapshot["data-disabled"] ?? null
      );
    }

    if (this.#open) {
      this.#showPanel(transition && reason !== "beforematch");
    } else {
      this.#hidePanel(transition);
    }
  }

  #showPanel(transition: boolean): void {
    this.#cancelPendingOpenAnimation();
    const wasHidden = this.panel.hasAttribute("hidden");
    const wasClosing =
      this.panel.hasAttribute("data-ending-style") || this.#closePending;
    this.#closePending = false;
    const version = this.#nextAnimationVersion();
    this.panel.removeAttribute("data-ending-style");
    this.panel.removeAttribute("hidden");
    this.panel.removeAttribute("data-starting-style");
    this.#measurePanel(true);

    if (!transition) {
      this.#clearPanelDimensions();
      return;
    }

    if (wasClosing) {
      void this.panel.offsetHeight;
      this.#scheduleClearPanelDimensions(version);
      return;
    }

    if (!wasHidden) {
      this.#clearPanelDimensions();
      return;
    }

    this.panel.setAttribute("data-starting-style", "");
    this.#restorePendingMotionStyle = setTemporaryStyle(
      this.panel,
      "transition-duration",
      "0s"
    );
    void this.panel.offsetHeight;
    this.#pendingOpenFrame = window.requestAnimationFrame(() => {
      this.#pendingOpenFrame = 0;

      if (!this.#open || this.#animationVersion !== version) {
        return;
      }

      this.#clearPendingMotionStyle();
      this.panel.removeAttribute("data-starting-style");
      this.#scheduleClearPanelDimensions(version);
    });
  }

  #hidePanel(transition: boolean): void {
    this.#cancelPendingOpenAnimation();
    const version = this.#nextAnimationVersion();
    this.panel.removeAttribute("data-starting-style");

    if (!transition || this.panel.hasAttribute("hidden")) {
      this.#closePending = false;
      this.#finishHidingPanel(version);
      return;
    }

    this.#closePending = true;
    void this.panel.offsetHeight;
    this.#measurePanel(true);
    void this.panel.offsetHeight;
    window.requestAnimationFrame(() => {
      if (this.#open || this.#animationVersion !== version) {
        return;
      }

      this.panel.setAttribute("data-ending-style", "");
      void this.panel.offsetHeight;
      waitForAnimations(
        this.panel,
        () => this.#finishHidingPanel(version),
        () => this.#open || this.#animationVersion !== version
      );
    });
  }

  #finishHidingPanel(version: number): void {
    if (this.#open || this.#animationVersion !== version) {
      return;
    }

    this.#closePending = false;

    if (this.#hiddenUntilFound) {
      this.panel.setAttribute("hidden", "until-found");
      this.panel.setAttribute("data-starting-style", "");
    } else {
      this.panel.hidden = true;
      this.panel.removeAttribute("data-starting-style");
    }

    this.panel.removeAttribute("data-ending-style");
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

  #measurePanel(force = false): void {
    let height = this.panel.scrollHeight;
    let width = this.panel.scrollWidth;

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

    this.panel.style.setProperty(
      "--accordion-panel-height",
      `${height}px`
    );
    this.panel.style.setProperty(
      "--accordion-panel-width",
      `${width}px`
    );
  }

  #clearPanelDimensions(): void {
    this.panel.style.setProperty("--accordion-panel-height", "auto");
    this.panel.style.setProperty("--accordion-panel-width", "auto");
  }

  #scheduleClearPanelDimensions(version: number): void {
    window.requestAnimationFrame(() => {
      if (!this.#open || this.#animationVersion !== version) {
        return;
      }

      const animations = getFiniteAnimations(this.panel);

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

  #nextAnimationVersion(): number {
    this.#animationVersion += 1;
    return this.#animationVersion;
  }

  #onTriggerClick = (event: MouseEvent): void => {
    if (this.#disabled) {
      event.preventDefault();
      return;
    }

    this.#onOpenChangeRequest(this, !this.#open, "trigger");
  };

  #onTriggerKeyDown = (event: KeyboardEvent): void => {
    // Disabled triggers keep aria-disabled (not the native disabled property)
    // to stay focusable, so Enter/Space still reach them. Prevent the default
    // to stop the synthesized click that would otherwise toggle the item.
    if (this.#disabled && isActivationKey(event)) {
      event.preventDefault();
    }
  };

  #onBeforeMatch = (): void => {
    this.#onOpenChangeRequest(this, true, "beforematch");
  };
}
