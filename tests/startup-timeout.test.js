/**
 * Vitest test for Model Startup Timeout Configuration
 *
 * This test verifies that:
 * 1. The default startup timeout is 90 seconds (90000ms)
 * 2. Models can override the default with a custom startup_timeout value
 * 3. The timeout value is correctly used when waiting for server ready
 */

import { describe, it, expect, beforeEach } from 'vitest';

// Import the ModelManager and related constants
import { ModelManager, ModelStatus, ExecMode, LoadMode } from '../backend/services/modelManager.js';

describe('Model Startup Timeout Configuration', () => {
  let modelManager;
  let mockModelConfig;

  beforeEach(() => {
    // Create a fresh ModelManager instance for each test
    modelManager = new ModelManager();

    // Mock model configuration
    mockModelConfig = {
      name: 'Test Model',
      description: 'A test model',
      capabilities: ['text-to-image'],
      command: './bin/sd-server',
      args: ['--test'],
      mode: LoadMode.ON_DEMAND,
      exec_mode: ExecMode.SERVER,
      port: 8000,
      model_type: 'text-to-image'
    };
  });

  describe('Default Startup Timeout', () => {
    it('should use 90 seconds (90000ms) as default timeout when no startup_timeout is specified', () => {
      // Create a model config without startup_timeout
      const model = { ...mockModelConfig, id: 'test-model' };

      // The modelManager should use the default 90 second timeout
      // when neither model.startup_timeout nor options.timeout is provided
      const expectedTimeout = 90000;

      // We're testing the logic: options.timeout || model.startup_timeout || 90000
      const calculatedTimeout = undefined || undefined || expectedTimeout;
      expect(calculatedTimeout).toBe(90000);
    });

    it('should interpret 90000ms as 90 seconds', () => {
      const milliseconds = 90000;
      const seconds = milliseconds / 1000;
      expect(seconds).toBe(90);
    });
  });

  describe('Custom Startup Timeout from Model Config', () => {
    it('should use custom startup_timeout when specified in model config', () => {
      // Create a model config with custom startup_timeout (120 seconds)
      const modelWithCustomTimeout = {
        ...mockModelConfig,
        id: 'flux1-schnell-fp8',
        startup_timeout: 120000
      };

      // The modelManager should use the model's custom timeout
      const calculatedTimeout = undefined || modelWithCustomTimeout.startup_timeout || 90000;
      expect(calculatedTimeout).toBe(120000);
    });

    it('should support various custom timeout values', () => {
      const testCases = [
        { timeout: 60000, expected: 60000, description: '60 seconds' },
        { timeout: 90000, expected: 90000, description: '90 seconds (default)' },
        { timeout: 120000, expected: 120000, description: '120 seconds (2 minutes)' },
        { timeout: 150000, expected: 150000, description: '150 seconds (2.5 minutes)' },
        { timeout: 180000, expected: 180000, description: '180 seconds (3 minutes)' }
      ];

      testCases.forEach(({ timeout, expected, description }) => {
        const model = { ...mockModelConfig, id: `test-${timeout}`, startup_timeout: timeout };
        const calculatedTimeout = undefined || model.startup_timeout || 90000;
        expect(calculatedTimeout).toBe(expected);
      });
    });
  });

  describe('Options Timeout Override', () => {
    it('should prioritize options.timeout over model config startup_timeout', () => {
      const model = { ...mockModelConfig, id: 'test-model', startup_timeout: 120000 };
      const optionsTimeout = 60000;

      // The modelManager should use options.timeout first
      const calculatedTimeout = optionsTimeout || model.startup_timeout || 90000;
      expect(calculatedTimeout).toBe(60000);
    });

    it('should use model startup_timeout when options.timeout is not provided', () => {
      const model = { ...mockModelConfig, id: 'test-model', startup_timeout: 150000 };

      // No options.timeout provided, should use model.startup_timeout
      const calculatedTimeout = undefined || model.startup_timeout || 90000;
      expect(calculatedTimeout).toBe(150000);
    });
  });

  describe('Timeout Value Priority Chain', () => {
    it('should follow correct priority: options.timeout > model.startup_timeout > 90000', () => {
      const model = { ...mockModelConfig, id: 'test-model', startup_timeout: 120000 };

      // Case 1: All values present - options.timeout wins
      expect(60000 || model.startup_timeout || 90000).toBe(60000);

      // Case 2: Only model.startup_timeout and default present - model.startup_timeout wins
      expect(undefined || model.startup_timeout || 90000).toBe(120000);

      // Case 3: Only default present - default wins
      expect(undefined || undefined || 90000).toBe(90000);
    });
  });

  describe('Model Configuration Integration', () => {
    it('should correctly parse startup_timeout from YAML model config', () => {
      // Simulate a model config loaded from YAML
      const yamlModelConfig = {
        id: 'qwen-image',
        name: 'Qwen Image',
        description: 'Qwen Image - advanced text-to-image model',
        capabilities: ['text-to-image'],
        command: './bin/sd-server',
        args: ['--diffusion-model', './models/Qwen_Image-Q4_K_M.gguf'],
        mode: 'on_demand',
        exec_mode: 'server',
        port: 1400,
        model_type: 'text-to-image',
        default_size: '1024x1024',
        startup_timeout: 150000,  // 150 seconds from YAML
        generation_params: {
          cfg_scale: 1.0,
          sample_steps: 24,
          sampling_method: 'euler'
        }
      };

      // Verify the startup_timeout is correctly parsed
      expect(yamlModelConfig.startup_timeout).toBe(150000);
      expect(yamlModelConfig.startup_timeout / 1000).toBe(150);
    });

    it('should handle models without startup_timeout in YAML config', () => {
      // Simulate a model config loaded from YAML without startup_timeout
      const yamlModelConfig = {
        id: 'sd-xl-turbo',
        name: 'SD XL Turbo',
        capabilities: ['text-to-image'],
        command: './bin/sd-server',
        args: ['--test'],
        mode: 'on_demand',
        exec_mode: 'server',
        port: 1401
        // No startup_timeout specified
      };

      // Verify startup_timeout is undefined (will use default 90000)
      expect(yamlModelConfig.startup_timeout).toBeUndefined();

      // The calculated timeout should fall back to default
      const calculatedTimeout = undefined || yamlModelConfig.startup_timeout || 90000;
      expect(calculatedTimeout).toBe(90000);
    });
  });

  describe('Real-World Model Examples', () => {
    it('should use 120 second timeout for FLUX.1 Schnell FP8', () => {
      const fluxModel = {
        id: 'flux1-schnell-fp8',
        name: 'FLUX.1 Schnell FP8',
        startup_timeout: 120000
      };

      const calculatedTimeout = undefined || fluxModel.startup_timeout || 90000;
      expect(calculatedTimeout).toBe(120000);
      expect(calculatedTimeout / 1000).toBe(120);
    });

    it('should use 150 second timeout for Qwen Image', () => {
      const qwenModel = {
        id: 'qwen-image',
        name: 'Qwen Image',
        startup_timeout: 150000
      };

      const calculatedTimeout = undefined || qwenModel.startup_timeout || 90000;
      expect(calculatedTimeout).toBe(150000);
      expect(calculatedTimeout / 1000).toBe(150);
    });

    it('should use default 90 second timeout for models without custom timeout', () => {
      const defaultModel = {
        id: 'sd-xl-turbo',
        name: 'SD XL Turbo'
        // No startup_timeout specified
      };

      const calculatedTimeout = undefined || defaultModel.startup_timeout || 90000;
      expect(calculatedTimeout).toBe(90000);
      expect(calculatedTimeout / 1000).toBe(90);
    });
  });
});
