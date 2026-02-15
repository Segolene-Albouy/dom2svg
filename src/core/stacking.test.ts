import { describe, it, expect } from "vitest";
import { getSortedPaintOrder } from "./stacking.js";
import type { StackingContext, StackingContextChild } from "../types.js";

// Helper to build a mock stacking context for testing sort order
function mockContext(children: StackingContextChild[]): StackingContext {
  return {
    element: null as any,
    children,
    zIndex: 0,
    opacity: 1,
  };
}

function mockStackingChild(zIndex: number): StackingContextChild {
  return {
    type: "stacking-context",
    context: {
      element: null as any,
      children: [],
      zIndex,
      opacity: 1,
    },
  };
}

function mockPositioned(zIndex: number): StackingContextChild {
  return {
    type: "positioned",
    element: null as any,
    zIndex,
  };
}

function mockBlock(): StackingContextChild {
  return { type: "block", element: null as any };
}

function mockFloat(): StackingContextChild {
  return { type: "float", element: null as any };
}

function mockInline(): StackingContextChild {
  return { type: "inline", element: null as any };
}

describe("getSortedPaintOrder", () => {
  it("returns empty for empty context", () => {
    const ctx = mockContext([]);
    expect(getSortedPaintOrder(ctx)).toEqual([]);
  });

  it("sorts layers in CSS 2.1 painting order", () => {
    const neg = mockStackingChild(-1);
    const block = mockBlock();
    const float = mockFloat();
    const inline = mockInline();
    const zero = mockStackingChild(0);
    const pos = mockStackingChild(1);

    // Deliberately add in wrong order
    const ctx = mockContext([pos, inline, neg, block, zero, float]);
    const sorted = getSortedPaintOrder(ctx);

    expect(sorted[0]).toBe(neg);       // Layer 1: negative z-index
    expect(sorted[1]).toBe(block);     // Layer 2: blocks
    expect(sorted[2]).toBe(float);     // Layer 3: floats
    expect(sorted[3]).toBe(inline);    // Layer 4: inlines
    expect(sorted[4]).toBe(zero);      // Layer 5: z-index 0/auto
    expect(sorted[5]).toBe(pos);       // Layer 6: positive z-index
  });

  it("sorts negative z-index children by z-index ascending", () => {
    const neg10 = mockStackingChild(-10);
    const neg1 = mockStackingChild(-1);
    const neg5 = mockStackingChild(-5);

    const ctx = mockContext([neg1, neg10, neg5]);
    const sorted = getSortedPaintOrder(ctx);

    expect(sorted[0]).toBe(neg10);
    expect(sorted[1]).toBe(neg5);
    expect(sorted[2]).toBe(neg1);
  });

  it("sorts positive z-index children by z-index ascending", () => {
    const pos1 = mockStackingChild(1);
    const pos10 = mockStackingChild(10);
    const pos5 = mockStackingChild(5);

    const ctx = mockContext([pos10, pos1, pos5]);
    const sorted = getSortedPaintOrder(ctx);

    expect(sorted[0]).toBe(pos1);
    expect(sorted[1]).toBe(pos5);
    expect(sorted[2]).toBe(pos10);
  });

  it("positioned elements go to correct layer based on z-index", () => {
    const posNeg = mockPositioned(-1);
    const posZero = mockPositioned(0);
    const posPos = mockPositioned(5);
    const block = mockBlock();

    const ctx = mockContext([posPos, block, posNeg, posZero]);
    const sorted = getSortedPaintOrder(ctx);

    // Layer order: negativeZ, blocks, floats, inlines, zeroAuto, positiveZ
    expect(sorted[0]).toBe(posNeg);
    expect(sorted[1]).toBe(block);
    expect(sorted[2]).toBe(posZero);
    expect(sorted[3]).toBe(posPos);
  });

  it("preserves DOM order within same layer", () => {
    const block1 = mockBlock();
    const block2 = mockBlock();
    const block3 = mockBlock();

    const ctx = mockContext([block1, block2, block3]);
    const sorted = getSortedPaintOrder(ctx);

    expect(sorted[0]).toBe(block1);
    expect(sorted[1]).toBe(block2);
    expect(sorted[2]).toBe(block3);
  });
});
