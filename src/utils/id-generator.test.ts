import { describe, it, expect, beforeEach } from "vitest";
import { createIdGenerator, resetIdCounter } from "./id-generator.js";

describe("createIdGenerator", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("generates sequential IDs with default prefix", () => {
    const gen = createIdGenerator();
    expect(gen.next()).toBe("d2s-0");
    expect(gen.next()).toBe("d2s-1");
    expect(gen.next()).toBe("d2s-2");
  });

  it("uses custom prefix", () => {
    const gen = createIdGenerator();
    expect(gen.next("mask")).toBe("mask-0");
    expect(gen.next("grad")).toBe("grad-1");
    expect(gen.next("svg")).toBe("svg-2");
  });

  it("counter is shared across prefix changes", () => {
    const gen = createIdGenerator();
    gen.next("a");
    gen.next("b");
    expect(gen.next("c")).toBe("c-2");
  });

  it("separate generators share the global counter to avoid ID collisions", () => {
    const gen1 = createIdGenerator();
    const gen2 = createIdGenerator();
    expect(gen1.next()).toBe("d2s-0");
    expect(gen2.next()).toBe("d2s-1");
    gen1.next();
    gen1.next();
    expect(gen1.next()).toBe("d2s-4");
    expect(gen2.next()).toBe("d2s-5");
  });
});
