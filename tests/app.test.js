/**
 * Tests for App component and routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock the child components with factory functions
vi.mock('../frontend/src/components/Studio', () => ({
  Studio: () => React.createElement('div', { 'data-testid': 'studio' }, 'Studio'),
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

  it('should render Toaster component', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('toaster')).toBeTruthy();
  });

  it('should render Studio component at / route (redirected to /studio)', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should render Studio component at /studio route', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/studio'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should redirect /generate to /studio', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/generate'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should redirect /gallery to /studio', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/gallery'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should redirect /models to /studio', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/models'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should redirect root / to /studio', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should render WebSocketStatusIndicator', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('websocket-status')).toBeTruthy();
  });
});
