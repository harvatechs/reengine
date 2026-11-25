import { useState } from 'react';
import { Box, Text, useInput, type Key } from 'ink';
import type { PermissionAnswer, PermissionRequest } from '../../core/contracts.js';
import { sanitizeTerminalText } from '../sanitize.js';
import { useTheme } from '../theme/context.js';

function handleFeedbackKey(
  input: string,
  key: Key,
  feedback: string,
  setFeedback: (fn: (prev: string) => string) => void,
  setFeedbackMode: (v: boolean) => void,
  onAnswer: (answer: PermissionAnswer) => void,
): void {
  if (key.return) {
    onAnswer({ kind: 'deny_with_feedback', feedback: feedback.trim() || 'Denied' });
    return;
  }
  if (key.escape) {
    setFeedbackMode(false);
    return;
  }
  if (key.backspace || key.delete) {
    setFeedback((f) => f.slice(0, -1));
    return;
  }
  if (!key.ctrl && !key.meta && input) {
    setFeedback((f) => f + sanitizeTerminalText(input));
  }
}

export function PermissionPrompt({
  request,
  onAnswer,
}: {
  request: PermissionRequest;
  onAnswer: (answer: PermissionAnswer) => void;
}) {
  const { theme, colorProp, boxBorder } = useTheme();
  const [feedbackMode, setFeedbackMode] = useState(false);
  const [feedback, setFeedback] = useState('');

  useInput((input, key) => {
    if (feedbackMode) {
      handleFeedbackKey(input, key, feedback, setFeedback, setFeedbackMode, onAnswer);
      return;
    }

    const ch = input.toLowerCase();
    if (ch === 'y') onAnswer({ kind: 'allow_once' });
    else if (ch === 's') onAnswer({ kind: 'allow_session' });
    else if (ch === 'p' && !request.tainted) onAnswer({ kind: 'allow_project_rule' });
    else if (ch === 'n' || key.escape) onAnswer({ kind: 'deny' });
    else if (ch === 'f') setFeedbackMode(true);
  });

  return (
    <Box flexDirection="column" {...boxBorder(theme.colors.status.warning, 'round')} paddingX={1}>
      <Text {...colorProp(theme.colors.status.warning)} bold>
        Permission required [{request.risk}]: {sanitizeTerminalText(request.tool)}
      </Text>
      <Text {...colorProp(theme.colors.text.primary)}>{sanitizeTerminalText(request.summary)}</Text>
      {request.tainted ? (
        <Text {...colorProp(theme.colors.status.danger)}>
          Taint guard active: untrusted content was observed; project-wide allow is disabled.
        </Text>
      ) : null}
      {feedbackMode ? (
        <Text {...colorProp(theme.colors.text.primary)}>Feedback: {feedback}</Text>
      ) : (
        <Text {...colorProp(theme.colors.text.muted)}>
          [y] allow once · [s] allow session
          {request.tainted ? '' : ' · [p] allow project'} · [n] deny · [f] deny with feedback
        </Text>
      )}
    </Box>
  );
}
