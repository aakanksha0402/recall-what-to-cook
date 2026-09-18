import type { Db } from './client';
import m001 from './migrations/001_init.sql?raw';
import m002 from './migrations/002_tags.sql?raw';
import m003 from './migrations/003_next_up_suppress.sql?raw';

const MIGRATIONS = [
  { id: 1, name: '001_init', sql: m001 },
  { id: 2, name: '002_tags', sql: m002 },
  { id: 3, name: '003_next_up_suppress', sql: m003 },
];

// One statement per `;` — migrations are plain DDL/DML, no triggers.
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function migrate(db: Db): Promise<number> {
  await db.sql(
    'CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL)',
  );
  const rows = await db.sql<{ id: number }>('SELECT id FROM _migrations');
  const applied = new Set(rows.map((r) => Number(r.id)));
  let ran = 0;
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await db.transaction(async (tx) => {
      for (const stmt of splitStatements(m.sql)) await tx.sql(stmt);
      await tx.sql(
        'INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)',
        m.id,
        m.name,
        new Date().toISOString(),
      );
    });
    ran++;
  }
  return ran;
}
