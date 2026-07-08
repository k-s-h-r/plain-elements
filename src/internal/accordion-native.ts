import type { AccordionEventReason } from "../accordion";
import {
  captureAttributes,
  restoreAttribute,
  restoreSnapshot,
  type AttributeSnapshot
} from "./dom";

type NativeAccordionItemOptions = {
  onChange: (
    item: NativeAccordionItem,
    reason: AccordionEventReason
  ) => void;
  warn: (message: string) => void;
};

function isActivationKey(event: KeyboardEvent): boolean {
  return event.key === "Enter" || event.key === " " || event.key === "Spacebar";
}

function getSummary(details: HTMLDetailsElement): HTMLElement | null {
  for (const child of details.children) {
    if (child instanceof HTMLElement && child.localName === "summary") {
      return child;
    }
  }

  return null;
}

export class NativeAccordionItem {
  readonly mode = "native";
  readonly element: HTMLDetailsElement;
  readonly trigger: HTMLElement;
  readonly panel = null;

  #onChange: NativeAccordionItemOptions["onChange"];
  #pendingReason: AccordionEventReason | null = null;
  #disabled = false;
  #elementSnapshot: AttributeSnapshot;
  #triggerSnapshot: AttributeSnapshot;

  private constructor(
    element: HTMLDetailsElement,
    trigger: HTMLElement,
    options: NativeAccordionItemOptions
  ) {
    this.element = element;
    this.trigger = trigger;
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
      "aria-disabled"
    ]);
    this.trigger.addEventListener("click", this.#onTriggerClick);
    this.trigger.addEventListener("keydown", this.#onTriggerKeyDown);
    this.element.addEventListener("toggle", this.#onToggle);
  }

  static create(
    element: HTMLDetailsElement,
    options: NativeAccordionItemOptions
  ): NativeAccordionItem | null {
    const summary = getSummary(element);

    if (!summary) {
      options.warn(
        "Every details[data-accordion-item] needs a direct <summary> child."
      );
      return null;
    }

    return new NativeAccordionItem(element, summary, options);
  }

  get open(): boolean {
    return this.element.open;
  }

  setOpen(open: boolean, reason: AccordionEventReason): void {
    if (this.open === open) {
      return;
    }

    this.#pendingReason = reason;
    this.element.open = open;
  }

  sync(index: number, rootDisabled: boolean): void {
    const state = this.open ? "open" : "closed";
    this.#disabled =
      rootDisabled ||
      this.element.hasAttribute("data-accordion-disabled") ||
      this.#triggerSnapshot["aria-disabled"] === "true";
    this.element.dataset.state = state;
    this.trigger.dataset.state = state;
    this.element.dataset.index = String(index);
    this.trigger.dataset.index = String(index);

    if (this.#disabled) {
      this.element.setAttribute("data-disabled", "");
      this.trigger.setAttribute("data-disabled", "");
      this.trigger.setAttribute("aria-disabled", "true");
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
    }
  }

  destroy(): void {
    this.trigger.removeEventListener("click", this.#onTriggerClick);
    this.trigger.removeEventListener("keydown", this.#onTriggerKeyDown);
    this.element.removeEventListener("toggle", this.#onToggle);
    restoreSnapshot(this.element, this.#elementSnapshot);
    restoreSnapshot(this.trigger, this.#triggerSnapshot);
  }

  #onTriggerClick = (event: MouseEvent): void => {
    if (this.#disabled) {
      event.preventDefault();
      return;
    }

    this.#pendingReason = "trigger";
  };

  #onTriggerKeyDown = (event: KeyboardEvent): void => {
    // A disabled <summary> stays focusable, so Enter/Space would otherwise
    // toggle the native <details>. Preventing the default keydown blocks that
    // native activation path (which does not always route through click).
    if (this.#disabled && isActivationKey(event)) {
      event.preventDefault();
    }
  };

  #onToggle = (): void => {
    const reason = this.#pendingReason ?? "native";
    this.#pendingReason = null;
    this.#onChange(this, reason);
  };
}
