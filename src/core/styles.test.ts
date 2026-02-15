import { describe, it, expect } from "vitest";
import {
  isInvisible,
  parseBorders,
  parseBorderRadii,
  hasBorder,
  hasRadius,
  isUniformRadius,
  hasOverflowClip,
  parseBackgroundColor,
  hasBackgroundImage,
  parseOpacity,
  createsStackingContext,
  getZIndex,
  isPositioned,
  isFloat,
  isInlineLevel,
} from "./styles.js";

// Helper to create a mock CSSStyleDeclaration-like object
function mockStyles(overrides: Record<string, string> = {}): CSSStyleDeclaration {
  const defaults: Record<string, string> = {
    display: "block",
    visibility: "visible",
    opacity: "1",
    borderTopWidth: "0px",
    borderTopStyle: "none",
    borderTopColor: "rgb(0, 0, 0)",
    borderRightWidth: "0px",
    borderRightStyle: "none",
    borderRightColor: "rgb(0, 0, 0)",
    borderBottomWidth: "0px",
    borderBottomStyle: "none",
    borderBottomColor: "rgb(0, 0, 0)",
    borderLeftWidth: "0px",
    borderLeftStyle: "none",
    borderLeftColor: "rgb(0, 0, 0)",
    borderTopLeftRadius: "0px",
    borderTopRightRadius: "0px",
    borderBottomRightRadius: "0px",
    borderBottomLeftRadius: "0px",
    overflow: "visible",
    overflowX: "visible",
    overflowY: "visible",
    backgroundColor: "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
    position: "static",
    zIndex: "auto",
    transform: "none",
    filter: "none",
    isolation: "auto",
    mixBlendMode: "normal",
    cssFloat: "none",
  };
  return { ...defaults, ...overrides } as unknown as CSSStyleDeclaration;
}

describe("isInvisible", () => {
  it("returns true for display: none", () => {
    expect(isInvisible(mockStyles({ display: "none" }))).toBe(true);
  });

  it("returns true for visibility: hidden", () => {
    expect(isInvisible(mockStyles({ visibility: "hidden" }))).toBe(true);
  });

  it("returns true for opacity: 0", () => {
    expect(isInvisible(mockStyles({ opacity: "0" }))).toBe(true);
  });

  it("returns false for visible element", () => {
    expect(isInvisible(mockStyles())).toBe(false);
  });

  it("returns false for low but non-zero opacity", () => {
    expect(isInvisible(mockStyles({ opacity: "0.01" }))).toBe(false);
  });
});

describe("parseOpacity", () => {
  it("returns 1 for full opacity", () => {
    expect(parseOpacity(mockStyles({ opacity: "1" }))).toBe(1);
  });

  it("returns 0 for zero opacity", () => {
    expect(parseOpacity(mockStyles({ opacity: "0" }))).toBe(0);
  });

  it("returns 0.5 for half opacity", () => {
    expect(parseOpacity(mockStyles({ opacity: "0.5" }))).toBe(0.5);
  });

  it("returns 1 for invalid opacity", () => {
    expect(parseOpacity(mockStyles({ opacity: "" }))).toBe(1);
    expect(parseOpacity(mockStyles({ opacity: "abc" }))).toBe(1);
  });
});

describe("parseBorders", () => {
  it("parses border widths", () => {
    const borders = parseBorders(
      mockStyles({
        borderTopWidth: "2px",
        borderTopStyle: "solid",
        borderTopColor: "red",
      }),
    );
    expect(borders.top.width).toBe(2);
    expect(borders.top.style).toBe("solid");
    expect(borders.top.color).toBe("red");
  });

  it("defaults to 0 for unparseable width", () => {
    const borders = parseBorders(mockStyles({ borderTopWidth: "thin" }));
    expect(borders.top.width).toBe(0);
  });
});

describe("parseBorderRadii", () => {
  it("parses uniform radius", () => {
    const radii = parseBorderRadii(
      mockStyles({
        borderTopLeftRadius: "8px",
        borderTopRightRadius: "8px",
        borderBottomRightRadius: "8px",
        borderBottomLeftRadius: "8px",
      }),
    );
    expect(radii.topLeft).toEqual([8, 8]);
    expect(radii.topRight).toEqual([8, 8]);
  });

  it("parses elliptical radius (two values)", () => {
    const radii = parseBorderRadii(
      mockStyles({ borderTopLeftRadius: "10px 20px" }),
    );
    expect(radii.topLeft).toEqual([10, 20]);
  });

  it("handles zero radius", () => {
    const radii = parseBorderRadii(mockStyles());
    expect(radii.topLeft).toEqual([0, 0]);
  });
});

describe("hasBorder", () => {
  it("returns false when all borders are 0", () => {
    expect(hasBorder(parseBorders(mockStyles()))).toBe(false);
  });

  it("returns true when one border has width and style", () => {
    expect(
      hasBorder(
        parseBorders(
          mockStyles({ borderTopWidth: "1px", borderTopStyle: "solid" }),
        ),
      ),
    ).toBe(true);
  });

  it("returns false when border has width but style none", () => {
    expect(
      hasBorder(
        parseBorders(
          mockStyles({ borderTopWidth: "1px", borderTopStyle: "none" }),
        ),
      ),
    ).toBe(false);
  });
});

describe("hasRadius / isUniformRadius", () => {
  it("hasRadius returns false for zero radii", () => {
    expect(hasRadius(parseBorderRadii(mockStyles()))).toBe(false);
  });

  it("hasRadius returns true for any non-zero corner", () => {
    expect(
      hasRadius(
        parseBorderRadii(mockStyles({ borderTopLeftRadius: "4px" })),
      ),
    ).toBe(true);
  });

  it("isUniformRadius returns true when all corners match", () => {
    const radii = parseBorderRadii(
      mockStyles({
        borderTopLeftRadius: "8px",
        borderTopRightRadius: "8px",
        borderBottomRightRadius: "8px",
        borderBottomLeftRadius: "8px",
      }),
    );
    expect(isUniformRadius(radii)).toBe(true);
  });

  it("isUniformRadius returns false when corners differ", () => {
    const radii = parseBorderRadii(
      mockStyles({
        borderTopLeftRadius: "8px",
        borderTopRightRadius: "4px",
        borderBottomRightRadius: "8px",
        borderBottomLeftRadius: "4px",
      }),
    );
    expect(isUniformRadius(radii)).toBe(false);
  });
});

describe("hasOverflowClip", () => {
  it("returns false for visible overflow", () => {
    expect(hasOverflowClip(mockStyles())).toBe(false);
  });

  it("returns true for overflow: hidden", () => {
    expect(hasOverflowClip(mockStyles({ overflow: "hidden" }))).toBe(true);
  });

  it("returns true for overflow: clip", () => {
    expect(hasOverflowClip(mockStyles({ overflow: "clip" }))).toBe(true);
  });

  it("returns true for overflowX: hidden", () => {
    expect(hasOverflowClip(mockStyles({ overflowX: "hidden" }))).toBe(true);
  });

  it("returns true for overflowY: clip", () => {
    expect(hasOverflowClip(mockStyles({ overflowY: "clip" }))).toBe(true);
  });
});

describe("parseBackgroundColor", () => {
  it("returns null for transparent", () => {
    expect(parseBackgroundColor(mockStyles())).toBeNull();
    expect(
      parseBackgroundColor(mockStyles({ backgroundColor: "transparent" })),
    ).toBeNull();
  });

  it("returns color string for non-transparent", () => {
    expect(
      parseBackgroundColor(mockStyles({ backgroundColor: "rgb(255, 0, 0)" })),
    ).toBe("rgb(255, 0, 0)");
  });

  it("returns null for empty string", () => {
    expect(
      parseBackgroundColor(mockStyles({ backgroundColor: "" })),
    ).toBeNull();
  });
});

describe("hasBackgroundImage", () => {
  it("returns false for none", () => {
    expect(hasBackgroundImage(mockStyles())).toBe(false);
  });

  it("returns true for gradient", () => {
    expect(
      hasBackgroundImage(
        mockStyles({ backgroundImage: "linear-gradient(red, blue)" }),
      ),
    ).toBe(true);
  });

  it("returns true for url", () => {
    expect(
      hasBackgroundImage(
        mockStyles({ backgroundImage: "url(image.png)" }),
      ),
    ).toBe(true);
  });
});

describe("createsStackingContext", () => {
  it("returns false for default static element", () => {
    expect(createsStackingContext(mockStyles())).toBe(false);
  });

  it("returns true for positioned element with z-index", () => {
    expect(
      createsStackingContext(mockStyles({ position: "relative", zIndex: "1" })),
    ).toBe(true);
  });

  it("returns false for positioned element with auto z-index", () => {
    expect(
      createsStackingContext(
        mockStyles({ position: "relative", zIndex: "auto" }),
      ),
    ).toBe(false);
  });

  it("returns true for opacity less than 1", () => {
    expect(
      createsStackingContext(mockStyles({ opacity: "0.5" })),
    ).toBe(true);
  });

  it("returns true for transform", () => {
    expect(
      createsStackingContext(
        mockStyles({ transform: "rotate(45deg)" }),
      ),
    ).toBe(true);
  });

  it("returns true for filter", () => {
    expect(
      createsStackingContext(
        mockStyles({ filter: "blur(5px)" }),
      ),
    ).toBe(true);
  });

  it("returns true for isolation: isolate", () => {
    expect(
      createsStackingContext(mockStyles({ isolation: "isolate" })),
    ).toBe(true);
  });

  it("returns true for mix-blend-mode", () => {
    expect(
      createsStackingContext(mockStyles({ mixBlendMode: "multiply" })),
    ).toBe(true);
  });
});

describe("getZIndex", () => {
  it("returns 0 for auto", () => {
    expect(getZIndex(mockStyles())).toBe(0);
  });

  it("returns parsed integer", () => {
    expect(getZIndex(mockStyles({ zIndex: "5" }))).toBe(5);
    expect(getZIndex(mockStyles({ zIndex: "-3" }))).toBe(-3);
  });

  it("returns 0 for empty string", () => {
    expect(getZIndex(mockStyles({ zIndex: "" }))).toBe(0);
  });
});

describe("isPositioned", () => {
  it("returns false for static", () => {
    expect(isPositioned(mockStyles())).toBe(false);
  });

  it("returns true for relative", () => {
    expect(isPositioned(mockStyles({ position: "relative" }))).toBe(true);
  });

  it("returns true for absolute", () => {
    expect(isPositioned(mockStyles({ position: "absolute" }))).toBe(true);
  });

  it("returns true for fixed", () => {
    expect(isPositioned(mockStyles({ position: "fixed" }))).toBe(true);
  });
});

describe("isFloat", () => {
  it("returns false for none", () => {
    expect(isFloat(mockStyles())).toBe(false);
  });

  it("returns true for left", () => {
    expect(isFloat(mockStyles({ cssFloat: "left" }))).toBe(true);
  });

  it("returns true for right", () => {
    expect(isFloat(mockStyles({ cssFloat: "right" }))).toBe(true);
  });
});

describe("isInlineLevel", () => {
  it("returns false for block", () => {
    expect(isInlineLevel(mockStyles())).toBe(false);
  });

  it("returns true for inline", () => {
    expect(isInlineLevel(mockStyles({ display: "inline" }))).toBe(true);
  });

  it("returns true for inline-block", () => {
    expect(isInlineLevel(mockStyles({ display: "inline-block" }))).toBe(true);
  });

  it("returns true for inline-flex", () => {
    expect(isInlineLevel(mockStyles({ display: "inline-flex" }))).toBe(true);
  });

  it("returns true for inline-grid", () => {
    expect(isInlineLevel(mockStyles({ display: "inline-grid" }))).toBe(true);
  });

  it("returns false for flex", () => {
    expect(isInlineLevel(mockStyles({ display: "flex" }))).toBe(false);
  });
});
