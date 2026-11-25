import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  REA_CONTRACT,
  REA_TOOL_POLICIES,
  TargetRegistry,
  getReaToolPolicy,
  normalizeToolEvidence,
  resolveReaBinary,
} from '../../../src/engine/index.js';
import { sanitizeMcpToolName } from '../../../src/mcp/index.js';

describe('src/engine policy, evidence, targets, resolver (P4-01..P4-09)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reengine-eng-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('classifies every single tool in the pinned REA 6.4.0 catalog (completeness check)', () => {
    const toolsJsonPath = path.resolve(
      process.cwd(),
      `test/fixtures/rea/${REA_CONTRACT.pinnedVersion}/mcp/tools.json`,
    );
    const catalog = JSON.parse(fs.readFileSync(toolsJsonPath, 'utf-8')) as Array<{ name: string }>;
    expect(catalog.length).toBe(170);
    expect(REA_TOOL_POLICIES.length).toBe(170);

    for (const tool of catalog) {
      const pol = getReaToolPolicy(tool.name);
      expect(pol, `Missing policy entry for REA tool "${tool.name}"`).toBeDefined();
    }
  });

  it('normalizes REA call-js-success fixture into observed/inferred/unknown EvidenceRecords without mutating input', () => {
    const fixturePath = path.resolve(
      process.cwd(),
      `test/fixtures/rea/${REA_CONTRACT.pinnedVersion}/mcp/call-js-success.json`,
    );
    const rawFixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as {
      content: Array<{ text: string }>;
    };
    const text = rawFixture.content[0]?.text ?? '';
    const records = normalizeToolEvidence('analyze_javascript_application', undefined, text);
    expect(records.length).toBeGreaterThan(0);
    expect(records.some((r) => r.status === 'observed')).toBe(true);
    expect(records.some((r) => r.status === 'inferred')).toBe(true);
    expect(records.some((r) => (r.limitations?.length ?? 0) > 0)).toBe(true);

    // Total function: malformed inputs never throw
    expect(normalizeToolEvidence('unknown_tool', null, 'not json')).toEqual([]);
  });

  it('resolves bundled rea-agents binary and manages targets', () => {
    const resolved = resolveReaBinary();
    expect(resolved.source).toBe('bundled');
    expect(resolved.version).toBe(REA_CONTRACT.pinnedVersion);

    const sampleFile = path.join(tmpDir, 'target.js');
    fs.writeFileSync(sampleFile, 'console.log(1);', 'utf-8');
    const reg = new TargetRegistry();
    const detected = reg.detectImplicitTargets(`Please inspect ${sampleFile}`, tmpDir);
    expect(detected.length).toBe(1);
    reg.saveToProject(tmpDir);

    const reg2 = new TargetRegistry();
    reg2.loadFromProject(tmpDir);
    expect(reg2.list().length).toBe(1);
  });

  it('sanitizes and truncates MCP tool names > 64 chars without collisions', () => {
    const used = new Set<string>();
    const longA = sanitizeMcpToolName('server', 'a'.repeat(70), used);
    const longB = sanitizeMcpToolName('server', 'a'.repeat(69) + 'b', used);
    expect(longA.length).toBeLessThanOrEqual(64);
    expect(longB.length).toBeLessThanOrEqual(64);
    expect(longA).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(longA).not.toBe(longB);
  });
});
