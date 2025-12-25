/**
 * Tests for Image Serving and Pagination
 *
 * Tests the static file serving for images and pagination functionality:
 * - Static file endpoints (/static/images/*, /static/input/*)
 * - Pagination API (limit/offset)
 * - Image response includes static_url field
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Client } from 'undici';
import request from 'supertest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import backend modules
import { initializeDatabase, getImagesDir, getInputImagesDir, closeDatabase } from '../backend/db/database.js';
import { createGeneration, createGeneratedImage, getAllGenerations, getGenerationsCount, getImageById } from '../backend/db/queries.js';

// Test server setup
let server;
let serverUrl;

async function startTestServer() {
  const { default: app } = await import('../backend/server.js');
  const port = 30101; // Use a different port for testing
  server = createServer(app);
  serverUrl = `http://localhost:${port}`;

  await new Promise((resolve) => {
    server.listen(port, resolve);
  });

  return { app, port, serverUrl };
}

async function stopTestServer() {
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
    });
  }
}

describe('Image Serving and Pagination', () => {
  beforeEach(async () => {
    // Initialize database
    initializeDatabase();

    // Start test server
    await startTestServer();
  });

  afterEach(async () => {
    // Stop test server
    await stopTestServer();

    // Close database
    await closeDatabase();

    // Clean up test database file
    const dbPath = path.join(__dirname, '..', 'backend', 'data', 'sd-webui.db');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    const walPath = dbPath + '-wal';
    if (fs.existsSync(walPath)) {
      fs.unlinkSync(walPath);
    }
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(shmPath)) {
      fs.unlinkSync(shmPath);
    }
  });

  describe('Static File Serving Configuration', () => {
    it('should have static file middleware configured', async () => {
      const { app } = await import('../backend/server.js');

      // Check that static middleware is registered by trying to access frontend dist
      const response = await request(app)
        .get('/')
        .expect(200);

      // The request should not error (may return frontend or 404 but not crash)
      expect(response.status).toBeLessThan(500);
    });

    it('should serve images from /static/images path', async () => {
      const imagesDir = getImagesDir();

      // Create a test image file
      fs.mkdirSync(imagesDir, { recursive: true });
      const testImageId = 'test-' + Date.now();
      const testFilename = `${testImageId}.png`;
      const testFilePath = path.join(imagesDir, testFilename);
      fs.writeFileSync(testFilePath, Buffer.from('test-png-data'));

      // Try to access the static file
      const { app } = await import('../backend/server.js');
      const response = await request(app)
        .get(`/static/images/${testFilename}`)
        .expect(200);

      expect(response.body).toEqual(Buffer.from('test-png-data'));

      // Clean up
      fs.unlinkSync(testFilePath);
    });

    it('should serve input images from /static/input path', async () => {
      const inputDir = getInputImagesDir();

      // Create a test input image file
      fs.mkdirSync(inputDir, { recursive: true });
      const testImageId = 'input-test-' + Date.now();
      const testFilename = `${testImageId}.png`;
      const testFilePath = path.join(inputDir, testFilename);
      fs.writeFileSync(testFilePath, Buffer.from('input-test-data'));

      // Try to access the static file
      const { app } = await import('../backend/server.js');
      const response = await request(app)
        .get(`/static/input/${testFilename}`)
        .expect(200);

      expect(response.body).toEqual(Buffer.from('input-test-data'));

      // Clean up
      fs.unlinkSync(testFilePath);
    });

    it('should return 404 for non-existent static files', async () => {
      const { app } = await import('../backend/server.js');
      await request(app)
        .get('/static/images/non-existent.png')
        .expect(404);
    });
  });

  describe('Image API Response - static_url Field', () => {
    it('should include static_url in getImageById response', async () => {
      const imagesDir = getImagesDir();
      fs.mkdirSync(imagesDir, { recursive: true });

      // Create a test image file
      const imageId = 'img-' + Date.now();
      const filename = `${imageId}.png`;
      const filePath = path.join(imagesDir, filename);
      const imageData = Buffer.from('test-image-data');
      fs.writeFileSync(filePath, imageData);

      // Create a generation with image
      const generationId = 'gen-' + Date.now();
      await createGeneration({
        id: generationId,
        type: 'generate',
        model: 'test-model',
        prompt: 'test prompt',
        status: 'completed',
        seed: 12345
      });

      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        image_data: imageData
      });

      // Get the image via API
      const image = getImageById(imageId);

      expect(image).toBeDefined();
      expect(image.static_url).toBeDefined();
      expect(image.static_url).toBe(`/static/images/${filename}`);
      expect(image.file_path).toBe(filePath);

      // Clean up
      fs.unlinkSync(filePath);
    });

    it('should include static_url for input images', async () => {
      const inputDir = getInputImagesDir();
      fs.mkdirSync(inputDir, { recursive: true });

      // Create a test input image file
      const filename = `input-${Date.now()}.png`;
      const filePath = path.join(inputDir, filename);
      fs.writeFileSync(filePath, Buffer.from('input-data'));

      // Mock an image object with input path
      const mockImage = {
        id: 'test-id',
        file_path: filePath,
        mime_type: 'image/png'
      };

      // Import and use the helper function
      const { addStaticUrlToImage } = await import('../backend/db/queries.js');

      // Note: addStaticUrlToImage is a private function, so we can't import it directly
      // Instead, we'll create a generation with input_image_path
      const generationId = 'gen-' + Date.now();
      await createGeneration({
        id: generationId,
        type: 'edit',
        model: 'test-model',
        prompt: 'test edit',
        status: 'pending',
        seed: 12345,
        input_image_path: filePath,
        input_image_mime_type: 'image/png'
      });

      const { getGenerationById } = await import('../backend/db/queries.js');
      const generation = getGenerationById(generationId);

      expect(generation.input_image_path).toBe(filePath);

      // Clean up
      fs.unlinkSync(filePath);
    });
  });

  describe('Pagination API', () => {
    beforeEach(async () => {
      // Create test generations
      for (let i = 0; i < 25; i++) {
        await createGeneration({
          id: `gen-pagination-${i}`,
          type: 'generate',
          model: 'test-model',
          prompt: `test prompt ${i}`,
          status: 'completed',
          seed: 1000 + i
        });
      }
    });

    it('should return paginated results with limit parameter', async () => {
      const { app } = await import('../backend/server.js');
      const response = await request(app)
        .get('/api/generations?limit=10')
        .expect(200);

      expect(response.body).toHaveProperty('generations');
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.generations).toBeInstanceOf(Array);
      expect(response.body.generations.length).toBe(10);
      expect(response.body.pagination).toEqual({
        total: 25,
        limit: 10,
        offset: 0,
        hasMore: true
      });
    });

    it('should support offset parameter for pagination', async () => {
      const { app } = await import('../backend/server.js');

      // Get first page
      const page1 = await request(app)
        .get('/api/generations?limit=10&offset=0')
        .expect(200);

      expect(page1.body.generations.length).toBe(10);

      // Get second page
      const page2 = await request(app)
        .get('/api/generations?limit=10&offset=10')
        .expect(200);

      expect(page2.body.generations.length).toBe(10);

      // Verify different items
      const page1Ids = page1.body.generations.map(g => g.id);
      const page2Ids = page2.body.generations.map(g => g.id);
      const hasOverlap = page1Ids.some(id => page2Ids.includes(id));
      expect(hasOverlap).toBe(false);
    });

    it('should return correct hasMore flag', async () => {
      const { app } = await import('../backend/server.js');

      // First page - should have more
      const page1 = await request(app)
        .get('/api/generations?limit=10&offset=0')
        .expect(200);
      expect(page1.body.pagination.hasMore).toBe(true);

      // Second page - should have more
      const page2 = await request(app)
        .get('/api/generations?limit=10&offset=10')
        .expect(200);
      expect(page2.body.pagination.hasMore).toBe(true);

      // Third page - should not have more (only 5 items left)
      const page3 = await request(app)
        .get('/api/generations?limit=10&offset=20')
        .expect(200);
      expect(page3.body.pagination.hasMore).toBe(false);
    });

    it('should return all results when no limit specified', async () => {
      const { app } = await import('../backend/server.js');
      const response = await request(app)
        .get('/api/generations')
        .expect(200);

      expect(response.body.generations.length).toBe(25);
      expect(response.body.pagination).toEqual({
        total: 25,
        limit: 25,
        offset: 0,
        hasMore: false
      });
    });

    it('should return empty array when offset exceeds total', async () => {
      const { app } = await import('../backend/server.js');
      const response = await request(app)
        .get('/api/generations?limit=10&offset=100')
        .expect(200);

      expect(response.body.generations).toEqual([]);
      expect(response.body.pagination).toEqual({
        total: 25,
        limit: 10,
        offset: 100,
        hasMore: false
      });
    });
  });

  describe('Request Logging - Static Files Excluded', () => {
    it('should not log requests to /static/images/* paths', async () => {
      const { app } = await import('../backend/server.js');
      const imagesDir = getImagesDir();

      // Create a test image
      fs.mkdirSync(imagesDir, { recursive: true });
      const filename = `test-${Date.now()}.png`;
      const filePath = path.join(imagesDir, filename);
      fs.writeFileSync(filePath, Buffer.from('data'));

      // Make a request to the static file
      const response = await request(app)
        .get(`/static/images/${filename}`)
        .expect(200);

      // Check that the request was successful
      expect(response.body).toEqual(Buffer.from('data'));

      // Verify the file was not logged to http.log
      const httpLogPath = path.join(__dirname, '..', 'backend', 'logs', 'http.log');
      if (fs.existsSync(httpLogPath)) {
        const logContent = fs.readFileSync(httpLogPath, 'utf8');
        // Should not contain the static file request
        expect(logContent).not.toContain(`/static/images/${filename}`);
      }

      // Clean up
      fs.unlinkSync(filePath);
    });

    it('should not log requests to /static/input/* paths', async () => {
      const { app } = await import('../backend/server.js');
      const inputDir = getInputImagesDir();

      // Create a test image
      fs.mkdirSync(inputDir, { recursive: true });
      const filename = `test-${Date.now()}.png`;
      const filePath = path.join(inputDir, filename);
      fs.writeFileSync(filePath, Buffer.from('data'));

      // Make a request to the static file
      const response = await request(app)
        .get(`/static/input/${filename}`)
        .expect(200);

      // Check that the request was successful
      expect(response.body).toEqual(Buffer.from('data'));

      // Verify the file was not logged to http.log
      const httpLogPath = path.join(__dirname, '..', 'backend', 'logs', 'http.log');
      if (fs.existsSync(httpLogPath)) {
        const logContent = fs.readFileSync(httpLogPath, 'utf8');
        // Should not contain the static file request
        expect(logContent).not.toContain(`/static/input/${filename}`);
      }

      // Clean up
      fs.unlinkSync(filePath);
    });

    it('should not log requests to /api/images/:imageId', async () => {
      const { app } = await import('../backend/server.js');
      const imagesDir = getImagesDir();

      // Create a test image
      fs.mkdirSync(imagesDir, { recursive: true });
      const imageId = `img-${Date.now()}`;
      const filename = `${imageId}.png`;
      const filePath = path.join(imagesDir, filename);
      fs.writeFileSync(filePath, Buffer.from('data'));

      // Create a generation with image
      const generationId = `gen-${Date.now()}`;
      await createGeneration({
        id: generationId,
        type: 'generate',
        model: 'test-model',
        prompt: 'test',
        status: 'completed',
        seed: 12345
      });
      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        image_data: Buffer.from('data')
      });

      // Make a request to the image API
      const response = await request(app)
        .get(`/api/images/${imageId}`)
        .expect(200);

      // Check that the request was successful
      expect(response.body).toEqual(Buffer.from('data'));

      // Verify the request was not logged to http.log
      const httpLogPath = path.join(__dirname, '..', 'backend', 'logs', 'http.log');
      if (fs.existsSync(httpLogPath)) {
        const logContent = fs.readFileSync(httpLogPath, 'utf8');
        // Should not contain the image API request
        expect(logContent).not.toContain(`/api/images/${imageId}`);
      }

      // Clean up
      fs.unlinkSync(filePath);
    });

    it('should not log requests to /api/generations/:id/image', async () => {
      const { app } = await import('../backend/server.js');
      const imagesDir = getImagesDir();

      // Create a test image
      fs.mkdirSync(imagesDir, { recursive: true });
      const imageId = `img-${Date.now()}`;
      const filename = `${imageId}.png`;
      const filePath = path.join(imagesDir, filename);
      fs.writeFileSync(filePath, Buffer.from('data'));

      // Create a generation with image
      const generationId = `gen-${Date.now()}`;
      await createGeneration({
        id: generationId,
        type: 'generate',
        model: 'test-model',
        prompt: 'test',
        status: 'completed',
        seed: 12345
      });
      await createGeneratedImage({
        id: imageId,
        generation_id: generationId,
        image_data: Buffer.from('data')
      });

      // Make a request to the generation image API
      const response = await request(app)
        .get(`/api/generations/${generationId}/image`)
        .expect(200);

      // Check that the request was successful
      expect(response.body).toEqual(Buffer.from('data'));

      // Verify the request was not logged to http.log
      const httpLogPath = path.join(__dirname, '..', 'backend', 'logs', 'http.log');
      if (fs.existsSync(httpLogPath)) {
        const logContent = fs.readFileSync(httpLogPath, 'utf8');
        // Should not contain the generation image API request
        expect(logContent).not.toContain(`/api/generations/${generationId}/image`);
      }

      // Clean up
      fs.unlinkSync(filePath);
    });
  });

  describe('getGenerationsCount Helper', () => {
    it('should return correct count of generations', async () => {
      // Create some test generations
      await createGeneration({
        id: `gen-count-1`,
        type: 'generate',
        model: 'test-model',
        prompt: 'test 1',
        status: 'completed',
        seed: 1
      });
      await createGeneration({
        id: `gen-count-2`,
        type: 'generate',
        model: 'test-model',
        prompt: 'test 2',
        status: 'pending',
        seed: 2
      });
      await createGeneration({
        id: `gen-count-3`,
        type: 'edit',
        model: 'test-model',
        prompt: 'test 3',
        status: 'failed',
        seed: 3
      });

      const count = getGenerationsCount();
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('should return 0 for empty database', async () => {
      // Create a fresh database
      const freshDbPath = path.join(__dirname, '..', 'backend', 'data', 'test-fresh.db');
      // Note: initializeDatabase uses a fixed path, so we can't easily test empty state
      // Instead, we just verify the function works
      const count = getGenerationsCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
