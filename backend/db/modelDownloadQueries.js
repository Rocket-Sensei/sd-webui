/**
 * Database queries for model downloads
 */

import { getDatabase } from './database.js';

/**
 * Create a new download job
 */
export function createDownloadJob(download) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO model_downloads (
      id, model_id, repo, status, progress, bytes_downloaded, total_bytes, error, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    download.id,
    download.model_id || null,
    download.repo,
    download.status || 'pending',
    download.progress || 0,
    download.bytes_downloaded || 0,
    download.total_bytes || null,
    download.error || null,
    download.created_at || Date.now()
  );
}

/**
 * Update download job progress
 */
export function updateDownloadProgress(jobId, updates) {
  const db = getDatabase();
  const fields = [];
  const values = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.progress !== undefined) {
    fields.push('progress = ?');
    values.push(updates.progress);
  }
  if (updates.bytes_downloaded !== undefined) {
    fields.push('bytes_downloaded = ?');
    values.push(updates.bytes_downloaded);
  }
  if (updates.total_bytes !== undefined) {
    fields.push('total_bytes = ?');
    values.push(updates.total_bytes);
  }
  if (updates.error !== undefined) {
    fields.push('error = ?');
    values.push(updates.error);
  }
  if (updates.completed_at !== undefined) {
    fields.push('completed_at = ?');
    values.push(updates.completed_at);
  }

  if (fields.length === 0) return;

  values.push(jobId);
  const stmt = db.prepare(`
    UPDATE model_downloads
    SET ${fields.join(', ')}
    WHERE id = ?
  `);
  return stmt.run(...values);
}

/**
 * Get download job by ID
 */
export function getDownloadJob(jobId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM model_downloads WHERE id = ?
  `);
  return stmt.get(jobId);
}

/**
 * Get all download jobs
 */
export function getAllDownloadJobs(options = {}) {
  const db = getDatabase();
  let query = 'SELECT * FROM model_downloads';
  const params = [];

  if (options.status) {
    query += ' WHERE status = ?';
    params.push(options.status);
  }

  query += ' ORDER BY created_at DESC';

  if (options.limit) {
    query += ' LIMIT ?';
    params.push(options.limit);
  }

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * Get active downloads (pending or downloading)
 */
export function getActiveDownloads() {
  return getAllDownloadJobs({ status: 'downloading' });
}

/**
 * Delete download job
 */
export function deleteDownloadJob(jobId) {
  const db = getDatabase();

  // First delete associated files (cascade should handle this, but let's be explicit)
  const deleteFilesStmt = db.prepare('DELETE FROM model_download_files WHERE download_id = ?');
  deleteFilesStmt.run(jobId);

  // Then delete the download job
  const stmt = db.prepare('DELETE FROM model_downloads WHERE id = ?');
  return stmt.run(jobId);
}

/**
 * Create download file entry
 */
export function createDownloadFile(file) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO model_download_files (
      id, download_id, file_path, destination_path, size, downloaded, progress, complete, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    file.id,
    file.download_id,
    file.file_path,
    file.destination_path,
    file.size || 0,
    file.downloaded || 0,
    file.progress || 0,
    file.complete ? 1 : 0,
    file.created_at || Date.now()
  );
}

/**
 * Update download file progress
 */
export function updateDownloadFile(fileId, updates) {
  const db = getDatabase();
  const fields = [];
  const values = [];

  if (updates.size !== undefined) {
    fields.push('size = ?');
    values.push(updates.size);
  }
  if (updates.downloaded !== undefined) {
    fields.push('downloaded = ?');
    values.push(updates.downloaded);
  }
  if (updates.progress !== undefined) {
    fields.push('progress = ?');
    values.push(updates.progress);
  }
  if (updates.complete !== undefined) {
    fields.push('complete = ?');
    values.push(updates.complete ? 1 : 0);
  }
  if (updates.completed_at !== undefined) {
    fields.push('completed_at = ?');
    values.push(updates.completed_at);
  }

  if (fields.length === 0) return;

  values.push(fileId);
  const stmt = db.prepare(`
    UPDATE model_download_files
    SET ${fields.join(', ')}
    WHERE id = ?
  `);
  return stmt.run(...values);
}

/**
 * Get files for a download job
 */
export function getDownloadFiles(downloadId) {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM model_download_files WHERE download_id = ? ORDER BY created_at
  `);
  return stmt.all(downloadId);
}

/**
 * Create or update model entry
 */
export function upsertModel(model) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO models (
      id, name, description, command, args, api, mode, exec_mode, port,
      huggingface_repo, huggingface_files, downloaded, download_path, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      description = excluded.description,
      command = excluded.command,
      args = excluded.args,
      api = excluded.api,
      mode = excluded.mode,
      exec_mode = excluded.exec_mode,
      port = excluded.port,
      huggingface_repo = excluded.huggingface_repo,
      huggingface_files = excluded.huggingface_files,
      downloaded = excluded.downloaded,
      download_path = excluded.download_path
  `);
  return stmt.run(
    model.id,
    model.name,
    model.description || null,
    model.command,
    model.args ? JSON.stringify(model.args) : null,
    model.api || null,
    model.mode || 'on_demand',
    model.exec_mode || 'server',
    model.port || null,
    model.huggingface_repo || null,
    model.huggingface_files ? JSON.stringify(model.huggingface_files) : null,
    model.downloaded ? 1 : 0,
    model.download_path || null,
    model.created_at || Date.now()
  );
}

/**
 * Get model by ID
 */
export function getModel(modelId) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM models WHERE id = ?');
  const model = stmt.get(modelId);

  if (model) {
    // Parse JSON fields
    if (model.args) {
      model.args = JSON.parse(model.args);
    }
    if (model.huggingface_files) {
      model.huggingface_files = JSON.parse(model.huggingface_files);
    }
    model.downloaded = Boolean(model.downloaded);
  }

  return model;
}

/**
 * Get all models
 */
export function getAllModels() {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM models ORDER BY created_at');
  const models = stmt.all();

  return models.map(model => {
    // Parse JSON fields
    if (model.args) {
      model.args = JSON.parse(model.args);
    }
    if (model.huggingface_files) {
      model.huggingface_files = JSON.parse(model.huggingface_files);
    }
    model.downloaded = Boolean(model.downloaded);
    return model;
  });
}

/**
 * Update model download status
 */
export function updateModelDownloadStatus(modelId, downloaded, downloadPath = null) {
  const db = getDatabase();
  const stmt = db.prepare(`
    UPDATE models
    SET downloaded = ?, download_path = ?
    WHERE id = ?
  `);
  return stmt.run(downloaded ? 1 : 0, downloadPath, modelId);
}

/**
 * Delete model
 */
export function deleteModel(modelId) {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM models WHERE id = ?');
  return stmt.run(modelId);
}

/**
 * Get default model
 */
export function getDefaultModel() {
  const db = getDatabase();
  // For now, return the first downloaded model
  // In the full implementation, this should read from a config file
  const stmt = db.prepare('SELECT * FROM models WHERE downloaded = 1 LIMIT 1');
  const model = stmt.get();

  if (model) {
    if (model.args) {
      model.args = JSON.parse(model.args);
    }
    if (model.huggingface_files) {
      model.huggingface_files = JSON.parse(model.huggingface_files);
    }
    model.downloaded = Boolean(model.downloaded);
  }

  return model;
}

/**
 * Create model process entry
 */
export function createModelProcess(process) {
  const db = getDatabase();
  const stmt = db.prepare(`
    INSERT INTO model_processes (
      model_id, pid, port, exec_mode, status, started_at, last_heartbeat_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    process.model_id,
    process.pid || null,
    process.port || null,
    process.exec_mode || 'server',
    process.status || 'starting',
    process.started_at || Date.now(),
    process.last_heartbeat_at || Date.now()
  );
}

/**
 * Update model process status
 */
export function updateModelProcess(modelId, updates) {
  const db = getDatabase();
  const fields = [];
  const values = [];

  if (updates.pid !== undefined) {
    fields.push('pid = ?');
    values.push(updates.pid);
  }
  if (updates.port !== undefined) {
    fields.push('port = ?');
    values.push(updates.port);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.last_heartbeat_at !== undefined) {
    fields.push('last_heartbeat_at = ?');
    values.push(updates.last_heartbeat_at);
  }

  if (fields.length === 0) return;

  values.push(modelId);
  const stmt = db.prepare(`
    UPDATE model_processes
    SET ${fields.join(', ')}
    WHERE model_id = ?
  `);
  return stmt.run(...values);
}

/**
 * Get model process
 */
export function getModelProcess(modelId) {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM model_processes WHERE model_id = ?');
  return stmt.get(modelId);
}

/**
 * Get all model processes
 */
export function getAllModelProcesses() {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM model_processes ORDER BY started_at DESC');
  return stmt.all();
}

/**
 * Delete model process
 */
export function deleteModelProcess(modelId) {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM model_processes WHERE model_id = ?');
  return stmt.run(modelId);
}

/**
 * Get running models
 */
export function getRunningModels() {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT m.*, mp.pid, mp.port as running_port, mp.exec_mode, mp.status as process_status, mp.started_at
    FROM models m
    INNER JOIN model_processes mp ON m.id = mp.model_id
    WHERE mp.status = 'running'
    ORDER BY mp.started_at DESC
  `);
  const models = stmt.all();

  return models.map(model => {
    if (model.args) {
      model.args = JSON.parse(model.args);
    }
    if (model.huggingface_files) {
      model.huggingface_files = JSON.parse(model.huggingface_files);
    }
    model.downloaded = Boolean(model.downloaded);
    return model;
  });
}
