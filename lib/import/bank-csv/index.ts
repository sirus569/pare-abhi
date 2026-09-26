// Bank-CSV importer: known-institution profiles (strict layout rules) plus an
// "Other institution" path with guessed, user-confirmed column mapping. Pure and
// client-safe; the server-only options validator lives in ./options.

export { parseBankCsv, slugifyAccountName } from "./parse";
export { suggestMapping, suggestInvert, detectProfile, type MappingSuggestion } from "./detect";
export { PROFILES, getProfile, cleanBoaDescription } from "./profiles";
export { classifyCsvRow } from "./classify";
export { toRows, parseMoney, parseDate, inferDateOrder } from "./values";
export * from "./types";
