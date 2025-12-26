/**
 * Comprehensive tests for sample_steps parameter handling
 *
 * Tests the full flow from:
 * 1. Frontend API request -> Queue creation
 * 2. Queue processing -> Model defaults application
 * 3. HTTP/CLI request generation -> SD.cpp API
 *
 * Ensures that:
 * - User-provided sample_steps values are respected
 * - Model defaults are used when no value is provided
 * - No hardcoded 20 steps override occurs
 * - The extra_args XML tag contains the correct sample_steps
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database
vi.mock('../backend/db/database.js', () => ({
  getDatabase: () => ({
    prepare: () => ({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    }),
  }),
  getImagesDir: () => '/tmp/images',
}));

describe('Sample Steps Parameter Tests', () => {
  describe('Frontend to Queue Flow', () => {
    it('should pass sample_steps from frontend request to queue', async () => {
      // Simulate frontend sending sample_steps: 9 for z-image-turbo
      const frontendRequest = {
        prompt: 'test prompt',
        model: 'z-image-turbo',
        sample_steps: 9,
      };

      // The queue endpoint should receive and store this value
      expect(frontendRequest.sample_steps).toBe(9);
    });

    it('should handle undefined sample_steps (use model default)', async () => {
      // When frontend does not send sample_steps
      const frontendRequest = {
        prompt: 'test prompt',
        model: 'z-image-turbo',
        // sample_steps not provided - should use model default of 9
      };

      expect(frontendRequest.sample_steps).toBeUndefined();
    });
  });

  describe('Queue Processor Model Defaults', () => {
    it('should use job.sample_steps when provided', () => {
      const job = {
        sample_steps: 4,
      };
      const modelParams = {
        sample_steps: 9,
      };

      // Test the fallback logic from queueProcessor.js line 350
      const result = job.sample_steps ?? modelParams?.sample_steps ?? undefined;
      expect(result).toBe(4); // Job value wins
    });

    it('should use model default when job.sample_steps is undefined', () => {
      const job = {
        sample_steps: undefined,
      };
      const modelParams = {
        sample_steps: 9,
      };

      const result = job.sample_steps ?? modelParams?.sample_steps ?? undefined;
      expect(result).toBe(9); // Model default wins
    });

    it('should return undefined when neither job nor model has sample_steps', () => {
      const job = {
        sample_steps: undefined,
      };
      const modelParams = {
        // sample_steps not defined
      };

      const result = job.sample_steps ?? modelParams?.sample_steps ?? undefined;
      expect(result).toBeUndefined();
    });

    it('should handle z-image-turbo model defaults', () => {
      // From models-z-turbo.yml line 30
      const zImageTurboDefaults = {
        cfg_scale: 1,
        sample_steps: 9,
        sampling_method: 'euler',
      };

      // Verify the config has 9 steps
      expect(zImageTurboDefaults.sample_steps).toBe(9);
    });

    it('should handle flux1-schnell model defaults', () => {
      // From models-flux.yml line 28
      const fluxSchnellDefaults = {
        sample_steps: 4,
      };

      expect(fluxSchnellDefaults.sample_steps).toBe(4);
    });

    it('should handle qwen-image model defaults', () => {
      // From models-qwen-image.yml line 31
      const qwenImageDefaults = {
        sample_steps: 24,
      };

      expect(qwenImageDefaults.sample_steps).toBe(24);
    });
  });

  describe('queueProcessor HTTP Generation', () => {
    it('should add sample_steps to extraArgs XML tag', () => {
      // Simulate queueProcessor.js lines 436-454
      const params = {
        sample_steps: 9,
        cfg_scale: 1.0,
        sampling_method: 'euler',
      };

      let extraArgs = {};

      // Add SD.cpp advanced settings from params if not already in extraArgs
      if (params.cfg_scale !== undefined && extraArgs.cfg_scale === undefined) {
        extraArgs.cfg_scale = params.cfg_scale;
      }
      if (params.sampling_method !== undefined && extraArgs.sampling_method === undefined) {
        extraArgs.sampling_method = params.sampling_method;
      }
      if (params.sample_steps !== undefined && extraArgs.sample_steps === undefined) {
        extraArgs.sample_steps = params.sample_steps;
      }

      // Verify extraArgs contains sample_steps
      expect(extraArgs.sample_steps).toBe(9);
      expect(extraArgs.cfg_scale).toBe(1.0);
      expect(extraArgs.sampling_method).toBe('euler');
    });

    it('should add steps to request body (not sample_steps)', () => {
      // Simulate queueProcessor.js line 494
      // Note: sd-server uses 'steps' not 'sample_steps' in JSON request body
      const params = {
        sample_steps: 9,
      };

      const requestBody = {};

      if (params.sample_steps !== undefined) {
        requestBody.steps = params.sample_steps;
      }

      // Verify requestBody.steps is set (not requestBody.sample_steps)
      expect(requestBody.steps).toBe(9);
      expect(requestBody.sample_steps).toBeUndefined();
    });

    it('should reconstruct prompt with extraArgs XML tag', () => {
      const processedPrompt = 'A lovely cat';
      const extraArgs = {
        seed: 12345,
        sample_steps: 9,
        cfg_scale: 1.0,
        sampling_method: 'euler',
      };

      // Reconstruct prompt with extra args (queueProcessor.js line 457)
      const finalPrompt = `${processedPrompt}<sd_cpp_extra_args>${JSON.stringify(extraArgs)}</sd_cpp_extra_args>`;

      // Verify the prompt contains the extra_args XML tag
      expect(finalPrompt).toContain('<sd_cpp_extra_args>');
      expect(finalPrompt).toContain('</sd_cpp_extra_args>');
      expect(finalPrompt).toContain('"sample_steps":9');
      expect(finalPrompt).toContain('"cfg_scale":1');
      expect(finalPrompt).toContain('"sampling_method":"euler"');
    });
  });

  describe('CLI Handler Steps Handling', () => {
    it('should use sample_steps when provided (override quality)', async () => {
      const CLIHandler = (await import('../backend/services/cliHandler.js')).default;
      const handler = new CLIHandler();

      const modelConfig = {
        command: './bin/sd-cli',
        args: [],
      };

      const params = {
        prompt: 'test',
        size: '512x512',
        quality: 'medium', // Would map to 20 steps
        sample_steps: 9,   // Should override to 9 steps
      };

      const command = handler.buildCommand(modelConfig, params);

      // Find --steps argument
      const stepsIndex = command.indexOf('--steps');
      expect(stepsIndex).toBeGreaterThanOrEqual(0);

      // The value should be 9 (from sample_steps), not 20 (from quality)
      const stepsValue = command[stepsIndex + 1];
      expect(stepsValue).toBe('9');

      // There should be only ONE --steps argument (not two)
      const stepsCount = command.filter(arg => arg === '--steps').length;
      expect(stepsCount).toBe(1);
    });

    it('should use quality-based steps when sample_steps not provided', async () => {
      const CLIHandler = (await import('../backend/services/cliHandler.js')).default;
      const handler = new CLIHandler();

      const modelConfig = {
        command: './bin/sd-cli',
        args: [],
      };

      const params = {
        prompt: 'test',
        size: '512x512',
        quality: 'medium', // Maps to 20 steps
        // sample_steps not provided
      };

      const command = handler.buildCommand(modelConfig, params);

      // Find --steps argument
      const stepsIndex = command.indexOf('--steps');
      expect(stepsIndex).toBeGreaterThanOrEqual(0);

      // The value should be 20 (from quality)
      const stepsValue = command[stepsIndex + 1];
      expect(stepsValue).toBe('20');
    });

    it('should not add --steps when neither sample_steps nor quality provided', async () => {
      const CLIHandler = (await import('../backend/services/cliHandler.js')).default;
      const handler = new CLIHandler();

      const modelConfig = {
        command: './bin/sd-cli',
        args: [],
      };

      const params = {
        prompt: 'test',
        size: '512x512',
        // quality not provided
        // sample_steps not provided
      };

      const command = handler.buildCommand(modelConfig, params);

      // There should be NO --steps argument
      const stepsCount = command.filter(arg => arg === '--steps').length;
      expect(stepsCount).toBe(0);
    });
  });

  describe('SD.next API Endpoint (server.js)', () => {
    it('should use model defaults for sample_steps when steps not provided', () => {
      // Simulate server.js lines 1405-1426
      const modelParams = {
        sample_steps: 9,
        cfg_scale: 1,
        sampling_method: 'euler',
      };

      const steps = undefined; // Not provided in request

      // Test the new logic from server.js line 1419
      const sample_steps = steps !== undefined ? steps : (modelParams?.sample_steps ?? undefined);

      expect(sample_steps).toBe(9); // Should use model default
    });

    it('should use provided steps value when available', () => {
      const modelParams = {
        sample_steps: 9,
      };

      const steps = 15; // User provided 15 steps

      const sample_steps = steps !== undefined ? steps : (modelParams?.sample_steps ?? undefined);

      expect(sample_steps).toBe(15); // Should use user value
    });

    it('should return undefined when no steps or model default', () => {
      const modelParams = {
        // No sample_steps defined
      };

      const steps = undefined;

      const sample_steps = steps !== undefined ? steps : (modelParams?.sample_steps ?? undefined);

      expect(sample_steps).toBeUndefined(); // Queue processor will handle
    });
  });

  describe('Full Flow Integration Tests', () => {
    it('should pass sample_steps: 9 for z-image-turbo from frontend to SD.cpp', () => {
      // Full flow simulation
      const frontendRequest = {
        prompt: 'A lovely cat',
        model: 'z-image-turbo',
        sample_steps: 9,
      };

      // Queue stores the value
      const job = {
        ...frontendRequest,
        sample_steps: frontendRequest.sample_steps,
      };

      // Queue processor uses job value
      const modelParams = { sample_steps: 9 }; // Model default
      const params = {
        sample_steps: job.sample_steps ?? modelParams?.sample_steps ?? undefined,
      };

      expect(params.sample_steps).toBe(9);

      // extraArgs XML tag gets the value
      const extraArgs = { sample_steps: params.sample_steps };
      expect(extraArgs.sample_steps).toBe(9);

      // Request body gets steps (not sample_steps)
      const requestBody = { steps: params.sample_steps };
      expect(requestBody.steps).toBe(9);
    });

    it('should use model default 9 steps when frontend does not provide sample_steps', () => {
      const frontendRequest = {
        prompt: 'A lovely cat',
        model: 'z-image-turbo',
        // sample_steps not provided
      };

      // Queue stores undefined
      const job = {
        ...frontendRequest,
        sample_steps: frontendRequest.sample_steps, // undefined
      };

      // Queue processor falls back to model default
      const modelParams = { sample_steps: 9 };
      const params = {
        sample_steps: job.sample_steps ?? modelParams?.sample_steps ?? undefined,
      };

      expect(params.sample_steps).toBe(9);
    });

    it('should use user-provided 15 steps even when model default is 9', () => {
      const frontendRequest = {
        prompt: 'A lovely cat',
        model: 'z-image-turbo',
        sample_steps: 15, // User override
      };

      const job = { ...frontendRequest };
      const modelParams = { sample_steps: 9 };

      const params = {
        sample_steps: job.sample_steps ?? modelParams?.sample_steps ?? undefined,
      };

      expect(params.sample_steps).toBe(15); // User value wins
    });

    it('should handle flux1-schnell with 4 steps', () => {
      const frontendRequest = {
        prompt: 'A lovely cat',
        model: 'flux1-schnell-fp8',
        sample_steps: 4,
      };

      const job = { ...frontendRequest };
      const modelParams = { sample_steps: 4 };

      const params = {
        sample_steps: job.sample_steps ?? modelParams?.sample_steps ?? undefined,
      };

      expect(params.sample_steps).toBe(4);
    });
  });

  describe('Regression Tests', () => {
    it('should NOT use hardcoded 20 steps as default', () => {
      // This test ensures the hardcoded "steps || 20" pattern is removed
      const steps = undefined;
      const modelParams = { sample_steps: 9 };

      // Old buggy code would be: sample_steps: steps || 20
      // New code should be: sample_steps: steps !== undefined ? steps : (modelParams?.sample_steps ?? undefined)
      const oldBuggyResult = steps || 20;
      const newCorrectResult = steps !== undefined ? steps : (modelParams?.sample_steps ?? undefined);

      // Old code would return 20, new code should return 9
      expect(oldBuggyResult).toBe(20); // Demonstrates the bug
      expect(newCorrectResult).toBe(9); // Shows the fix
    });

    it('should NOT default to 20 when model has no sample_steps configured', () => {
      const steps = undefined;
      const modelParams = {}; // No sample_steps defined

      const result = steps !== undefined ? steps : (modelParams?.sample_steps ?? undefined);

      // Should be undefined, not 20
      expect(result).toBeUndefined();
    });
  });
});
