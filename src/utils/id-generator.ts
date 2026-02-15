import type { IdGenerator } from "../types.js";

/** Creates an ID generator that produces unique IDs with an optional prefix */
export function createIdGenerator(): IdGenerator {
  let counter = 0;
  return {
    next(prefix = "d2s"): string {
      return `${prefix}-${counter++}`;
    },
  };
}
