// Internal warn-once factory shared across components.
// Not part of the public API and not re-exported from src/index.ts.

export function createWarnOnce(prefix: string): (message: string) => void {
  const warned = new Set<string>();

  return (message: string): void => {
    if (warned.has(message)) {
      return;
    }

    warned.add(message);
    console.warn(`${prefix} ${message}`);
  };
}
