/**
 * WebSocket Status Indicator
 *
 * Displays a visual indicator of the WebSocket connection status.
 * Shows "Live" when connected, "Offline" when disconnected.
 */

import { useWebSocket } from '../contexts/WebSocketContext';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

export function WebSocketStatusIndicator() {
  const { isConnected, isConnecting } = useWebSocket();

  return (
    <div
      className="flex items-center gap-1.5 text-xs"
      title={`WebSocket ${isConnected ? 'connected' : 'disconnected'}`}
    >
      {isConnecting ? (
        <>
          <Loader2 className="h-3.5 w-3.5 text-yellow-500 animate-spin" />
          <span className="text-yellow-600 dark:text-yellow-400 hidden sm:inline">Connecting...</span>
        </>
      ) : isConnected ? (
        <>
          <Wifi className="h-3.5 w-3.5 text-green-500" />
          <span className="text-green-600 dark:text-green-400 font-medium hidden sm:inline">Live</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-red-500" />
          <span className="text-red-600 dark:text-red-400 hidden sm:inline">Offline</span>
        </>
      )}
    </div>
  );
}

export default WebSocketStatusIndicator;
