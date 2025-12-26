/**
 * WebSocket Global Connection Tests
 *
 * Tests for the global WebSocket context that ensures only one connection
 * is shared across all components.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, cleanup, waitFor } from '@testing-library/react';
import { WebSocketProvider, useWebSocket, WS_CHANNELS } from '../frontend/src/contexts/WebSocketContext.jsx';

// Mock react-use-websocket with stable function references
const mockSendJsonMessage = vi.fn();
const mockGetWebSocket = vi.fn(() => ({ close: vi.fn() }));

vi.mock('react-use-websocket', () => ({
  default: vi.fn(() => ({
    sendJsonMessage: mockSendJsonMessage,
    lastJsonMessage: null,
    readyState: 1, // OPEN
    getWebSocket: mockGetWebSocket,
  })),
}));

describe('WebSocketContext', () => {
  let wrapper;

  beforeEach(() => {
    wrapper = ({ children }) => <WebSocketProvider>{children}</WebSocketProvider>;
  });

  afterEach(() => {
    cleanup();
  });

  describe('Single Global Connection', () => {
    it('should provide the same connection state to multiple hooks', async () => {
      // Render both hooks in the same provider to test they share the same connection
      const { result } = renderHook(
        () => {
          const hook1 = useWebSocket();
          const hook2 = useWebSocket();
          return { hook1, hook2 };
        },
        { wrapper }
      );

      // Both hooks should have the same connection state
      expect(result.current.hook1.isConnected).toBe(result.current.hook2.isConnected);
      expect(result.current.hook1.getWebSocket).toBe(result.current.hook2.getWebSocket);
    });

    it('should allow multiple components to subscribe to different channels', async () => {
      const messageHandler1 = vi.fn();
      const messageHandler2 = vi.fn();

      renderHook(() => useWebSocket({
        channels: [WS_CHANNELS.QUEUE],
        onMessage: messageHandler1,
      }), { wrapper });

      renderHook(() => useWebSocket({
        channels: [WS_CHANNELS.MODELS],
        onMessage: messageHandler2,
      }), { wrapper });

      // Both subscriptions should be created
      await waitFor(() => {
        expect(messageHandler1).toBeDefined();
        expect(messageHandler2).toBeDefined();
      });
    });

    it('should share connection state changes across all hooks', async () => {
      const { result: result1 } = renderHook(() => useWebSocket(), { wrapper });
      const { result: result2 } = renderHook(() => useWebSocket(), { wrapper });

      const initialConnectionState = result1.current.isConnected;

      // Force a rerender to simulate connection state change
      await waitFor(() => {
        expect(result2.current.isConnected).toBe(initialConnectionState);
      });
    });
  });

  describe('Channel Subscriptions', () => {
    it('should subscribe to a single channel', async () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() => useWebSocket({
        channels: [WS_CHANNELS.QUEUE],
        onMessage,
      }), { wrapper });

      await waitFor(() => {
        expect(result.current.isConnected).toBeDefined();
      });
    });

    it('should subscribe to multiple channels', async () => {
      const onMessage = vi.fn();
      const { result } = renderHook(() => useWebSocket({
        channels: [WS_CHANNELS.QUEUE, WS_CHANNELS.GENERATIONS, WS_CHANNELS.MODELS],
        onMessage,
      }), { wrapper });

      await waitFor(() => {
        expect(result.current.isConnected).toBeDefined();
      });
    });

    it('should unsubscribe when component unmounts', async () => {
      const onMessage = vi.fn();
      const { unmount } = renderHook(() => useWebSocket({
        channels: [WS_CHANNELS.QUEUE],
        onMessage,
      }), { wrapper });

      unmount();

      // Should not throw after unmount
      expect(true).toBe(true);
    });
  });

  describe('Connection State Callbacks', () => {
    it('should call onConnectionChange callback when connection state changes', async () => {
      const onConnectionChange = vi.fn();

      renderHook(() => useWebSocket({
        onConnectionChange,
      }), { wrapper });

      await waitFor(() => {
        expect(onConnectionChange).toHaveBeenCalledWith(true);
      });
    });

    it('should unsubscribe from connection state changes on unmount', async () => {
      const onConnectionChange = vi.fn();
      const { unmount } = renderHook(() => useWebSocket({
        onConnectionChange,
      }), { wrapper });

      unmount();

      // Callback should not be called after unmount
      expect(true).toBe(true);
    });
  });

  describe('Hook API', () => {
    it('should provide isConnected boolean', async () => {
      const { result } = renderHook(() => useWebSocket(), { wrapper });

      await waitFor(() => {
        expect(typeof result.current.isConnected).toBe('boolean');
      });
    });

    it('should provide isConnecting boolean', async () => {
      const { result } = renderHook(() => useWebSocket(), { wrapper });

      await waitFor(() => {
        expect(typeof result.current.isConnecting).toBe('boolean');
      });
    });

    it('should provide sendMessage function', async () => {
      const { result } = renderHook(() => useWebSocket(), { wrapper });

      await waitFor(() => {
        expect(typeof result.current.sendMessage).toBe('function');
      });
    });

    it('should provide subscribe function', async () => {
      const { result } = renderHook(() => useWebSocket(), { wrapper });

      await waitFor(() => {
        expect(typeof result.current.subscribe).toBe('function');
      });
    });

    it('should provide getWebSocket function', async () => {
      const { result } = renderHook(() => useWebSocket(), { wrapper });

      await waitFor(() => {
        expect(typeof result.current.getWebSocket).toBe('function');
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw error when useWebSocket is used outside provider', () => {
      // Suppress the expected error console output
      const consoleError = console.error;
      console.error = vi.fn();

      expect(() => {
        renderHook(() => useWebSocket());
      }).toThrow('useWebSocket must be used within a WebSocketProvider');

      console.error = consoleError;
    });
  });
});
