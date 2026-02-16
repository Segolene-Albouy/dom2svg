import { describe, it, expect } from "vitest";
import { parseTransform } from "./parse.js";

describe("parseTransform", () => {
  it("returns empty array for none", () => {
    expect(parseTransform("none")).toEqual([]);
    expect(parseTransform("")).toEqual([]);
  });

  it("parses translate(x, y)", () => {
    const result = parseTransform("translate(10px, 20px)");
    expect(result).toEqual([{ type: "translate", x: 10, y: 20 }]);
  });

  it("parses translate with single value", () => {
    const result = parseTransform("translate(10px)");
    expect(result).toEqual([{ type: "translate", x: 10, y: 0 }]);
  });

  it("parses translateX", () => {
    const result = parseTransform("translateX(5px)");
    expect(result).toEqual([{ type: "translate", x: 5, y: 0 }]);
  });

  it("parses translateY", () => {
    const result = parseTransform("translateY(8px)");
    expect(result).toEqual([{ type: "translate", x: 0, y: 8 }]);
  });

  it("parses scale(x, y)", () => {
    const result = parseTransform("scale(2, 3)");
    expect(result).toEqual([{ type: "scale", x: 2, y: 3 }]);
  });

  it("parses scale with single value", () => {
    const result = parseTransform("scale(0.5)");
    expect(result).toEqual([{ type: "scale", x: 0.5, y: 0.5 }]);
  });

  it("parses rotate", () => {
    const result = parseTransform("rotate(45deg)");
    expect(result).toEqual([{ type: "rotate", angle: 45 }]);
  });

  it("parses rotate in radians", () => {
    const result = parseTransform("rotate(3.14159rad)");
    expect(result[0]!.type).toBe("rotate");
    expect((result[0] as any).angle).toBeCloseTo(180, 1);
  });

  it("parses skewX", () => {
    const result = parseTransform("skewX(30deg)");
    expect(result).toEqual([{ type: "skewX", angle: 30 }]);
  });

  it("parses skewY", () => {
    const result = parseTransform("skewY(15deg)");
    expect(result).toEqual([{ type: "skewY", angle: 15 }]);
  });

  it("parses matrix", () => {
    const result = parseTransform("matrix(1, 0, 0, 1, 10, 20)");
    expect(result).toEqual([
      { type: "matrix", values: [1, 0, 0, 1, 10, 20] },
    ]);
  });

  it("parses chained transforms", () => {
    const result = parseTransform("translate(10px, 0px) rotate(45deg) scale(2)");
    expect(result).toHaveLength(3);
    expect(result[0]!.type).toBe("translate");
    expect(result[1]!.type).toBe("rotate");
    expect(result[2]!.type).toBe("scale");
  });

  it("parses scaleX", () => {
    const result = parseTransform("scaleX(2)");
    expect(result).toEqual([{ type: "scale", x: 2, y: 1 }]);
  });

  it("parses scaleY", () => {
    const result = parseTransform("scaleY(0.5)");
    expect(result).toEqual([{ type: "scale", x: 1, y: 0.5 }]);
  });

  it("parses rotate with no unit (assumes degrees)", () => {
    const result = parseTransform("rotate(90)");
    expect(result[0]!.type).toBe("rotate");
    expect((result[0] as any).angle).toBe(90);
  });

  it("parses matrix with decimal values", () => {
    const result = parseTransform("matrix(0.866, 0.5, -0.5, 0.866, 0, 0)");
    expect(result).toHaveLength(1);
    expect(result[0]!.type).toBe("matrix");
    expect((result[0] as any).values[0]).toBeCloseTo(0.866);
    expect((result[0] as any).values[1]).toBeCloseTo(0.5);
  });

  it("parses translate with negative values", () => {
    const result = parseTransform("translate(-10px, -20px)");
    expect(result).toEqual([{ type: "translate", x: -10, y: -20 }]);
  });

  it("handles whitespace between transform functions", () => {
    const result = parseTransform("  translate(10px, 0px)   rotate(45deg)  ");
    expect(result).toHaveLength(2);
  });

  it("skew(x, y) is not supported (browsers decompose to matrix)", () => {
    const result = parseTransform("skew(10deg, 20deg)");
    expect(result).toHaveLength(0);
  });

  it("parses rotate in turns", () => {
    const result = parseTransform("rotate(0.25turn)");
    expect(result[0]!.type).toBe("rotate");
    expect((result[0] as any).angle).toBeCloseTo(90, 0);
  });
});
