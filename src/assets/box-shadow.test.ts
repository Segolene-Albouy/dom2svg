import { describe, it, expect } from "vitest";
import { parseBoxShadows } from "./box-shadow.js";

describe("parseBoxShadows", () => {
  it("returns empty array for none", () => {
    expect(parseBoxShadows("none")).toEqual([]);
    expect(parseBoxShadows("")).toEqual([]);
  });

  it("parses a simple shadow", () => {
    const result = parseBoxShadows("2px 4px 6px rgba(0, 0, 0, 0.5)");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      inset: false,
      offsetX: 2,
      offsetY: 4,
      blur: 6,
      spread: 0,
      color: "rgba(0, 0, 0, 0.5)",
    });
  });

  it("parses shadow with spread", () => {
    const result = parseBoxShadows("1px 2px 3px 4px red");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      inset: false,
      offsetX: 1,
      offsetY: 2,
      blur: 3,
      spread: 4,
      color: "red",
    });
  });

  it("parses inset shadow (prefix)", () => {
    const result = parseBoxShadows("inset 0 2px 4px rgba(0, 0, 0, 0.2)");
    expect(result).toHaveLength(1);
    expect(result[0]!.inset).toBe(true);
    expect(result[0]!.offsetX).toBe(0);
    expect(result[0]!.offsetY).toBe(2);
    expect(result[0]!.blur).toBe(4);
  });

  it("parses multiple shadows", () => {
    const result = parseBoxShadows("2px 2px 4px red, 0 0 8px blue");
    expect(result).toHaveLength(2);
    expect(result[0]!.color).toBe("red");
    expect(result[1]!.color).toBe("blue");
  });

  it("parses negative offset values", () => {
    const result = parseBoxShadows("-3px -5px 10px black");
    expect(result).toHaveLength(1);
    expect(result[0]!.offsetX).toBe(-3);
    expect(result[0]!.offsetY).toBe(-5);
  });

  it("handles rgba color with commas inside parens", () => {
    const result = parseBoxShadows("0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)");
    expect(result).toHaveLength(2);
    expect(result[0]!.color).toBe("rgba(0, 0, 0, 0.1)");
    expect(result[1]!.color).toBe("rgba(0, 0, 0, 0.06)");
  });

  it("parses shadow with only offset (no blur/spread/color)", () => {
    const result = parseBoxShadows("5px 10px");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      inset: false,
      offsetX: 5,
      offsetY: 10,
      blur: 0,
      spread: 0,
      color: "rgba(0, 0, 0, 0.3)",
    });
  });
});
