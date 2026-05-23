import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../../fictia.db");

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Auto-create tables on startup
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS novels (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    genre TEXT DEFAULT '',
    description TEXT DEFAULT '',
    target_chapters INTEGER DEFAULT 28,
    status TEXT DEFAULT 'creating',
    pipeline_status TEXT DEFAULT 'not_started',
    tags TEXT DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    title TEXT DEFAULT '',
    summary TEXT DEFAULT '',
    filename TEXT DEFAULT '',
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'empty',
    goal TEXT DEFAULT '',
    word_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_outputs (
    id TEXT PRIMARY KEY,
    novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    chapter_id TEXT,
    agent_type TEXT NOT NULL,
    stage_name TEXT,
    persona TEXT,
    filename TEXT DEFAULT '',
    model_used TEXT DEFAULT '',
    provider_used TEXT DEFAULT '',
    status TEXT DEFAULT 'running',
    tokens_input INTEGER DEFAULT 0,
    tokens_output INTEGER DEFAULT 0,
    cost REAL DEFAULT 0,
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS review_feedback (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    agent_output_id TEXT NOT NULL REFERENCES agent_outputs(id) ON DELETE CASCADE,
    reviewer_type TEXT NOT NULL,
    persona TEXT,
    line_number INTEGER DEFAULT 0,
    severity TEXT DEFAULT 'suggestion',
    message TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT DEFAULT '',
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    novel_id TEXT REFERENCES novels(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    model_used TEXT,
    provider_used TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pipeline_state (
    id TEXT PRIMARY KEY,
    novel_id TEXT NOT NULL REFERENCES novels(id) ON DELETE CASCADE,
    stage_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    reason TEXT,
    confirmed_at TEXT,
    output_files TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

export const db = drizzle(sqlite, { schema });
export { schema };
