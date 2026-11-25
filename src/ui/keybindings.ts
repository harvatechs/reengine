import * as fs from 'node:fs';
import { z } from 'zod';
import { ConfigError } from '../util/index.js';

export type KeybindingAction =
  | 'submit'
  | 'newline'
  | 'cancel'
  | 'exit'
  | 'historyPrev'
  | 'historyNext'
  | 'historySearch'
  | 'complete'
  | 'clearScreen'
  | 'commandPalette'
  | 'toggleInspector'
  | 'openDetail'
  | 'toggleTodo'
  | 'cycleMode'
  | 'modelPicker'
  | 'editExternal';

export const DEFAULT_KEYBINDINGS: Record<KeybindingAction, string[]> = {
  submit: ['enter'],
  newline: ['shift+enter', 'ctrl+j', '\\+enter'],
  cancel: ['escape', 'ctrl+c'],
  exit: ['ctrl+d', 'ctrl+c ctrl+c'],
  historyPrev: ['up'],
  historyNext: ['down'],
  historySearch: ['ctrl+r'],
  complete: ['tab'],
  clearScreen: ['ctrl+l'],
  commandPalette: ['ctrl+k'],
  toggleInspector: ['ctrl+g'],
  openDetail: ['ctrl+o'],
  toggleTodo: ['ctrl+t'],
  cycleMode: ['shift+tab'],
  modelPicker: ['alt+m'],
  editExternal: ['ctrl+x ctrl+e'],
};

const RESERVED_BINDINGS = new Set(['ctrl+i', 'ctrl+m']);

const KeybindingsFileSchema = z
  .object({
    version: z.literal(1),
    bindings: z.record(z.array(z.string().min(1))).default({}),
  })
  .strict();

export function validateKeybindingsMap(bindings: Record<string, string[]>): void {
  for (const [action, keys] of Object.entries(bindings)) {
    for (const k of keys) {
      const norm = k.trim().toLowerCase();
      if (RESERVED_BINDINGS.has(norm)) {
        throw new ConfigError(
          'KEYBINDING_RESERVED',
          `Keybinding "${k}" on action "${action}" collides with reserved terminal key (ctrl+i=Tab, ctrl+m=Enter).`,
        );
      }
    }
  }
}

export function loadKeybindings(filePath: string): Record<KeybindingAction, string[]> {
  const merged: Record<KeybindingAction, string[]> = { ...DEFAULT_KEYBINDINGS };
  if (!fs.existsSync(filePath)) {
    validateKeybindingsMap(merged);
    return merged;
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as unknown;
  const parsed = KeybindingsFileSchema.parse(raw);
  validateKeybindingsMap(parsed.bindings);
  for (const [action, keys] of Object.entries(parsed.bindings)) {
    if (action in merged) {
      merged[action as KeybindingAction] = keys;
    }
  }
  return merged;
}
