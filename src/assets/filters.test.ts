import { describe, it, expect } from "vitest";
import { parseDropShadow } from "./filters.js";

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
