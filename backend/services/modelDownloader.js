/**
 * Model Downloader Service
 *
 * Downloads models from HuggingFace with progress tracking,
 * pause/resume support, and file verification.
 */

import { randomUUID } from 'crypto';
import { mkdirSync, existsSync, createWriteStream, statSync, unlinkSync } from 'fs';
import { join, dirname, basename } from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default models directory
const DEFAULT_MODELS_DIR = process.env.MODELS_DIR || `${__dirname}/../../models`;

// HuggingFace API base URLs
const HF_API_BASE = 'https://huggingface.co';
const HF_API_MODELS = `${HF_API_BASE}/api/models`;
const HF_RAW_BASE = 'https://huggingface.co';

// Download status constants
const DOWNLOAD_STATUS = {
  PENDING: 'pending',
  DOWNLOADING: 'downloading',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * In-memory download job tracker
 * In production, this should be persisted to database
 */
const downloadJobs = new Map();

/**
 * Calculate download speed and ETA
 */
function calculateProgress(bytesDownloaded, totalBytes, startTime, lastBytes, lastTime) {
  const progress = totalBytes > 0 ? (bytesDownloaded / totalBytes) * 100 : 0;

  // Calculate speed (bytes per second)
  const now = Date.now();
  const timeDiff = (now - lastTime) / 1000; // seconds
  const bytesDiff = bytesDownloaded - lastBytes;
  const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;

  // Calculate ETA
  const remainingBytes = totalBytes - bytesDownloaded;
  const eta = speed > 0 ? remainingBytes / speed : 0;

  return { progress, speed, eta };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format seconds to human readable
 */
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Get HuggingFace model info via API
 */
async function getHuggingFaceModelInfo(repo) {
  const url = `${HF_API_MODELS}/${encodeURIComponent(repo)}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Model repository not found: ${repo}`);
    }
    throw new Error(`Failed to fetch model info: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get HuggingFace model file list
 */
async function getHuggingFaceModelFiles(repo) {
  const url = `${HF_API_BASE}/api/models/${encodeURIComponent(repo)}`;

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch model files: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Return the siblings array which contains file information
  return data.siblings || [];
}

/**
 * Construct HuggingFace raw file URL
 */
function getHuggingFaceFileUrl(repo, filename) {
  return `${HF_RAW_BASE}/${encodeURIComponent(repo)}/resolve/main/${encodeURIComponent(filename)}`;
}

/**
 * Download a single file with progress tracking
 */
async function downloadFile({
  url,
  destinationPath,
  jobId,
  fileIndex,
  totalFiles,
  onProgress,
  signal
}) {
  const job = downloadJobs.get(jobId);
  if (!job) {
    throw new Error('Download job not found');
  }

  // Check if already cancelled
  if (signal?.aborted) {
    throw new Error('Download cancelled');
  }

  // Ensure destination directory exists
  const destDir = dirname(destinationPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }

  // Check for partial download (resume support)
  let startPosition = 0;
  if (existsSync(destinationPath)) {
    const stats = statSync(destinationPath);
    startPosition = stats.size;

    // Verify if file is complete by checking against job data
    const fileProgress = job.files.get(destinationPath);
    if (fileProgress && fileProgress.complete) {
      return {
        path: destinationPath,
        size: startPosition,
        resumed: false,
        skipped: true
      };
    }
  }

  const options = {
    method: 'GET',
    headers: {}
  };

  // Add range header for resume
  if (startPosition > 0) {
    options.headers['Range'] = `bytes=${startPosition}-`;
  }

  const response = await fetch(url, options);

  // Handle resume response
  if (response.status === 416) {
    // Range not satisfiable - file might be complete
    const stats = statSync(destinationPath);
    return {
      path: destinationPath,
      size: stats.size,
      resumed: false,
      skipped: true
    };
  }

  if (!response.ok && response.status !== 206) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  // Get total file size
  const contentRange = response.headers.get('Content-Range');
  const contentLength = response.headers.get('Content-Length');
  let totalBytes = contentLength ? parseInt(contentLength) : 0;

  if (contentRange) {
    // Format: "bytes start-end/total"
    const match = contentRange.match(/bytes \d+-\d+\/(\d+)/);
    if (match) {
      totalBytes = parseInt(match[1]);
    }
  }

  // If resuming, add start position to total
  if (startPosition > 0 && response.status === 206) {
    // Already have total from Content-Range
  }

  // Create write stream
  const writeStream = createWriteStream(destinationPath, {
    flags: startPosition > 0 ? 'a' : 'w'
  });

  // Get reader from response body
  const reader = response.body.getReader();
  const stream = Readable.fromWeb(reader);

  let bytesDownloaded = startPosition;
  const startTime = Date.now();
  let lastUpdateTime = startTime;
  let lastBytesDownloaded = bytesDownloaded;

  return new Promise((resolve, reject) => {
    const timeoutId = signal?.addEventListener('abort', () => {
      stream.destroy();
      writeStream.destroy();
      reject(new Error('Download cancelled'));
    });

    stream.on('data', (chunk) => {
      if (signal?.aborted) {
        stream.destroy();
        writeStream.destroy();
        reject(new Error('Download cancelled'));
        return;
      }

      writeStream.write(chunk);
      bytesDownloaded += chunk.length;

      // Update progress every 500ms or every 1MB
      const now = Date.now();
      if (now - lastUpdateTime > 500 || bytesDownloaded - lastBytesDownloaded > 1024 * 1024) {
        const { progress, speed, eta } = calculateProgress(
          bytesDownloaded,
          totalBytes,
          startTime,
          lastBytesDownloaded,
          lastUpdateTime
        );

        // Update job state
        const job = downloadJobs.get(jobId);
        if (job) {
          job.files.set(destinationPath, {
            size: totalBytes,
            downloaded: bytesDownloaded,
            progress: progress,
            speed: speed,
            eta: eta
          });

          // Calculate overall progress across all files
          let totalDownloaded = 0;
          let totalSize = 0;
          for (const [path, file] of job.files) {
            totalDownloaded += file.downloaded;
            totalSize += file.size || 0;
          }

          const overallProgress = totalSize > 0 ? (totalDownloaded / totalSize) * 100 : 0;

          job.progress = overallProgress;
          job.bytesDownloaded = totalDownloaded;
          job.totalBytes = totalSize;
          job.speed = speed;
          job.eta = eta;

          // Call progress callback
          if (onProgress) {
            onProgress({
              jobId,
              fileIndex,
              totalFiles,
              fileName: basename(destinationPath),
              fileProgress: progress,
              overallProgress,
              bytesDownloaded: totalDownloaded,
              totalBytes: totalSize,
              speed: formatBytes(speed) + '/s',
              eta: formatTime(eta),
              currentFile: {
                path: destinationPath,
                progress: progress,
                downloaded: bytesDownloaded,
                total: totalBytes
              }
            });
          }

          lastUpdateTime = now;
          lastBytesDownloaded = bytesDownloaded;
        }
      }
    });

    stream.on('end', () => {
      writeStream.end();

      // Mark file as complete
      const job = downloadJobs.get(jobId);
      if (job) {
        job.files.set(destinationPath, {
          size: totalBytes,
          downloaded: bytesDownloaded,
          progress: 100,
          complete: true
        });
      }

      resolve({
        path: destinationPath,
        size: bytesDownloaded,
        resumed: startPosition > 0,
        skipped: false
      });
    });

    stream.on('error', (err) => {
      writeStream.destroy();
      reject(err);
    });

    writeStream.on('error', (err) => {
      stream.destroy();
      reject(err);
    });
  });
}

/**
 * Model Downloader Class
 */
class ModelDownloader {
  constructor(options = {}) {
    this.modelsDir = options.modelsDir || DEFAULT_MODELS_DIR;

    // Ensure models directory exists
    if (!existsSync(this.modelsDir)) {
      mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  /**
   * Download a model from HuggingFace
   * @param {string} repo - HuggingFace repository (e.g., "stabilityai/sdxl-turbo")
   * @param {Array} files - Array of file objects with path and optional dest
   * @param {Function} onProgress - Progress callback
   * @returns {Promise} Download job result
   */
  async downloadModel(repo, files, onProgress) {
    const jobId = randomUUID();

    // Initialize download job
    downloadJobs.set(jobId, {
      id: jobId,
      repo,
      status: DOWNLOAD_STATUS.PENDING,
      files: new Map(),
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      startTime: Date.now(),
      error: null
    });

    try {
      // Update status to downloading
      const job = downloadJobs.get(jobId);
      job.status = DOWNLOAD_STATUS.DOWNLOADING;

      // Get model info to validate repository
      let modelInfo;
      try {
        modelInfo = await getHuggingFaceModelInfo(repo);
      } catch (error) {
        job.status = DOWNLOAD_STATUS.FAILED;
        job.error = error.message;
        throw new Error(`Failed to access repository "${repo}": ${error.message}`);
      }

      // Prepare file list
      const downloadList = [];
      for (const file of files) {
        const fileName = basename(file.path);
        const destDir = file.dest || this.modelsDir;
        const destPath = join(destDir, fileName);

        downloadList.push({
          url: getHuggingFaceFileUrl(repo, file.path),
          destinationPath: destPath,
          originalPath: file.path
        });

        // Initialize file tracking
        job.files.set(destPath, {
          size: 0,
          downloaded: 0,
          progress: 0,
          complete: false
        });
      }

      job.totalFiles = downloadList.length;

      // Download files sequentially (could be parallelized)
      const results = [];
      const abortController = new AbortController();

      job.abortController = abortController;

      for (let i = 0; i < downloadList.length; i++) {
        const file = downloadList[i];

        // Check if cancelled
        if (abortController.signal.aborted) {
          throw new Error('Download cancelled');
        }

        try {
          const result = await downloadFile({
            url: file.url,
            destinationPath: file.destinationPath,
            jobId,
            fileIndex: i,
            totalFiles: downloadList.length,
            onProgress,
            signal: abortController.signal
          });

          results.push(result);

          // Notify progress
          if (onProgress) {
            onProgress({
              jobId,
              fileIndex: i,
              totalFiles: downloadList.length,
              fileName: basename(file.destinationPath),
              fileComplete: true,
              message: `Completed ${basename(file.destinationPath)}`
            });
          }
        } catch (error) {
          job.status = DOWNLOAD_STATUS.FAILED;
          job.error = `Failed to download ${file.originalPath}: ${error.message}`;
          throw error;
        }
      }

      // Update job status to completed
      job.status = DOWNLOAD_STATUS.COMPLETED;
      job.progress = 100;
      job.completedAt = Date.now();

      return {
        jobId,
        repo,
        status: DOWNLOAD_STATUS.COMPLETED,
        files: results,
        totalSize: job.bytesDownloaded,
        duration: job.completedAt - job.startTime
      };

    } catch (error) {
      const job = downloadJobs.get(jobId);

      // Check if it was a cancellation
      if (error.message === 'Download cancelled' || error.name === 'AbortError') {
        job.status = DOWNLOAD_STATUS.CANCELLED;
        job.error = 'Download was cancelled';
      } else {
        job.status = DOWNLOAD_STATUS.FAILED;
        job.error = error.message;
      }

      throw error;
    }
  }

  /**
   * Get download status
   * @param {string} jobId - Download job ID
   * @returns {Object} Download status
   */
  getDownloadStatus(jobId) {
    const job = downloadJobs.get(jobId);

    if (!job) {
      return null;
    }

    // Calculate current progress
    let totalDownloaded = 0;
    let totalSize = 0;

    for (const [path, file] of job.files) {
      totalDownloaded += file.downloaded || 0;
      totalSize += file.size || 0;
    }

    return {
      id: job.id,
      repo: job.repo,
      status: job.status,
      progress: job.progress,
      bytesDownloaded: totalDownloaded,
      totalBytes: totalSize,
      speed: job.speed ? formatBytes(job.speed) + '/s' : '--',
      eta: job.eta ? formatTime(job.eta) : '--',
      files: Array.from(job.files.entries()).map(([path, file]) => ({
        path,
        size: file.size,
        downloaded: file.downloaded,
        progress: file.progress,
        complete: file.complete
      })),
      error: job.error,
      createdAt: job.startTime,
      completedAt: job.completedAt
    };
  }

  /**
   * Cancel a download
   * @param {string} jobId - Download job ID
   */
  cancelDownload(jobId) {
    const job = downloadJobs.get(jobId);

    if (!job) {
      throw new Error('Download job not found');
    }

    if (job.status === DOWNLOAD_STATUS.COMPLETED) {
      throw new Error('Cannot cancel completed download');
    }

    // Abort the download
    if (job.abortController) {
      job.abortController.abort();
    }

    job.status = DOWNLOAD_STATUS.CANCELLED;

    // Clean up partial files (optional)
    for (const [path, file] of job.files) {
      if (!file.complete && existsSync(path)) {
        try {
          unlinkSync(path);
        } catch (e) {
          console.error(`Failed to delete partial file: ${path}`, e);
        }
      }
    }
  }

  /**
   * Pause a download
   * @param {string} jobId - Download job ID
   */
  pauseDownload(jobId) {
    const job = downloadJobs.get(jobId);

    if (!job) {
      throw new Error('Download job not found');
    }

    if (job.status !== DOWNLOAD_STATUS.DOWNLOADING) {
      throw new Error('Can only pause active downloads');
    }

    // Abort the current download - files will be resumed on next call
    if (job.abortController) {
      job.abortController.abort();
    }

    job.status = DOWNLOAD_STATUS.PAUSED;
    job.pausedAt = Date.now();
  }

  /**
   * Resume a paused download
   * @param {string} jobId - Download job ID
   * @param {Function} onProgress - Progress callback
   */
  async resumeDownload(jobId, onProgress) {
    const job = downloadJobs.get(jobId);

    if (!job) {
      throw new Error('Download job not found');
    }

    if (job.status !== DOWNLOAD_STATUS.PAUSED) {
      throw new Error('Can only resume paused downloads');
    }

    // Re-download with resume support
    // Since we download files with range headers, we can just restart
    const filesToDownload = [];
    for (const [path, file] of job.files) {
      if (!file.complete) {
        const fileName = basename(path);
        // Find original file path from repo info
        filesToDownload.push({
          path: fileName,
          dest: dirname(path)
        });
      }
    }

    if (filesToDownload.length === 0) {
      job.status = DOWNLOAD_STATUS.COMPLETED;
      return;
    }

    // Restart download (will resume from existing files)
    job.status = DOWNLOAD_STATUS.DOWNLOADING;
    job.abortController = new AbortController();

    // This would need to be implemented with the original download parameters
    // For now, throw an error indicating full re-download needed
    throw new Error('Resume requires original download parameters. Please restart the download.');
  }

  /**
   * Verify downloaded files
   * @param {Array} files - Array of file objects to verify
   * @returns {boolean} True if all files exist and are non-empty
   */
  verifyFiles(files) {
    for (const file of files) {
      const destDir = file.dest || this.modelsDir;
      const fileName = basename(file.path);
      const filePath = join(destDir, fileName);

      if (!existsSync(filePath)) {
        return false;
      }

      const stats = statSync(filePath);
      if (stats.size === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get list of downloaded models
   * @returns {Array} List of downloaded models
   */
  getDownloadedModels() {
    const models = [];

    // Scan models directory
    if (!existsSync(this.modelsDir)) {
      return models;
    }

    // This is a basic implementation
    // In production, you might want to track this in a database
    // or scan for specific model file patterns

    return models;
  }

  /**
   * Get all active download jobs
   * @returns {Array} List of download jobs
   */
  getAllJobs() {
    return Array.from(downloadJobs.values()).map(job => this.getDownloadStatus(job.id));
  }

  /**
   * Clean up completed/failed jobs older than specified time
   * @param {number} maxAge - Maximum age in milliseconds (default: 1 hour)
   */
  cleanupOldJobs(maxAge = 60 * 60 * 1000) {
    const now = Date.now();
    const toDelete = [];

    for (const [jobId, job] of downloadJobs) {
      const age = now - (job.completedAt || job.startTime);
      if (age > maxAge &&
          (job.status === DOWNLOAD_STATUS.COMPLETED ||
           job.status === DOWNLOAD_STATUS.FAILED ||
           job.status === DOWNLOAD_STATUS.CANCELLED)) {
        toDelete.push(jobId);
      }
    }

    for (const jobId of toDelete) {
      downloadJobs.delete(jobId);
    }

    return toDelete.length;
  }
}

// Export singleton instance
const modelDownloader = new ModelDownloader();

// Export class and constants
export {
  ModelDownloader,
  modelDownloader,
  DOWNLOAD_STATUS
};

// Also export utility functions
export {
  getHuggingFaceModelInfo,
  getHuggingFaceModelFiles,
  getHuggingFaceFileUrl,
  formatBytes,
  formatTime
};
