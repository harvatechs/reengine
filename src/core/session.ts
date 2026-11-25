import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ContentPart, EvidenceRecord, Message, Usage } from './contracts.js';
import { SessionError, createSortableId } from '../util/index.js';

export type SessionRecordType =
  | 'session_start'
  | 'message'
  | 'tool_start'
  | 'tool_end'
  | 'permission'
  | 'compaction'
  | 'usage'
  | 'notice'
  | 'target_add'
  | 'target_remove'
  | 'todo';

export interface BaseSessionRecord {
  v: 1;
  type: SessionRecordType;
  ts: number;
  id: string;
  [key: string]: unknown;
}

interface SessionStartRecord extends BaseSessionRecord {
  type: 'session_start';
  cwd: string;
  model: string;
  reaVersion?: string | undefined;
  configSnapshot?: unknown;
}

export interface SessionSummary {
  id: string;
  createdAt: number;
  cwd: string;
  model: string;
  messageCount: number;
  filePath: string;
}

const ARTIFACT_ID_RE = /^[0-9a-f]{64}$/;

export class ArtifactStore {
  public readonly dir: string;

  constructor(sessionDir: string) {
    this.dir = path.join(sessionDir, 'artifacts');
  }

  public put(content: string | Uint8Array): {
    artifactId: string;
    bytes: number;
    filePath: string;
  } {
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : Buffer.from(content);
    const artifactId = createHash('sha256').update(buf).digest('hex');
    fs.mkdirSync(this.dir, { recursive: true });
    const target = path.join(this.dir, artifactId);
    if (!fs.existsSync(target)) {
      const tmp = path.join(this.dir, `.tmp-${artifactId}-${String(process.pid)}`);
      fs.writeFileSync(tmp, buf, { mode: 0o600 });
      fs.renameSync(tmp, target);
    }
    return { artifactId, bytes: buf.byteLength, filePath: target };
  }

  public get(artifactId: string): string {
    if (!ARTIFACT_ID_RE.test(artifactId)) {
      throw new SessionError('ARTIFACT_INVALID_ID', `Invalid artifact id: ${artifactId}`);
    }
    const target = path.join(this.dir, artifactId);
    if (!fs.existsSync(target)) {
      throw new SessionError('ARTIFACT_NOT_FOUND', `Artifact not found: ${artifactId}`);
    }
    return fs.readFileSync(target, 'utf-8');
  }

  public exists(artifactId: string): boolean {
    if (!ARTIFACT_ID_RE.test(artifactId)) return false;
    return fs.existsSync(path.join(this.dir, artifactId));
  }
}

export function spillToolOutput(
  rawText: string,
  thresholdTokens: number,
  artifacts: ArtifactStore,
): { modelView: string; artifactId?: string } {
  const estTokens = Math.ceil(Buffer.byteLength(rawText, 'utf-8') / 3.5);
  if (estTokens <= thresholdTokens) {
    return { modelView: rawText };
  }
  const { artifactId, bytes } = artifacts.put(rawText);
  const head = rawText.slice(0, 1500);
  const tail = rawText.slice(-1500);
  const modelView = [
    head,
    `\n... [TRUNCATED ${String(bytes)} bytes; full output stored in artifact ${artifactId}. Use artifact_read or artifact_search to inspect.] ...\n`,
    tail,
  ].join('');
  return { modelView, artifactId };
}

export class SessionStore {
  public readonly sessionId: string;
  public readonly sessionFile: string;
  public readonly sessionDir: string;
  public readonly artifacts: ArtifactStore;

  constructor(sessionsRootDir: string, sessionId: string = createSortableId('ses')) {
    this.sessionId = sessionId;
    this.sessionDir = path.join(sessionsRootDir, sessionId);
    this.sessionFile = path.join(sessionsRootDir, `${sessionId}.jsonl`);
    this.artifacts = new ArtifactStore(this.sessionDir);
  }

  public append(
    type: SessionRecordType,
    payload: Record<string, unknown>,
    ts = Date.now(),
  ): string {
    fs.mkdirSync(path.dirname(this.sessionFile), { recursive: true });
    const id = createSortableId('rec', ts);
    const record: BaseSessionRecord = { v: 1, type, ts, id, ...payload };
    fs.appendFileSync(this.sessionFile, JSON.stringify(record) + '\n', {
      encoding: 'utf-8',
      mode: 0o600,
    });
    return id;
  }

  public readRecords(): BaseSessionRecord[] {
    if (!fs.existsSync(this.sessionFile)) {
      return [];
    }
    const raw = fs.readFileSync(this.sessionFile, 'utf-8');
    const lines = raw.split('\n');
    const records: BaseSessionRecord[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? '';
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as Partial<BaseSessionRecord>;
        if (parsed.v === 1 && typeof parsed.type === 'string') {
          records.push(parsed as BaseSessionRecord);
        }
      } catch {
        // Ignore one trailing partial/corrupt line on crash recovery
        if (i < lines.length - 1) {
          throw new SessionError(
            'SESSION_CORRUPT',
            `Corrupt JSONL record at line ${String(i + 1)} in ${this.sessionFile}`,
          );
        }
      }
    }
    return records;
  }

  public loadMessages(): Message[] {
    const records = this.readRecords();
    const messages: Message[] = [];
    for (const rec of records) {
      if (rec.type === 'message' && rec.message) {
        messages.push(rec.message as Message);
      }
    }
    return repairIncompleteToolCalls(messages);
  }

  public loadEvidence(): EvidenceRecord[] {
    const records = this.readRecords();
    const out: EvidenceRecord[] = [];
    for (const rec of records) {
      if (rec.type === 'tool_end' && Array.isArray(rec.evidence)) {
        out.push(...(rec.evidence as EvidenceRecord[]));
      }
    }
    return out;
  }

  public loadUsageTotals(): Usage {
    const totals: Usage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    for (const rec of this.readRecords()) {
      if (rec.type === 'usage' && rec.usage) {
        const u = rec.usage as Usage;
        totals.inputTokens += u.inputTokens;
        totals.outputTokens += u.outputTokens;
        totals.cacheReadTokens = (totals.cacheReadTokens ?? 0) + (u.cacheReadTokens ?? 0);
        totals.cacheWriteTokens = (totals.cacheWriteTokens ?? 0) + (u.cacheWriteTokens ?? 0);
      }
    }
    return totals;
  }
}

function repairIncompleteToolCalls(messages: Message[]): Message[] {
  const resultIds = new Set<string>();
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === 'tool_result') {
        resultIds.add(part.callId);
      }
    }
  }

  const repaired: Message[] = [];
  for (const msg of messages) {
    repaired.push(msg);
    if (msg.role !== 'assistant') continue;
    const missingParts: ContentPart[] = [];
    for (const part of msg.parts) {
      if (part.type === 'tool_call' && !resultIds.has(part.id)) {
        resultIds.add(part.id);
        missingParts.push({
          type: 'tool_result',
          callId: part.id,
          name: part.name,
          isError: true,
          modelView: 'Tool execution was interrupted before a result was recorded.',
        });
      }
    }
    if (missingParts.length > 0) {
      repaired.push({
        id: createSortableId('msg', msg.ts + 1),
        role: 'tool',
        parts: missingParts,
        ts: msg.ts + 1,
        meta: { synthetic: true },
      });
    }
  }
  return repaired;
}

export function listSessions(sessionsRootDir: string): SessionSummary[] {
  if (!fs.existsSync(sessionsRootDir)) return [];
  const entries = fs.readdirSync(sessionsRootDir).filter((f) => f.endsWith('.jsonl'));
  const summaries: SessionSummary[] = [];
  for (const file of entries) {
    const id = file.replace(/\.jsonl$/, '');
    const store = new SessionStore(sessionsRootDir, id);
    try {
      const records = store.readRecords();
      const start = records.find((r) => r.type === 'session_start') as
        SessionStartRecord | undefined;
      const msgCount = records.filter((r) => r.type === 'message').length;
      summaries.push({
        id,
        createdAt: start?.ts ?? records[0]?.ts ?? 0,
        cwd: start?.cwd ?? '',
        model: start?.model ?? '',
        messageCount: msgCount,
        filePath: store.sessionFile,
      });
    } catch {
      // Skip unreadable session file
    }
  }
  return summaries.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteSession(sessionsRootDir: string, sessionId: string): boolean {
  const store = new SessionStore(sessionsRootDir, sessionId);
  let deleted = false;
  if (fs.existsSync(store.sessionFile)) {
    fs.rmSync(store.sessionFile, { force: true });
    deleted = true;
  }
  if (fs.existsSync(store.sessionDir)) {
    fs.rmSync(store.sessionDir, { recursive: true, force: true });
    deleted = true;
  }
  return deleted;
}

export function pruneSessions(
  sessionsRootDir: string,
  retentionDays: number,
  nowMs = Date.now(),
): number {
  const cutoff = nowMs - retentionDays * 86_400_000;
  let removed = 0;
  for (const s of listSessions(sessionsRootDir)) {
    if (s.createdAt > 0 && s.createdAt < cutoff) {
      if (deleteSession(sessionsRootDir, s.id)) {
        removed++;
      }
    }
  }
  return removed;
}
