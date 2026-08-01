// Shared bits for the local-only helper scripts.
import { readFileSync } from 'node:fs';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

export const BASE = process.argv[2] ?? 'http://localhost:5173';

/** The admin row is seeded by the first migration, so take the name from there. */
export const ADMIN_NAME =
  read('../migrations/0001_init.sql').match(
    /INSERT INTO users[^;]*VALUES\s*\(\s*'([^']+)'\s*,\s*'admin'\s*\)/i,
  )?.[1] ?? 'admin';

export const BOOTSTRAP_PASSWORD =
  process.env.ADMIN_INITIAL_PASSWORD ??
  read('../.dev.vars').match(/ADMIN_INITIAL_PASSWORD="?([^"\n]+)"?/)?.[1];

if (!BOOTSTRAP_PASSWORD) throw new Error('ADMIN_INITIAL_PASSWORD not found in env or .dev.vars');
