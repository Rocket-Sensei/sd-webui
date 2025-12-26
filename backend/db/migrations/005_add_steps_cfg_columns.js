/**
 * Migration 005: Add sample_steps and cfg_scale columns for generation info display
 *
 * These values are displayed in the UI to show generation parameters:
 * - sample_steps: Number of denoising steps (1-100)
 * - cfg_scale: Classifier-free guidance scale (1-20)
 */

import Database from 'better-sqlite3';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('db:migration:005');

export function up(db) {
  logger.info('Running migration 005: Add sample_steps and cfg_scale columns');

  // Check if columns already exist
  const columns = db.prepare("PRAGMA table_info(generations)").all();
  const columnNames = columns.map(c => c.name);

  // Add sample_steps column if it doesn't exist
  if (!columnNames.includes('sample_steps')) {
    db.exec(`ALTER TABLE generations ADD COLUMN sample_steps INTEGER`);
    logger.info('  [005] Added sample_steps column');
  } else {
    logger.info('  [005] Column sample_steps already exists, skipping');
  }

  // Add cfg_scale column if it doesn't exist
  if (!columnNames.includes('cfg_scale')) {
    db.exec(`ALTER TABLE generations ADD COLUMN cfg_scale REAL`);
    logger.info('  [005] Added cfg_scale column');
  } else {
    logger.info('  [005] Column cfg_scale already exists, skipping');
  }

  // Add sampling_method column if it doesn't exist (for reference)
  if (!columnNames.includes('sampling_method')) {
    db.exec(`ALTER TABLE generations ADD COLUMN sampling_method TEXT`);
    logger.info('  [005] Added sampling_method column');
  } else {
    logger.info('  [005] Column sampling_method already exists, skipping');
  }

  // Add clip_skip column if it doesn't exist (for reference)
  if (!columnNames.includes('clip_skip')) {
    db.exec(`ALTER TABLE generations ADD COLUMN clip_skip TEXT`);
    logger.info('  [005] Added clip_skip column');
  } else {
    logger.info('  [005] Column clip_skip already exists, skipping');
  }
}

export function down(db) {
  logger.info('Rolling back migration 005: Remove steps and cfg columns');

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
      strength REAL DEFAULT 0.75,
      model_loading_time_ms INTEGER,
      generation_time_ms INTEGER
    )
  `);

  db.exec(`
    INSERT INTO generations_backup
    SELECT
      id, type, model, prompt, negative_prompt, size, seed, n, quality, style,
      response_format, user_id, source_image_id, status, progress, error,
      created_at, updated_at, started_at, completed_at,
      input_image_path, input_image_mime_type, mask_image_path, mask_image_mime_type, strength,
      model_loading_time_ms, generation_time_ms
    FROM generations
  `);

  db.exec('DROP TABLE generations');
  db.exec('ALTER TABLE generations_backup RENAME TO generations');

  logger.info('  [005] Steps and cfg columns removed');
}
