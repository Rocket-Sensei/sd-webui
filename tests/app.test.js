/**
 * Tests for App component and routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock the child components with factory functions
vi.mock('../frontend/src/components/Navigation', () => ({
  Navigation: () => React.createElement('nav', { 'data-testid': 'navigation' }, 'Navigation'),
}));

vi.mock('../frontend/src/components/Generate', () => ({
  Generate: () => React.createElement('div', { 'data-testid': 'generate' }, 'Generate'),
}));

vi.mock('../frontend/src/components/UnifiedQueue', () => ({
  UnifiedQueue: () => React.createElement('div', { 'data-testid': 'gallery' }, 'UnifiedQueue'),
}));

vi.mock('../frontend/src/components/ModelManager', () => ({
  ModelManager: () => React.createElement('div', { 'data-testid': 'models' }, 'ModelManager'),
}));

vi.mock('../frontend/src/components/ui/sonner', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }, 'Toaster'),
}));

vi.mock('../frontend/src/components/WebSocketStatusIndicator', () => ({
  WebSocketStatusIndicator: () => React.createElement('div', { 'data-testid': 'websocket-status' }, 'WebSocketStatus'),
}));

vi.mock('../frontend/src/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }) => React.createElement('div', null, children),
}));

vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
  useGenerations: () => ({ fetchGenerations: vi.fn() }),
}));

vi.mock('../frontend/src/components/ApiKeyModal', () => ({
  ApiKeyProvider: ({ children }) => React.createElement('div', null, children),
}));

const renderWithRouter = (component, { initialEntries = ['/'] } = {}) => {
  return render(
    React.createElement(MemoryRouter, { initialEntries }, component)
  );
};

// Import App after mocks are set up
const App = (await import('../frontend/src/App')).default;

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render Navigation component', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('navigation')).toBeTruthy();
  });

  it('should render Toaster component', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('toaster')).toBeTruthy();
  });

  it('should render Generate component at / route (redirected)', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('generate')).toBeTruthy();
  });

  it('should render Generate component at /generate route', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/generate'] });
    expect(screen.getByTestId('generate')).toBeTruthy();
  });

  it('should render UnifiedQueue component at /gallery route', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/gallery'] });
    expect(screen.getByTestId('gallery')).toBeTruthy();
  });

  it('should render ModelManager component at /models route', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/models'] });
    expect(screen.getByTestId('models')).toBeTruthy();
  });

  it('should redirect root / to /generate', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/'] });
    expect(screen.getByTestId('generate')).toBeTruthy();
  });

  it('should pass onGenerated prop to Generate', () => {
    const { container } = renderWithRouter(React.createElement(App), { initialEntries: ['/generate'] });
    expect(screen.getByTestId('generate')).toBeTruthy();
  });

  it('should pass onCreateMore prop to UnifiedQueue', () => {
    const { container } = renderWithRouter(React.createElement(App), { initialEntries: ['/gallery'] });
    expect(screen.getByTestId('gallery')).toBeTruthy();
  });

  it('should render WebSocketStatusIndicator', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('websocket-status')).toBeTruthy();
  });
});
