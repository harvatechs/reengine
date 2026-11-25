import { describe, expect, it } from 'vitest';
import { main } from '../../src/cli/main.js';

describe('scaffold smoke', () => {
  it('exports main entrypoint', () => {
    expect(typeof main).toBe('function');
  });
});
