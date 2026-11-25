import { createHash } from 'node:crypto';
import { createSortableId } from '../util/index.js';

const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function normalizeToolCallId(rawId: string | undefined): string {
  if (!rawId) {
    return createSortableId('call');
  }
  if (VALID_ID_RE.test(rawId)) {
    return rawId;
  }
  const cleaned = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  if (cleaned.length > 0 && cleaned.length <= 64) {
    return cleaned;
  }
  const suffix = createHash('sha256').update(rawId).digest('hex').slice(0, 8);
  const prefix = cleaned.slice(0, 55) || 'call';
  return `${prefix}_${suffix}`;
}

export function buildUrlWithQuery(
  baseUrl: string,
  suffixPath: string,
  queryParams: Record<string, string>,
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const cleanSuffix = suffixPath.startsWith('/') ? suffixPath : `/${suffixPath}`;
  const url = new URL(`${cleanBase}${cleanSuffix}`);
  for (const [k, v] of Object.entries(queryParams)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}
