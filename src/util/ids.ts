import { randomBytes } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function createSortableId(prefix?: string, nowMs: number = Date.now()): string {
  let time = Math.max(0, Math.floor(nowMs));
  let timePart = '';
  for (let i = 0; i < 10; i++) {
    timePart = (CROCKFORD[time % 32] ?? '0') + timePart;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(10);
  let randPart = '';
  for (const byte of bytes) {
    randPart += CROCKFORD[byte % 32] ?? '0';
  }
  const ulid = `${timePart}${randPart}`;
  return prefix ? `${prefix}_${ulid}` : ulid;
}
