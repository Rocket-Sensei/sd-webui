/**
 * Migration 004: Add timing columns for model loading and generation
 *
 * Tracks timing information for better user feedback:
 * - model_loading_time_ms: Time taken to load/start the model
 * - generation_time_ms: Time taken for the actual generation (excluding model loading)
 */

import Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('db:migration:004');

export function up(db) {
  logger.info('Running migration 004: Add timing columns');

  // Check if columns already exist
  const columns = db.prepare("PRAGMA table_info(generations)").all();
  const columnNames = columns.map(c => c.name);

  // Add model_loading_time_ms column if it doesn't exist
  if (!columnNames.includes('model_loading_time_ms')) {
    db.exec(`ALTER TABLE generations ADD COLUMN model_loading_time_ms INTEGER`);
    logger.info('  [004] Added model_loading_time_ms column');
  } else {
    logger.info('  [004] Column model_loading_time_ms already exists, skipping');
  }

  // Add generation_time_ms column if it doesn't exist
  if (!columnNames.includes('generation_time_ms')) {
    db.exec(`ALTER TABLE generations ADD COLUMN generation_time_ms INTEGER`);
    logger.info('  [004] Added generation_time_ms column');
  } else {
    logger.info('  [004] Column generation_time_ms already exists, skipping');
  }
}

export function down(db) {
  logger.info('Rolling back migration 004: Remove timing columns');

  // SQLite doesn't support DROP COLUMN directly, need to recreate table
  db.exec(`
    CREATE TABLE generations_backup (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      model TEXT NOT NULL,
      prompt TEXT,
      negative_prompt TEXT,
      size TEXT,
      seed TEXT,
      n INTEGER DEFAULT 1,
      quality TEXT,
      style TEXT,
      response_format TEXT DEFAULT 'b64_json',
      user_id TEXT,
      source_image_id TEXT,
      status TEXT DEFAULT 'pending',
      progress REAL DEFAULT 0,
      error TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      started_at INTEGER,
      completed_at INTEGER,
      input_image_path TEXT,
      input_image_mime_type TEXT,
      mask_image_path TEXT,
      mask_image_mime_type TEXT,
      strength REAL DEFAULT 0.75
    )
  `);

  db.exec(`
    INSERT INTO generations_backup
    SELECT
      id, type, model, prompt, negative_prompt, size, seed, n, quality, style,
      response_format, user_id, source_image_id, status, progress, error,
      created_at, updated_at, started_at, completed_at,
      input_image_path, input_image_mime_type, mask_image_path, mask_image_mime_type, strength
    FROM generations
  `);

  db.exec('DROP TABLE generations');
  db.exec('ALTER TABLE generations_backup RENAME TO generations');

  logger.info('  [004] Timing columns removed');
}
