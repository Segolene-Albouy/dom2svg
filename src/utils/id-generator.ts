import type { IdGenerator } from "../types.js";

/** Global counter shared across all generators to avoid ID collisions
 *  when multiple SVGs are embedded in the same HTML document. */
let globalCounter = 0;

/** Creates an ID generator that produces unique IDs with an optional prefix */
export function createIdGenerator(): IdGenerator {
  return {
    next(prefix = "d2s"): string {
      return `${prefix}-${globalCounter++}`;
    },
  };
}

/** Reset the global counter (for testing only) */
export function resetIdCounter(): void {
  globalCounter = 0;
}
