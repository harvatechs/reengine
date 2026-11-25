import * as os from 'node:os';
import * as path from 'node:path';

export interface RuntimePaths {
  configDir: string;
  dataDir: string;
  stateDir: string;
  cacheDir: string;
  configFile: string;
  themesDir: string;
  keybindingsFile: string;
  credentialsFile: string;
  trustFile: string;
  sessionsDir: string;
  logsDir: string;
  historyFile: string;
}

interface BaseDirs {
  configDir: string;
  dataDir: string;
  stateDir: string;
  cacheDir: string;
}

function resolveWindowsBaseDirs(env: NodeJS.ProcessEnv, homedir: string): BaseDirs {
  const appData = env.APPDATA?.trim() || path.join(homedir, 'AppData', 'Roaming');
  const localAppData = env.LOCALAPPDATA?.trim() || path.join(homedir, 'AppData', 'Local');
  return {
    configDir: path.join(appData, 'reengine'),
    dataDir: path.join(localAppData, 'reengine', 'data'),
    stateDir: path.join(localAppData, 'reengine', 'state'),
    cacheDir: path.join(localAppData, 'reengine', 'cache'),
  };
}

function resolvePosixBaseDirs(env: NodeJS.ProcessEnv, homedir: string): BaseDirs {
  const xdgConfig = env.XDG_CONFIG_HOME?.trim() || path.join(homedir, '.config');
  const xdgData = env.XDG_DATA_HOME?.trim() || path.join(homedir, '.local', 'share');
  const xdgState = env.XDG_STATE_HOME?.trim() || path.join(homedir, '.local', 'state');
  const xdgCache = env.XDG_CACHE_HOME?.trim() || path.join(homedir, '.cache');
  return {
    configDir: path.join(xdgConfig, 'reengine'),
    dataDir: path.join(xdgData, 'reengine'),
    stateDir: path.join(xdgState, 'reengine'),
    cacheDir: path.join(xdgCache, 'reengine'),
  };
}

function resolveBaseDirs(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform,
  homedir: string,
): BaseDirs {
  const overrideHome = env.REENGINE_HOME?.trim();
  if (overrideHome) {
    return {
      configDir: path.join(overrideHome, 'config'),
      dataDir: path.join(overrideHome, 'data'),
      stateDir: path.join(overrideHome, 'state'),
      cacheDir: path.join(overrideHome, 'cache'),
    };
  }
  return platform === 'win32'
    ? resolveWindowsBaseDirs(env, homedir)
    : resolvePosixBaseDirs(env, homedir);
}

export function resolveRuntimePaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  homedir: string = os.homedir(),
): RuntimePaths {
  const { configDir, dataDir, stateDir, cacheDir } = resolveBaseDirs(env, platform, homedir);

  return {
    configDir,
    dataDir,
    stateDir,
    cacheDir,
    configFile: path.join(configDir, 'config.jsonc'),
    themesDir: path.join(configDir, 'themes'),
    keybindingsFile: path.join(configDir, 'keybindings.json'),
    credentialsFile: path.join(configDir, 'credentials.json'),
    trustFile: path.join(stateDir, 'trust.json'),
    sessionsDir: path.join(dataDir, 'sessions'),
    logsDir: path.join(stateDir, 'logs'),
    historyFile: path.join(stateDir, 'history'),
  };
}
