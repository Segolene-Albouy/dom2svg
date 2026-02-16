import { describe, it, expect } from "vitest";
import { parseDropShadow, parseCssFilterFunctions } from "./filters.js";

describe("parseDropShadow", () => {
  it("returns null for non-drop-shadow values", () => {
    expect(parseDropShadow("none")).toBeNull();
    expect(parseDropShadow("blur(5px)")).toBeNull();
    expect(parseDropShadow("")).toBeNull();
  });

  it("parses basic drop-shadow with named color", () => {
    const result = parseDropShadow("drop-shadow(2px 4px 6px black)");
    expect(result).not.toBeNull();
    expect(result!.offsetX).toBe(2);
    expect(result!.offsetY).toBe(4);
    expect(result!.blur).toBe(6);
    expect(result!.color).toBe("black");
  });

  it("parses drop-shadow without blur", () => {
    const result = parseDropShadow("drop-shadow(2px 4px red)");
    expect(result).not.toBeNull();
    expect(result!.offsetX).toBe(2);
    expect(result!.offsetY).toBe(4);
    expect(result!.blur).toBe(0);
    expect(result!.color).toBe("red");
  });

  it("parses drop-shadow with rgba color", () => {
    const result = parseDropShadow(
      "drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.5))",
    );
    expect(result).not.toBeNull();
    expect(result!.offsetX).toBe(2);
    expect(result!.offsetY).toBe(4);
    expect(result!.blur).toBe(6);
    expect(result!.color).toBe("rgba(0, 0, 0, 0.5)");
  });

  it("parses drop-shadow with rgb color", () => {
    const result = parseDropShadow(
      "drop-shadow(1px 2px 3px rgb(255, 0, 128))",
    );
    expect(result).not.toBeNull();
    expect(result!.offsetX).toBe(1);
    expect(result!.offsetY).toBe(2);
    expect(result!.blur).toBe(3);
    expect(result!.color).toBe("rgb(255, 0, 128)");
  });

  it("parses negative offsets", () => {
    const result = parseDropShadow("drop-shadow(-2px -4px 6px black)");
    expect(result).not.toBeNull();
    expect(result!.offsetX).toBe(-2);
    expect(result!.offsetY).toBe(-4);
  });

  it("parses drop-shadow with only offsets", () => {
    const result = parseDropShadow("drop-shadow(5px 10px)");
    expect(result).not.toBeNull();
    expect(result!.offsetX).toBe(5);
    expect(result!.offsetY).toBe(10);
    expect(result!.blur).toBe(0);
  });

  it("handles decimal values", () => {
    const result = parseDropShadow("drop-shadow(0.5px 1.5px 2.5px black)");
    expect(result).not.toBeNull();
    expect(result!.offsetX).toBeCloseTo(0.5);
    expect(result!.offsetY).toBeCloseTo(1.5);
    expect(result!.blur).toBeCloseTo(2.5);
  });

  it("handles zero values", () => {
    const result = parseDropShadow("drop-shadow(0 0 0 black)");
    expect(result).not.toBeNull();
    expect(result!.offsetX).toBe(0);
    expect(result!.offsetY).toBe(0);
    expect(result!.blur).toBe(0);
  });
});

describe("parseCssFilterFunctions", () => {
  it("returns empty for none", () => {
    expect(parseCssFilterFunctions("none")).toEqual([]);
  });

  it("parses single blur", () => {
    const result = parseCssFilterFunctions("blur(5px)");
    expect(result).toEqual([{ name: "blur", args: "5px" }]);
  });

  it("parses single grayscale with %", () => {
    const result = parseCssFilterFunctions("grayscale(50%)");
    expect(result).toEqual([{ name: "grayscale", args: "50%" }]);
  });

  it("parses multiple chained filters", () => {
    const result = parseCssFilterFunctions("blur(2px) brightness(1.5) contrast(0.8)");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: "blur", args: "2px" });
    expect(result[1]).toEqual({ name: "brightness", args: "1.5" });
    expect(result[2]).toEqual({ name: "contrast", args: "0.8" });
  });

  it("handles drop-shadow with nested parentheses (rgba)", () => {
    const result = parseCssFilterFunctions("drop-shadow(2px 4px 6px rgba(0, 0, 0, 0.5))");
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("drop-shadow");
    expect(result[0]!.args).toBe("2px 4px 6px rgba(0, 0, 0, 0.5)");
  });

  it("handles mixed filters including drop-shadow", () => {
    const result = parseCssFilterFunctions("blur(3px) drop-shadow(2px 2px 4px black) grayscale(100%)");
    expect(result).toHaveLength(3);
    expect(result[0]!.name).toBe("blur");
    expect(result[1]!.name).toBe("drop-shadow");
    expect(result[2]!.name).toBe("grayscale");
  });

  it("parses hue-rotate with deg", () => {
    const result = parseCssFilterFunctions("hue-rotate(90deg)");
    expect(result).toEqual([{ name: "hue-rotate", args: "90deg" }]);
  });

  it("parses sepia and invert", () => {
    const result = parseCssFilterFunctions("sepia(0.5) invert(1)");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: "sepia", args: "0.5" });
    expect(result[1]).toEqual({ name: "invert", args: "1" });
  });

  it("returns empty for empty string", () => {
    expect(parseCssFilterFunctions("")).toEqual([]);
  });

  it("parses saturate with percentage", () => {
    const result = parseCssFilterFunctions("saturate(200%)");
    expect(result).toEqual([{ name: "saturate", args: "200%" }]);
  });

  it("parses opacity filter", () => {
    const result = parseCssFilterFunctions("opacity(50%)");
    expect(result).toEqual([{ name: "opacity", args: "50%" }]);
  });

  it("parses brightness with percentage", () => {
    const result = parseCssFilterFunctions("brightness(150%)");
    expect(result).toEqual([{ name: "brightness", args: "150%" }]);
  });

  it("parses contrast", () => {
    const result = parseCssFilterFunctions("contrast(0.5)");
    expect(result).toEqual([{ name: "contrast", args: "0.5" }]);
  });

  it("parses complex chain of all filter types", () => {
    const result = parseCssFilterFunctions(
      "blur(2px) brightness(1.2) contrast(0.9) grayscale(10%) hue-rotate(45deg) invert(0.1) opacity(0.8) saturate(1.5) sepia(0.2) drop-shadow(2px 2px 4px black)"
    );
    expect(result).toHaveLength(10);
    expect(result.map(f => f.name)).toEqual([
      "blur", "brightness", "contrast", "grayscale", "hue-rotate",
      "invert", "opacity", "saturate", "sepia", "drop-shadow",
    ]);
  });

  it("handles filter names case-insensitively", () => {
    const result = parseCssFilterFunctions("Blur(5px)");
    expect(result).toEqual([{ name: "blur", args: "5px" }]);
  });
});
