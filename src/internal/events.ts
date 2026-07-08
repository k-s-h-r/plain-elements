// Internal helper for dispatching bubbling, composed custom events.
// Not part of the public API and not re-exported from src/index.ts.

export function dispatchCustomEvent<TDetail>(
  host: HTMLElement,
  type: string,
  detail: TDetail
): void {
  host.dispatchEvent(
    new CustomEvent<TDetail>(type, {
      bubbles: true,
      composed: true,
      detail
    })
  );
}
