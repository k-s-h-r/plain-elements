// Shared document readiness helper for deferring validation during parse.
// Not part of the public API and not re-exported from src/index.ts.

export function isDocumentLoading(): boolean {
  return document.readyState === "loading";
}
