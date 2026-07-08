import { expect, expectTypeOf, test } from "vitest";
import type {
  AccordionEventDetail,
  CollapsibleEventDetail,
  DialogEventDetail,
  PopoverEventDetail,
  TabsEventDetail,
  TooltipEventDetail
} from "../src/index";
import "../src/index";

// These assertions fail to compile unless the GlobalEventHandlersEventMap
// augmentation in each component narrows the listener event to a typed
// CustomEvent. They document the primary DX win: no cast needed when
// listening on document/window/elements.

test("infers detail types for pe-* events on document listeners", () => {
  document.addEventListener("pe-dialog:open", (event) => {
    expectTypeOf(event).toEqualTypeOf<CustomEvent<DialogEventDetail>>();
  });
  document.addEventListener("pe-dialog:close", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<DialogEventDetail>();
  });
  document.addEventListener("pe-dialog:cancel", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<DialogEventDetail>();
  });
  document.addEventListener("pe-popover:open", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<PopoverEventDetail>();
  });
  document.addEventListener("pe-popover:close", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<PopoverEventDetail>();
  });
  document.addEventListener("pe-tooltip:open", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<TooltipEventDetail>();
  });
  document.addEventListener("pe-tooltip:close", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<TooltipEventDetail>();
  });
  document.addEventListener("pe-collapsible:open", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<CollapsibleEventDetail>();
  });
  document.addEventListener("pe-collapsible:close", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<CollapsibleEventDetail>();
  });
  document.addEventListener("pe-accordion:open", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<AccordionEventDetail>();
  });
  document.addEventListener("pe-accordion:close", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<AccordionEventDetail>();
  });
  document.addEventListener("pe-tabs:change", (event) => {
    expectTypeOf(event.detail).toEqualTypeOf<TabsEventDetail>();
  });

  expect(true).toBe(true);
});

test("delivers a typed detail to a document listener at runtime", async () => {
  document.body.innerHTML = `
    <pe-tabs>
      <div data-tabs-list aria-label="Account">
        <button data-tabs-trigger="profile">Profile</button>
        <button data-tabs-trigger="security">Security</button>
      </div>
      <section data-tabs-content="profile">Profile panel</section>
      <section data-tabs-content="security">Security panel</section>
    </pe-tabs>
  `;

  await customElements.whenDefined("pe-tabs");

  let received: string | null | undefined;
  const onChange = (event: CustomEvent<TabsEventDetail>) => {
    // No cast required: event is inferred as CustomEvent<TabsEventDetail>.
    received = event.detail.value;
  };
  document.addEventListener("pe-tabs:change", onChange);

  const security = document.querySelector<HTMLButtonElement>(
    "[data-tabs-trigger='security']"
  );
  security?.click();

  document.removeEventListener("pe-tabs:change", onChange);
  expect(received).toBe("security");
});
