import { describe, it, expect } from "vitest";
import { cleanFontFamily } from "./fonts.js";

describe("cleanFontFamily", () => {
  it("strips double quotes", () => {
    expect(cleanFontFamily('"Arial"')).toBe("Arial");
  });

  it("strips single quotes", () => {
    expect(cleanFontFamily("'Helvetica Neue'")).toBe("Helvetica Neue");
  });

  it("takes first family from comma-separated list", () => {
    expect(cleanFontFamily('"Inter", sans-serif')).toBe("Inter");
  });

  it("handles unquoted family name", () => {
    expect(cleanFontFamily("Arial")).toBe("Arial");
  });

  it("handles complex font stack", () => {
    expect(
      cleanFontFamily('"Segoe UI", Roboto, "Helvetica Neue", sans-serif'),
    ).toBe("Segoe UI");
  });

  it("trims whitespace", () => {
    expect(cleanFontFamily('  "Inter"  , sans-serif')).toBe("Inter");
  });

  it("handles empty string", () => {
    expect(cleanFontFamily("")).toBe("");
  });
});
