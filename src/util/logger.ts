import * as fs from 'node:fs';
import * as path from 'node:path';
import pino from 'pino';
import type { SecretRedactor } from './redact.js';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface AppLogger {
  error(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  trace(msg: string, meta?: Record<string, unknown>): void;
  child(bindings: { module: string }): AppLogger;
}

export function createFileLogger(options: {
  logDir: string;
  level?: LogLevel | undefined;
  redactor: SecretRedactor;
  dateStr?: string | undefined;
}): AppLogger {
  fs.mkdirSync(options.logDir, { recursive: true, mode: 0o700 });
  const datePart = options.dateStr ?? new Date().toISOString().slice(0, 10);
  const logFile = path.join(options.logDir, `reengine-${datePart}.log`);

  const destination = pino.destination({
    dest: logFile,
    sync: false,
    mkdir: true,
  });

  const basePino = pino(
    {
      level: options.level ?? 'info',
      base: null,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );

  const wrap = (instance: pino.Logger): AppLogger => {
    const emit = (lvl: LogLevel, msg: string, meta?: Record<string, unknown>): void => {
      const safeMsg = options.redactor.redactText(msg);
      const safeMeta = meta ? options.redactor.redactValue(meta) : {};
      instance[lvl](safeMeta, safeMsg);
    };

    return {
      error: (msg, meta) => {
        emit('error', msg, meta);
      },
      warn: (msg, meta) => {
        emit('warn', msg, meta);
      },
      info: (msg, meta) => {
        emit('info', msg, meta);
      },
      debug: (msg, meta) => {
        emit('debug', msg, meta);
      },
      trace: (msg, meta) => {
        emit('trace', msg, meta);
      },
      child: (bindings) => wrap(instance.child(bindings)),
    };
  };

  return wrap(basePino);
}

export function createNullLogger(): AppLogger {
  const noop = (): void => {};
  const logger: AppLogger = {
    error: noop,
    warn: noop,
    info: noop,
    debug: noop,
    trace: noop,
    child: () => logger,
  };
  return logger;
}
