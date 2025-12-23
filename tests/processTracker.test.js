/**
 * Process Tracker Tests
 *
 * Tests for the ProcessTracker service.
 * Note: These tests can run without sdcpp installed by using mock processes.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  registerProcess,
  unregisterProcess,
  getProcess,
  getAllProcesses,
  killProcess,
  cleanupZombies,
  getAvailablePort,
  isPortAvailable,
  isProcessRunning,
  getProcessStats,
  getProcessesByExecMode,
  getProcessByPort,
  sendHeartbeat,
  updateProcessStatus,
  ProcessStatus,
  _processes,
  _usedPorts
} from '../backend/services/processTracker.js';

// Store mock PIDs for process.kill mocking
const mockPids = new Set();

describe('ProcessTracker', () => {
  let originalKill;

  beforeEach(() => {
    // Clear all processes before each test
    _processes.clear();
    _usedPorts.clear();
    mockPids.clear();

    // Store and mock process.kill
    originalKill = process.kill;
    process.kill = vi.fn((pid, signal) => {
      if (mockPids.has(pid)) {
        if (signal === 0) {
          // Signal 0 check - pretend our mock process exists
          return true;
        }
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          // Pretend the kill succeeded (process was terminated)
          return true;
        }
        throw new Error('ESRCH'); // Other signals not supported
      }
      try {
        return originalKill.call(process, pid, signal);
      } catch (e) {
        // If original fails, throw ESRCH for consistency
        if (e.code === 'ESRCH') throw e;
        return true; // For signal 0, return true for other PIDs too
      }
    });
  });

  afterEach(() => {
    // Restore original process.kill
    process.kill = originalKill;
  });

  describe('Process Registration', () => {
    it('should register a process successfully', () => {
      const mockProcess = createMockProcess(12345);
      const procInfo = registerProcess('test-model', mockProcess, 8000, 'server');

      expect(procInfo).toBeDefined();
      expect(procInfo.modelId).toBe('test-model');
      expect(procInfo.pid).toBe(12345);
      expect(procInfo.port).toBe(8000);
      expect(procInfo.execMode).toBe('server');
      expect(procInfo.status).toBe(ProcessStatus.STARTING);
    });

    it('should throw error when registering without modelId', () => {
      const mockProcess = createMockProcess(12345);
      expect(() => {
        registerProcess(null, mockProcess, 8000, 'server');
      }).toThrow('modelId is required');
    });

    it('should throw error when registering without process', () => {
      expect(() => {
        registerProcess('test-model', null, 8000, 'server');
      }).toThrow('process is required');
    });

    it('should throw error when registering without port', () => {
      const mockProcess = createMockProcess(12345);
      expect(() => {
        registerProcess('test-model', mockProcess, null, 'server');
      }).toThrow('port is required');
    });

    it('should throw error when registering with invalid execMode', () => {
      const mockProcess = createMockProcess(12345);
      expect(() => {
        registerProcess('test-model', mockProcess, 8000, 'invalid');
      }).toThrow('execMode must be "server" or "cli"');
    });

    it('should replace existing process when registering same modelId', () => {
      const mockProcess1 = createMockProcess(12345);
      const mockProcess2 = createMockProcess(12346);

      registerProcess('test-model', mockProcess1, 8000, 'server');
      const procInfo2 = registerProcess('test-model', mockProcess2, 8001, 'server');

      expect(procInfo2.pid).toBe(12346);
      expect(procInfo2.port).toBe(8001);

      const retrieved = getProcess('test-model');
      expect(retrieved.pid).toBe(12346);
    });
  });

  describe('Process Retrieval', () => {
    it('should get a process by modelId', () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      const procInfo = getProcess('test-model');

      expect(procInfo).toBeDefined();
      expect(procInfo.modelId).toBe('test-model');
      expect(procInfo.pid).toBe(12345);
      expect(procInfo.port).toBe(8000);
    });

    it('should return null for non-existent process', () => {
      const procInfo = getProcess('non-existent');
      expect(procInfo).toBeNull();
    });

    it('should get all processes', () => {
      const mockProcess1 = createMockProcess(12345);
      const mockProcess2 = createMockProcess(12346);

      registerProcess('model1', mockProcess1, 8000, 'server');
      registerProcess('model2', mockProcess2, 8001, 'cli');

      const allProcesses = getAllProcesses();

      expect(allProcesses).toHaveLength(2);
      expect(allProcesses.some(p => p.modelId === 'model1')).toBe(true);
      expect(allProcesses.some(p => p.modelId === 'model2')).toBe(true);
    });

    it('should get processes by exec mode', () => {
      registerProcess('server-model', createMockProcess(12345), 8000, 'server');
      registerProcess('cli-model', createMockProcess(12346), 8001, 'cli');

      const serverProcesses = getProcessesByExecMode('server');
      const cliProcesses = getProcessesByExecMode('cli');

      expect(serverProcesses).toHaveLength(1);
      expect(cliProcesses).toHaveLength(1);
      expect(serverProcesses[0].modelId).toBe('server-model');
      expect(cliProcesses[0].modelId).toBe('cli-model');
    });

    it('should get process by port', () => {
      registerProcess('model1', createMockProcess(12345), 8000, 'server');
      registerProcess('model2', createMockProcess(12346), 8001, 'cli');

      const procInfo = getProcessByPort(8001);

      expect(procInfo).toBeDefined();
      expect(procInfo.modelId).toBe('model2');
      expect(procInfo.port).toBe(8001);
    });
  });

  describe('Process Unregistration', () => {
    it('should unregister a process', () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      const unregistered = unregisterProcess('test-model');

      expect(unregistered).toBe(true);
      expect(getProcess('test-model')).toBeNull();
    });

    it('should return false when unregistering non-existent process', () => {
      const unregistered = unregisterProcess('non-existent');
      expect(unregistered).toBe(false);
    });

    it('should release port when unregistering', () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      unregisterProcess('test-model');

      // Port should be available
      expect(_usedPorts.has(8000)).toBe(false);
    });
  });

  describe('Process Status', () => {
    it('should update process status', () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      const updated = updateProcessStatus('test-model', ProcessStatus.RUNNING);

      expect(updated).toBe(true);
      expect(getProcess('test-model').status).toBe(ProcessStatus.RUNNING);
    });

    it('should return false when updating non-existent process status', () => {
      const updated = updateProcessStatus('non-existent', ProcessStatus.RUNNING);
      expect(updated).toBe(false);
    });

    it('should check if process is running', () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      expect(isProcessRunning('test-model')).toBe(true);

      updateProcessStatus('test-model', ProcessStatus.STOPPED);
      expect(isProcessRunning('test-model')).toBe(false);
    });

    it('should return false for non-existent process when checking if running', () => {
      expect(isProcessRunning('non-existent')).toBe(false);
    });
  });

  describe('Heartbeat', () => {
    it('should send heartbeat for process', async () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      const initialHeartbeat = getProcess('test-model').lastHeartbeat;

      // Wait a bit then send heartbeat
      await new Promise(resolve => setTimeout(resolve, 10));

      const sent = sendHeartbeat('test-model');
      expect(sent).toBe(true);

      const newHeartbeat = getProcess('test-model').lastHeartbeat;
      expect(newHeartbeat).toBeGreaterThan(initialHeartbeat);
    });

    it('should transition from STARTING to RUNNING on heartbeat', () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      expect(getProcess('test-model').status).toBe(ProcessStatus.STARTING);

      sendHeartbeat('test-model');

      expect(getProcess('test-model').status).toBe(ProcessStatus.RUNNING);
    });

    it('should return false when sending heartbeat for non-existent process', () => {
      const sent = sendHeartbeat('non-existent');
      expect(sent).toBe(false);
    });
  });

  describe('Process Statistics', () => {
    it('should return process statistics', () => {
      registerProcess('model1', createMockProcess(12345), 8000, 'server');
      registerProcess('model2', createMockProcess(12346), 8001, 'cli');

      const stats = getProcessStats();

      expect(stats.total).toBe(2);
      expect(stats.portsUsed).toBe(2);
      expect(stats.byExecMode.server).toBe(1);
      expect(stats.byExecMode.cli).toBe(1);
      expect(stats.byStatus[ProcessStatus.STARTING]).toBe(2);
    });
  });

  describe('Kill Process', () => {
    it('should kill a process', () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      const killed = killProcess('test-model');

      expect(killed).toBe(true);
      expect(getProcess('test-model')).toBeNull();
    });

    it('should return false when killing non-existent process', () => {
      const killed = killProcess('non-existent');
      expect(killed).toBe(false);
    });
  });

  describe('Port Availability', () => {
    it('should get available port', async () => {
      // This test finds an available port in the range
      const port = await getAvailablePort();

      expect(port).toBeGreaterThanOrEqual(8000);
      expect(port).toBeLessThanOrEqual(9000);
    });

    it('should check if port is available', async () => {
      // Most ports in the high range should be available for testing
      const available = await isPortAvailable(8999);

      // Result depends on system state
      expect(typeof available).toBe('boolean');
    });
  });

  describe('Zombie Cleanup', () => {
    it('should cleanup stopped processes', () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      // Simulate process exit
      updateProcessStatus('test-model', ProcessStatus.STOPPED);

      const zombiesCleaned = cleanupZombies();

      expect(zombiesCleaned).toBe(1);
      expect(getProcess('test-model')).toBeNull();
    });

    it('should not cleanup running processes', () => {
      const mockProcess = createMockProcess(12345);
      registerProcess('test-model', mockProcess, 8000, 'server');

      // Mock processes have valid PIDs (in our test), so they should not be cleaned up
      cleanupZombies();

      // Process should still exist since it's "running"
      expect(getProcess('test-model')).not.toBeNull();
    });
  });
});

/**
 * Helper function to create a mock process object
 */
function createMockProcess(pid) {
  // Add PID to mock PIDs set for process.kill mocking
  mockPids.add(pid);

  const mockProcess = {
    pid,
    on: vi.fn(),
    kill: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() }
  };

  return mockProcess;
}
