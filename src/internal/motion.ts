// Internal motion primitives shared by animated components.
// Not part of the public API and not re-exported from src/index.ts.

export function setTemporaryStyle(
  element: HTMLElement,
  property: string,
  value: string
): () => void {
  const previousValue = element.style.getPropertyValue(property);
  const previousPriority = element.style.getPropertyPriority(property);

  element.style.setProperty(property, value);

  return () => {
    if (previousValue === "") {
      element.style.removeProperty(property);
      return;
    }

    element.style.setProperty(property, previousValue, previousPriority);
  };
}

export function getFiniteAnimations(element: HTMLElement): Animation[] {
  return element.getAnimations().filter((animation) => {
    const endTime = animation.effect?.getComputedTiming().endTime;
    return typeof endTime === "number" && Number.isFinite(endTime) && endTime > 0;
  });
}

export function waitForAnimations(
  element: HTMLElement,
  onComplete: () => void,
  isCancelled: () => boolean
): void {
  const watch = (allowRetry: boolean): void => {
    if (isCancelled()) {
      return;
    }

    const animations = getFiniteAnimations(element);

    if (animations.length > 0) {
      void Promise.allSettled(animations.map((animation) => animation.finished)).then(
        () => {
          if (!isCancelled()) {
            onComplete();
          }
        }
      );
      return;
    }

    if (allowRetry) {
      window.requestAnimationFrame(() => watch(false));
      return;
    }

    onComplete();
  };

  window.requestAnimationFrame(() => watch(true));
}
