import { SQLocal } from 'sqlocal';

export type Db = SQLocal;
export type Row = Record<string, unknown>;

export const DB_PATH = 'akku.sqlite3';

export function openDb(): Db {
  return new SQLocal({
    databasePath: DB_PATH,
    onInit: (sql) => [sql`PRAGMA foreign_keys = ON`],
  });
}

export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // Some contexts (thumbnail capture, private mode) throw here; non-fatal.
  }
  return false;
}
