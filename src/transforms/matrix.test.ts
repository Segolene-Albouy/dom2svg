import { describe, it, expect } from "vitest";
import {
  identity,
  multiply,
  translate,
  scale,
  rotate,
  inverse,
  isIdentity,
  toSvgTransform,
} from "./matrix.js";

describe("Matrix operations", () => {
  it("identity is [1,0,0,1,0,0]", () => {
    expect(identity()).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("isIdentity returns true for identity", () => {
    expect(isIdentity(identity())).toBe(true);
  });

  it("isIdentity returns false for non-identity", () => {
    expect(isIdentity([1, 0, 0, 1, 1, 0])).toBe(false);
  });

  it("multiplying identity preserves the matrix", () => {
    const m = translate(10, 20);
    expect(multiply(identity(), m)).toEqual(m);
    expect(multiply(m, identity())).toEqual(m);
  });

  it("translate creates correct matrix", () => {
    const m = translate(5, 10);
    expect(m).toEqual([1, 0, 0, 1, 5, 10]);
  });

  it("scale creates correct matrix", () => {
    const m = scale(2, 3);
    expect(m).toEqual([2, 0, 0, 3, 0, 0]);
  });

  it("rotation by 0 is identity", () => {
    const m = rotate(0);
    expect(isIdentity(m)).toBe(true);
  });

  it("rotation by 90 degrees", () => {
    const m = rotate(90);
    expect(m[0]).toBeCloseTo(0);
    expect(m[1]).toBeCloseTo(1);
    expect(m[2]).toBeCloseTo(-1);
    expect(m[3]).toBeCloseTo(0);
  });

  it("inverse of identity is identity", () => {
    const inv = inverse(identity());
    expect(inv).not.toBeNull();
    expect(isIdentity(inv!)).toBe(true);
  });

  it("inverse of translation", () => {
    const m = translate(10, 20);
    const inv = inverse(m);
    expect(inv).not.toBeNull();
    const result = multiply(m, inv!);
    expect(isIdentity(result)).toBe(true);
  });

  it("inverse of scale", () => {
    const m = scale(2, 4);
    const inv = inverse(m);
    expect(inv).not.toBeNull();
    const result = multiply(m, inv!);
    expect(result[0]).toBeCloseTo(1);
    expect(result[3]).toBeCloseTo(1);
  });

  it("inverse of singular matrix returns null", () => {
    expect(inverse([0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it("toSvgTransform formats correctly", () => {
    const str = toSvgTransform(identity());
    expect(str).toBe("matrix(1.000000,0.000000,0.000000,1.000000,0.000000,0.000000)");
  });

  it("compound transform: translate then scale", () => {
    const t = translate(10, 0);
    const s = scale(2, 2);
    const result = multiply(t, s);
    // Scale applied first, then translate
    expect(result).toEqual([2, 0, 0, 2, 10, 0]);
  });
});
