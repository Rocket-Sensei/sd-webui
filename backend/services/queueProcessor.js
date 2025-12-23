import { getNextPendingJob, updateJobStatus, updateJobProgress, deleteJob } from '../db/queueQueries.js';
import { generateImageDirect } from './imageService.js';
import { createGeneration, createGeneratedImage } from '../db/queries.js';
import { randomUUID } from 'crypto';

let isProcessing = false;
let currentJob = null;
let pollInterval = null;

/**
 * Start the queue processor
 */
export function startQueueProcessor(intervalMs = 1000) {
  if (pollInterval) {
    console.log('Queue processor already running');
    return;
  }

  console.log('Starting queue processor...');
  processQueue();

  pollInterval = setInterval(processQueue, intervalMs);
}

/**
 * Stop the queue processor
 */
export function stopQueueProcessor() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('Queue processor stopped');
  }
}

/**
 * Get current job being processed
 */
export function getCurrentJob() {
  return currentJob;
}

/**
 * Process the next job in the queue
 */
async function processQueue() {
  // Don't start if already processing a job
  if (isProcessing) {
    return;
  }

  const job = getNextPendingJob();
  if (!job) {
    return;
  }

  isProcessing = true;
  currentJob = job;

  console.log(`Processing job ${job.id}: ${job.prompt?.substring(0, 50)}...`);

  try {
    // Update status to processing
    updateJobStatus(job.id, 'processing');

    // Process the job based on type
    let result;
    switch (job.type) {
      case 'generate':
        result = await processGenerateJob(job);
        break;
      case 'edit':
        result = await processEditJob(job);
        break;
      case 'variation':
        result = await processVariationJob(job);
        break;
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }

    // Update status to completed
    updateJobStatus(job.id, 'completed', {
      generation_id: result.generationId,
    });

    console.log(`Job ${job.id} completed successfully`);
  } catch (error) {
    console.error(`Job ${job.id} failed:`, error);
    updateJobStatus(job.id, 'failed', {
      error: error.message,
    });
  } finally {
    isProcessing = false;
    currentJob = null;
  }
}

/**
 * Process a text-to-image generation job
 */
async function processGenerateJob(job) {
  // Update progress
  updateJobProgress(job.id, 0.1);

  const params = {
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed ? parseInt(job.seed) : null,
    n: job.n,
    quality: job.quality,
    style: job.style,
  };

  updateJobProgress(job.id, 0.3);

  // Generate images
  const response = await generateImageDirect(params, 'generate');

  updateJobProgress(job.id, 0.7);

  // Create generation record
  const generationId = randomUUID();
  await createGeneration({
    id: generationId,
    type: 'generate',
    model: job.model,
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed,
    n: job.n,
    quality: job.quality,
    style: job.style,
  });

  updateJobProgress(job.id, 0.9);

  // Save images
  if (response.data && response.data.length > 0) {
    for (let i = 0; i < response.data.length; i++) {
      const imageData = response.data[i];
      const imageId = randomUUID();

      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        index_in_batch: i,
        image_data: Buffer.from(imageData.b64_json, 'base64'),
        mime_type: 'image/png',
        width: null, // Will be populated if available
        height: null,
        revised_prompt: imageData.revised_prompt,
      });
    }
  }

  return { generationId };
}

/**
 * Process an image-to-image edit job
 */
async function processEditJob(job) {
  // Similar to generate but with source image
  const params = {
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed ? parseInt(job.seed) : null,
    n: job.n || 1,
  };

  updateJobProgress(job.id, 0.3);

  // For now, reuse the generate logic
  // In full implementation, this would handle source_image_id
  const response = await generateImageDirect(params, 'edit');

  updateJobProgress(job.id, 0.7);

  const generationId = randomUUID();
  await createGeneration({
    id: generationId,
    type: 'edit',
    model: job.model,
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed,
    n: params.n,
    source_image_id: job.source_image_id,
  });

  updateJobProgress(job.id, 0.9);

  if (response.data && response.data.length > 0) {
    for (let i = 0; i < response.data.length; i++) {
      const imageData = response.data[i];
      const imageId = randomUUID();

      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        index_in_batch: i,
        image_data: Buffer.from(imageData.b64_json, 'base64'),
        mime_type: 'image/png',
        width: null,
        height: null,
        revised_prompt: imageData.revised_prompt,
      });
    }
  }

  return { generationId };
}

/**
 * Process a variation job
 */
async function processVariationJob(job) {
  // Similar to edit
  const params = {
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed ? parseInt(job.seed) : null,
    n: job.n || 1,
  };

  updateJobProgress(job.id, 0.3);

  const response = await generateImageDirect(params, 'variation');

  updateJobProgress(job.id, 0.7);

  const generationId = randomUUID();
  await createGeneration({
    id: generationId,
    type: 'variation',
    model: job.model,
    prompt: job.prompt,
    negative_prompt: job.negative_prompt,
    size: job.size,
    seed: job.seed,
    n: params.n,
    source_image_id: job.source_image_id,
  });

  updateJobProgress(job.id, 0.9);

  if (response.data && response.data.length > 0) {
    for (let i = 0; i < response.data.length; i++) {
      const imageData = response.data[i];
      const imageId = randomUUID();

      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        index_in_batch: i,
        image_data: Buffer.from(imageData.b64_json, 'base64'),
        mime_type: 'image/png',
        width: null,
        height: null,
        revised_prompt: imageData.revised_prompt,
      });
    }
  }

  return { generationId };
}
