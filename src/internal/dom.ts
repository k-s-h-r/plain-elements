// Internal DOM attribute primitives shared across components.
// Not part of the public API and not re-exported from src/index.ts.

export function restoreAttribute(
  element: HTMLElement,
  name: string,
  value: string | null
): void {
  if (value === null) {
    element.removeAttribute(name);
    return;
  }

  element.setAttribute(name, value);
}

export function setAttributeIfNeeded(
  element: HTMLElement,
  name: string,
  value: string
): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

export function escapeAttributeValue(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function readTriggerValue(
  element: Element,
  attribute: string
): string | null {
  const raw = element.getAttribute(attribute);

  if (raw === null) {
    return null;
  }

  // React boolean attributes serialize as ="true"; treat as an empty marker.
  if (raw === "" || raw === "true") {
    return "";
  }

  return raw;
}

export type StylePropertySnapshot = {
  value: string;
  priority: string;
};

export function captureStyleProperty(
  element: HTMLElement,
  property: string
): StylePropertySnapshot {
  return {
    value: element.style.getPropertyValue(property),
    priority: element.style.getPropertyPriority(property)
  };
}

export function restoreStyleProperty(
  element: HTMLElement,
  property: string,
  snapshot: StylePropertySnapshot
): void {
  if (snapshot.value === "") {
    element.style.removeProperty(property);
    return;
  }

  element.style.setProperty(property, snapshot.value, snapshot.priority);
}

export type AttributeSnapshot = Record<string, string | null>;

export function captureAttributes(
  element: HTMLElement,
  names: string[]
): AttributeSnapshot {
  const snapshot: AttributeSnapshot = {};

  for (const name of names) {
    snapshot[name] = element.getAttribute(name);
  }

  return snapshot;
}

export function restoreSnapshot(
  element: HTMLElement,
  snapshot: AttributeSnapshot
): void {
  for (const [name, value] of Object.entries(snapshot)) {
    restoreAttribute(element, name, value);
  }
}
