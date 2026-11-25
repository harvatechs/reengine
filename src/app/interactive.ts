import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentEvent, PermissionMode } from '../core/contracts.js';
import { listSessions } from '../core/index.js';
import { loadConfig, writeConfigEdit } from '../config/index.js';
import {
  detectTerminalCapabilities,
  resolveRuntimePaths,
  restoreTerminalState,
} from '../platform/index.js';
import { resolveTheme } from './ui-bridge.js';
import { runHeadlessTurn } from './run-service.js';

function resolveInteractiveSessionId(
  sessionsDir: string,
  options: { resumeId?: string; continueLatest?: boolean },
): string | undefined {
  if (options.resumeId) return options.resumeId;
  if (options.continueLatest) return listSessions(sessionsDir)[0]?.id;
  return undefined;
}

export async function launchInteractiveSession(options: {
  initialPrompt?: string;
  cwd?: string;
  model?: string;
  themeName?: string;
  plain?: boolean;
  continueLatest?: boolean;
  resumeId?: string;
}): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const paths = resolveRuntimePaths();
  const { config } = loadConfig({ cwd });
  const term = detectTerminalCapabilities();
  const theme = resolveTheme(
    options.themeName ?? config.ui.theme,
    config.ui.colorOverrides,
    paths.themesDir,
  );

  if (!config.model.default && !options.model) {
    process.stdout.write(
      'First-run setup needed: no default model configured. Run `reengine setup` or pass `--model <provider/model>`.\n',
    );
    return 2;
  }

  const { render } = await import('ink');
  const React = await import('react');
  const { ReengineApp } = await import('../ui/index.js');

  const sessionId = resolveInteractiveSessionId(paths.sessionsDir, options);

  const modelRef = options.model ?? config.model.default ?? 'unconfigured';
  const appInstance = render(
    React.createElement(ReengineApp, {
      banner: `ReEngine 0.1.0 · REA 6.4.0 · ${os.platform()} · type /help${sessionId ? ` · session ${sessionId}` : ''}`,
      initialMode: config.permissions.mode,
      model: modelRef,
      cwd: path.resolve(cwd),
      engine: {
        state: config.engine.rea.enabled ? 'ready' : 'absent',
        version: '6.4.0',
        provider: config.engine.rea.provider,
        stderrLines: [],
      },
      targets: [],
      theme,
      colorDepth: options.plain ? 'none' : term.colorDepth,
      plain: (options.plain ?? false) || config.ui.plain || !term.isTTY,
      inspectorDefaultOpen: config.ui.inspector.defaultOpen,
      onModeChange: (nextMode: PermissionMode) => {
        writeConfigEdit(paths.configFile, ['permissions', 'mode'], nextMode);
      },
      onSendTurn: async (prompt: string, emit: (evt: AgentEvent) => void) => {
        await runHeadlessTurn({
          prompt,
          cwd,
          model: modelRef,
          onEvent: emit,
        });
      },
    }),
  );

  try {
    await appInstance.waitUntilExit();
    return 0;
  } finally {
    restoreTerminalState();
  }
}
