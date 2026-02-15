import { describe, it, expect } from "vitest";
import { parseTextShadows } from "./text-shadow.js";

describe("parseTextShadows", () => {
  it("returns empty array for none", () => {
    expect(parseTextShadows("none")).toEqual([]);
    expect(parseTextShadows("")).toEqual([]);
  });

  it("parses a simple shadow", () => {
    const result = parseTextShadows("2px 4px 6px rgba(0, 0, 0, 0.5)");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      offsetX: 2,
      offsetY: 4,
      blur: 6,
      color: "rgba(0, 0, 0, 0.5)",
    });
  });

  it("parses shadow without blur", () => {
    const result = parseTextShadows("1px 2px red");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      offsetX: 1,
      offsetY: 2,
      blur: 0,
      color: "red",
    });
  });

  it("parses multiple shadows", () => {
    const result = parseTextShadows("1px 1px 2px black, 0 0 8px rgba(0, 0, 255, 0.5)");
    expect(result).toHaveLength(2);
    expect(result[0]!.color).toBe("black");
    expect(result[1]!.color).toBe("rgba(0, 0, 255, 0.5)");
    expect(result[1]!.blur).toBe(8);
  });

  it("parses shadow with only offsets", () => {
    const result = parseTextShadows("3px 5px");
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      offsetX: 3,
      offsetY: 5,
      blur: 0,
      color: "rgba(0, 0, 0, 0.5)",
    });
  });

  it("parses negative offsets", () => {
    const result = parseTextShadows("-2px -3px 4px white");
    expect(result).toHaveLength(1);
    expect(result[0]!.offsetX).toBe(-2);
    expect(result[0]!.offsetY).toBe(-3);
  });
});
