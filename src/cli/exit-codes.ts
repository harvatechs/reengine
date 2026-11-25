import { CommanderError } from 'commander';
import {
  AppError,
  ConfigError,
  EngineError,
  McpError,
  PermissionError,
  isAbortError,
} from '../util/index.js';

export const EXIT_CODES = {
  SUCCESS: 0,
  UNEXPECTED: 1,
  USAGE_OR_CONFIG: 2,
  PROVIDER_OR_AUTH: 3,
  ENGINE_UNAVAILABLE: 4,
  PERMISSION_UNAVAILABLE: 5,
  MAX_STEPS_OR_BUDGET: 6,
  LOOP_DETECTED: 7,
  INTERRUPTED: 130,
} as const;

export function mapErrorToExitCode(error: unknown): number {
  if (isAbortError(error)) {
    return EXIT_CODES.INTERRUPTED;
  }
  if (error instanceof CommanderError) {
    return error.exitCode === 0 ? EXIT_CODES.SUCCESS : EXIT_CODES.USAGE_OR_CONFIG;
  }
  if (error instanceof ConfigError) {
    return EXIT_CODES.USAGE_OR_CONFIG;
  }
  if (error instanceof EngineError || error instanceof McpError) {
    return EXIT_CODES.ENGINE_UNAVAILABLE;
  }
  if (error instanceof PermissionError) {
    return EXIT_CODES.PERMISSION_UNAVAILABLE;
  }
  if (error instanceof AppError) {
    if (error.code === 'LOOP_DETECTED') return EXIT_CODES.LOOP_DETECTED;
    if (error.code === 'MAX_STEPS' || error.code === 'BUDGET_EXCEEDED') {
      return EXIT_CODES.MAX_STEPS_OR_BUDGET;
    }
    if (error.code === 'PROVIDER_ERROR' || error.code === 'AUTH_ERROR') {
      return EXIT_CODES.PROVIDER_OR_AUTH;
    }
  }
  return EXIT_CODES.UNEXPECTED;
}
