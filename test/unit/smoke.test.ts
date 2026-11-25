import { describe, expect, it } from 'vitest';
import { runCli } from '../../src/cli/main.js';

describe('scaffold smoke', () => {
  it('exports runCli entrypoint', () => {
    expect(typeof runCli).toBe('function');
  });
});
