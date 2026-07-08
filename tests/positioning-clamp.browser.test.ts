import { afterEach, expect, test } from "vitest";
import "../src/popover";
import "../src/tooltip";

// Characterization tests: freeze the viewport-clamp behavior for content that
// is larger than the viewport before the floating-position geometry is
// extracted into a shared internal module. Both Popover and Tooltip must keep
// clamping such content to the collision padding on both axes.

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 20));
  await Promise.resolve();
}

afterEach(() => {
  document.body.replaceChildren();
});

test("popover clamps oversized content to the collision padding", async () => {
  document.body.innerHTML = `
    <pe-popover
      data-popover-side="bottom"
      data-popover-offset="0"
      data-popover-collision-padding="7"
    >
      <button
        type="button"
        data-popover-trigger
        style="position: fixed; left: 40px; top: 40px; width: 80px; height: 30px"
      >Open</button>
      <div
        data-popover-content
        aria-label="Oversized"
        hidden
        style="width: 100000px; height: 100000px; box-sizing: border-box"
      >Content</div>
    </pe-popover>
  `;

  const trigger = document.querySelector("button") as HTMLButtonElement;
  const content = document.querySelector("[data-popover-content]") as HTMLElement;

  trigger.click();
  await settle();

  expect(content.style.left).toBe("7px");
  expect(content.style.top).toBe("7px");
});

test("tooltip clamps oversized content to the collision padding", async () => {
  document.body.innerHTML = `
    <button
      type="button"
      data-tooltip-trigger="big-tip"
      style="position: fixed; left: 40px; top: 40px; width: 80px; height: 30px;"
    >Save</button>
    <pe-tooltip
      id="big-tip"
      data-tooltip-side="bottom"
      data-tooltip-offset="0"
      data-tooltip-collision-padding="7"
    >
      <span
        data-tooltip-content
        style="display: block; width: 100000px; height: 100000px;"
      >Saved changes are published.</span>
    </pe-tooltip>
  `;

  await customElements.whenDefined("pe-tooltip");

  const trigger = document.querySelector<HTMLButtonElement>(
    "[data-tooltip-trigger='big-tip']"
  );
  const content = document.querySelector<HTMLElement>("[data-tooltip-content]");

  trigger?.focus();
  await settle();

  expect(content?.style.left).toBe("7px");
  expect(content?.style.top).toBe("7px");
});
