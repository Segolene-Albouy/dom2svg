import { describe, it, expect } from "vitest";
import { parseClipPath } from "./clip-path.js";

describe("parseClipPath", () => {
  it("returns null for none", () => {
    expect(parseClipPath("none")).toBeNull();
    expect(parseClipPath("")).toBeNull();
  });

  it("parses inset()", () => {
    const result = parseClipPath("inset(10px 20px 30px 40px)");
    expect(result).toEqual({ type: "inset", top: 10, right: 20, bottom: 30, left: 40 });
  });

  it("parses inset() with round", () => {
    const result = parseClipPath("inset(10px round 5px)");
    expect(result).toEqual({ type: "inset", top: 10, right: 10, bottom: 10, left: 10, round: "5px" });
  });

  it("parses circle()", () => {
    const result = parseClipPath("circle(50px at 100px 100px)");
    expect(result).toEqual({ type: "circle", radius: 50, cx: 100, cy: 100 });
  });

  it("parses ellipse()", () => {
    const result = parseClipPath("ellipse(100px 50px at 150px 75px)");
    expect(result).toEqual({ type: "ellipse", rx: 100, ry: 50, cx: 150, cy: 75 });
  });

  it("parses polygon()", () => {
    const result = parseClipPath("polygon(50px 0px, 100px 100px, 0px 100px)");
    expect(result).toEqual({
      type: "polygon",
      points: [[50, 0], [100, 100], [0, 100]],
    });
  });

  it("parses path()", () => {
    const result = parseClipPath('path("M 0 0 L 100 0 L 100 100 Z")');
    expect(result).toEqual({ type: "path", d: "M 0 0 L 100 0 L 100 100 Z" });
  });

  it("parses inset() with shorthand values", () => {
    const result = parseClipPath("inset(10px)");
    expect(result).toEqual({ type: "inset", top: 10, right: 10, bottom: 10, left: 10 });
  });

  it("parses inset() with two values", () => {
    const result = parseClipPath("inset(10px 20px)");
    expect(result).toEqual({ type: "inset", top: 10, right: 20, bottom: 10, left: 20 });
  });
});
