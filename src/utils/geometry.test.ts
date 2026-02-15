import { describe, it, expect } from "vitest";
import { boxesIntersect, expandBox } from "./geometry.js";

describe("boxesIntersect", () => {
  it("returns true for overlapping boxes", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 50, width: 100, height: 100 };
    expect(boxesIntersect(a, b)).toBe(true);
  });

  it("returns true for contained box", () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 10, y: 10, width: 20, height: 20 };
    expect(boxesIntersect(a, b)).toBe(true);
  });

  it("returns false for non-overlapping boxes (horizontal)", () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 100, y: 0, width: 50, height: 50 };
    expect(boxesIntersect(a, b)).toBe(false);
  });

  it("returns false for non-overlapping boxes (vertical)", () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 0, y: 100, width: 50, height: 50 };
    expect(boxesIntersect(a, b)).toBe(false);
  });

  it("returns false for touching edges (not overlapping)", () => {
    const a = { x: 0, y: 0, width: 50, height: 50 };
    const b = { x: 50, y: 0, width: 50, height: 50 };
    expect(boxesIntersect(a, b)).toBe(false);
  });

  it("a zero-size point inside a box counts as intersecting", () => {
    const a = { x: 10, y: 10, width: 0, height: 0 };
    const b = { x: 0, y: 0, width: 100, height: 100 };
    // A degenerate point at (10,10) is geometrically inside b
    expect(boxesIntersect(a, b)).toBe(true);
  });

  it("a zero-size point outside a box does not intersect", () => {
    const a = { x: 200, y: 200, width: 0, height: 0 };
    const b = { x: 0, y: 0, width: 100, height: 100 };
    expect(boxesIntersect(a, b)).toBe(false);
  });

  it("handles negative coordinates", () => {
    const a = { x: -50, y: -50, width: 100, height: 100 };
    const b = { x: -10, y: -10, width: 20, height: 20 };
    expect(boxesIntersect(a, b)).toBe(true);
  });
});

describe("expandBox", () => {
  it("expands box by padding", () => {
    const box = { x: 10, y: 20, width: 100, height: 50 };
    const result = expandBox(box, 5);
    expect(result).toEqual({ x: 5, y: 15, width: 110, height: 60 });
  });

  it("handles zero padding", () => {
    const box = { x: 10, y: 20, width: 100, height: 50 };
    expect(expandBox(box, 0)).toEqual(box);
  });

  it("handles negative padding (shrink)", () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    const result = expandBox(box, -10);
    expect(result).toEqual({ x: 10, y: 10, width: 80, height: 80 });
  });
});
