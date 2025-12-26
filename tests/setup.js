import { expect, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import path from 'path';
import { fileURLToPath } from 'url';

// Set test database path BEFORE importing any backend modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, 'backend', 'data', 'test-sd-webui.db');
process.env.DB_PATH = TEST_DB_PATH;

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Don't mock fetch globally - let individual test files decide
// Integration tests need real fetch, unit tests can mock it locally
