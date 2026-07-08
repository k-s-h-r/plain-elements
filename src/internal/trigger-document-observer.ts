// Shared document-level MutationObserver for external trigger detection.
// One observer per trigger attribute (dialog / popover / tooltip). Not part of
// the public API and not re-exported from src/index.ts.

function nodeTreeContainsTrigger(node: Node, triggerAttribute: string): boolean {
  if (!(node instanceof Element)) {
    return false;
  }

  if (node.hasAttribute(triggerAttribute)) {
    return true;
  }

  return node.querySelector(`[${triggerAttribute}]`) !== null;
}

function recordsAffectTriggers(
  records: MutationRecord[],
  triggerAttribute: string
): boolean {
  for (const record of records) {
    if (record.type === "attributes") {
      return true;
    }

    if (record.type !== "childList") {
      continue;
    }

    for (const node of record.addedNodes) {
      if (nodeTreeContainsTrigger(node, triggerAttribute)) {
        return true;
      }
    }

    for (const node of record.removedNodes) {
      if (nodeTreeContainsTrigger(node, triggerAttribute)) {
        return true;
      }
    }
  }

  return false;
}

export function createTriggerDocumentObserver(triggerAttribute: string): {
  register(key: object, queueRefresh: () => void): void;
  unregister(key: object): void;
  setInvalidTriggerWarningScheduler(scheduler: () => void): void;
  setRefreshRecordFilter(enabled: boolean): void;
} {
  const refreshCallbacks = new Map<object, () => void>();
  let observer: MutationObserver | null = null;
  let warnScheduled = false;
  let scheduleInvalidTriggerWarnings: (() => void) | null = null;
  let filterChildListRecords = false;

  function dispatchRefresh(): void {
    for (const callback of refreshCallbacks.values()) {
      callback();
    }
  }

  function scheduleWarnings(): void {
    if (!scheduleInvalidTriggerWarnings || warnScheduled) {
      return;
    }

    warnScheduled = true;
    queueMicrotask(() => {
      warnScheduled = false;
      scheduleInvalidTriggerWarnings?.();
    });
  }

  function ensureObserver(): void {
    if (observer) {
      return;
    }

    observer = new MutationObserver((records) => {
      const shouldRefresh = filterChildListRecords
        ? recordsAffectTriggers(records, triggerAttribute)
        : true;

      if (shouldRefresh) {
        dispatchRefresh();
      }

      scheduleWarnings();
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [triggerAttribute]
    });
  }

  return {
    register(key: object, queueRefresh: () => void): void {
      refreshCallbacks.set(key, queueRefresh);
      ensureObserver();
      scheduleWarnings();
    },
    unregister(key: object): void {
      refreshCallbacks.delete(key);

      if (refreshCallbacks.size === 0) {
        observer?.disconnect();
        observer = null;
      }
    },
    setInvalidTriggerWarningScheduler(scheduler: () => void): void {
      scheduleInvalidTriggerWarnings = scheduler;
    },
    setRefreshRecordFilter(enabled: boolean): void {
      filterChildListRecords = enabled;
    }
  };
}
