import { describe, it, expect } from "vitest";
import { parseLinearGradient } from "./gradients.js";

describe("parseLinearGradient", () => {
  it("returns null for non-gradient values", () => {
    expect(parseLinearGradient("none")).toBeNull();
    expect(parseLinearGradient("url(image.png)")).toBeNull();
  });

  it("parses simple two-color gradient", () => {
    const result = parseLinearGradient("linear-gradient(red, blue)");
    expect(result).not.toBeNull();
    expect(result!.angle).toBe(180); // default: to bottom
    expect(result!.stops).toHaveLength(2);
    expect(result!.stops[0]!.color).toBe("red");
    expect(result!.stops[0]!.position).toBe(0);
    expect(result!.stops[1]!.color).toBe("blue");
    expect(result!.stops[1]!.position).toBe(1);
  });

  it("parses gradient with direction", () => {
    const result = parseLinearGradient("linear-gradient(to right, red, blue)");
    expect(result).not.toBeNull();
    expect(result!.angle).toBe(90);
  });

  it("parses gradient with angle", () => {
    const result = parseLinearGradient("linear-gradient(45deg, red, blue)");
    expect(result).not.toBeNull();
    expect(result!.angle).toBe(45);
  });

  it("parses gradient with percentage stops", () => {
    const result = parseLinearGradient(
      "linear-gradient(red 0%, green 50%, blue 100%)",
    );
    expect(result).not.toBeNull();
    expect(result!.stops).toHaveLength(3);
    expect(result!.stops[1]!.color).toBe("green");
    expect(result!.stops[1]!.position).toBe(0.5);
  });

  it("parses gradient with rgb colors", () => {
    const result = parseLinearGradient(
      "linear-gradient(rgb(255, 0, 0), rgb(0, 0, 255))",
    );
    expect(result).not.toBeNull();
    expect(result!.stops).toHaveLength(2);
    expect(result!.stops[0]!.color).toBe("rgb(255, 0, 0)");
  });

  it("parses to top direction", () => {
    const result = parseLinearGradient("linear-gradient(to top, red, blue)");
    expect(result!.angle).toBe(0);
  });

  it("parses to bottom right direction", () => {
    const result = parseLinearGradient(
      "linear-gradient(to bottom right, red, blue)",
    );
    expect(result!.angle).toBe(135);
  });

  it("parses gradient with modern CSS color syntax (spaces in functions)", () => {
    const result = parseLinearGradient(
      "linear-gradient(hsl(120deg 50% 50%) 25%, hsl(240deg 50% 50%) 75%)",
    );
    expect(result).not.toBeNull();
    expect(result!.stops).toHaveLength(2);
    expect(result!.stops[0]!.color).toBe("hsl(120deg 50% 50%)");
    expect(result!.stops[0]!.position).toBe(0.25);
    expect(result!.stops[1]!.color).toBe("hsl(240deg 50% 50%)");
    expect(result!.stops[1]!.position).toBe(0.75);
  });

  it("parses gradient with rgba and position", () => {
    const result = parseLinearGradient(
      "linear-gradient(rgba(255, 0, 0, 0.5) 50%, blue)",
    );
    expect(result).not.toBeNull();
    expect(result!.stops[0]!.color).toBe("rgba(255, 0, 0, 0.5)");
    expect(result!.stops[0]!.position).toBe(0.5);
  });
});
