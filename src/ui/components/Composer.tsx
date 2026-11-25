import { useState } from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import { sanitizeTerminalText } from '../sanitize.js';
import { useTheme } from '../theme/context.js';

interface ComposerKeyCtx {
  input: string;
  key: Key;
  value: string;
  isRunning: boolean;
  history: string[];
  histIdx: number;
  setValue: (v: string | ((prev: string) => string)) => void;
  setHistory: (fn: (prev: string[]) => string[]) => void;
  setHistIdx: (idx: number) => void;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  onCycleMode: () => void;
  onToggleInspector: () => void;
  onToggleHelp: () => void;
  onExit: () => void;
}

function handleControlKey(ctx: ComposerKeyCtx): boolean {
  const { input, key, value, isRunning } = ctx;
  if (key.escape) {
    if (isRunning) ctx.onCancel();
    else if (value) ctx.setValue('');
    return true;
  }
  if (key.ctrl && input === 'c') {
    if (isRunning) ctx.onCancel();
    else if (value) ctx.setValue('');
    else ctx.onExit();
    return true;
  }
  if (key.ctrl && input === 'd' && !value) {
    ctx.onExit();
    return true;
  }
  if (key.ctrl && input === 'g') {
    ctx.onToggleInspector();
    return true;
  }
  if (key.tab && key.shift) {
    ctx.onCycleMode();
    return true;
  }
  return false;
}

function handleHistoryAndEditKey(ctx: ComposerKeyCtx): void {
  const { input, key, history, histIdx } = ctx;
  if (key.upArrow && history.length > 0) {
    const nextIdx = Math.min(history.length - 1, histIdx + 1);
    ctx.setHistIdx(nextIdx);
    ctx.setValue(history[nextIdx] ?? '');
    return;
  }
  if (key.downArrow) {
    const nextIdx = histIdx - 1;
    ctx.setHistIdx(nextIdx < 0 ? -1 : nextIdx);
    ctx.setValue(nextIdx < 0 ? '' : (history[nextIdx] ?? ''));
    return;
  }
  if (key.backspace || key.delete) {
    ctx.setValue((v) => v.slice(0, -1));
    return;
  }
  if (!key.ctrl && !key.meta && input) {
    ctx.setValue((v) => v + sanitizeTerminalText(input));
  }
}

function handleComposerKey(ctx: ComposerKeyCtx): void {
  if (handleControlKey(ctx)) return;
  if (ctx.key.return) {
    const trimmed = ctx.value.trim();
    if (!trimmed) return;
    if (trimmed === '/help') {
      ctx.setValue('');
      ctx.onToggleHelp();
      return;
    }
    ctx.setHistory((h) => [trimmed, ...h.slice(0, 49)]);
    ctx.setHistIdx(-1);
    ctx.setValue('');
    ctx.onSubmit(trimmed);
    return;
  }
  handleHistoryAndEditKey(ctx);
}

export function Composer({
  isRunning,
  disabled,
  onSubmit,
  onCancel,
  onCycleMode,
  onToggleInspector,
  onToggleHelp,
  onExit,
}: {
  isRunning: boolean;
  disabled: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  onCycleMode: () => void;
  onToggleInspector: () => void;
  onToggleHelp: () => void;
  onExit: () => void;
}) {
  const { theme, colorProp, boxBorder } = useTheme();
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);

  useInput(
    (input, key) => {
      if (disabled) return;
      handleComposerKey({
        input,
        key,
        value,
        isRunning,
        history,
        histIdx,
        setValue,
        setHistory,
        setHistIdx,
        onSubmit,
        onCancel,
        onCycleMode,
        onToggleInspector,
        onToggleHelp,
        onExit,
      });
    },
    { isActive: !disabled },
  );

  return (
    <Box {...boxBorder(theme.colors.surface.borderFocus, 'round')} paddingX={1}>
      <Text {...colorProp(theme.colors.brand.accent)} bold>
        ❯{' '}
      </Text>
      {value ? (
        <Text {...colorProp(theme.colors.text.primary)}>{value}</Text>
      ) : (
        <Text {...colorProp(theme.colors.text.dim)} dimColor>
          message… (Enter send · /help · Ctrl+G inspector · Shift+Tab mode)
        </Text>
      )}
    </Box>
  );
}
