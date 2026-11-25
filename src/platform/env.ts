const BASE_ALLOWLIST = new Set([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'LANG',
  'TERM',
  'TMPDIR',
  'TEMP',
  'TMP',
  'SYSTEMROOT',
  'COMSPEC',
  'PATHEXT',
  'WINDIR',
]);

export function buildScrubbedEnv(options: {
  sourceEnv?: NodeJS.ProcessEnv | undefined;
  allowExtra?: readonly string[] | undefined;
  overrides?: Record<string, string> | undefined;
}): Record<string, string> {
  const source = options.sourceEnv ?? process.env;
  const extraSet = new Set(options.allowExtra ?? []);
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (BASE_ALLOWLIST.has(key) || key.startsWith('LC_') || extraSet.has(key)) {
      out[key] = value;
    }
  }

  if (options.overrides) {
    for (const [key, value] of Object.entries(options.overrides)) {
      out[key] = value;
    }
  }

  return out;
}
