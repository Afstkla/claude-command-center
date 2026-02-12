import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'command-center.db');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cwd TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'starting',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_activity TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export interface Session {
  id: string;
  name: string;
  cwd: string;
  status: string;
  created_at: string;
  last_activity: string;
}

const stmts = {
  insert: db.prepare(
    'INSERT INTO sessions (id, name, cwd, status) VALUES (?, ?, ?, ?)'
  ),
  getAll: db.prepare('SELECT * FROM sessions ORDER BY created_at DESC'),
  getById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
  updateStatus: db.prepare(
    `UPDATE sessions SET status = ?, last_activity = datetime('now') WHERE id = ?`
  ),
  remove: db.prepare('DELETE FROM sessions WHERE id = ?'),
};

export function insertSession(id: string, name: string, cwd: string) {
  stmts.insert.run(id, name, cwd, 'starting');
}

export function getAllSessions(): Session[] {
  return stmts.getAll.all() as Session[];
}

export function getSession(id: string): Session | undefined {
  return stmts.getById.get(id) as Session | undefined;
}

export function updateSessionStatus(id: string, status: string) {
  stmts.updateStatus.run(status, id);
}

export function removeSession(id: string) {
  stmts.remove.run(id);
}

export default db;
