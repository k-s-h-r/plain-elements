// Internal, side-effect-free floating-position geometry shared by Popover and
// Tooltip. This module never touches the DOM, reads attributes, warns, or
// writes data-side/data-align; those stay in each component. Not part of the
// public API and not re-exported from src/index.ts.

export type Side = "top" | "right" | "bottom" | "left";
export type Align = "start" | "center" | "end";

export type Placement = {
  side: Side;
  align: Align;
  left: number;
  top: number;
};

export type ArrowPlacement = {
  left?: number;
  top?: number;
  center: number;
  uncentered: boolean;
};

export type FloatingBox = {
  width: number;
  height: number;
  clientLeft: number;
  clientTop: number;
};

export type ArrowSize = {
  width: number;
  height: number;
};

export function oppositeSide(side: Side): Side {
  if (side === "top") {
    return "bottom";
  }

  if (side === "bottom") {
    return "top";
  }

  if (side === "left") {
    return "right";
  }

  return "left";
}

export function getPlacement(
  triggerRect: DOMRect,
  contentRect: DOMRect,
  side: Side,
  align: Align,
  sideOffset: number,
  alignOffset: number
): Placement {
  let left = triggerRect.left + (triggerRect.width - contentRect.width) / 2;
  let top = triggerRect.top - contentRect.height - sideOffset;

  if (side === "bottom") {
    top = triggerRect.bottom + sideOffset;
  }

  if (side === "left") {
    left = triggerRect.left - contentRect.width - sideOffset;
    top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
  }

  if (side === "right") {
    left = triggerRect.right + sideOffset;
    top = triggerRect.top + (triggerRect.height - contentRect.height) / 2;
  }

  if (side === "top" || side === "bottom") {
    if (align === "start") {
      left = triggerRect.left;
    }

    if (align === "end") {
      left = triggerRect.right - contentRect.width;
    }

    left += alignOffset;
  } else {
    if (align === "start") {
      top = triggerRect.top;
    }

    if (align === "end") {
      top = triggerRect.bottom - contentRect.height;
    }

    top += alignOffset;
  }

  return { side, align, left, top };
}

export function hasMainAxisCollision(
  placement: Placement,
  contentRect: DOMRect,
  padding: number
): boolean {
  if (placement.side === "top") {
    return placement.top < padding;
  }

  if (placement.side === "bottom") {
    return placement.top + contentRect.height > window.innerHeight - padding;
  }

  if (placement.side === "left") {
    return placement.left < padding;
  }

  return placement.left + contentRect.width > window.innerWidth - padding;
}

export function clampPlacement(
  placement: Placement,
  contentRect: DOMRect,
  padding: number
): Placement {
  const maxLeft = Math.max(padding, window.innerWidth - contentRect.width - padding);
  const maxTop = Math.max(padding, window.innerHeight - contentRect.height - padding);

  return {
    ...placement,
    left: Math.min(Math.max(placement.left, padding), maxLeft),
    top: Math.min(Math.max(placement.top, padding), maxTop)
  };
}

export function getArrowPlacement(
  triggerRect: DOMRect,
  placement: Placement,
  floatingBox: FloatingBox,
  arrowSize: ArrowSize,
  padding: number
): ArrowPlacement {
  const isVerticalSide = placement.side === "top" || placement.side === "bottom";
  const floatingStart = isVerticalSide
    ? placement.left + floatingBox.clientLeft
    : placement.top + floatingBox.clientTop;
  const floatingSize = isVerticalSide ? floatingBox.width : floatingBox.height;
  const size = isVerticalSide ? arrowSize.width : arrowSize.height;
  const triggerCenter = isVerticalSide
    ? triggerRect.left + triggerRect.width / 2
    : triggerRect.top + triggerRect.height / 2;
  const ideal = triggerCenter - floatingStart - size / 2;
  const available = Math.max(0, floatingSize - size);
  const effectivePadding = Math.min(Math.max(0, padding), available / 2);
  const position = Math.min(
    Math.max(ideal, effectivePadding),
    available - effectivePadding
  );
  const center = position + size / 2 + (isVerticalSide
    ? floatingBox.clientLeft
    : floatingBox.clientTop);
  const result = {
    center,
    uncentered: Math.abs(position - ideal) > 0.01
  };

  if (isVerticalSide) {
    return { ...result, left: position };
  }

  return { ...result, top: position };
}

export function getAnchorDimensions(triggerRect: DOMRect): {
  width: number;
  height: number;
} {
  const dpr = window.devicePixelRatio || 1;
  const width =
    (Math.round((triggerRect.left + triggerRect.width) * dpr) -
      Math.round(triggerRect.left * dpr)) /
    dpr;
  const height =
    (Math.round((triggerRect.top + triggerRect.height) * dpr) -
      Math.round(triggerRect.top * dpr)) /
    dpr;

  return { width, height };
}

export function getAvailableSpace(
  triggerRect: DOMRect,
  side: Side,
  padding: number
): { width: number; height: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (side === "bottom") {
    return {
      width: Math.max(0, viewportWidth - padding * 2),
      height: Math.max(0, viewportHeight - triggerRect.bottom - padding)
    };
  }

  if (side === "top") {
    return {
      width: Math.max(0, viewportWidth - padding * 2),
      height: Math.max(0, triggerRect.top - padding)
    };
  }

  if (side === "right") {
    return {
      width: Math.max(0, viewportWidth - triggerRect.right - padding),
      height: Math.max(0, viewportHeight - padding * 2)
    };
  }

  return {
    width: Math.max(0, triggerRect.left - padding),
    height: Math.max(0, viewportHeight - padding * 2)
  };
}

export function getTransformOrigin(
  triggerRect: DOMRect,
  placement: Placement,
  sideOffset: number,
  arrowCenter?: number
): string {
  const anchorCenterX = triggerRect.left + triggerRect.width / 2;
  const anchorCenterY = triggerRect.top + triggerRect.height / 2;
  const originX = arrowCenter ?? anchorCenterX - placement.left;
  const originY = arrowCenter ?? anchorCenterY - placement.top;

  switch (placement.side) {
    case "bottom":
      return `${originX}px ${-sideOffset}px`;
    case "top":
      return `${originX}px calc(100% + ${sideOffset}px)`;
    case "right":
      return `${-sideOffset}px ${originY}px`;
    case "left":
      return `calc(100% + ${sideOffset}px) ${originY}px`;
  }
}
