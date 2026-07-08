import { ManagedAccordionItem } from "./internal/accordion-managed";
import { NativeAccordionItem } from "./internal/accordion-native";
import { restoreAttribute } from "./internal/dom";
import { dispatchCustomEvent } from "./internal/events";
import { createWarnOnce } from "./internal/warnings";

export type AccordionEventReason =
  | "trigger"
  | "programmatic"
  | "attribute"
  | "beforematch"
  | "native";

export type AccordionItemElement = HTMLDetailsElement | HTMLDivElement;

export type AccordionEventDetail = {
  item: AccordionItemElement;
  trigger: HTMLElement;
  summary: HTMLElement;
  panel: HTMLElement | null;
  value: string | null;
  reason: AccordionEventReason;
  index: number;
};

type AccordionItem = NativeAccordionItem | ManagedAccordionItem;

const warn = createWarnOnce("[pe-accordion]");

function isOwnedByHost(element: HTMLElement, host: HTMLElement): boolean {
  return element.closest("pe-accordion") === host;
}

function dispatchAccordionEvent(
  host: HTMLElement,
  type: "pe-accordion:open" | "pe-accordion:close",
  detail: AccordionEventDetail
): void {
  dispatchCustomEvent(host, type, detail);
}

export class AccordionElement extends HTMLElement {
  #items: AccordionItem[] = [];
  #observer: MutationObserver | null = null;
  #refreshQueued = false;
  #hostStateSnapshot: string | null = null;
  #hostDisabledSnapshot: string | null = null;

  connectedCallback(): void {
    this.#hostStateSnapshot = this.getAttribute("data-state");
    this.#hostDisabledSnapshot = this.getAttribute("data-disabled");
    this.#refresh();
    this.#observe();
  }

  disconnectedCallback(): void {
    this.#destroyItems();
    this.#observer?.disconnect();
    this.#observer = null;
    restoreAttribute(this, "data-state", this.#hostStateSnapshot);
    restoreAttribute(this, "data-disabled", this.#hostDisabledSnapshot);
  }

  open(target: string | AccordionItemElement): void {
    this.#setOpen(target, true, "programmatic");
  }

  get disabled(): boolean {
    return this.hasAttribute("data-accordion-disabled");
  }

  set disabled(disabled: boolean) {
    this.toggleAttribute("data-accordion-disabled", disabled);
  }

  get value(): string[] {
    return this.#items.flatMap((item) => {
      const value = item.element.getAttribute("data-accordion-value");
      return item.open && value !== null ? [value] : [];
    });
  }

  set value(values: string[]) {
    const requestedValues = new Set(values);

    for (const item of this.#items) {
      const value = item.element.getAttribute("data-accordion-value");

      if (value !== null) {
        this.#requestOpenChange(
          item,
          requestedValues.has(value),
          "programmatic"
        );
      }
    }
  }

  close(target: string | AccordionItemElement): void {
    this.#setOpen(target, false, "programmatic");
  }

  toggle(target: string | AccordionItemElement): void {
    const item = this.#resolveTarget(target);

    if (item) {
      this.#requestOpenChange(item, !item.open, "programmatic");
    }
  }

  #setOpen(
    target: string | AccordionItemElement,
    open: boolean,
    reason: AccordionEventReason
  ): void {
    const item = this.#resolveTarget(target);

    if (item) {
      this.#requestOpenChange(item, open, reason);
    }
  }

  #requestOpenChange(
    item: AccordionItem,
    open: boolean,
    reason: AccordionEventReason
  ): void {
    if (item.open === open) {
      return;
    }

    if (
      item.mode === "managed" &&
      open &&
      this.hasAttribute("data-accordion-single")
    ) {
      for (const candidate of this.#items) {
        if (
          candidate.mode === "managed" &&
          candidate !== item &&
          candidate.open
        ) {
          candidate.setOpen(false, reason);
        }
      }
    }

    item.setOpen(open, reason);
  }

  #resolveTarget(target: string | AccordionItemElement): AccordionItem | null {
    const item =
      typeof target === "string"
        ? this.#items.find(
            (candidate) =>
              candidate.element.getAttribute("data-accordion-value") === target
          )
        : this.#items.find((candidate) => candidate.element === target);

    if (!item) {
      const label = typeof target === "string" ? ` "${target}"` : "";
      warn(`Cannot find accordion item${label}.`);
      return null;
    }

    return item;
  }

  #refresh(): void {
    this.#refreshQueued = false;
    this.#destroyItems();

    const candidates = Array.from(
      this.querySelectorAll<HTMLElement>("[data-accordion-item]")
    ).filter((element) => isOwnedByHost(element, this));
    const supportedCandidates = candidates.filter((element) => {
      const supported =
        element instanceof HTMLDetailsElement ||
        element instanceof HTMLDivElement;

      if (!supported) {
        warn("[data-accordion-item] must be a <details> or <div> element.");
      }

      return supported;
    }) as AccordionItemElement[];
    const firstMode = supportedCandidates[0] instanceof HTMLDetailsElement
      ? "native"
      : supportedCandidates.length > 0
        ? "managed"
        : null;

    if (
      firstMode &&
      supportedCandidates.some(
        (element) =>
          (element instanceof HTMLDetailsElement ? "native" : "managed") !==
          firstMode
      )
    ) {
      warn(
        "Do not mix <details> and <div> accordion items in the same <pe-accordion>."
      );
    }

    for (const element of supportedCandidates) {
      const mode = element instanceof HTMLDetailsElement ? "native" : "managed";

      if (mode !== firstMode) {
        continue;
      }

      const item =
        element instanceof HTMLDetailsElement
          ? NativeAccordionItem.create(element, {
              onChange: this.#onItemChange,
              warn
            })
          : ManagedAccordionItem.create(element, this, {
              onOpenChangeRequest: (item, open, reason) => {
                this.#requestOpenChange(item, open, reason);
              },
              onChange: this.#onItemChange,
              warn
            });

      if (item) {
        this.#items.push(item);
      }
    }

    this.#normalizeManagedSingleOpen();
    this.#syncItems();
    this.#syncHost();
  }

  #normalizeManagedSingleOpen(): void {
    if (!this.hasAttribute("data-accordion-single")) {
      return;
    }

    let foundOpenItem = false;

    for (const item of this.#items) {
      if (item.mode !== "managed" || !item.open) {
        continue;
      }

      if (foundOpenItem) {
        item.setInitialOpen(false);
      } else {
        foundOpenItem = true;
      }
    }
  }

  #syncItems(): void {
    for (const [index, item] of this.#items.entries()) {
      if (item.mode === "native") {
        item.sync(index, this.disabled);
      } else {
        item.sync(index, this.disabled, this.#usesHiddenUntilFound(item));
      }
    }
  }

  #usesHiddenUntilFound(item: ManagedAccordionItem): boolean {
    return (
      this.hasAttribute("data-accordion-hidden-until-found") ||
      item.panel.hasAttribute("data-accordion-hidden-until-found")
    );
  }

  #onItemChange = (
    item: AccordionItem,
    reason: AccordionEventReason
  ): void => {
    const index = this.#items.indexOf(item);

    if (index < 0) {
      return;
    }

    if (item.mode === "native") {
      item.sync(index, this.disabled);
    }

    this.#syncHost();
    dispatchAccordionEvent(
      this,
      item.open ? "pe-accordion:open" : "pe-accordion:close",
      {
        item: item.element,
        trigger: item.trigger,
        summary: item.trigger,
        panel: item.panel,
        value: item.element.getAttribute("data-accordion-value"),
        reason,
        index
      }
    );
  };

  #syncHost(): void {
    this.dataset.state = this.#items.some((item) => item.open)
      ? "open"
      : "closed";

    if (this.disabled) {
      this.setAttribute("data-disabled", "");
    } else {
      restoreAttribute(this, "data-disabled", this.#hostDisabledSnapshot);
    }
  }

  #observe(): void {
    this.#observer?.disconnect();
    this.#observer = new MutationObserver((records) => {
      let needsRefresh = false;

      for (const record of records) {
        if (
          record.type === "attributes" &&
          record.attributeName === "data-accordion-open" &&
          record.target instanceof HTMLDivElement
        ) {
          const item = this.#items.find(
            (candidate): candidate is ManagedAccordionItem =>
              candidate.mode === "managed" &&
              candidate.element === record.target
          );

          if (item) {
            this.#requestOpenChange(
              item,
              item.element.hasAttribute("data-accordion-open"),
              "attribute"
            );
            continue;
          }
        }

        needsRefresh = true;
      }

      if (needsRefresh) {
        this.#queueRefresh();
      }
    });
    this.#observer.observe(this, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-accordion-item",
        "data-accordion-value",
        "data-accordion-disabled",
        "data-accordion-open",
        "data-accordion-single",
        "data-accordion-trigger",
        "data-accordion-panel",
        "data-accordion-hidden-until-found",
        "disabled"
      ]
    });
  }

  #queueRefresh(): void {
    if (this.#refreshQueued) {
      return;
    }

    this.#refreshQueued = true;
    queueMicrotask(() => {
      if (this.isConnected) {
        this.#refresh();
      }
    });
  }

  #destroyItems(): void {
    for (const item of this.#items) {
      item.destroy();
    }

    this.#items = [];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pe-accordion": AccordionElement;
  }

  interface GlobalEventHandlersEventMap {
    "pe-accordion:open": CustomEvent<AccordionEventDetail>;
    "pe-accordion:close": CustomEvent<AccordionEventDetail>;
  }
}

if (!customElements.get("pe-accordion")) {
  customElements.define("pe-accordion", AccordionElement);
}
