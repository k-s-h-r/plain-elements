import {
  captureStyleProperty,
  escapeAttributeValue,
  restoreAttribute,
  restoreStyleProperty,
  setAttributeIfNeeded,
  type StylePropertySnapshot
} from "./internal/dom";
import { dispatchCustomEvent } from "./internal/events";
import {
  clampPlacement,
  getArrowPlacement,
  getAnchorDimensions,
  getAvailableSpace,
  getPlacement,
  getTransformOrigin,
  hasMainAxisCollision,
  oppositeSide,
  type Align,
  type Placement,
  type Side
} from "./internal/floating-position";
import {
  getFiniteAnimations,
  setTemporaryStyle,
  waitForAnimations
} from "./internal/motion";
import { isDocumentLoading } from "./internal/document-loading";
import { createTriggerDocumentObserver } from "./internal/trigger-document-observer";
import { createWarnOnce } from "./internal/warnings";

type PopoverState = "open" | "closed";
type PopoverSide = Side;
type PopoverAlign = Align;
type PopoverPlacement = Placement;

type TriggerAttributeSnapshot = {
  dataState: string | null;
  ariaControls: string | null;
  ariaExpanded: string | null;
  ariaHaspopup: string | null;
};

type ContentAttributeSnapshot = {
  id: string | null;
  dataState: string | null;
  dataSide: string | null;
  dataAlign: string | null;
  role: string | null;
  ariaLabelledBy: string | null;
  ariaDescribedBy: string | null;
  popover: string | null;
  tabIndex: string | null;
  hidden: string | null;
  style: string | null;
};

type ArrowAttributeSnapshot = {
  dataState: string | null;
  dataSide: string | null;
  dataAlign: string | null;
  dataUncentered: string | null;
  ariaHidden: string | null;
  style: string | null;
  left: StylePropertySnapshot;
  top: StylePropertySnapshot;
};

type InteractionType = "keyboard" | "mouse" | "touch" | "pen" | "programmatic";

export type PopoverEventReason =
  | "trigger"
  | "close-control"
  | "dismiss"
  | "escape"
  | "programmatic"
  | "native";

export type PopoverEventDetail = {
  content: HTMLElement;
  trigger?: HTMLElement;
  reason: PopoverEventReason;
};

let generatedPopoverContentId = 0;
let generatedPopoverTitleId = 0;
let generatedPopoverDescriptionId = 0;
const openPopoverStack: PopoverElement[] = [];
const handledDismissEvents = new WeakSet<Event>();
const warn = createWarnOnce("[pe-popover]");
const sharedTriggerDocumentObserver = createTriggerDocumentObserver(
  "data-popover-trigger"
);

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function hasFiniteExitTransition(content: HTMLElement): boolean {
  const { transitionDuration } = getComputedStyle(content);

  return transitionDuration
    .split(",")
    .some((value) => Number.parseFloat(value) > 0);
}

function isOwnedByHost(element: HTMLElement, host: HTMLElement): boolean {
  return element.closest("pe-popover") === host;
}

function findEnhancedPopoverHostById(id: string): PopoverElement | null {
  const element = document.getElementById(id);

  if (element instanceof PopoverElement) {
    return element;
  }

  return null;
}

function isTriggerManagedByAnyPopover(trigger: HTMLElement): boolean {
  const value = trigger.getAttribute("data-popover-trigger");

  if (value === null) {
    return false;
  }

  if (value === "") {
    return trigger.closest("pe-popover") instanceof PopoverElement;
  }

  return Boolean(findEnhancedPopoverHostById(value));
}

function warnForInvalidPopoverTriggers(): void {
  for (const trigger of document.querySelectorAll<HTMLElement>(
    "[data-popover-trigger]"
  )) {
    const triggerValue = trigger.getAttribute("data-popover-trigger") ?? "";

    if (triggerValue === "" && !trigger.closest("pe-popover")) {
      warn("Empty [data-popover-trigger] outside <pe-popover> is ignored.");
      continue;
    }

    if (triggerValue !== "" && !findEnhancedPopoverHostById(triggerValue)) {
      warn(
        `[data-popover-trigger="${triggerValue}"] does not match an enhanced popover.`
      );
    }
  }
}

sharedTriggerDocumentObserver.setInvalidTriggerWarningScheduler(
  warnForInvalidPopoverTriggers
);
sharedTriggerDocumentObserver.setRefreshRecordFilter(true);

function readSide(host: HTMLElement, content: HTMLElement): PopoverSide {
  const value =
    content.getAttribute("data-popover-side") ??
    host.getAttribute("data-popover-side") ??
    "bottom";

  if (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  ) {
    return value;
  }

  warn(`Invalid data-popover-side="${value}"; using "bottom".`);
  return "bottom";
}

function readAlign(host: HTMLElement, content: HTMLElement): PopoverAlign {
  const value =
    content.getAttribute("data-popover-align") ??
    host.getAttribute("data-popover-align") ??
    "center";

  if (value === "start" || value === "center" || value === "end") {
    return value;
  }

  warn(`Invalid data-popover-align="${value}"; using "center".`);
  return "center";
}

function readNumberAttribute(
  host: HTMLElement,
  content: HTMLElement,
  name: string,
  fallback: number
): number {
  const value = content.getAttribute(name) ?? host.getAttribute(name);

  if (value === null || value.trim() === "") {
    return fallback;
  }

  const number = Number(value);

  if (Number.isFinite(number)) {
    return number;
  }

  warn(`Invalid ${name}="${value}"; using ${fallback}.`);
  return fallback;
}

function readArrowPadding(host: HTMLElement, content: HTMLElement): number {
  const name = "data-popover-arrow-padding";
  const value = content.getAttribute(name) ?? host.getAttribute(name);

  if (value === null || value.trim() === "") {
    return 5;
  }

  const padding = Number(value);

  if (Number.isFinite(padding) && padding >= 0) {
    return padding;
  }

  warn(`Invalid ${name}="${value}"; using 5.`);
  return 5;
}

const POSITIONING_CSS_PROPERTIES = [
  "--anchor-width",
  "--anchor-height",
  "--available-width",
  "--available-height",
  "--positioner-width",
  "--positioner-height",
  "--transform-origin"
] as const;

function measurePositionerSize(
  contentRect: DOMRect,
  lastWidth: number,
  lastHeight: number
): { width: number; height: number; lastWidth: number; lastHeight: number } {
  let width = contentRect.width;
  let height = contentRect.height;

  if (width === 0 && lastWidth > 0) {
    width = lastWidth;
  }

  if (height === 0 && lastHeight > 0) {
    height = lastHeight;
  }

  if (width > 0) {
    lastWidth = width;
  }

  if (height > 0) {
    lastHeight = height;
  }

  return { width, height, lastWidth, lastHeight };
}

function syncPositioningCssVariables(
  content: HTMLElement,
  triggerRect: DOMRect,
  contentRect: DOMRect,
  placement: PopoverPlacement,
  sideOffset: number,
  collisionPadding: number,
  lastDimensions: { width: number; height: number },
  arrowCenter?: number
): { width: number; height: number } {
  const anchor = getAnchorDimensions(triggerRect);
  const available = getAvailableSpace(triggerRect, placement.side, collisionPadding);
  const positioner = measurePositionerSize(
    contentRect,
    lastDimensions.width,
    lastDimensions.height
  );
  const style = content.style;

  style.setProperty("--anchor-width", `${anchor.width}px`);
  style.setProperty("--anchor-height", `${anchor.height}px`);
  style.setProperty("--available-width", `${available.width}px`);
  style.setProperty("--available-height", `${available.height}px`);
  style.setProperty("--positioner-width", `${positioner.width}px`);
  style.setProperty("--positioner-height", `${positioner.height}px`);
  style.setProperty(
    "--transform-origin",
    getTransformOrigin(triggerRect, placement, sideOffset, arrowCenter)
  );

  return {
    width: positioner.lastWidth,
    height: positioner.lastHeight
  };
}

function clearPositioningCssVariables(content: HTMLElement): void {
  for (const property of POSITIONING_CSS_PROPERTIES) {
    content.style.removeProperty(property);
  }
}

function dispatchPopoverEvent(
  host: HTMLElement,
  type: string,
  detail: PopoverEventDetail
): void {
  dispatchCustomEvent(host, type, detail);
}

function markPopoverOpen(popover: PopoverElement): void {
  const index = openPopoverStack.indexOf(popover);

  if (index !== -1) {
    openPopoverStack.splice(index, 1);
  }

  openPopoverStack.push(popover);
}

function ensurePopoverMarkedOpen(popover: PopoverElement): void {
  if (!openPopoverStack.includes(popover)) {
    openPopoverStack.push(popover);
  }
}

function markPopoverClosed(popover: PopoverElement): void {
  const index = openPopoverStack.indexOf(popover);

  if (index !== -1) {
    openPopoverStack.splice(index, 1);
  }
}

function isTopmostOpenPopover(popover: PopoverElement): boolean {
  return openPopoverStack.at(-1) === popover;
}

function isPopoverOpen(content: HTMLElement): boolean {
  try {
    return content.matches(":popover-open");
  } catch {
    return false;
  }
}

function isVisible(element: HTMLElement): boolean {
  return (
    !element.hidden &&
    element.getAttribute("aria-hidden") !== "true" &&
    getComputedStyle(element).visibility !== "hidden" &&
    element.getClientRects().length > 0
  );
}

export class PopoverElement extends HTMLElement {
  #content: HTMLElement | null = null;
  #arrow: HTMLElement | null = null;
  #triggers = new Set<HTMLElement>();
  #closeControls = new Set<HTMLElement>();
  #triggerAttributeSnapshots = new Map<HTMLElement, TriggerAttributeSnapshot>();
  #contentAttributeSnapshots = new Map<HTMLElement, ContentAttributeSnapshot>();
  #arrowAttributeSnapshots = new Map<HTMLElement, ArrowAttributeSnapshot>();
  #partIdSnapshots = new Map<HTMLElement, string | null>();
  #activeTrigger: HTMLElement | null = null;
  #generatedLabelledBy: string | null = null;
  #generatedDescribedBy: string | null = null;
  #interactionType: InteractionType = "programmatic";
  #listenerCleanup: Array<() => void> = [];
  #observerCleanup: Array<() => void> = [];
  #resizeObserver: ResizeObserver | null = null;
  #observedContent: HTMLElement | null = null;
  #observedTrigger: HTMLElement | null = null;
  #observedArrow: HTMLElement | null = null;
  #positionFrame = 0;
  #positionAfterAnimationVersion = -1;
  #animationVersion = 0;
  #closePending = false;
  #pendingCloseReason: PopoverEventReason | null = null;
  #pendingOpenFrame = 0;
  #restorePendingMotionStyle: (() => void) | null = null;
  #suppressToggleClose = false;
  #lastPositionerWidth = 0;
  #lastPositionerHeight = 0;
  #refreshQueued = false;

  connectedCallback(): void {
    if (isDocumentLoading()) {
      this.#queueRefresh();
    } else {
      this.#refresh();
    }

    this.#observe();
    sharedTriggerDocumentObserver.register(this, () => this.#queueRefresh());

    if (document.readyState === "loading") {
      const onDocumentReady = (): void => this.#queueRefresh();
      document.addEventListener("DOMContentLoaded", onDocumentReady, { once: true });
      this.#observerCleanup.push(() => {
        document.removeEventListener("DOMContentLoaded", onDocumentReady);
      });
    }
  }

  disconnectedCallback(): void {
    sharedTriggerDocumentObserver.unregister(this);
    this.#cleanupListeners();
    this.#cleanupObservers();
    markPopoverClosed(this);

    if (this.#content && isPopoverOpen(this.#content)) {
      this.#content.hidePopover();
    }

    this.#restoreManagedTriggers();
    this.#restoreManagedContents();
    this.#restoreManagedArrows();
    this.#restoreManagedPartIds();
    this.#content = null;
    this.#arrow = null;
    this.#triggers.clear();
    this.#closeControls.clear();
    this.#activeTrigger = null;
    this.#generatedLabelledBy = null;
    this.#generatedDescribedBy = null;
    this.#stopPositioningObserver();
    this.#cancelPendingOpenAnimation();
    if (this.#positionFrame) {
      cancelAnimationFrame(this.#positionFrame);
      this.#positionFrame = 0;
    }
    this.#animationVersion += 1;
    this.#closePending = false;
  }

  get isOpen(): boolean {
    return this.#content !== null && isPopoverOpen(this.#content);
  }

  open(trigger?: HTMLElement): void {
    if (!this.#content) {
      return;
    }

    const nextTrigger = trigger ?? this.#activeTrigger ?? this.#firstTrigger();

    if (!nextTrigger) {
      return;
    }

    if (!trigger) {
      this.#interactionType = "programmatic";
    }

    this.#activeTrigger = nextTrigger;

    if (isPopoverOpen(this.#content)) {
      this.#syncState("open");
      this.#position();
      return;
    }

    try {
      this.#content.showPopover();
    } catch {
      warn("Unable to open [data-popover-content] with the native Popover API.");
      return;
    }

    if (!isPopoverOpen(this.#content)) {
      return;
    }

    this.#transitionOpen(trigger ? "trigger" : "programmatic");
  }

  close(): void {
    this.#closeWithReason("programmatic");
  }

  toggle(trigger?: HTMLElement): void {
    if (this.#content && isPopoverOpen(this.#content)) {
      if (
        trigger &&
        this.#activeTrigger &&
        trigger !== this.#activeTrigger
      ) {
        this.#activeTrigger = trigger;
        this.#syncState("open");
        this.#position();
        return;
      }

      this.#closeWithReason("trigger");
      return;
    }

    this.open(trigger);
  }

  #closeWithReason(reason: PopoverEventReason): void {
    if (!this.#content || !isPopoverOpen(this.#content) || this.#closePending) {
      return;
    }

    this.#pendingCloseReason = reason;
    this.#animateClose();
  }

  #animateClose(): void {
    if (!this.#content || !isPopoverOpen(this.#content)) {
      return;
    }

    const content = this.#content;
    const version = ++this.#animationVersion;
    this.#closePending = true;
    this.#cancelPendingOpenAnimation();
    content.removeAttribute("data-starting-style");

    window.requestAnimationFrame(() => {
      if (!isPopoverOpen(content) || this.#animationVersion !== version) {
        this.#closePending = false;
        return;
      }

      content.setAttribute("data-ending-style", "");
      void content.offsetHeight;

      if (!hasFiniteExitTransition(content)) {
        this.#finishAnimatedClose(version);
        return;
      }

      waitForAnimations(
        content,
        () => this.#finishAnimatedClose(version),
        () => this.#animationVersion !== version
      );
    });
  }

  #finishAnimatedClose(version: number): void {
    if (!this.#content || this.#animationVersion !== version) {
      return;
    }

    const content = this.#content;
    const reason = this.#pendingCloseReason ?? "programmatic";
    this.#closePending = false;
    this.#pendingCloseReason = null;
    content.removeAttribute("data-ending-style");

    if (!isPopoverOpen(content)) {
      return;
    }

    this.#suppressToggleClose = true;

    try {
      content.hidePopover();
    } finally {
      this.#suppressToggleClose = false;
    }

    this.#transitionClosed(reason);
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

  #beginOpenAnimation(): void {
    if (!this.#content) {
      return;
    }

    const content = this.#content;
    const version = ++this.#animationVersion;
    const wasClosing =
      content.hasAttribute("data-ending-style") || this.#closePending;
    this.#closePending = false;
    this.#cancelPendingOpenAnimation();
    content.removeAttribute("data-ending-style");
    content.removeAttribute("data-starting-style");

    if (wasClosing) {
      void content.offsetHeight;
      return;
    }

    content.setAttribute("data-starting-style", "");
    this.#restorePendingMotionStyle = setTemporaryStyle(
      content,
      "transition-duration",
      "0s"
    );
    void content.offsetHeight;
    this.#pendingOpenFrame = window.requestAnimationFrame(() => {
      this.#pendingOpenFrame = 0;

      if (!isPopoverOpen(content) || this.#animationVersion !== version) {
        return;
      }

      this.#clearPendingMotionStyle();
      content.removeAttribute("data-starting-style");
    });
  }

  #refresh(): void {
    this.#refreshQueued = false;
    this.#cleanupListeners();
    this.#resolveContent();
    this.#resolveArrow();
    this.#resolveTriggers();
    this.#resolveCloseControls();
    this.#restoreStaleTriggers();
    this.#restoreStaleContents();
    this.#restoreStaleArrows();
    this.#syncSemantics();
    this.#restoreStalePartIds();
    this.#bindListeners();

    const state: PopoverState = this.#content && isPopoverOpen(this.#content)
      ? "open"
      : "closed";
    this.#syncState(state);

    if (state === "open") {
      ensurePopoverMarkedOpen(this);
      this.#position();
    } else {
      markPopoverClosed(this);
    }
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

  #resolveContent(): void {
    const previousContent = this.#content;
    const contents = Array.from(
      this.querySelectorAll<HTMLElement>("[data-popover-content]")
    ).filter((content) => isOwnedByHost(content, this));

    if (contents.length === 0) {
      this.#content = null;
      this.dataset.state = "closed";

      if (!isDocumentLoading()) {
        warn("Missing [data-popover-content] inside <pe-popover>.");
      }

      return;
    }

    if (contents.length > 1) {
      warn(
        "Multiple [data-popover-content] targets found inside <pe-popover>; using the first one."
      );
    }

    this.#content = contents[0] ?? null;

    if (previousContent && previousContent !== this.#content) {
      if (isPopoverOpen(previousContent)) {
        previousContent.hidePopover();
      }

      this.#activeTrigger = null;
      this.#generatedLabelledBy = null;
      this.#generatedDescribedBy = null;
    }

    if (!this.#content) {
      return;
    }

    this.#snapshotContentAttributes(this.#content);

    if (!this.#content.id) {
      generatedPopoverContentId += 1;
      this.#content.id = `pe-popover-content-${generatedPopoverContentId}`;
    }

    setAttributeIfNeeded(this.#content, "popover", "manual");
    setAttributeIfNeeded(this.#content, "role", "dialog");
    setAttributeIfNeeded(this.#content, "tabindex", "-1");
    this.#content.removeAttribute("hidden");
  }

  #resolveArrow(): void {
    this.#arrow = null;

    if (!this.#content) {
      return;
    }

    const arrows = Array.from(this.#content.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element.hasAttribute("data-popover-arrow")
    );
    const nestedArrows = Array.from(
      this.#content.querySelectorAll<HTMLElement>("[data-popover-arrow]")
    ).filter(
      (arrow) =>
        isOwnedByHost(arrow, this) && arrow.parentElement !== this.#content
    );

    if (arrows.length > 1) {
      warn(
        "Multiple direct [data-popover-arrow] elements found; using the first one."
      );
    }

    if (nestedArrows.length > 0) {
      warn(
        "[data-popover-arrow] must be a direct child of [data-popover-content]; nested arrows are ignored."
      );
    }

    this.#arrow = arrows[0] ?? null;

    if (!this.#arrow) {
      return;
    }

    this.#snapshotArrowAttributes(this.#arrow);
    setAttributeIfNeeded(this.#arrow, "aria-hidden", "true");
    this.#arrow.style.position = "absolute";
  }

  #resolveTriggers(): void {
    this.#triggers.clear();

    if (!this.#content) {
      return;
    }

    const internalTriggers = Array.from(
      this.querySelectorAll<HTMLElement>("[data-popover-trigger]")
    ).filter(
      (trigger) =>
        isOwnedByHost(trigger, this) &&
        trigger.getAttribute("data-popover-trigger") === ""
    );

    for (const trigger of internalTriggers) {
      this.#triggers.add(trigger);
    }

    if (this.id && findEnhancedPopoverHostById(this.id) === this) {
      const selector = `[data-popover-trigger="${escapeAttributeValue(this.id)}"]`;

      for (const trigger of document.querySelectorAll<HTMLElement>(selector)) {
        this.#triggers.add(trigger);
      }
    }

    if (this.#activeTrigger && !this.#triggers.has(this.#activeTrigger)) {
      this.#activeTrigger = null;
    }
  }

  #resolveCloseControls(): void {
    this.#closeControls.clear();

    if (!this.#content) {
      return;
    }

    for (const control of this.#content.querySelectorAll<HTMLElement>(
      "[data-popover-close]"
    )) {
      if (isOwnedByHost(control, this)) {
        this.#closeControls.add(control);
      }
    }
  }

  #syncSemantics(): void {
    const content = this.#content;

    if (!content) {
      return;
    }

    const titles = Array.from(
      content.querySelectorAll<HTMLElement>("[data-popover-title]")
    ).filter((element) => isOwnedByHost(element, this));
    const descriptions = Array.from(
      content.querySelectorAll<HTMLElement>("[data-popover-description]")
    ).filter((element) => isOwnedByHost(element, this));
    const title = titles[0];
    const description = descriptions[0];

    if (
      titles.length === 0 &&
      !content.hasAttribute("aria-label") &&
      !content.hasAttribute("aria-labelledby")
    ) {
      warn(`Popover "${content.id}" has no accessible name.`);
    }

    if (titles.length > 1) {
      warn(
        `Popover "${content.id}" has multiple [data-popover-title] elements; using the first one.`
      );
    }

    if (descriptions.length > 1) {
      warn(
        `Popover "${content.id}" has multiple [data-popover-description] elements; using the first one.`
      );
    }

    if (title && !title.id) {
      this.#snapshotPartId(title);
      generatedPopoverTitleId += 1;
      title.id = `${content.id}-title-${generatedPopoverTitleId}`;
    }

    const currentLabelledBy = content.getAttribute("aria-labelledby");

    if (
      this.#generatedLabelledBy &&
      currentLabelledBy === this.#generatedLabelledBy &&
      (!title || content.hasAttribute("aria-label"))
    ) {
      content.removeAttribute("aria-labelledby");
      this.#generatedLabelledBy = null;
    }

    if (
      title?.id &&
      !content.hasAttribute("aria-label") &&
      (!content.hasAttribute("aria-labelledby") ||
        content.getAttribute("aria-labelledby") === this.#generatedLabelledBy)
    ) {
      setAttributeIfNeeded(content, "aria-labelledby", title.id);
      this.#generatedLabelledBy = title.id;
    }

    if (description && !description.id) {
      this.#snapshotPartId(description);
      generatedPopoverDescriptionId += 1;
      description.id = `${content.id}-description-${generatedPopoverDescriptionId}`;
    }

    const currentDescribedBy = content.getAttribute("aria-describedby");

    if (
      this.#generatedDescribedBy &&
      currentDescribedBy === this.#generatedDescribedBy &&
      !description
    ) {
      content.removeAttribute("aria-describedby");
      this.#generatedDescribedBy = null;
    }

    if (
      description?.id &&
      (!content.hasAttribute("aria-describedby") ||
        content.getAttribute("aria-describedby") === this.#generatedDescribedBy)
    ) {
      setAttributeIfNeeded(content, "aria-describedby", description.id);
      this.#generatedDescribedBy = description.id;
    }
  }

  #bindListeners(): void {
    const content = this.#content;

    if (!content) {
      return;
    }

    const onToggle = (event: Event): void => {
      const newState = (event as Event & { newState?: string }).newState;

      if (newState === "open") {
        this.#transitionOpen("native");
        return;
      }

      if (newState !== "closed" || this.#suppressToggleClose || this.#closePending) {
        return;
      }

      if (this.dataset.state === "closed") {
        return;
      }

      this.#transitionClosed("native");
    };

    const onDocumentPointerDown = (event: PointerEvent): void => {
      if (
        !isPopoverOpen(content) ||
        !isTopmostOpenPopover(this) ||
        handledDismissEvents.has(event) ||
        event.button !== 0
      ) {
        return;
      }

      const target = event.target;

      if (!(target instanceof Node) || content.contains(target)) {
        return;
      }

      if (
        target instanceof HTMLElement &&
        Array.from(this.#triggers).some((trigger) => trigger.contains(target))
      ) {
        return;
      }

      handledDismissEvents.add(event);
      this.#closeWithReason("dismiss");
    };

    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (
        event.key === "Escape" &&
        isPopoverOpen(content) &&
        isTopmostOpenPopover(this) &&
        !handledDismissEvents.has(event)
      ) {
        handledDismissEvents.add(event);
        event.preventDefault();
        this.#closeWithReason("escape");
      }
    };

    const onWindowChange = (): void => {
      if (isPopoverOpen(content)) {
        this.#schedulePosition();
      }
    };

    content.addEventListener("toggle", onToggle);
    document.addEventListener("pointerdown", onDocumentPointerDown);
    document.addEventListener("keydown", onDocumentKeyDown);
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    this.#listenerCleanup.push(() => {
      content.removeEventListener("toggle", onToggle);
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      document.removeEventListener("keydown", onDocumentKeyDown);
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    });

    for (const trigger of this.#triggers) {
      const onPointerDown = (event: PointerEvent): void => {
        if (
          event.pointerType === "mouse" ||
          event.pointerType === "touch" ||
          event.pointerType === "pen"
        ) {
          this.#interactionType = event.pointerType;
        }
      };

      const onClick = (event: MouseEvent): void => {
        event.preventDefault();

        if (event.detail === 0) {
          this.#interactionType = "keyboard";
        }

        this.toggle(trigger);
      };

      trigger.addEventListener("pointerdown", onPointerDown);
      trigger.addEventListener("click", onClick);
      this.#listenerCleanup.push(() => {
        trigger.removeEventListener("pointerdown", onPointerDown);
        trigger.removeEventListener("click", onClick);
      });
    }

    for (const control of this.#closeControls) {
      const onClick = (event: MouseEvent): void => {
        event.preventDefault();
        this.#closeWithReason("close-control");
      };

      control.addEventListener("click", onClick);
      this.#listenerCleanup.push(() => {
        control.removeEventListener("click", onClick);
      });
    }
  }

  #observe(): void {
    this.#cleanupObservers();

    const hostObserver = new MutationObserver(() => this.#queueRefresh());
    hostObserver.observe(this, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "id",
        "data-popover-content",
        "data-popover-trigger",
        "data-popover-close",
        "data-popover-title",
        "data-popover-description",
        "data-popover-arrow",
        "data-popover-side",
        "data-popover-align",
        "data-popover-offset",
        "data-popover-align-offset",
        "data-popover-collision-padding",
        "data-popover-arrow-padding",
        "aria-label",
        "aria-labelledby",
        "aria-describedby"
      ]
    });

    this.#observerCleanup.push(() => hostObserver.disconnect());
  }

  #transitionOpen(reason: PopoverEventReason): void {
    if (!this.#content) {
      return;
    }

    const wasOpen = this.dataset.state === "open";
    this.#syncState("open");
    this.#position();

    if (wasOpen) {
      return;
    }

    this.#beginOpenAnimation();
    markPopoverOpen(this);
    this.#queueInitialFocus();
    dispatchPopoverEvent(this, "pe-popover:open", {
      content: this.#content,
      trigger: this.#activeTrigger ?? undefined,
      reason
    });
  }

  #transitionClosed(reason: PopoverEventReason): void {
    if (!this.#content) {
      return;
    }

    const wasOpen = this.dataset.state === "open";
    const shouldRestoreFocus =
      reason !== "dismiss" &&
      document.activeElement instanceof Node &&
      this.#content.contains(document.activeElement);

    this.#syncState("closed");
    markPopoverClosed(this);
    this.#clearPositioningState();

    if (!wasOpen) {
      return;
    }

    if (shouldRestoreFocus && this.#activeTrigger?.isConnected) {
      this.#activeTrigger.focus();
    }

    dispatchPopoverEvent(this, "pe-popover:close", {
      content: this.#content,
      trigger: this.#activeTrigger ?? undefined,
      reason
    });
  }

  #syncState(state: PopoverState): void {
    this.dataset.state = state;

    if (this.#content) {
      this.#content.dataset.state = state;
    }

    if (this.#arrow) {
      this.#snapshotArrowAttributes(this.#arrow);
      this.#arrow.dataset.state = state;
      setAttributeIfNeeded(this.#arrow, "aria-hidden", "true");
    }

    for (const trigger of this.#triggers) {
      this.#snapshotTriggerAttributes(trigger);
      const isActive = state === "open" && trigger === this.#activeTrigger;
      trigger.dataset.state = isActive ? "open" : "closed";
      setAttributeIfNeeded(trigger, "aria-expanded", String(isActive));
      setAttributeIfNeeded(trigger, "aria-haspopup", "dialog");

      if (this.#content?.id) {
        setAttributeIfNeeded(trigger, "aria-controls", this.#content.id);
      }
    }
  }

  #queueInitialFocus(): void {
    const content = this.#content;

    queueMicrotask(() => {
      if (!content || !isPopoverOpen(content)) {
        return;
      }

      if (this.#interactionType === "touch") {
        content.focus({ preventScroll: true });
        return;
      }

      const explicitTarget = content.matches("[data-popover-initial-focus]")
        ? content
        : content.querySelector<HTMLElement>("[data-popover-initial-focus]");
      const autofocusTarget = content.querySelector<HTMLElement>("[autofocus]");
      const firstFocusable = Array.from(
        content.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).find(isVisible);
      const target = explicitTarget ?? autofocusTarget ?? firstFocusable ?? content;

      target.focus({ preventScroll: true });
    });
  }

  #position(): void {
    if (!this.#content || !this.#activeTrigger) {
      return;
    }

    const content = this.#content;

    if (
      content.hasAttribute("data-starting-style") ||
      content.hasAttribute("data-ending-style")
    ) {
      this.#schedulePosition();
      return;
    }

    if (this.#deferPositionForAnimations(content)) {
      return;
    }

    const triggerRect = this.#activeTrigger.getBoundingClientRect();
    const side = readSide(this, content);
    const align = readAlign(this, content);
    const sideOffset = readNumberAttribute(
      this,
      content,
      "data-popover-offset",
      0
    );
    const alignOffset = readNumberAttribute(
      this,
      content,
      "data-popover-align-offset",
      0
    );
    const collisionPadding = readNumberAttribute(
      this,
      content,
      "data-popover-collision-padding",
      5
    );
    const arrowPadding = readArrowPadding(this, content);

    content.style.position = "fixed";
    content.style.inset = "auto";
    content.style.margin = "0";
    content.style.left = "0px";
    content.style.top = "0px";

    const contentRect = content.getBoundingClientRect();
    let placement = getPlacement(
      triggerRect,
      contentRect,
      side,
      align,
      sideOffset,
      alignOffset
    );

    if (hasMainAxisCollision(placement, contentRect, collisionPadding)) {
      const flippedPlacement = getPlacement(
        triggerRect,
        contentRect,
        oppositeSide(side),
        align,
        sideOffset,
        alignOffset
      );

      if (!hasMainAxisCollision(flippedPlacement, contentRect, collisionPadding)) {
        placement = flippedPlacement;
      }
    }

    placement = clampPlacement(placement, contentRect, collisionPadding);
    content.dataset.side = placement.side;
    content.dataset.align = placement.align;
    content.style.left = `${placement.left}px`;
    content.style.top = `${placement.top}px`;
    const arrowCenter = this.#positionArrow(
      triggerRect,
      placement,
      arrowPadding
    );

    const updatedDimensions = syncPositioningCssVariables(
      content,
      triggerRect,
      content.getBoundingClientRect(),
      placement,
      sideOffset,
      collisionPadding,
      {
        width: this.#lastPositionerWidth,
        height: this.#lastPositionerHeight
      },
      arrowCenter
    );
    this.#lastPositionerWidth = updatedDimensions.width;
    this.#lastPositionerHeight = updatedDimensions.height;
    this.#syncPositioningObserver();
  }

  #positionArrow(
    triggerRect: DOMRect,
    placement: PopoverPlacement,
    padding: number
  ): number | undefined {
    if (!this.#content || !this.#arrow) {
      return undefined;
    }

    const arrow = this.#arrow;
    const snapshot = this.#arrowAttributeSnapshots.get(arrow);
    const arrowPlacement = getArrowPlacement(
      triggerRect,
      placement,
      {
        width: this.#content.clientWidth,
        height: this.#content.clientHeight,
        clientLeft: this.#content.clientLeft,
        clientTop: this.#content.clientTop
      },
      {
        width: arrow.offsetWidth,
        height: arrow.offsetHeight
      },
      padding
    );

    arrow.dataset.side = placement.side;
    arrow.dataset.align = placement.align;
    arrow.toggleAttribute("data-uncentered", arrowPlacement.uncentered);
    arrow.style.position = "absolute";

    if (arrowPlacement.left !== undefined) {
      if (snapshot) {
        restoreStyleProperty(arrow, "top", snapshot.top);
      }

      arrow.style.left = `${arrowPlacement.left}px`;
    } else if (arrowPlacement.top !== undefined) {
      if (snapshot) {
        restoreStyleProperty(arrow, "left", snapshot.left);
      }

      arrow.style.top = `${arrowPlacement.top}px`;
    }

    return arrowPlacement.center;
  }

  #schedulePosition(): void {
    const content = this.#content;

    if (!content) {
      return;
    }

    if (this.#positionFrame) {
      return;
    }

    this.#positionFrame = requestAnimationFrame(() => {
      this.#positionFrame = 0;

      if (
        content.hasAttribute("data-starting-style") ||
        content.hasAttribute("data-ending-style")
      ) {
        this.#schedulePosition();
        return;
      }

      if (this.#deferPositionForAnimations(content)) {
        return;
      }

      this.#position();
    });
  }

  #deferPositionForAnimations(content: HTMLElement): boolean {
    const animations = getFiniteAnimations(content);

    if (animations.length === 0) {
      return false;
    }

    const version = this.#animationVersion;

    if (this.#positionAfterAnimationVersion === version) {
      return true;
    }

    // Transforms affect getBoundingClientRect(). Reposition after the motion
    // finishes instead of feeding animated dimensions back into placement.
    this.#positionAfterAnimationVersion = version;
    void Promise.allSettled(
      animations.map((animation) => animation.finished)
    ).then(() => {
      if (this.#positionAfterAnimationVersion !== version) {
        return;
      }

      this.#positionAfterAnimationVersion = -1;

      if (this.#animationVersion === version && isPopoverOpen(content)) {
        this.#position();
      }
    });
    return true;
  }

  #syncPositioningObserver(): void {
    if (
      !this.#content ||
      !this.#activeTrigger ||
      !isPopoverOpen(this.#content) ||
      typeof ResizeObserver === "undefined"
    ) {
      this.#stopPositioningObserver();
      return;
    }

    const content = this.#content;
    const trigger = this.#activeTrigger;
    const arrow = this.#arrow;

    if (
      this.#resizeObserver &&
      this.#observedContent === content &&
      this.#observedTrigger === trigger &&
      this.#observedArrow === arrow
    ) {
      return;
    }

    // Re-observing unchanged targets emits another initial notification and
    // can otherwise turn positioning into a requestAnimationFrame loop.
    this.#stopPositioningObserver();
    const update = (): void => this.#schedulePosition();

    this.#resizeObserver = new ResizeObserver(update);
    this.#observedContent = content;
    this.#observedTrigger = trigger;
    this.#observedArrow = arrow;
    this.#resizeObserver.observe(content);
    this.#resizeObserver.observe(trigger);

    if (arrow) {
      this.#resizeObserver.observe(arrow);
    }
  }

  #stopPositioningObserver(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    this.#observedContent = null;
    this.#observedTrigger = null;
    this.#observedArrow = null;

    if (this.#positionFrame) {
      cancelAnimationFrame(this.#positionFrame);
      this.#positionFrame = 0;
    }
  }

  #clearPositioningState(): void {
    this.#stopPositioningObserver();

    if (this.#content) {
      clearPositioningCssVariables(this.#content);
    }

    this.#lastPositionerWidth = 0;
    this.#lastPositionerHeight = 0;
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

  #snapshotContentAttributes(content: HTMLElement): void {
    if (this.#contentAttributeSnapshots.has(content)) {
      return;
    }

    this.#contentAttributeSnapshots.set(content, {
      id: content.getAttribute("id"),
      dataState: content.getAttribute("data-state"),
      dataSide: content.getAttribute("data-side"),
      dataAlign: content.getAttribute("data-align"),
      role: content.getAttribute("role"),
      ariaLabelledBy: content.getAttribute("aria-labelledby"),
      ariaDescribedBy: content.getAttribute("aria-describedby"),
      popover: content.getAttribute("popover"),
      tabIndex: content.getAttribute("tabindex"),
      hidden: content.getAttribute("hidden"),
      style: content.getAttribute("style")
    });
  }

  #snapshotArrowAttributes(arrow: HTMLElement): void {
    if (this.#arrowAttributeSnapshots.has(arrow)) {
      return;
    }

    this.#arrowAttributeSnapshots.set(arrow, {
      dataState: arrow.getAttribute("data-state"),
      dataSide: arrow.getAttribute("data-side"),
      dataAlign: arrow.getAttribute("data-align"),
      dataUncentered: arrow.getAttribute("data-uncentered"),
      ariaHidden: arrow.getAttribute("aria-hidden"),
      style: arrow.getAttribute("style"),
      left: captureStyleProperty(arrow, "left"),
      top: captureStyleProperty(arrow, "top")
    });
  }

  #snapshotPartId(part: HTMLElement): void {
    if (!this.#partIdSnapshots.has(part)) {
      this.#partIdSnapshots.set(part, part.getAttribute("id"));
    }
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

  #restoreContentAttributes(content: HTMLElement): void {
    const snapshot = this.#contentAttributeSnapshots.get(content);

    if (!snapshot) {
      return;
    }

    restoreAttribute(content, "id", snapshot.id);
    restoreAttribute(content, "data-state", snapshot.dataState);
    restoreAttribute(content, "data-side", snapshot.dataSide);
    restoreAttribute(content, "data-align", snapshot.dataAlign);
    restoreAttribute(content, "role", snapshot.role);
    restoreAttribute(content, "aria-labelledby", snapshot.ariaLabelledBy);
    restoreAttribute(content, "aria-describedby", snapshot.ariaDescribedBy);
    restoreAttribute(content, "popover", snapshot.popover);
    restoreAttribute(content, "tabindex", snapshot.tabIndex);
    restoreAttribute(content, "hidden", snapshot.hidden);
    restoreAttribute(content, "style", snapshot.style);
    this.#contentAttributeSnapshots.delete(content);
  }

  #restoreArrowAttributes(arrow: HTMLElement): void {
    const snapshot = this.#arrowAttributeSnapshots.get(arrow);

    if (!snapshot) {
      return;
    }

    restoreAttribute(arrow, "data-state", snapshot.dataState);
    restoreAttribute(arrow, "data-side", snapshot.dataSide);
    restoreAttribute(arrow, "data-align", snapshot.dataAlign);
    restoreAttribute(arrow, "data-uncentered", snapshot.dataUncentered);
    restoreAttribute(arrow, "aria-hidden", snapshot.ariaHidden);
    restoreAttribute(arrow, "style", snapshot.style);
    this.#arrowAttributeSnapshots.delete(arrow);
  }

  #restoreStaleTriggers(): void {
    for (const trigger of Array.from(this.#triggerAttributeSnapshots.keys())) {
      if (this.#triggers.has(trigger)) {
        continue;
      }

      if (isTriggerManagedByAnyPopover(trigger)) {
        this.#triggerAttributeSnapshots.delete(trigger);
        continue;
      }

      this.#restoreTriggerAttributes(trigger);
    }
  }

  #restoreStaleContents(): void {
    for (const content of Array.from(this.#contentAttributeSnapshots.keys())) {
      if (content === this.#content) {
        continue;
      }

      this.#restoreContentAttributes(content);
    }
  }

  #restoreStaleArrows(): void {
    for (const arrow of Array.from(this.#arrowAttributeSnapshots.keys())) {
      if (arrow === this.#arrow) {
        continue;
      }

      this.#restoreArrowAttributes(arrow);
    }
  }

  #restoreStalePartIds(): void {
    const managedParts = new Set<HTMLElement>();

    if (this.#content) {
      for (const part of this.#content.querySelectorAll<HTMLElement>(
        "[data-popover-title], [data-popover-description]"
      )) {
        if (isOwnedByHost(part, this)) {
          managedParts.add(part);
        }
      }
    }

    for (const [part, id] of Array.from(this.#partIdSnapshots.entries())) {
      if (!managedParts.has(part)) {
        restoreAttribute(part, "id", id);
        this.#partIdSnapshots.delete(part);
      }
    }
  }

  #restoreManagedTriggers(): void {
    for (const trigger of Array.from(this.#triggerAttributeSnapshots.keys())) {
      this.#restoreTriggerAttributes(trigger);
    }
  }

  #restoreManagedContents(): void {
    for (const content of Array.from(this.#contentAttributeSnapshots.keys())) {
      this.#restoreContentAttributes(content);
    }
  }

  #restoreManagedArrows(): void {
    for (const arrow of Array.from(this.#arrowAttributeSnapshots.keys())) {
      this.#restoreArrowAttributes(arrow);
    }
  }

  #restoreManagedPartIds(): void {
    for (const [part, id] of Array.from(this.#partIdSnapshots.entries())) {
      restoreAttribute(part, "id", id);
    }

    this.#partIdSnapshots.clear();
  }

  #firstTrigger(): HTMLElement | null {
    return this.#triggers.values().next().value ?? null;
  }

  #cleanupListeners(): void {
    for (const cleanup of this.#listenerCleanup.splice(0)) {
      cleanup();
    }

    this.#stopPositioningObserver();
  }

  #cleanupObservers(): void {
    for (const cleanup of this.#observerCleanup.splice(0)) {
      cleanup();
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "pe-popover": PopoverElement;
  }

  interface GlobalEventHandlersEventMap {
    "pe-popover:open": CustomEvent<PopoverEventDetail>;
    "pe-popover:close": CustomEvent<PopoverEventDetail>;
  }
}

if (!customElements.get("pe-popover")) {
  customElements.define("pe-popover", PopoverElement);
}
