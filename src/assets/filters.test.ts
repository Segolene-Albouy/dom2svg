import { describe, it, expect } from "vitest";

// Since createDropShadowFilter requires a full RenderContext with DOM,
// we test the parsing logic indirectly. The main logic is in the
// parseDropShadow internal function. We can at least verify the module loads.
describe("filters module", () => {
  it("exports createDropShadowFilter", async () => {
    const mod = await import("./filters.js");
    expect(typeof mod.createDropShadowFilter).toBe("function");
  });
});
