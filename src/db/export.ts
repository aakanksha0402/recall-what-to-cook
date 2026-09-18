import type { Db, Row } from './client';

const TABLES = [
  'dish',
  'ingredient',
  'dish_ingredient',
  'dish_version',
  'cook_event',
  'pantry',
  'source',
  'tag',
  'dish_tag',
  'next_up',
  'suppression',
  'proposal_answer',
  'setting',
  'person',
  'dish_person',
];

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportSqlite(db: Db): Promise<void> {
  const file = await db.getDatabaseFile();
  download(file, `akku-${stamp()}.sqlite`);
}

export async function exportJson(db: Db): Promise<void> {
  const out: Record<string, Row[]> = {};
  for (const t of TABLES) out[t] = await db.sql<Row>(`SELECT * FROM ${t}`);
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), tables: out }, null, 2)], {
    type: 'application/json',
  });
  download(blob, `akku-${stamp()}.json`);
}

export async function importSqlite(db: Db, file: File): Promise<void> {
  await db.overwriteDatabaseFile(file);
}
