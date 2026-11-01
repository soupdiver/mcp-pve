/**
 * Shared schemas for list-style and digest parameters.
 */

import { z } from "zod";

const isOptionList = (v: string): boolean =>
  /^[a-z0-9_-]+(,[a-z0-9_-]+)*$/.test(v);

/** Comma-separated option names, as taken by delete and revert. */
export function optionListSchema(description: string, example: string) {
  return z
    .string()
    .refine(isOptionList, {
      message: `Expected option names like ${example}`,
    })
    .optional()
    .describe(`${description}, comma-separated (e.g. ${example})`);
}

/** Config digest. PVE rejects the change if the config changed since. */
export function digestSchema(description: string) {
  return z
    .string()
    .refine((v) => /^[a-f0-9]{1,64}$/i.test(v), {
      message: "Expected a hex digest",
    })
    .optional()
    .describe(description);
}
