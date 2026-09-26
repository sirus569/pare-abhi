// Server-side validation of the `csv_options` form field (untrusted JSON from
// the upload panel). Kept out of index.ts so zod stays out of the client bundle.

import { z } from "zod";
import type { CsvImportOptions } from "./types";

const col = z.number().int().min(0).max(500);

const Schema = z.object({
  institution: z.string().min(1).max(40),
  kind: z.enum(["chequing", "savings", "card"]),
  accountName: z.string().max(60).optional(),
  mapping: z
    .object({
      headerRow: z.number().int().min(-1).max(10000),
      date: col,
      description: col,
      amount: col.nullable(),
      debit: col.nullable(),
      credit: col.nullable(),
      balance: col.nullable(),
      dateOrder: z.enum(["mdy", "dmy", "ymd"]),
      invertSign: z.boolean(),
    })
    .optional(),
});

export function parseCsvImportOptions(raw: unknown): CsvImportOptions | null {
  if (typeof raw !== "string") return null;
  try {
    const result = Schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
