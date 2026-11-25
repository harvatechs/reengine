import { readFileSync } from 'node:fs';

const IPC_CHANNEL = 'app:get-config';

export function handleIpc(channel, payload) {
  if (channel === IPC_CHANNEL) {
    return { ok: true, echo: payload ?? null, version: '1.0.0' };
  }
  return { ok: false, error: 'UNKNOWN_CHANNEL' };
}

export function loadLocalConfig(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
