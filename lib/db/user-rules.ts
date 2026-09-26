import fs from "fs";
import path from "path";

/**
 * User-defined category rules are persisted to a gitignored JSON file alongside
 * the DB so they survive a database wipe + re-ingest. The SQLite category_rules
 * table is rebuilt from SEED_RULES (built-ins) on a fresh DB; this file restores
 * the user's own rules on top.
 *
 * Privacy: this lives under data/ (gitignored), so private keywords like an
 * e-transfer recipient handle (used to tag rent) never enter tracked source.
 */
// Data dir defaults to <cwd>/data (self-host/hosted); PARE_DATA_DIR overrides it
// so the test suite can run hermetically instead of reading/writing the real
// data/ (which in a working checkout holds the user's private seed-rules.json).
const DATA_DIR = process.env.PARE_DATA_DIR || path.join(process.cwd(), "data");

const FILE = path.join(DATA_DIR, "user-rules.json");

export interface UserRule {
  category: string;
  keyword: string;
}

function loadStrict<T>(file: string): T[] {
  if (!fs.existsSync(file)) return [];
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
  if (!Array.isArray(parsed)) throw new Error("expected a JSON array");
  return parsed as T[];
}

export function loadUserRules(): UserRule[] {
  try {
    return loadStrict<UserRule>(FILE);
  } catch {
    return [];
  }
}

// Write-path load: a corrupt file must NOT read as "no rules" — the next write
// would replace every persisted rule with a single one. Set it aside instead.
function loadForWrite<T>(file: string): T[] {
  try {
    return loadStrict<T>(file);
  } catch (err) {
    const bad = file + ".bad";
    fs.renameSync(file, bad);
    console.error(
      `${path.basename(file)} is unreadable (${err instanceof Error ? err.message : err}); ` +
        `moved it to ${bad} — restore it by hand to recover the rules`
    );
    return [];
  }
}

// The full personal taxonomy, kept gitignored at data/seed-rules.json so real
// merchant keywords never enter tracked source. Used as the seed source when
// present; otherwise the generic STARTER_RULES in categories.ts is used.
const SEED_FILE = path.join(DATA_DIR, "seed-rules.json");

export function loadSeedRules(): UserRule[] | null {
  try {
    if (!fs.existsSync(SEED_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(SEED_FILE, "utf-8"));
    return Array.isArray(parsed) && parsed.length ? (parsed as UserRule[]) : null;
  } catch {
    return null;
  }
}

function writeRules<T>(file: string, rules: T[]): void {
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rules, null, 2));
}

// The JSON file is a SELF-HOST redundancy layer (rules survive a DB wipe); the
// DB row the caller just committed is the source of truth on BOTH targets. So:
// (a) skip the file entirely in hosted mode — hosted rules live in the caller's
//     per-user Durable Object, which is already durable, and a shared server
//     file would cross user boundaries anyway;
// (b) never let a redundancy write fail the mutation. On Workers, node:fs is an
//     unenv stub whose methods THROW ("fs.mkdirSync is not implemented") — that
//     throw fired AFTER the insert landed, so every hosted rule write (the
//     /categories UI, rules import, and the MCP add_category_rule tool)
//     reported failure while silently succeeding.
function persistSkipped(): boolean {
  return process.env.PARE_DEPLOY_TARGET === "hosted";
}

function bestEffort(op: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    // Self-host only reaches here on a real I/O problem (permissions, disk):
    // the DB write already committed, so surface loudly but don't fail the
    // mutation over the redundancy copy.
    console.error(
      `rules file ${op} failed (rule is saved in the database; the wipe-survival copy is stale): ` +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

export function saveUserRule(category: string, keyword: string): void {
  saveUserRules([{ category, keyword }]);
}

// Merge many rules into the persisted set in ONE read+write (bulk import path —
// calling saveUserRule per rule would reload+rewrite the file O(n) times). Later
// entries win on a keyword collision, matching saveUserRule's last-write-wins.
export function saveUserRules(incoming: UserRule[]): void {
  if (!incoming.length || persistSkipped()) return;
  bestEffort("write", () => {
    const byKeyword = new Map<string, UserRule>();
    for (const r of loadForWrite<UserRule>(FILE)) byKeyword.set(r.keyword.toUpperCase(), r);
    for (const r of incoming) byKeyword.set(r.keyword.toUpperCase(), r);
    writeRules(FILE, [...byKeyword.values()]);
  });
}

export function removeUserRule(keyword: string): void {
  if (persistSkipped()) return;
  bestEffort("delete", () => {
    const rules = loadForWrite<UserRule>(FILE);
    const filtered = rules.filter(
      (r) => r.keyword.toUpperCase() !== keyword.toUpperCase()
    );
    if (filtered.length !== rules.length) writeRules(FILE, filtered);
  });
}

// ---------------------------------------------------------------------------
// Type rules (keyword → transaction type, lib/db/transaction-types.ts) get the
// same wipe-survival copy in their own file, data/user-type-rules.json. Every
// type rule is user-defined (there are no built-ins), so the file IS the list.
// ---------------------------------------------------------------------------

const TYPE_FILE = path.join(DATA_DIR, "user-type-rules.json");

export interface UserTypeRule {
  keyword: string;
  flow: string;
}

export function loadUserTypeRules(): UserTypeRule[] {
  try {
    return loadStrict<UserTypeRule>(TYPE_FILE);
  } catch {
    return [];
  }
}

export function saveUserTypeRule(keyword: string, flow: string): void {
  if (persistSkipped()) return;
  bestEffort("write", () => {
    const rules = loadForWrite<UserTypeRule>(TYPE_FILE).filter(
      (r) => r.keyword.toUpperCase() !== keyword.toUpperCase()
    );
    writeRules(TYPE_FILE, [...rules, { keyword, flow }]);
  });
}

export function removeUserTypeRule(keyword: string): void {
  if (persistSkipped()) return;
  bestEffort("delete", () => {
    const rules = loadForWrite<UserTypeRule>(TYPE_FILE);
    const filtered = rules.filter((r) => r.keyword.toUpperCase() !== keyword.toUpperCase());
    if (filtered.length !== rules.length) writeRules(TYPE_FILE, filtered);
  });
}
