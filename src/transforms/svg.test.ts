import { describe, it, expect } from "vitest";
import { cssTransformToSvg } from "./svg.js";

describe("cssTransformToSvg", () => {
  const box = { x: 0, y: 0, width: 100, height: 100 };

  it("returns null for none", () => {
    expect(cssTransformToSvg("none", "50% 50%", box)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(cssTransformToSvg("", "50% 50%", box)).toBeNull();
  });

  it("returns a matrix string for translate", () => {
    const result = cssTransformToSvg("translate(10px, 20px)", "0 0", box);
    expect(result).not.toBeNull();
    // With origin at (0,0), translate(10,20) → matrix(1,0,0,1,10,20)
    expect(result).toContain("matrix(");
    expect(result).toContain("10.0");
    expect(result).toContain("20.0");
  });

  it("handles transform-origin center (default 50% 50%)", () => {
    // scale(2) with origin at center of 100x100 box = (50,50)
    // translate(50,50) * scale(2,2) * translate(-50,-50)
    const result = cssTransformToSvg("scale(2)", "50% 50%", box);
    expect(result).not.toBeNull();
    // The result matrix should be [2,0,0,2,-50,-50]
    expect(result).toContain("2.000000");
    expect(result).toContain("-50.000000");
  });

  it("handles pixel transform-origin", () => {
    const result = cssTransformToSvg("rotate(90deg)", "0px 0px", box);
    expect(result).not.toBeNull();
  });

  it("handles keyword transform-origin", () => {
    const result = cssTransformToSvg("scale(2)", "left top", box);
    expect(result).not.toBeNull();
    // Origin at (0,0) for left top → just scale(2,2) → matrix(2,0,0,2,0,0)
    expect(result).toContain("2.000000");
  });

  it("returns null for identity transform", () => {
    // translate(0,0) is identity
    expect(cssTransformToSvg("translate(0px, 0px)", "0 0", box)).toBeNull();
  });

  it("handles chained transforms", () => {
    const result = cssTransformToSvg(
      "translate(10px, 0px) scale(2)",
      "0 0",
      box,
    );
    expect(result).not.toBeNull();
  });

  it("handles box offset in transform-origin", () => {
    const offsetBox = { x: 50, y: 50, width: 100, height: 100 };
    const result = cssTransformToSvg("scale(2)", "50% 50%", offsetBox);
    expect(result).not.toBeNull();
    // Origin should be at (50 + 50, 50 + 50) = (100, 100)
    // translate(100,100) * scale(2) * translate(-100,-100) = [2,0,0,2,-100,-100]
    expect(result).toContain("-100.000000");
  });
});
