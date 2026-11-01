/**
 * Shared schemas for list-style, retention and digest parameters.
 */

import { z } from "zod";

const isOptionList = (v: string): boolean =>
  /^[a-z0-9_-]+(,[a-z0-9_-]+)*$/.test(v);

const KEEP = "keep-(last|hourly|daily|weekly|monthly|yearly)=[1-9]\\d*";
const PRUNE_RE = new RegExp(
  `^(${KEEP}|keep-all=[01])(,(${KEEP}|keep-all=[01]))*$`,
);

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

/** prune-backups retention string. */
export function pruneBackupsSchema(description: string) {
  return z
    .string()
    .refine((v) => PRUNE_RE.test(v), {
      message: "Expected e.g. keep-last=3,keep-weekly=2",
    })
    .optional()
    .describe(`${description} (e.g. keep-last=3,keep-weekly=2)`);
}
