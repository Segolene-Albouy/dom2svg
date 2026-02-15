import { describe, it, expect } from "vitest";
import { extractUrlFromCss } from "./images.js";

describe("extractUrlFromCss", () => {
  it("extracts unquoted URL", () => {
    expect(extractUrlFromCss("url(http://example.com/image.png)")).toBe(
      "http://example.com/image.png",
    );
  });

  it("extracts double-quoted URL", () => {
    expect(extractUrlFromCss('url("http://example.com/image.png")')).toBe(
      "http://example.com/image.png",
    );
  });

  it("extracts single-quoted URL", () => {
    expect(extractUrlFromCss("url('http://example.com/image.png')")).toBe(
      "http://example.com/image.png",
    );
  });

  it("returns null for non-url values", () => {
    expect(extractUrlFromCss("none")).toBeNull();
    expect(extractUrlFromCss("linear-gradient(red, blue)")).toBeNull();
    expect(extractUrlFromCss("")).toBeNull();
  });

  it("extracts relative URL", () => {
    expect(extractUrlFromCss("url(./assets/icon.svg)")).toBe(
      "./assets/icon.svg",
    );
  });

  it("extracts data URL", () => {
    const dataUrl = "data:image/png;base64,iVBOR";
    expect(extractUrlFromCss(`url(${dataUrl})`)).toBe(dataUrl);
  });
});
