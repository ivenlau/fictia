export * from "./project.js";
export * from "./genre-analysis.js";
export * from "./blueprint.js";
export * from "./style-guide.js";
export * from "./narrative-weave.js";
export * from "./character.js";
export * from "./outline.js";
export * from "./review.js";

import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

/**
 * Validate data against a TypeBox schema.
 * Returns { success: true, data } or { success: false, errors }.
 */
export function validate<T extends TSchema>(
  schema: T,
  data: unknown
): { success: true; data: unknown } | { success: false; errors: string[] } {
  const errors = [...Value.Errors(schema, data)];
  if (errors.length === 0) {
    return { success: true, data };
  }
  return {
    success: false,
    errors: errors.map((e) => `${e.path}: ${e.message}`),
  };
}
