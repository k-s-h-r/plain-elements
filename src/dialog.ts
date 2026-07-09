import {
  escapeAttributeValue,
  restoreAttribute,
  setAttributeIfNeeded
} from "./internal/dom";
import { dispatchCustomEvent } from "./internal/events";
import { createTriggerDocumentObserver } from "./internal/trigger-document-observer";
import { isDocumentLoading } from "./internal/document-loading";
import { createWarnOnce } from "./internal/warnings";

type DialogState = "open" | "closed";

type TriggerAttributeSnapshot = {
  dataState: string | null;
  ariaControls: string | null;
  ariaExpanded: string | null;
  ariaHaspopup: string | null;
};

export type DialogEventReason =
  | "trigger"
  | "close-control"
  | "form"
  | "cancel"
  | "dismiss"
  | "programmatic"
  | "native";

export type DialogEventDetail = {
  dialog: HTMLDialogElement;
  trigger?: HTMLElement;
  reason: DialogEventReason;
  defaultPrevented?: boolean;
};

let generatedDialogId = 0;
let generatedDialogTitleId = 0;
let generatedDialogDescriptionId = 0;
const generatedLabelledBy = new WeakMap<HTMLDialogElement, string>();
const generatedDescribedBy = new WeakMap<HTMLDialogElement, string>();
const openDialogStack: HTMLDialogElement[] = [];

const warn = createWarnOnce("[pe-dialog]");
const sharedTriggerDocumentObserver = createTriggerDocumentObserver(
  "data-dialog-trigger"
);

function getState(dialog: HTMLDialogElement | null): DialogState {
  return dialog?.open ? "open" : "closed";
}

function getElementValue(element: HTMLElement): string | undefined {
  if ("value" in element && typeof element.value === "string") {
    return element.value;
  }

  return element.getAttribute("value") ?? undefined;
}

function findEnhancedDialogHostById(id: string): HTMLElement | null {
  const element = document.getElementById(id);

  if (element instanceof HTMLElement && element.localName === "pe-dialog") {
    return element;
  }

  return null;
}

function isTriggerManagedByAnyDialog(trigger: HTMLElement): boolean {
  const value = trigger.getAttribute("data-dialog-trigger");

  if (value === null) {
    return false;
  }

  if (value === "") {
    return Boolean(trigger.closest("pe-dialog")?.querySelector("dialog"));
  }

  return Boolean(findEnhancedDialogHostById(value));
}

function warnForInvalidDialogTriggers(): void {
  const triggers = Array.from(
    document.querySelectorAll<HTMLElement>("[data-dialog-trigger]")
  );

  for (const trigger of triggers) {
    const triggerValue = trigger.getAttribute("data-dialog-trigger") ?? "";

    if (triggerValue === "" && !trigger.closest("pe-dialog")) {
      warn("Empty [data-dialog-trigger] outside <pe-dialog> is ignored.");
      continue;
    }

    if (triggerValue !== "" && !findEnhancedDialogHostById(triggerValue)) {
      warn(
        `[data-dialog-trigger="${triggerValue}"] does not match an enhanced dialog.`
      );
    }
  }
}

sharedTriggerDocumentObserver.setInvalidTriggerWarningScheduler(
  warnForInvalidDialogTriggers
);
sharedTriggerDocumentObserver.setRefreshRecordFilter(true);

function dispatchDialogEvent(
  host: HTMLElement,
  type: string,
  detail: DialogEventDetail
): void {
  dispatchCustomEvent(host, type, detail);
}

function markDialogOpen(dialog: HTMLDialogElement): void {
  const existingIndex = openDialogStack.indexOf(dialog);

  if (existingIndex !== -1) {
    openDialogStack.splice(existingIndex, 1);
  }

  openDialogStack.push(dialog);
}

function markDialogClosed(dialog: HTMLDialogElement): void {
  const existingIndex = openDialogStack.indexOf(dialog);

  if (existingIndex !== -1) {
    openDialogStack.splice(existingIndex, 1);
  }
}

function isTopmostOpenDialog(dialog: HTMLDialogElement): boolean {
  return openDialogStack.at(-1) === dialog;
}

function getDialogSurface(host: HTMLElement): HTMLDialogElement | null {
  return host.querySelector("dialog");
}

function isStructurallyNested(host: HTMLElement): boolean {
  const ancestorDialog = host.closest("dialog");

  if (!ancestorDialog) {
    return false;
  }

  const ancestorHost = ancestorDialog.closest("pe-dialog");

  return ancestorHost !== null && ancestorHost !== host;
}

function getNestedDepth(host: HTMLElement): number {
  let depth = 0;
  let element: Element | null = host.parentElement;

  while (element) {
    if (element instanceof HTMLDialogElement && element.open) {
      const ownerHost = element.closest("pe-dialog");

      if (ownerHost && ownerHost !== host && ownerHost.contains(host)) {
        depth += 1;
      }
    }

    element = element.parentElement;
  }

  return depth;
}

function hasOpenNestedDialog(dialog: HTMLDialogElement): boolean {
  const nestedHosts = Array.from(dialog.querySelectorAll("pe-dialog"));

  return nestedHosts.some((nestedHost) => getDialogSurface(nestedHost)?.open === true);
}

function syncNestedDialogState(
  host: HTMLElement,
  dialog: HTMLDialogElement | null
): void {
  if (!dialog) {
    return;
  }

  if (isStructurallyNested(host)) {
    dialog.setAttribute("data-nested", "");
  } else {
    dialog.removeAttribute("data-nested");
  }

  const depth = dialog.open ? getNestedDepth(host) : 0;
  dialog.style.setProperty("--nested-dialogs", String(depth));

  if (dialog.open && hasOpenNestedDialog(dialog)) {
    dialog.setAttribute("data-nested-dialog-open", "");
  } else {
    dialog.removeAttribute("data-nested-dialog-open");
  }
}

function syncAllNestedDialogStates(): void {
  for (const host of document.querySelectorAll("pe-dialog")) {
    syncNestedDialogState(host, getDialogSurface(host));
  }
}

function isOwnedByHost(element: HTMLElement, host: HTMLElement): boolean {
  return element.closest("pe-dialog") === host;
}

export class DialogElement extends HTMLElement {
  #dialog: HTMLDialogElement | null = null;
  #triggers = new Set<HTMLElement>();
  #closeControls = new Set<HTMLElement>();
  #triggerAttributeSnapshots = new Map<HTMLElement, TriggerAttributeSnapshot>();
  #lastTrigger: HTMLElement | null = null;
  #listenerCleanup: Array<() => void> = [];
  #observerCleanup: Array<() => void> = [];
  #refreshQueued = false;
  #closedDialogSyncQueued = false;
  #closedDialogSyncTimer = 0;
  #pendingCloseReason: DialogEventReason | null = null;

  connectedCallback(): void {
    if (isDocumentLoading()) {
      this.#queueRefresh();
    } else {
      this.#refresh();
    }

    this.#observe();
    sharedTriggerDocumentObserver.register(this, () => this.#queueRefresh());
  }

  disconnectedCallback(): void {
    sharedTriggerDocumentObserver.unregister(this);
    this.#cancelClosedDialogSync();
    this.#cleanupListeners();
    this.#cleanupObservers();
    this.#restoreManagedTriggers();
    if (this.#dialog) {
      markDialogClosed(this.#dialog);
    }
    this.#dialog = null;
    this.#triggers.clear();
    this.#closeControls.clear();
    this.#lastTrigger = null;
    syncAllNestedDialogStates();
  }

  get isOpen(): boolean {
    return this.#dialog?.open ?? false;
  }

  open(trigger?: HTMLElement): void {
    if (!this.#dialog || this.#dialog.open) {
      return;
    }

    this.#lastTrigger = trigger ?? null;

    const reason: DialogEventReason = trigger ? "trigger" : "programmatic";

    this.#dialog.showModal();
    markDialogOpen(this.#dialog);
    this.#sync();

    dispatchDialogEvent(this, "pe-dialog:open", {
      dialog: this.#dialog,
      trigger,
      reason
    });
  }

  close(returnValue?: string): void {
    this.#closeWithReason(returnValue, "programmatic");
  }

  #closeWithReason(
    returnValue: string | undefined,
    reason: DialogEventReason
  ): void {
    if (!this.#dialog || !this.#dialog.open) {
      return;
    }

    this.#pendingCloseReason = reason;

    if (returnValue === undefined) {
      this.#dialog.close();
    } else {
      this.#dialog.close(returnValue);
    }
  }

  toggle(trigger?: HTMLElement): void {
    if (this.#dialog?.open) {
      this.close();
      return;
    }

    this.open(trigger);
  }

  #refresh(): void {
    this.#refreshQueued = false;
    this.#cleanupListeners();
    this.#resolveDialog();
    this.#resolveTriggers();
    this.#restoreStaleTriggers();
    this.#resolveCloseControls();
    this.#bindListeners();
    this.#sync();
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

  #resolveDialog(): void {
    const dialogs = Array.from(this.querySelectorAll<HTMLDialogElement>("dialog"));

    if (dialogs.length === 0) {
      this.#dialog = null;
      this.dataset.state = "closed";

      if (!isDocumentLoading()) {
        warn("Missing <dialog> inside <pe-dialog>.");
      }

      return;
    }

    if (dialogs.length > 1) {
      warn("Multiple <dialog> targets found inside <pe-dialog>; using the first one.");
    }

    this.#dialog = dialogs[0] ?? null;

    if (this.#dialog && !this.#dialog.id) {
      generatedDialogId += 1;
      this.#dialog.id = `pe-dialog-surface-${generatedDialogId}`;
    }

    if (
      this.#dialog?.hasAttribute("aria-label") &&
      generatedLabelledBy.get(this.#dialog) ===
        this.#dialog.getAttribute("aria-labelledby")
    ) {
      this.#dialog.removeAttribute("aria-labelledby");
      generatedLabelledBy.delete(this.#dialog);
    }

    if (
      this.#dialog &&
      !this.#dialog.hasAttribute("aria-label") &&
      !this.#dialog.hasAttribute("aria-labelledby")
    ) {
      this.#resolveDialogTitle(this.#dialog);
    }

    if (this.#dialog) {
      this.#resolveDialogDescription(this.#dialog);
    }
  }

  #resolveDialogTitle(dialog: HTMLDialogElement): void {
    const titles = Array.from(
      dialog.querySelectorAll<HTMLElement>("[data-dialog-title]")
    ).filter((title) => isOwnedByHost(title, this));

    const title = titles[0];

    if (!title) {
      warn(`Dialog "${dialog.id}" has no accessible name.`);
      return;
    }

    if (titles.length > 1) {
      warn(
        `Dialog "${dialog.id}" has multiple [data-dialog-title] elements; using the first one.`
      );
    }

    if (!title.id) {
      generatedDialogTitleId += 1;
      title.id = `${dialog.id}-title-${generatedDialogTitleId}`;
    }

    setAttributeIfNeeded(dialog, "aria-labelledby", title.id);
    generatedLabelledBy.set(dialog, title.id);
  }

  #resolveDialogDescription(dialog: HTMLDialogElement): void {
    const generatedId = generatedDescribedBy.get(dialog);
    const currentDescribedBy = dialog.getAttribute("aria-describedby");

    if (generatedId && currentDescribedBy && currentDescribedBy !== generatedId) {
      generatedDescribedBy.delete(dialog);
      return;
    }

    const descriptions = Array.from(
      dialog.querySelectorAll<HTMLElement>("[data-dialog-description]")
    ).filter((description) => isOwnedByHost(description, this));
    const description = descriptions[0];

    if (!description) {
      if (generatedId && currentDescribedBy === generatedId) {
        dialog.removeAttribute("aria-describedby");
        generatedDescribedBy.delete(dialog);
      }

      return;
    }

    if (descriptions.length > 1) {
      warn(
        `Dialog "${dialog.id}" has multiple [data-dialog-description] elements; using the first one.`
      );
    }

    if (currentDescribedBy && currentDescribedBy !== generatedId) {
      generatedDescribedBy.delete(dialog);
      return;
    }

    if (!description.id) {
      generatedDialogDescriptionId += 1;
      description.id = `${dialog.id}-description-${generatedDialogDescriptionId}`;
    }

    setAttributeIfNeeded(dialog, "aria-describedby", description.id);
    generatedDescribedBy.set(dialog, description.id);
  }

  #resolveTriggers(): void {
    this.#triggers.clear();

    if (!this.#dialog) {
      return;
    }

    const internalTriggers = Array.from(
      this.querySelectorAll<HTMLElement>("[data-dialog-trigger]")
    ).filter(
      (trigger) =>
        trigger.getAttribute("data-dialog-trigger") === "" &&
        isOwnedByHost(trigger, this)
    );

    for (const trigger of internalTriggers) {
      this.#triggers.add(trigger);
    }

    if (this.id) {
      const selector = `[data-dialog-trigger="${escapeAttributeValue(this.id)}"]`;
      const externalTriggers = Array.from(
        document.querySelectorAll<HTMLElement>(selector)
      );

      for (const trigger of externalTriggers) {
        this.#triggers.add(trigger);
      }
    }
  }

  #resolveCloseControls(): void {
    this.#closeControls.clear();

    if (!this.#dialog) {
      return;
    }

    const closeControls = Array.from(
      this.querySelectorAll<HTMLElement>("[data-dialog-close]")
    ).filter((control) => isOwnedByHost(control, this));

    for (const control of closeControls) {
      this.#closeControls.add(control);
    }
  }

  #bindListeners(): void {
    if (!this.#dialog) {
      return;
    }

    const onClose = (): void => {
      this.#queueClosedDialogSync();
    };

    const onCancel = (event: Event): void => {
      this.#pendingCloseReason ??= "cancel";

      queueMicrotask(() => {
        if (!this.#dialog) {
          return;
        }

        if (
          event.defaultPrevented &&
          this.#pendingCloseReason === "cancel" &&
          this.#dialog.open
        ) {
          this.#pendingCloseReason = null;
        }

        if (!event.defaultPrevented && !this.#dialog.open) {
          this.#queueClosedDialogSync();
        }

        this.#sync();

        dispatchDialogEvent(this, "pe-dialog:cancel", {
          dialog: this.#dialog,
          trigger: this.#lastTrigger ?? undefined,
          reason: "cancel",
          defaultPrevented: event.defaultPrevented
        });
      });
    };

    const onSubmit = (event: Event): void => {
      const form = event.target;

      if (
        form instanceof HTMLFormElement &&
        form.method.toLowerCase() === "dialog"
      ) {
        this.#pendingCloseReason = "form";
        this.#queueClosedDialogSync();
      }
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (!this.#dialog?.hasAttribute("data-dialog-dismiss")) {
        return;
      }

      if (!isTopmostOpenDialog(this.#dialog)) {
        return;
      }

      if (event.target !== this.#dialog || this.#isPointInsideDialog(event)) {
        return;
      }

      event.preventDefault();
      this.#closeWithReason("dismiss", "dismiss");
    };

    const dialog = this.#dialog;

    dialog.addEventListener("close", onClose);
    dialog.addEventListener("cancel", onCancel);
    dialog.addEventListener("submit", onSubmit);
    dialog.addEventListener("pointerdown", onPointerDown);
    this.#listenerCleanup.push(() => {
      dialog.removeEventListener("close", onClose);
      dialog.removeEventListener("cancel", onCancel);
      dialog.removeEventListener("submit", onSubmit);
      dialog.removeEventListener("pointerdown", onPointerDown);
    });

    for (const trigger of this.#triggers) {
      const onClick = (event: MouseEvent): void => {
        event.preventDefault();
        this.open(trigger);
      };

      trigger.addEventListener("click", onClick);
      this.#listenerCleanup.push(() => {
        trigger.removeEventListener("click", onClick);
      });
    }

    for (const control of this.#closeControls) {
      const onClick = (event: MouseEvent): void => {
        event.preventDefault();
        this.#closeWithReason(getElementValue(control), "close-control");
      };

      control.addEventListener("click", onClick);
      this.#listenerCleanup.push(() => {
        control.removeEventListener("click", onClick);
      });
    }
  }

  #observe(): void {
    this.#cleanupObservers();

    const hostObserver = new MutationObserver((records) => {
      if (records.some((record) => this.#shouldRefreshForMutation(record))) {
        this.#queueRefresh();
      }
    });
    hostObserver.observe(this, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "id",
        "data-dialog-dismiss",
        "data-dialog-title",
        "data-dialog-description",
        "data-dialog-trigger",
        "data-dialog-close",
        "aria-label",
        "aria-labelledby",
        "aria-describedby"
      ]
    });

    this.#observerCleanup.push(() => hostObserver.disconnect());
  }

  #shouldRefreshForMutation(record: MutationRecord): boolean {
    if (record.type === "childList") {
      return true;
    }

    if (record.type !== "attributes" || !(record.target instanceof HTMLElement)) {
      return false;
    }

    const target = record.target;
    const attributeName = record.attributeName;

    if (
      attributeName === "data-dialog-title" ||
      attributeName === "data-dialog-description" ||
      attributeName === "data-dialog-trigger" ||
      attributeName === "data-dialog-close"
    ) {
      return isOwnedByHost(target, this);
    }

    if (
      attributeName === "data-dialog-dismiss" ||
      attributeName === "aria-label" ||
      attributeName === "aria-labelledby" ||
      attributeName === "aria-describedby"
    ) {
      return target === this.#dialog;
    }

    if (attributeName === "id") {
      return (
        target === this ||
        target === this.#dialog ||
        (isOwnedByHost(target, this) &&
          (target.hasAttribute("data-dialog-title") ||
            target.hasAttribute("data-dialog-description")))
      );
    }

    return false;
  }

  #sync(): void {
    const state = getState(this.#dialog);

    this.dataset.state = state;

    if (this.#dialog) {
      this.#dialog.dataset.state = state;
    }

    for (const trigger of this.#triggers) {
      this.#snapshotTriggerAttributes(trigger);
      const isActive = state === "open" && trigger === this.#lastTrigger;
      trigger.dataset.state = isActive ? "open" : "closed";

      if (this.#dialog?.id) {
        setAttributeIfNeeded(trigger, "aria-controls", this.#dialog.id);
      }

      setAttributeIfNeeded(trigger, "aria-expanded", String(isActive));
      setAttributeIfNeeded(trigger, "aria-haspopup", "dialog");
    }

    syncAllNestedDialogStates();
  }

  #snapshotTriggerAttributes(trigger: HTMLElement): void {
    if (this.#triggerAttributeSnapshots.has(trigger)) {
      return;
    }

    this.#triggerAttributeSnapshots.set(trigger, {
      dataState: trigger.getAttribute("data-state"),
      ariaControls: trigger.getAttribute("aria-controls"),
      ariaExpanded: trigger.getAttribute("aria-expanded"),
      ariaHaspopup: trigger.getAttribute("aria-haspopup")
    });
  }

  #restoreTriggerAttributes(trigger: HTMLElement): void {
    const snapshot = this.#triggerAttributeSnapshots.get(trigger);

    if (!snapshot) {
      return;
    }

    restoreAttribute(trigger, "data-state", snapshot.dataState);
    restoreAttribute(trigger, "aria-controls", snapshot.ariaControls);
    restoreAttribute(trigger, "aria-expanded", snapshot.ariaExpanded);
    restoreAttribute(trigger, "aria-haspopup", snapshot.ariaHaspopup);
    this.#triggerAttributeSnapshots.delete(trigger);
  }

  #restoreStaleTriggers(): void {
    for (const trigger of Array.from(this.#triggerAttributeSnapshots.keys())) {
      if (this.#triggers.has(trigger)) {
        continue;
      }

      if (isTriggerManagedByAnyDialog(trigger)) {
        this.#triggerAttributeSnapshots.delete(trigger);
        continue;
      }

      this.#restoreTriggerAttributes(trigger);
    }
  }

  #restoreManagedTriggers(): void {
    for (const trigger of Array.from(this.#triggerAttributeSnapshots.keys())) {
      this.#restoreTriggerAttributes(trigger);
    }
  }

  #isPointInsideDialog(event: PointerEvent): boolean {
    if (!this.#dialog) {
      return false;
    }

    const rect = this.#dialog.getBoundingClientRect();

    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  #queueClosedDialogSync(): void {
    if (this.#closedDialogSyncQueued) {
      return;
    }

    const dialog = this.#dialog;
    const wasOpen =
      this.dataset.state === "open" || dialog?.dataset.state === "open";
    const trigger = this.#lastTrigger ?? undefined;
    const reason = this.#pendingCloseReason ?? "native";

    this.#closedDialogSyncQueued = true;

    this.#closedDialogSyncTimer = window.setTimeout(() => {
      this.#closedDialogSyncQueued = false;
      this.#closedDialogSyncTimer = 0;

      if (!dialog || dialog.open) {
        return;
      }

      markDialogClosed(dialog);
      this.#pendingCloseReason = null;
      this.#sync();

      if (!wasOpen) {
        return;
      }

      this.#restoreFocus();

      dispatchDialogEvent(this, "pe-dialog:close", {
        dialog,
        trigger,
        reason
      });
    }, 0);
  }

  #restoreFocus(): void {
    const trigger = this.#lastTrigger;

    if (!trigger?.isConnected) {
      this.#lastTrigger = null;
      return;
    }

    const activeElement = document.activeElement;
    const shouldRestore =
      activeElement === document.body ||
      activeElement === document.documentElement ||
      activeElement === null ||
      (activeElement instanceof Node &&
        this.#dialog?.contains(activeElement) === true);

    if (shouldRestore) {
      trigger.focus();
    }

    this.#lastTrigger = null;
  }

  #cancelClosedDialogSync(): void {
    if (this.#closedDialogSyncTimer !== 0) {
      window.clearTimeout(this.#closedDialogSyncTimer);
      this.#closedDialogSyncTimer = 0;
    }

    this.#closedDialogSyncQueued = false;
  }

  #cleanupListeners(): void {
    for (const cleanup of this.#listenerCleanup.splice(0)) {
      cleanup();
    }
  }

  #cleanupObservers(): void {
    for (const cleanup of this.#observerCleanup.splice(0)) {
      cleanup();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pe-dialog": DialogElement;
  }

  interface GlobalEventHandlersEventMap {
    "pe-dialog:open": CustomEvent<DialogEventDetail>;
    "pe-dialog:close": CustomEvent<DialogEventDetail>;
    "pe-dialog:cancel": CustomEvent<DialogEventDetail>;
  }
}

if (!customElements.get("pe-dialog")) {
  customElements.define("pe-dialog", DialogElement);
}
