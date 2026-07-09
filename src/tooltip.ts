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
import { setTemporaryStyle, waitForAnimations } from "./internal/motion";
import { isDocumentLoading } from "./internal/document-loading";
import { createTriggerDocumentObserver } from "./internal/trigger-document-observer";
import { createWarnOnce } from "./internal/warnings";

type TooltipState = "open" | "closed";
type TooltipSide = Side;
type TooltipAlign = Align;
type TooltipPlacement = Placement;

type TriggerAttributeSnapshot = {
  dataState: string | null;
  ariaDescribedBy: string | null;
};

type ContentAttributeSnapshot = {
  dataState: string | null;
  role: string | null;
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

export type TooltipEventReason =
  | "hover"
  | "focus"
  | "trigger"
  | "escape"
  | "programmatic";

export type TooltipEventDetail = {
  content: HTMLElement;
  trigger?: HTMLElement;
  reason: TooltipEventReason;
};

let generatedTooltipId = 0;
const warn = createWarnOnce("[pe-tooltip]");
const sharedTriggerDocumentObserver = createTriggerDocumentObserver(
  "data-tooltip-trigger"
);

function findEnhancedTooltipHostById(id: string): HTMLElement | null {
  const element = document.getElementById(id);

  if (element instanceof HTMLElement && element.localName === "pe-tooltip") {
    return element;
  }

  return null;
}

function isOwnedByHost(element: HTMLElement, host: HTMLElement): boolean {
  return element.closest("pe-tooltip") === host;
}

function isTriggerManagedByAnyTooltip(trigger: HTMLElement): boolean {
  const value = trigger.getAttribute("data-tooltip-trigger");

  if (value === null) {
    return false;
  }

  if (value === "") {
    return Boolean(
      trigger.closest("pe-tooltip")?.querySelector("[data-tooltip-content]")
    );
  }

  return Boolean(findEnhancedTooltipHostById(value));
}

function warnForInvalidTooltipTriggers(): void {
  const triggers = Array.from(
    document.querySelectorAll<HTMLElement>("[data-tooltip-trigger]")
  );

  for (const trigger of triggers) {
    const triggerValue = trigger.getAttribute("data-tooltip-trigger") ?? "";

    if (triggerValue === "" && !trigger.closest("pe-tooltip")) {
      warn("Empty [data-tooltip-trigger] outside <pe-tooltip> is ignored.");
      continue;
    }

    if (triggerValue !== "" && !findEnhancedTooltipHostById(triggerValue)) {
      warn(
        `[data-tooltip-trigger="${triggerValue}"] does not match an enhanced tooltip.`
      );
    }
  }
}

sharedTriggerDocumentObserver.setInvalidTriggerWarningScheduler(
  warnForInvalidTooltipTriggers
);
sharedTriggerDocumentObserver.setRefreshRecordFilter(true);

function readSide(host: HTMLElement, content: HTMLElement): TooltipSide {
  const value =
    content.getAttribute("data-tooltip-side") ??
    host.getAttribute("data-tooltip-side") ??
    "top";

  if (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  ) {
    return value;
  }

  warn(`Invalid data-tooltip-side="${value}"; using "top".`);
  return "top";
}

function readAlign(host: HTMLElement, content: HTMLElement): TooltipAlign {
  const value =
    content.getAttribute("data-tooltip-align") ??
    host.getAttribute("data-tooltip-align") ??
    "center";

  if (value === "start" || value === "center" || value === "end") {
    return value;
  }

  warn(`Invalid data-tooltip-align="${value}"; using "center".`);
  return "center";
}

function readOffset(host: HTMLElement, content: HTMLElement): number {
  const value =
    content.getAttribute("data-tooltip-offset") ??
    host.getAttribute("data-tooltip-offset");

  if (value === null || value.trim() === "") {
    return 8;
  }

  const offset = Number(value);

  if (Number.isFinite(offset)) {
    return offset;
  }

  warn(`Invalid data-tooltip-offset="${value}"; using 8.`);
  return 8;
}

function readAlignOffset(host: HTMLElement, content: HTMLElement): number {
  const value =
    content.getAttribute("data-tooltip-align-offset") ??
    host.getAttribute("data-tooltip-align-offset");

  if (value === null || value.trim() === "") {
    return 0;
  }

  const offset = Number(value);

  if (Number.isFinite(offset)) {
    return offset;
  }

  warn(`Invalid data-tooltip-align-offset="${value}"; using 0.`);
  return 0;
}

function readCollisionPadding(host: HTMLElement, content: HTMLElement): number {
  const value =
    content.getAttribute("data-tooltip-collision-padding") ??
    host.getAttribute("data-tooltip-collision-padding");

  if (value === null || value.trim() === "") {
    return 4;
  }

  const padding = Number(value);

  if (Number.isFinite(padding)) {
    return padding;
  }

  warn(`Invalid data-tooltip-collision-padding="${value}"; using 4.`);
  return 4;
}

function readArrowPadding(host: HTMLElement, content: HTMLElement): number {
  const name = "data-tooltip-arrow-padding";
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

function readDelay(host: HTMLElement, content: HTMLElement): number {
  const value =
    content.getAttribute("data-tooltip-delay") ??
    host.getAttribute("data-tooltip-delay");

  if (value === null || value.trim() === "") {
    return 0;
  }

  const delay = Number(value);

  if (Number.isFinite(delay) && delay >= 0) {
    return delay;
  }

  warn(`Invalid data-tooltip-delay="${value}"; using 0.`);
  return 0;
}

function readCloseDelay(host: HTMLElement, content: HTMLElement): number {
  const value =
    content.getAttribute("data-tooltip-close-delay") ??
    host.getAttribute("data-tooltip-close-delay");

  if (value === null || value.trim() === "") {
    return 0;
  }

  const delay = Number(value);

  if (Number.isFinite(delay) && delay >= 0) {
    return delay;
  }

  warn(`Invalid data-tooltip-close-delay="${value}"; using 0.`);
  return 0;
}

function readDelayGroup(host: HTMLElement, content: HTMLElement): string | null {
  const value =
    content.getAttribute("data-tooltip-delay-group") ??
    host.getAttribute("data-tooltip-delay-group");

  if (value === null || value.trim() === "") {
    return null;
  }

  return value.trim();
}

function readSkipDelay(host: HTMLElement, content: HTMLElement): number {
  const value =
    content.getAttribute("data-tooltip-skip-delay") ??
    host.getAttribute("data-tooltip-skip-delay");

  if (value === null || value.trim() === "") {
    return 0;
  }

  const delay = Number(value);

  if (Number.isFinite(delay) && delay >= 0) {
    return delay;
  }

  warn(`Invalid data-tooltip-skip-delay="${value}"; using 0.`);
  return 0;
}

function readEffectiveCloseDelay(host: HTMLElement, content: HTMLElement): number {
  const closeDelay = readCloseDelay(host, content);
  const group = readDelayGroup(host, content);
  const skipDelay = readSkipDelay(host, content);

  if (group && skipDelay > 0) {
    return Math.max(closeDelay, skipDelay);
  }

  return closeDelay;
}

const delayGroupRegistry = new Map<string, Set<TooltipElement>>();
const delayGroupLastOpenAt = new Map<string, number>();

function shouldSkipOpenDelay(host: TooltipElement, content: HTMLElement): boolean {
  const group = readDelayGroup(host, content);
  const skipDelay = readSkipDelay(host, content);

  if (!group || skipDelay <= 0) {
    return false;
  }

  const lastOpenAt = delayGroupLastOpenAt.get(group);

  if (lastOpenAt === undefined) {
    return false;
  }

  return Date.now() - lastOpenAt < skipDelay;
}

const POSITIONING_CSS_PROPERTIES = [
  "--anchor-width",
  "--anchor-height",
  "--available-width",
  "--available-height",
  "--transform-origin"
] as const;

function syncPositioningCssVariables(
  content: HTMLElement,
  triggerRect: DOMRect,
  placement: TooltipPlacement,
  collisionPadding: number,
  sideOffset: number,
  arrowCenter?: number
): void {
  const anchor = getAnchorDimensions(triggerRect);
  const available = getAvailableSpace(triggerRect, placement.side, collisionPadding);
  const style = content.style;

  style.setProperty("--anchor-width", `${anchor.width}px`);
  style.setProperty("--anchor-height", `${anchor.height}px`);
  style.setProperty("--available-width", `${available.width}px`);
  style.setProperty("--available-height", `${available.height}px`);
  style.setProperty(
    "--transform-origin",
    getTransformOrigin(triggerRect, placement, sideOffset, arrowCenter)
  );
}

function clearPositioningCssVariables(content: HTMLElement): void {
  for (const property of POSITIONING_CSS_PROPERTIES) {
    content.style.removeProperty(property);
  }
}

function hasFiniteExitTransition(content: HTMLElement): boolean {
  const { transitionDuration } = getComputedStyle(content);

  return transitionDuration
    .split(",")
    .some((value) => Number.parseFloat(value) > 0);
}

function measurePlacementRect(
  content: HTMLElement,
  lastDimensions: { width: number; height: number }
): DOMRect {
  void content.offsetHeight;
  let width = content.offsetWidth;
  let height = content.offsetHeight;

  if (width === 0 && lastDimensions.width > 0) {
    width = lastDimensions.width;
  }

  if (height === 0 && lastDimensions.height > 0) {
    height = lastDimensions.height;
  }

  if (width > 0) {
    lastDimensions.width = width;
  }

  if (height > 0) {
    lastDimensions.height = height;
  }

  return new DOMRect(0, 0, width, height);
}

type Point = [number, number];
type Polygon = Point[];

function isPointInsideRect(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  padding = 0
): boolean {
  return (
    clientX >= rect.left - padding &&
    clientX <= rect.right + padding &&
    clientY >= rect.top - padding &&
    clientY <= rect.bottom + padding
  );
}

function isPointInPolygon(point: Point, polygon: Polygon): boolean {
  const [x, y] = point;
  let isInside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    const intersect =
      yi >= y !== yj >= y && x <= ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) {
      isInside = !isInside;
    }
  }

  return isInside;
}

function getSafeHoverRectBridge(
  side: TooltipSide,
  refRect: DOMRect,
  floatingRect: DOMRect
): Polygon {
  const isFloatingWider = floatingRect.width > refRect.width;
  const isFloatingTaller = floatingRect.height > refRect.height;
  const left = (isFloatingWider ? refRect : floatingRect).left;
  const right = (isFloatingWider ? refRect : floatingRect).right;
  const top = (isFloatingTaller ? refRect : floatingRect).top;
  const bottom = (isFloatingTaller ? refRect : floatingRect).bottom;

  switch (side) {
    case "top":
      return [
        [left, refRect.top + 1],
        [left, floatingRect.bottom - 1],
        [right, floatingRect.bottom - 1],
        [right, refRect.top + 1]
      ];
    case "bottom":
      return [
        [left, floatingRect.top + 1],
        [left, refRect.bottom - 1],
        [right, refRect.bottom - 1],
        [right, floatingRect.top + 1]
      ];
    case "left":
      return [
        [floatingRect.right - 1, bottom],
        [floatingRect.right - 1, top],
        [refRect.left + 1, top],
        [refRect.left + 1, bottom]
      ];
    case "right":
      return [
        [refRect.right - 1, bottom],
        [refRect.right - 1, top],
        [floatingRect.left + 1, top],
        [floatingRect.left + 1, bottom]
      ];
  }
}

function getSafeHoverCursorPolygon(
  side: TooltipSide,
  refRect: DOMRect,
  floatingRect: DOMRect,
  exitX: number,
  exitY: number,
  buffer = 0.5
): Polygon {
  const cursorLeaveFromRight = exitX > floatingRect.right - floatingRect.width / 2;
  const cursorLeaveFromBottom =
    exitY > floatingRect.bottom - floatingRect.height / 2;
  const isFloatingWider = floatingRect.width > refRect.width;
  const isFloatingTaller = floatingRect.height > refRect.height;

  switch (side) {
    case "top": {
      const cursorPointOne: Point = [
        isFloatingWider
          ? exitX + buffer / 2
          : cursorLeaveFromRight
            ? exitX + buffer * 4
            : exitX - buffer * 4,
        exitY + buffer + 1
      ];
      const cursorPointTwo: Point = [
        isFloatingWider
          ? exitX - buffer / 2
          : cursorLeaveFromRight
            ? exitX + buffer * 4
            : exitX - buffer * 4,
        exitY + buffer + 1
      ];

      return [
        cursorPointOne,
        cursorPointTwo,
        [
          floatingRect.left,
          cursorLeaveFromRight
            ? floatingRect.bottom - buffer
            : isFloatingWider
              ? floatingRect.bottom - buffer
              : floatingRect.top
        ],
        [
          floatingRect.right,
          cursorLeaveFromRight
            ? isFloatingWider
              ? floatingRect.bottom - buffer
              : floatingRect.top
            : floatingRect.bottom - buffer
        ]
      ];
    }
    case "bottom": {
      const cursorPointOne: Point = [
        isFloatingWider
          ? exitX + buffer / 2
          : cursorLeaveFromRight
            ? exitX + buffer * 4
            : exitX - buffer * 4,
        exitY - buffer
      ];
      const cursorPointTwo: Point = [
        isFloatingWider
          ? exitX - buffer / 2
          : cursorLeaveFromRight
            ? exitX + buffer * 4
            : exitX - buffer * 4,
        exitY - buffer
      ];

      return [
        cursorPointOne,
        cursorPointTwo,
        [
          floatingRect.left,
          cursorLeaveFromRight
            ? floatingRect.top + buffer
            : isFloatingWider
              ? floatingRect.top + buffer
              : floatingRect.bottom
        ],
        [
          floatingRect.right,
          cursorLeaveFromRight
            ? isFloatingWider
              ? floatingRect.top + buffer
              : floatingRect.bottom
            : floatingRect.top + buffer
        ]
      ];
    }
    case "left": {
      const cursorPointOne: Point = [
        exitX + buffer + 1,
        isFloatingTaller
          ? exitY + buffer / 2
          : cursorLeaveFromBottom
            ? exitY + buffer * 4
            : exitY - buffer * 4
      ];
      const cursorPointTwo: Point = [
        exitX + buffer + 1,
        isFloatingTaller
          ? exitY - buffer / 2
          : cursorLeaveFromBottom
            ? exitY + buffer * 4
            : exitY - buffer * 4
      ];

      return [
        [
          cursorLeaveFromBottom
            ? floatingRect.right - buffer
            : isFloatingTaller
              ? floatingRect.right - buffer
              : floatingRect.left,
          floatingRect.top
        ],
        [
          cursorLeaveFromBottom
            ? isFloatingTaller
              ? floatingRect.right - buffer
              : floatingRect.left
            : floatingRect.right - buffer,
          floatingRect.bottom
        ],
        cursorPointOne,
        cursorPointTwo
      ];
    }
    case "right": {
      const cursorPointOne: Point = [
        exitX - buffer,
        isFloatingTaller
          ? exitY + buffer / 2
          : cursorLeaveFromBottom
            ? exitY + buffer * 4
            : exitY - buffer * 4
      ];
      const cursorPointTwo: Point = [
        exitX - buffer,
        isFloatingTaller
          ? exitY - buffer / 2
          : cursorLeaveFromBottom
            ? exitY + buffer * 4
            : exitY - buffer * 4
      ];

      return [
        cursorPointOne,
        cursorPointTwo,
        [
          cursorLeaveFromBottom
            ? floatingRect.left + buffer
            : isFloatingTaller
              ? floatingRect.left + buffer
              : floatingRect.right,
          floatingRect.top
        ],
        [
          cursorLeaveFromBottom
            ? isFloatingTaller
              ? floatingRect.left + buffer
              : floatingRect.right
            : floatingRect.left + buffer,
          floatingRect.bottom
        ]
      ];
    }
  }
}

function readPlacementSide(host: HTMLElement, content: HTMLElement): TooltipSide {
  const value = content.dataset.side;

  if (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  ) {
    return value;
  }

  return readSide(host, content);
}

function appendToken(value: string | null, token: string): string {
  const tokens = (value ?? "").split(/\s+/).filter(Boolean);

  if (!tokens.includes(token)) {
    tokens.push(token);
  }

  return tokens.join(" ");
}

function dispatchTooltipEvent(
  host: HTMLElement,
  type: string,
  detail: TooltipEventDetail
): void {
  dispatchCustomEvent(host, type, detail);
}

export class TooltipElement extends HTMLElement {
  #content: HTMLElement | null = null;
  #arrow: HTMLElement | null = null;
  #triggers = new Set<HTMLElement>();
  #triggerAttributeSnapshots = new Map<HTMLElement, TriggerAttributeSnapshot>();
  #contentAttributeSnapshots = new Map<HTMLElement, ContentAttributeSnapshot>();
  #arrowAttributeSnapshots = new Map<HTMLElement, ArrowAttributeSnapshot>();
  #activeTrigger: HTMLElement | null = null;
  #pointerTrigger: HTMLElement | null = null;
  #focusTrigger: HTMLElement | null = null;
  #isPointerOverContent = false;
  #safeHoverTracking = false;
  #safeHoverLanded = false;
  #safeHoverExit: Point | null = null;
  #listenerCleanup: Array<() => void> = [];
  #observerCleanup: Array<() => void> = [];
  #resizeObserver: ResizeObserver | null = null;
  #positionFrame = 0;
  #lastContentWidth = 0;
  #lastContentHeight = 0;
  #pendingOpenFrame = 0;
  #animationVersion = 0;
  #restorePendingMotionStyle: (() => void) | null = null;
  #refreshQueued = false;
  #hideQueued = false;
  #queuedHideReason: TooltipEventReason | null = null;
  #closePending = false;
  #pendingCloseReason: TooltipEventReason | null = null;
  #openDelayTimer = 0;
  #closeDelayTimer = 0;
  #pendingHoverTrigger: HTMLElement | null = null;
  #delayGroupRegistration: string | null = null;
  #openedViaPointer = false;
  #hasInitialized = false;

  connectedCallback(): void {
    if (!this.#hasInitialized) {
      this.#hasInitialized = true;

      if (!this.dataset.state) {
        this.dataset.state = "closed";
      }

      this.#applyInitialClosedState();
    }

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
    this.#cleanupListeners();
    this.#cleanupObservers();
    this.#stopSafeHoverTracking();
    this.#stopPositioningObserver();
    this.#cancelPendingOpenAnimation();
    this.#restoreManagedTriggers();
    this.#restoreManagedContents();
    this.#restoreManagedArrows();
    this.#content = null;
    this.#arrow = null;
    this.#triggers.clear();
    this.#activeTrigger = null;
    this.#pointerTrigger = null;
    this.#focusTrigger = null;
    this.#isPointerOverContent = false;
    this.#safeHoverTracking = false;
    this.#safeHoverLanded = false;
    this.#safeHoverExit = null;
    this.#queuedHideReason = null;
    this.#openedViaPointer = false;
    this.#closePending = false;
    this.#pendingCloseReason = null;
    this.#cancelOpenDelay();
    this.#cancelInactiveHide();
    this.#unregisterDelayGroup();
  }

  get isOpen(): boolean {
    return this.dataset.state === "open";
  }

  open(trigger?: HTMLElement): void {
    this.#openWithReason(trigger, "programmatic");
  }

  #openWithReason(
    trigger: HTMLElement | undefined,
    reason: TooltipEventReason
  ): void {
    if (!this.#content) {
      return;
    }

    const nextTrigger = trigger ?? this.#activeTrigger ?? this.#firstTrigger();

    if (!nextTrigger) {
      return;
    }

    this.#cancelOpenDelay();
    this.#cancelInactiveHide();

    if (this.#closePending) {
      this.#cancelAnimatedClose();
    }

    const wasOpen = this.dataset.state === "open";

    if (!wasOpen) {
      this.#handoffDelayGroupPeers();
    }

    this.#activeTrigger = nextTrigger;

    if (!wasOpen) {
      this.#openedViaPointer = reason === "hover";
    } else if (reason === "hover") {
      this.#openedViaPointer = true;
    }

    this.#sync("open");
    this.#position();
    this.#touchDelayGroupActivity();

    if (!wasOpen) {
      this.#beginOpenAnimation();
      dispatchTooltipEvent(this, "pe-tooltip:open", {
        content: this.#content,
        trigger: nextTrigger,
        reason
      });
    }
  }

  close(): void {
    this.#closeWithReason("programmatic");
  }

  #closeWithReason(reason: TooltipEventReason): void {
    if (!this.#content || this.dataset.state !== "open" || this.#closePending) {
      return;
    }

    this.#cancelOpenDelay();
    this.#cancelInactiveHide();
    this.#pendingCloseReason = reason;
    this.#stopSafeHoverTracking();
    this.#animateClose();
  }

  #animateClose(): void {
    if (!this.#content || this.dataset.state !== "open") {
      return;
    }

    const content = this.#content;
    const version = ++this.#animationVersion;
    this.#closePending = true;
    this.#cancelPendingOpenAnimation();
    content.removeAttribute("data-starting-style");

    window.requestAnimationFrame(() => {
      if (this.dataset.state !== "open" || this.#animationVersion !== version) {
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
    const trigger = this.#activeTrigger ?? undefined;
    this.#closePending = false;
    this.#pendingCloseReason = null;
    this.#openedViaPointer = false;
    content.removeAttribute("data-ending-style");
    this.#sync("closed");

    dispatchTooltipEvent(this, "pe-tooltip:close", {
      content,
      trigger,
      reason
    });
  }

  #cancelAnimatedClose(): void {
    if (!this.#closePending) {
      return;
    }

    this.#animationVersion += 1;
    this.#closePending = false;
    this.#pendingCloseReason = null;
    this.#content?.removeAttribute("data-ending-style");
  }

  toggle(trigger?: HTMLElement): void {
    if (this.dataset.state === "open") {
      this.close();
      return;
    }

    this.open(trigger);
  }

  #refresh(): void {
    this.#refreshQueued = false;
    this.#cleanupListeners();
    this.#resolveContent();
    this.#resolveArrow();
    this.#resolveTriggers();
    this.#restoreStaleTriggers();
    this.#restoreStaleContents();
    this.#restoreStaleArrows();
    this.#syncDelayGroupRegistration();
    this.#bindListeners();
    this.#sync(this.dataset.state === "open" ? "open" : "closed");

    if (this.dataset.state === "open") {
      this.#position();
    }
  }

  #applyInitialClosedState(): void {
    for (const content of this.querySelectorAll<HTMLElement>(
      "[data-tooltip-content]"
    )) {
      if (!isOwnedByHost(content, this)) {
        continue;
      }

      this.#snapshotContentAttributes(content);

      if (content.dataset.state === "open") {
        continue;
      }

      content.setAttribute("hidden", "");
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
    const contents = Array.from(
      this.querySelectorAll<HTMLElement>("[data-tooltip-content]")
    ).filter((content) => isOwnedByHost(content, this));

    if (contents.length === 0) {
      this.#content = null;
      this.dataset.state = "closed";

      if (!isDocumentLoading()) {
        warn("Missing [data-tooltip-content] inside <pe-tooltip>.");
      }

      return;
    }

    if (contents.length > 1) {
      warn(
        "Multiple [data-tooltip-content] targets found inside <pe-tooltip>; using the first one."
      );
    }

    this.#content = contents[0] ?? null;

    if (this.#content && !this.#content.id) {
      generatedTooltipId += 1;
      this.#content.id = `pe-tooltip-content-${generatedTooltipId}`;
    }
  }

  #resolveArrow(): void {
    this.#arrow = null;

    if (!this.#content) {
      return;
    }

    const arrows = Array.from(this.#content.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element.hasAttribute("data-tooltip-arrow")
    );
    const nestedArrows = Array.from(
      this.#content.querySelectorAll<HTMLElement>("[data-tooltip-arrow]")
    ).filter(
      (arrow) =>
        isOwnedByHost(arrow, this) && arrow.parentElement !== this.#content
    );

    if (arrows.length > 1) {
      warn(
        "Multiple direct [data-tooltip-arrow] elements found; using the first one."
      );
    }

    if (nestedArrows.length > 0) {
      warn(
        "[data-tooltip-arrow] must be a direct child of [data-tooltip-content]; nested arrows are ignored."
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
      this.querySelectorAll<HTMLElement>("[data-tooltip-trigger]")
    ).filter(
      (trigger) =>
        isOwnedByHost(trigger, this) &&
        trigger.getAttribute("data-tooltip-trigger") === ""
    );

    for (const trigger of internalTriggers) {
      this.#triggers.add(trigger);
    }

    if (this.id) {
      const selector = `[data-tooltip-trigger="${escapeAttributeValue(this.id)}"]`;
      const externalTriggers = Array.from(
        document.querySelectorAll<HTMLElement>(selector)
      );

      for (const trigger of externalTriggers) {
        this.#triggers.add(trigger);
      }
    }

    if (this.#activeTrigger && !this.#triggers.has(this.#activeTrigger)) {
      this.#activeTrigger = null;
    }
  }

  #bindListeners(): void {
    if (!this.#content) {
      return;
    }

    const onContentPointerEnter = (): void => {
      this.#stopSafeHoverTracking();
      this.#isPointerOverContent = true;
    };

    const onContentPointerLeave = (event: PointerEvent): void => {
      this.#isPointerOverContent = false;

      if (this.#activeTrigger) {
        this.#startSafeHoverTracking(event, content, this.#activeTrigger);
      }

      this.#queueInactiveHide("hover");
    };

    const onDocumentKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        this.#cancelOpenDelay();
        this.#cancelInactiveHide();

        if (this.dataset.state === "open") {
          this.#closeWithReason("escape");
        }
      }
    };

    const onWindowChange = (): void => {
      if (this.dataset.state === "open") {
        this.#schedulePosition();
      }
    };

    const content = this.#content;

    const onDocumentPointerMove = (event: PointerEvent): void => {
      this.#handleSafeHoverPointerMove(event);
    };

    content.addEventListener("pointerenter", onContentPointerEnter);
    content.addEventListener("pointerleave", onContentPointerLeave);
    document.addEventListener("keydown", onDocumentKeyDown);
    document.addEventListener("pointermove", onDocumentPointerMove);
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    this.#listenerCleanup.push(() => {
      content.removeEventListener("pointerenter", onContentPointerEnter);
      content.removeEventListener("pointerleave", onContentPointerLeave);
      document.removeEventListener("keydown", onDocumentKeyDown);
      document.removeEventListener("pointermove", onDocumentPointerMove);
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    });

    for (const trigger of this.#triggers) {
      const onPointerEnter = (event: PointerEvent): void => {
        if (event.pointerType === "touch") {
          return;
        }

        this.#stopSafeHoverTracking();
        this.#cancelInactiveHide();
        this.#pointerTrigger = trigger;
        this.#scheduleHoverOpen(trigger);
      };

      const onPointerLeave = (event: PointerEvent): void => {
        if (this.#pointerTrigger === trigger) {
          this.#pointerTrigger = null;
        }

        if (this.#pendingHoverTrigger === trigger) {
          this.#cancelOpenDelay();
        }

        if (this.#content) {
          this.#startSafeHoverTracking(event, trigger, this.#content);
        }

        this.#queueInactiveHide("hover");
      };

      const onFocusIn = (): void => {
        this.#cancelOpenDelay();
        this.#cancelInactiveHide();
        this.#focusTrigger = trigger;
        this.#openWithReason(trigger, "focus");
      };

      const onFocusOut = (): void => {
        if (this.#focusTrigger === trigger) {
          this.#focusTrigger = null;
        }

        this.#queueInactiveHide("focus");
      };

      const onClick = (): void => {
        if (this.dataset.state === "open") {
          this.#closeWithReason("trigger");
        }
      };

      trigger.addEventListener("pointerenter", onPointerEnter);
      trigger.addEventListener("pointerleave", onPointerLeave);
      trigger.addEventListener("focusin", onFocusIn);
      trigger.addEventListener("focusout", onFocusOut);
      trigger.addEventListener("click", onClick);
      this.#listenerCleanup.push(() => {
        trigger.removeEventListener("pointerenter", onPointerEnter);
        trigger.removeEventListener("pointerleave", onPointerLeave);
        trigger.removeEventListener("focusin", onFocusIn);
        trigger.removeEventListener("focusout", onFocusOut);
        trigger.removeEventListener("click", onClick);
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
        "data-tooltip-content",
        "data-tooltip-trigger",
        "data-tooltip-arrow",
        "data-tooltip-side",
        "data-tooltip-align",
        "data-tooltip-offset",
        "data-tooltip-align-offset",
        "data-tooltip-collision-padding",
        "data-tooltip-arrow-padding",
        "data-tooltip-delay",
        "data-tooltip-close-delay",
        "data-tooltip-delay-group",
        "data-tooltip-skip-delay"
      ]
    });

    this.#observerCleanup.push(() => hostObserver.disconnect());
  }

  #sync(state: TooltipState): void {
    this.dataset.state = state;

    if (this.#content) {
      this.#snapshotContentAttributes(this.#content);
      this.#content.dataset.state = state;
      this.#content.setAttribute("role", "tooltip");

      if (state === "open") {
        this.#content.style.position = "fixed";
        const preservePosition =
          this.#closePending ||
          this.#content.hasAttribute("data-starting-style") ||
          this.#content.hasAttribute("data-ending-style");

        if (!preservePosition) {
          this.#content.style.left = "0px";
          this.#content.style.top = "0px";
        }

        this.#content.style.pointerEvents = "auto";
        this.#content.removeAttribute("hidden");
      } else {
        this.#clearPositioningState();
        this.#content.setAttribute("hidden", "");
      }
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

      if (this.#content?.id) {
        const snapshot = this.#triggerAttributeSnapshots.get(trigger);
        trigger.setAttribute(
          "aria-describedby",
          appendToken(snapshot?.ariaDescribedBy ?? null, this.#content.id)
        );
      }
    }
  }

  #snapshotTriggerAttributes(trigger: HTMLElement): void {
    if (this.#triggerAttributeSnapshots.has(trigger)) {
      return;
    }

    this.#triggerAttributeSnapshots.set(trigger, {
      dataState: trigger.getAttribute("data-state"),
      ariaDescribedBy: trigger.getAttribute("aria-describedby")
    });
  }

  #snapshotContentAttributes(content: HTMLElement): void {
    if (this.#contentAttributeSnapshots.has(content)) {
      return;
    }

    this.#contentAttributeSnapshots.set(content, {
      dataState: content.getAttribute("data-state"),
      role: content.getAttribute("role"),
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

  #restoreTriggerAttributes(trigger: HTMLElement): void {
    const snapshot = this.#triggerAttributeSnapshots.get(trigger);

    if (!snapshot) {
      return;
    }

    restoreAttribute(trigger, "data-state", snapshot.dataState);
    restoreAttribute(trigger, "aria-describedby", snapshot.ariaDescribedBy);
    this.#triggerAttributeSnapshots.delete(trigger);
  }

  #restoreContentAttributes(content: HTMLElement): void {
    const snapshot = this.#contentAttributeSnapshots.get(content);

    if (!snapshot) {
      return;
    }

    restoreAttribute(content, "data-state", snapshot.dataState);
    restoreAttribute(content, "role", snapshot.role);
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

      if (isTriggerManagedByAnyTooltip(trigger)) {
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

  #queueInactiveHide(reason: TooltipEventReason): void {
    if (this.#closePending) {
      return;
    }

    this.#queuedHideReason = reason;

    if (this.#hideQueued) {
      return;
    }

    this.#hideQueued = true;
    const closeDelay = this.#content
      ? readEffectiveCloseDelay(this, this.#content)
      : 0;

    this.#closeDelayTimer = window.setTimeout(() => {
      this.#closeDelayTimer = 0;
      this.#hideQueued = false;
      const queuedReason = this.#queuedHideReason ?? reason;
      this.#queuedHideReason = null;

      if (
        this.#pointerTrigger ||
        this.#isPointerOverContent ||
        this.#safeHoverTracking
      ) {
        return;
      }

      if (this.#focusTrigger && !this.#openedViaPointer) {
        return;
      }

      this.#closeWithReason(queuedReason);
    }, closeDelay);
  }

  #scheduleHoverOpen(trigger: HTMLElement): void {
    if (!this.#content) {
      return;
    }

    this.#cancelOpenDelay();

    const skipOpenDelay = this.#shouldSkipDelayGroupOpen();

    this.#handoffDelayGroupPeers();

    if (this.dataset.state === "open") {
      this.#openWithReason(trigger, "hover");
      return;
    }

    const openDelay = skipOpenDelay ? 0 : readDelay(this, this.#content);

    if (openDelay <= 0) {
      this.#openWithReason(trigger, "hover");
      return;
    }

    this.#pendingHoverTrigger = trigger;
    this.#openDelayTimer = window.setTimeout(() => {
      this.#openDelayTimer = 0;
      const pendingTrigger = this.#pendingHoverTrigger;
      this.#pendingHoverTrigger = null;

      if (
        !pendingTrigger ||
        pendingTrigger !== this.#pointerTrigger ||
        !pendingTrigger.isConnected
      ) {
        return;
      }

      this.#openWithReason(pendingTrigger, "hover");
    }, openDelay);
  }

  #isDelayGroupHandoffActive(): boolean {
    return (
      this.dataset.state === "open" ||
      this.#closePending ||
      this.#hideQueued ||
      this.#openDelayTimer !== 0
    );
  }

  #shouldSkipDelayGroupOpen(): boolean {
    if (!this.#content) {
      return false;
    }

    if (shouldSkipOpenDelay(this, this.#content)) {
      return true;
    }

    const group = readDelayGroup(this, this.#content);

    if (!group) {
      return false;
    }

    for (const peer of delayGroupRegistry.get(group) ?? []) {
      if (peer !== this && peer.#isDelayGroupHandoffActive()) {
        return true;
      }
    }

    return false;
  }

  #syncDelayGroupRegistration(): void {
    if (this.#delayGroupRegistration) {
      delayGroupRegistry.get(this.#delayGroupRegistration)?.delete(this);
      this.#delayGroupRegistration = null;
    }

    if (!this.#content) {
      return;
    }

    const group = readDelayGroup(this, this.#content);

    if (!group) {
      return;
    }

    let peers = delayGroupRegistry.get(group);

    if (!peers) {
      peers = new Set();
      delayGroupRegistry.set(group, peers);
    }

    peers.add(this);
    this.#delayGroupRegistration = group;
  }

  #unregisterDelayGroup(): void {
    if (!this.#delayGroupRegistration) {
      return;
    }

    delayGroupRegistry.get(this.#delayGroupRegistration)?.delete(this);
    this.#delayGroupRegistration = null;
  }

  #handoffDelayGroupPeers(): void {
    if (!this.#content) {
      return;
    }

    const group = readDelayGroup(this, this.#content);

    if (!group) {
      return;
    }

    for (const peer of delayGroupRegistry.get(group) ?? []) {
      if (peer !== this) {
        peer.#handoffFromDelayGroup();
      }
    }
  }

  #handoffFromDelayGroup(): void {
    this.#cancelOpenDelay();
    this.#cancelInactiveHide();

    if (this.#closePending) {
      const content = this.#content;
      const trigger = this.#activeTrigger ?? undefined;
      this.#animationVersion += 1;
      this.#closePending = false;
      this.#pendingCloseReason = null;
      content?.removeAttribute("data-ending-style");
      this.#openedViaPointer = false;
      this.#sync("closed");

      if (content) {
        dispatchTooltipEvent(this, "pe-tooltip:close", {
          content,
          trigger,
          reason: "programmatic"
        });
      }
    }

    if (this.dataset.state === "open") {
      this.#closeWithReason("programmatic");
    }
  }

  #touchDelayGroupActivity(): void {
    if (!this.#content) {
      return;
    }

    const group = readDelayGroup(this, this.#content);

    if (group) {
      delayGroupLastOpenAt.set(group, Date.now());
    }
  }

  #cancelOpenDelay(): void {
    if (this.#openDelayTimer) {
      window.clearTimeout(this.#openDelayTimer);
      this.#openDelayTimer = 0;
    }

    this.#pendingHoverTrigger = null;
  }

  #cancelInactiveHide(): void {
    if (this.#closeDelayTimer) {
      window.clearTimeout(this.#closeDelayTimer);
      this.#closeDelayTimer = 0;
    }

    this.#hideQueued = false;
    this.#queuedHideReason = null;
  }

  #startSafeHoverTracking(
    event: PointerEvent,
    source: HTMLElement,
    target: HTMLElement
  ): boolean {
    if (
      event.pointerType !== "mouse" ||
      this.dataset.state !== "open" ||
      !this.#activeTrigger ||
      !this.#content
    ) {
      return false;
    }

    const related = event.relatedTarget;

    if (
      related instanceof Node &&
      (source.contains(related) || target.contains(related))
    ) {
      return false;
    }

    const trigger = this.#activeTrigger;
    const content = this.#content;
    const refRect = trigger.getBoundingClientRect();
    const floatingRect = content.getBoundingClientRect();
    const exitX = event.clientX;
    const exitY = event.clientY;
    const side = readPlacementSide(this, content);

    if (
      (side === "top" && exitY >= refRect.bottom - 1) ||
      (side === "bottom" && exitY <= refRect.top + 1) ||
      (side === "left" && exitX >= refRect.right - 1) ||
      (side === "right" && exitX <= refRect.left + 1)
    ) {
      return false;
    }

    this.#safeHoverExit = [exitX, exitY];
    this.#safeHoverTracking = true;
    this.#safeHoverLanded = source === content;

    if (
      !this.#isPointInSafeHoverArea(exitX, exitY, refRect, floatingRect, side)
    ) {
      this.#stopSafeHoverTracking();
      return false;
    }

    return true;
  }

  #isPointInSafeHoverArea(
    clientX: number,
    clientY: number,
    refRect: DOMRect,
    floatingRect: DOMRect,
    side: TooltipSide
  ): boolean {
    const point: Point = [clientX, clientY];

    if (isPointInsideRect(clientX, clientY, floatingRect)) {
      return true;
    }

    if (isPointInsideRect(clientX, clientY, refRect)) {
      return true;
    }

    const exit = this.#safeHoverExit;

    if (!exit) {
      return false;
    }

    const [exitX, exitY] = exit;

    if (isPointInPolygon(point, getSafeHoverRectBridge(side, refRect, floatingRect))) {
      return true;
    }

    if (this.#safeHoverLanded) {
      return false;
    }

    return isPointInPolygon(
      point,
      getSafeHoverCursorPolygon(side, refRect, floatingRect, exitX, exitY)
    );
  }

  #handleSafeHoverPointerMove(event: PointerEvent): void {
    if (
      !this.#safeHoverTracking ||
      !this.#activeTrigger ||
      !this.#content ||
      event.pointerType === "touch"
    ) {
      return;
    }

    const trigger = this.#activeTrigger;
    const content = this.#content;
    const target = event.target;

    if (target instanceof Node) {
      if (content.contains(target) || trigger.contains(target)) {
        this.#stopSafeHoverTracking();
        return;
      }
    }

    const refRect = trigger.getBoundingClientRect();
    const floatingRect = content.getBoundingClientRect();
    const { clientX, clientY } = event;
    const side = readPlacementSide(this, content);

    if (isPointInsideRect(clientX, clientY, floatingRect)) {
      this.#safeHoverLanded = true;
      return;
    }

    if (isPointInsideRect(clientX, clientY, refRect)) {
      this.#safeHoverLanded = false;
      return;
    }

    if (!this.#isPointInSafeHoverArea(clientX, clientY, refRect, floatingRect, side)) {
      this.#closeFromSafeHover();
    }
  }

  #closeFromSafeHover(): void {
    this.#stopSafeHoverTracking();
    this.#queueInactiveHide("hover");
  }

  #stopSafeHoverTracking(): void {
    this.#safeHoverTracking = false;
    this.#safeHoverLanded = false;
    this.#safeHoverExit = null;
  }

  #position(): void {
    if (!this.#content || !this.#activeTrigger) {
      return;
    }

    if (this.#content.hasAttribute("data-starting-style")) {
      return;
    }

    if (this.#content.hasAttribute("data-ending-style")) {
      return;
    }

    const content = this.#content;
    const triggerRect = this.#activeTrigger.getBoundingClientRect();
    const side = readSide(this, content);
    const align = readAlign(this, content);
    const sideOffset = readOffset(this, content);
    const alignOffset = readAlignOffset(this, content);
    const collisionPadding = readCollisionPadding(this, content);
    const arrowPadding = readArrowPadding(this, content);

    content.style.position = "fixed";

    const contentRect = measurePlacementRect(content, {
      width: this.#lastContentWidth,
      height: this.#lastContentHeight
    });
    this.#lastContentWidth = contentRect.width;
    this.#lastContentHeight = contentRect.height;
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
    syncPositioningCssVariables(
      content,
      triggerRect,
      placement,
      collisionPadding,
      sideOffset,
      arrowCenter
    );
    this.#syncPositioningObserver();
  }

  #positionArrow(
    triggerRect: DOMRect,
    placement: TooltipPlacement,
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
    if (this.#content?.hasAttribute("data-starting-style")) {
      return;
    }

    if (this.#content?.hasAttribute("data-ending-style")) {
      return;
    }

    if (this.#positionFrame) {
      return;
    }

    this.#positionFrame = requestAnimationFrame(() => {
      this.#positionFrame = 0;
      this.#position();
    });
  }

  #syncPositioningObserver(): void {
    this.#stopPositioningObserver();

    if (
      !this.#content ||
      !this.#activeTrigger ||
      this.dataset.state !== "open" ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }

    const content = this.#content;
    const trigger = this.#activeTrigger;
    const update = (): void => this.#schedulePosition();

    this.#resizeObserver = new ResizeObserver(update);
    this.#resizeObserver.observe(content);
    this.#resizeObserver.observe(trigger);

    if (this.#arrow) {
      this.#resizeObserver.observe(this.#arrow);
    }
  }

  #stopPositioningObserver(): void {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;

    if (this.#positionFrame) {
      cancelAnimationFrame(this.#positionFrame);
      this.#positionFrame = 0;
    }
  }

  #clearPositioningState(): void {
    this.#stopPositioningObserver();
    this.#cancelPendingOpenAnimation();

    if (this.#content) {
      this.#content.removeAttribute("data-starting-style");
      this.#content.removeAttribute("data-ending-style");
      clearPositioningCssVariables(this.#content);
    }

    this.#lastContentWidth = 0;
    this.#lastContentHeight = 0;
  }

  #cancelPendingOpenAnimation(): void {
    if (this.#pendingOpenFrame !== 0) {
      window.cancelAnimationFrame(this.#pendingOpenFrame);
      this.#pendingOpenFrame = 0;
    }

    this.#restorePendingMotionStyle?.();
    this.#restorePendingMotionStyle = null;
  }

  #beginOpenAnimation(): void {
    if (!this.#content || this.dataset.state !== "open") {
      return;
    }

    const content = this.#content;
    const version = ++this.#animationVersion;
    const wasClosing =
      content.hasAttribute("data-ending-style") || this.#closePending;
    this.#closePending = false;
    this.#pendingCloseReason = null;
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

      if (this.dataset.state !== "open" || this.#animationVersion !== version) {
        return;
      }

      this.#restorePendingMotionStyle?.();
      this.#restorePendingMotionStyle = null;
      content.removeAttribute("data-starting-style");
    });
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
    "pe-tooltip": TooltipElement;
  }

  interface GlobalEventHandlersEventMap {
    "pe-tooltip:open": CustomEvent<TooltipEventDetail>;
    "pe-tooltip:close": CustomEvent<TooltipEventDetail>;
  }
}

if (!customElements.get("pe-tooltip")) {
  customElements.define("pe-tooltip", TooltipElement);
}
