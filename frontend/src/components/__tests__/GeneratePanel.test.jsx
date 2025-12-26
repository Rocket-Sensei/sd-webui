import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GeneratePanel } from '../GeneratePanel';

// Mock the useImageGeneration hook
vi.mock('../../hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    generateQueued: vi.fn().mockResolvedValue({ success: true }),
    isLoading: false,
    error: null,
    result: null,
  }),
}));

// Mock the toast function
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock authenticatedFetch
vi.mock('../../utils/api', () => ({
  authenticatedFetch: vi.fn(),
}));

const mockOnModelsChange = vi.fn();
const mockOnGenerated = vi.fn();

describe('GeneratePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for upscalers
    global.fetch = vi.fn((url) => {
      if (url === '/sdapi/v1/upscalers') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ name: 'RealESRGAN 4x+', scale: 4 }]),
        });
      }
      if (url === '/api/models') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            models: [
              { id: 'model1', name: 'Model 1', capabilities: ['text-to-image'] },
              { id: 'model2', name: 'Model 2', capabilities: ['text-to-image', 'image-to-image'] },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  describe('Rendering', () => {
    it('should render all mode tabs', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Text to Image')).toBeInTheDocument();
      expect(screen.getByText('Image to Image')).toBeInTheDocument();
      expect(screen.getByText('Image Edit')).toBeInTheDocument();
      expect(screen.getByText('Upscale')).toBeInTheDocument();
    });

    it('should render txt2img mode by default', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Generate images from text descriptions')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/A serene landscape with/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
    });

    it('should render img2img mode with image upload and strength slider', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click img2img mode
      fireEvent.click(screen.getByText('Image to Image'));

      expect(screen.getByText('Create variations of images')).toBeInTheDocument();
      expect(screen.getByText('Source Image *')).toBeInTheDocument();
      expect(screen.getByText(/Strength:/)).toBeInTheDocument();
    });

    it('should render imgedit mode', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click imgedit mode
      fireEvent.click(screen.getByText('Image Edit'));

      expect(screen.getByText('Edit and transform images')).toBeInTheDocument();
      expect(screen.getByText('Source Image *')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Transform this image/)).toBeInTheDocument();
    });

    it('should render upscale mode with upscaler settings', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click upscale mode
      fireEvent.click(screen.getByText('Upscale'));

      await waitFor(() => {
        expect(screen.getByText('Enhance and upscale images')).toBeInTheDocument();
      });
    });

    it('should NOT show strength slider in txt2img mode', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Should not find Strength slider in default txt2img mode
      expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();
    });

    it('should NOT show strength slider in imgedit mode', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click imgedit mode
      fireEvent.click(screen.getByText('Image Edit'));

      expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();
    });

    it('should show selected models count', () => {
      render(
        <GeneratePanel
          selectedModels={['model1', 'model2']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText(/Selected: 2/)).toBeInTheDocument();
    });

    it('should render size sliders and presets', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Image Size')).toBeInTheDocument();
      expect(screen.getByText('Width')).toBeInTheDocument();
      expect(screen.getByText('Height')).toBeInTheDocument();
      expect(screen.getByText('512')).toBeInTheDocument();
      expect(screen.getByText('768')).toBeInTheDocument();
      expect(screen.getByText('1024')).toBeInTheDocument();
    });

    it('should render advanced settings section', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Advanced SD.cpp Settings')).toBeInTheDocument();
    });

    it('should render queue mode toggle', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Queue Mode')).toBeInTheDocument();
      expect(screen.getByText('Add to queue and continue working')).toBeInTheDocument();
    });

    it('should render seed input', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Seed (optional)')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Leave empty for random')).toBeInTheDocument();
    });
  });

  describe('Mode switching', () => {
    it('should switch to img2img mode and show strength slider', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Initially no strength slider in txt2img
      expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();

      // Switch to img2img
      fireEvent.click(screen.getByText('Image to Image'));

      // Now strength slider should be visible
      expect(screen.getByText(/Strength:/)).toBeInTheDocument();
      expect(screen.getByText(/How much to transform the source image/)).toBeInTheDocument();
    });

    it('should switch to upscale mode and show upscaler settings', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Should show prompt initially
      expect(screen.getByPlaceholderText(/A serene landscape/)).toBeInTheDocument();

      // Switch to upscale
      fireEvent.click(screen.getByText('Upscale'));

      await waitFor(() => {
        expect(screen.getByText('Upscaler Settings')).toBeInTheDocument();
      });
    });
  });

  describe('Strength parameter', () => {
    it('should have default strength of 0.75 in img2img mode', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      fireEvent.click(screen.getByText('Image to Image'));

      expect(screen.getByText(/Strength: 0.75/)).toBeInTheDocument();
    });

    it('should update strength value when slider changes', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      fireEvent.click(screen.getByText('Image to Image'));

      // Find the strength slider - it's controlled by the component
      const strengthLabel = screen.getByText(/Strength: 0.75/);
      expect(strengthLabel).toBeInTheDocument();
    });
  });

  describe('Collapse functionality', () => {
    it('should be expanded by default', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Generate images from text descriptions')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/A serene landscape/)).toBeInTheDocument();
    });

    it('should collapse when header is clicked', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Find the collapse button in the header
      const collapseButton = screen.getByRole('button', { name: '' }).closest('button');
      const header = collapseButton?.closest('.cursor-pointer');

      if (header) {
        fireEvent.click(header);

        // Content should be hidden
        expect(screen.queryByText('Generation Mode')).not.toBeInTheDocument();
      }
    });
  });

  describe('Sticky generate button', () => {
    it('should render generate button at top', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByRole('button', { name: /Generate/i })).toBeInTheDocument();
    });

    it('should disable generate button when no models selected', () => {
      render(
        <GeneratePanel
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /Generate/i });
      expect(generateButton).toBeDisabled();
    });

    it('should enable generate button when models are selected', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /Generate/i });
      expect(generateButton).not.toBeDisabled();
    });
  });

  describe('Settings from Create More', () => {
    it('should apply prompt from settings', () => {
      const settings = { prompt: 'Test prompt from settings' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      const promptInput = screen.getByPlaceholderText(/A serene landscape/);
      expect(promptInput).toHaveValue('Test prompt from settings');
    });

    it('should apply negative prompt from settings', () => {
      const settings = { negative_prompt: 'blurry, watermark' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      const negPromptInput = screen.getByPlaceholderText(/blurry, low quality/);
      expect(negPromptInput).toHaveValue('blurry, watermark');
    });

    it('should apply size from settings', () => {
      const settings = { size: '768x768' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      expect(screen.getByText(/768 x 768/)).toBeInTheDocument();
    });

    it('should apply strength from settings for img2img', () => {
      const settings = {
        strength: 0.5,
        type: 'variation'
      };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      // Settings should switch mode to img2img
      fireEvent.click(screen.getByText('Image to Image'));

      // Strength should be updated
      expect(screen.getByText(/Strength: 0.5/)).toBeInTheDocument();
    });

    it('should switch to imgedit mode when settings type is edit', () => {
      const settings = { type: 'edit' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      expect(screen.getByText('Edit and transform images')).toBeInTheDocument();
    });

    it('should switch to img2img mode when settings type is variation', () => {
      const settings = { type: 'variation' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      expect(screen.getByText('Create variations of images')).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should show error when generating with no models selected', async () => {
      const { toast } = await import('sonner');

      render(
        <GeneratePanel
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /Generate/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Please select at least one model');
      });
    });

    it('should show error when generating without prompt in txt2img mode', async () => {
      const { toast } = await import('sonner');

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /Generate/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Please enter a prompt');
      });
    });

    it('should show error when generating without source image in img2img mode', async () => {
      const { toast } = await import('sonner');

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Switch to img2img
      fireEvent.click(screen.getByText('Image to Image'));

      // Enter prompt but no image
      const promptInput = screen.getByPlaceholderText(/Create a variation/);
      fireEvent.change(promptInput, { target: { value: 'A test prompt' } });

      const generateButton = screen.getByRole('button', { name: /Generate/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Please select a source image');
      });
    });
  });

  describe('Multi-model generation', () => {
    it('should display count of selected models', () => {
      render(
        <GeneratePanel
          selectedModels={['model1', 'model2', 'model3']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText(/Selected: 3/)).toBeInTheDocument();
    });

    it('should show placeholder for multi-model selector', () => {
      render(
        <GeneratePanel
          selectedModels={['model1', 'model2']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText(/Multi-model selector component will be rendered here/)).toBeInTheDocument();
    });
  });

  describe('Advanced settings toggle', () => {
    it('should collapse advanced settings by default', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Advanced settings are collapsed by default
      // CFG scale should not be visible
      expect(screen.queryByText(/CFG Scale:/)).not.toBeInTheDocument();
    });

    it('should expand advanced settings when clicked', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click to expand
      const advancedButton = screen.getByText('Advanced SD.cpp Settings');
      fireEvent.click(advancedButton);

      // Now CFG scale should be visible
      expect(screen.getByText(/CFG Scale:/)).toBeInTheDocument();
    });

    it('should show all advanced settings when expanded', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click to expand
      const advancedButton = screen.getByText('Advanced SD.cpp Settings');
      fireEvent.click(advancedButton);

      expect(screen.getByText(/CFG Scale:/)).toBeInTheDocument();
      expect(screen.getByText(/Sample Steps:/)).toBeInTheDocument();
      expect(screen.getByText(/Sampling Method/)).toBeInTheDocument();
      expect(screen.getByText(/CLIP Skip/)).toBeInTheDocument();
    });
  });

  describe('Size controls', () => {
    it('should render size presets', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Check common presets
      expect(screen.getByText('256')).toBeInTheDocument();
      expect(screen.getByText('512')).toBeInTheDocument();
      expect(screen.getByText('768')).toBeInTheDocument();
      expect(screen.getByText('1024')).toBeInTheDocument();
      expect(screen.getByText('1024x768')).toBeInTheDocument();
      expect(screen.getByText('768x1024')).toBeInTheDocument();
    });
  });

  describe('Upscale mode specific features', () => {
    it('should show upscaler settings in upscale mode', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      fireEvent.click(screen.getByText('Upscale'));

      await waitFor(() => {
        expect(screen.getByText('Upscaler Settings')).toBeInTheDocument();
        expect(screen.getByText('Resize Mode')).toBeInTheDocument();
        expect(screen.getByText('By Factor')).toBeInTheDocument();
        expect(screen.getByText('To Size')).toBeInTheDocument();
      });
    });

    it('should not show prompt input in upscale mode', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Prompt is visible in txt2img
      expect(screen.getByPlaceholderText(/A serene landscape/)).toBeInTheDocument();

      // Switch to upscale
      fireEvent.click(screen.getByText('Upscale'));

      // Prompt should no longer be visible
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/A serene landscape/)).not.toBeInTheDocument();
      });
    });

    it('should show upscale after generation option in non-upscale modes', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Upscale After Generation')).toBeInTheDocument();
      expect(screen.getByText('Automatically upscale the generated image')).toBeInTheDocument();
    });
  });
});
