import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initializeDatabase, getImagesDir } from './db/database.js';
import { generateImage } from './services/imageService.js';
import { getAllGenerations, getGenerationById, getImageById, getImagesByGenerationId } from './db/queries.js';
import { addToQueue, getJobs, getJobById, cancelJob, getQueueStats } from './db/queueQueries.js';
import { startQueueProcessor } from './services/queueProcessor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from frontend build
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  }
});

// Initialize database
initializeDatabase();

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get API config (for client to know the SD API endpoint)
app.get('/api/config', (req, res) => {
  res.json({
    sdApiEndpoint: process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1234/v1',
    model: 'sd-cpp-local'
  });
});

// Generate image (text-to-image)
app.post('/api/generate', async (req, res) => {
  try {
    const result = await generateImage(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate image edit (image-to-image)
app.post('/api/edit', upload.single('image'), async (req, res) => {
  try {
    const result = await generateImage({
      ...req.body,
      image: req.file
    }, 'edit');
    res.json(result);
  } catch (error) {
    console.error('Error editing image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate image variation
app.post('/api/variation', upload.single('image'), async (req, res) => {
  try {
    const result = await generateImage({
      ...req.body,
      image: req.file
    }, 'variation');
    res.json(result);
  } catch (error) {
    console.error('Error creating variation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all generations
app.get('/api/generations', async (req, res) => {
  try {
    const generations = await getAllGenerations();
    res.json(generations);
  } catch (error) {
    console.error('Error fetching generations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single generation
app.get('/api/generations/:id', async (req, res) => {
  try {
    const generation = await getGenerationById(req.params.id);
    if (!generation) {
      return res.status(404).json({ error: 'Generation not found' });
    }
    res.json(generation);
  } catch (error) {
    console.error('Error fetching generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get image file by image ID (for thumbnails and specific images)
app.get('/api/images/:imageId', async (req, res) => {
  try {
    const image = getImageById(req.params.imageId);
    if (!image) {
      return res.status(404).json({ error: 'Image not found' });
    }
    res.set('Content-Type', image.mime_type);
    res.sendFile(image.file_path);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get first image for a generation (for backwards compatibility)
app.get('/api/generations/:id/image', async (req, res) => {
  try {
    const generation = await getGenerationById(req.params.id);
    if (!generation || !generation.images || generation.images.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const firstImage = generation.images[0];
    res.set('Content-Type', firstImage.mime_type);
    res.sendFile(firstImage.file_path);
  } catch (error) {
    console.error('Error fetching image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all images for a generation
app.get('/api/generations/:id/images', async (req, res) => {
  try {
    const images = await getImagesByGenerationId(req.params.id);
    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete generation
app.delete('/api/generations/:id', async (req, res) => {
  try {
    const { deleteGeneration } = await import('./db/database.js');
    await deleteGeneration(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting generation:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== Queue API Endpoints ==========

// Add job to queue (text-to-image)
app.post('/api/queue/generate', async (req, res) => {
  try {
    const job = addToQueue({
      type: 'generate',
      model: req.body.model || 'sd-cpp-local',
      prompt: req.body.prompt,
      negative_prompt: req.body.negative_prompt,
      size: req.body.size,
      n: req.body.n,
      quality: req.body.quality,
      style: req.body.style,
    });
    res.json({ job_id: job.id, status: job.status });
  } catch (error) {
    console.error('Error adding to queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add job to queue (image-to-image edit)
app.post('/api/queue/edit', upload.single('image'), async (req, res) => {
  try {
    const job = addToQueue({
      type: 'edit',
      model: req.body.model || 'sd-cpp-local',
      prompt: req.body.prompt,
      negative_prompt: req.body.negative_prompt,
      size: req.body.size,
      n: req.body.n,
      source_image_id: req.body.source_image_id,
    });
    res.json({ job_id: job.id, status: job.status });
  } catch (error) {
    console.error('Error adding to queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add job to queue (variation)
app.post('/api/queue/variation', upload.single('image'), async (req, res) => {
  try {
    const job = addToQueue({
      type: 'variation',
      model: req.body.model || 'sd-cpp-local',
      prompt: req.body.prompt,
      negative_prompt: req.body.negative_prompt,
      size: req.body.size,
      n: req.body.n,
      source_image_id: req.body.source_image_id,
    });
    res.json({ job_id: job.id, status: job.status });
  } catch (error) {
    console.error('Error adding to queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all jobs in queue
app.get('/api/queue', async (req, res) => {
  try {
    const status = req.query.status || null;
    const jobs = getJobs(status, 100);
    const stats = getQueueStats();
    res.json({ jobs, stats });
  } catch (error) {
    console.error('Error fetching queue:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single job
app.get('/api/queue/:id', async (req, res) => {
  try {
    const job = getJobById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel job
app.delete('/api/queue/:id', async (req, res) => {
  try {
    const job = cancelJob(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found or cannot be cancelled' });
    }
    res.json({ success: true, job });
  } catch (error) {
    console.error('Error cancelling job:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get queue statistics
app.get('/api/queue/stats', async (req, res) => {
  try {
    const stats = getQueueStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`SD API endpoint: ${process.env.SD_API_ENDPOINT || 'http://192.168.2.180:1234/v1'}`);

  // Start the queue processor
  startQueueProcessor(2000);
  console.log(`Queue processor started (polling every 2 seconds)`);
});
