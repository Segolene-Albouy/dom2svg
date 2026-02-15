import { describe, it, expect } from "vitest";
import { buildRoundedRectPath } from "./geometry.js";

describe("buildRoundedRectPath", () => {
  it("builds a path with uniform radii", () => {
    const radii = {
      topLeft: [10, 10] as [number, number],
      topRight: [10, 10] as [number, number],
      bottomRight: [10, 10] as [number, number],
      bottomLeft: [10, 10] as [number, number],
    };
    const d = buildRoundedRectPath(0, 0, 100, 50, radii);
    expect(d).toContain("M 10 0");
    expect(d).toContain("A 10 10");
    expect(d).toContain("Z");
  });

  it("builds a path with non-uniform radii", () => {
    const radii = {
      topLeft: [5, 5] as [number, number],
      topRight: [10, 10] as [number, number],
      bottomRight: [15, 15] as [number, number],
      bottomLeft: [20, 20] as [number, number],
    };
    const d = buildRoundedRectPath(10, 20, 100, 50, radii);
    expect(d).toContain("M 15 20"); // x + tlx, y
    expect(d).toContain("A 10 10"); // topRight
    expect(d).toContain("A 15 15"); // bottomRight
    expect(d).toContain("A 20 20"); // bottomLeft
    expect(d).toContain("A 5 5");   // topLeft
  });

  it("skips arcs for zero radii corners", () => {
    const radii = {
      topLeft: [0, 0] as [number, number],
      topRight: [0, 0] as [number, number],
      bottomRight: [0, 0] as [number, number],
      bottomLeft: [0, 0] as [number, number],
    };
    const d = buildRoundedRectPath(0, 0, 100, 50, radii);
    expect(d).not.toContain("A ");
  });
});
