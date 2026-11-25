import { Box, Text } from 'ink';
import { sanitizeTerminalText } from '../sanitize.js';
import { useTheme } from '../theme/context.js';

type AsmTokenKind =
  'address' | 'bytes' | 'mnemonic' | 'register' | 'immediate' | 'label' | 'comment' | 'plain';

const ASM_REGISTER_RE =
  /^(?:r[0-9]{1,2}[dwb]?|[er]?(?:ax|bx|cx|dx|si|di|bp|sp|ip)|x[0-9]{1,2}|w[0-9]{1,2}|xmm[0-9]+)$/i;
const ASM_MNEMONIC_RE =
  /^(?:mov|lea|add|sub|mul|imul|div|xor|and|or|cmp|test|jmp|je|jne|jz|jnz|jg|jl|call|ret|push|pop|nop|syscall|int|ldr|str|bl|br|b)$/i;

export function tokenizeAsmLine(line: string): Array<{ kind: AsmTokenKind; text: string }> {
  const commentIdx = line.search(/[;#]/);
  const codePart = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
  const commentPart = commentIdx >= 0 ? line.slice(commentIdx) : '';
  const tokens: Array<{ kind: AsmTokenKind; text: string }> = [];

  for (const part of codePart.split(/(\s+|,|\[|\]|\+|-)/)) {
    if (!part) continue;
    if (/^\s+$/.test(part) || /^[,[\]+-]$/.test(part)) {
      tokens.push({ kind: 'plain', text: part });
    } else if (/^(?:0x)?[0-9a-fA-F]{4,}:$/.test(part)) {
      tokens.push({ kind: 'address', text: part });
    } else if (/^[a-zA-Z_.$][a-zA-Z0-9_.$]*:$/.test(part)) {
      tokens.push({ kind: 'label', text: part });
    } else if (ASM_MNEMONIC_RE.test(part)) {
      tokens.push({ kind: 'mnemonic', text: part });
    } else if (ASM_REGISTER_RE.test(part)) {
      tokens.push({ kind: 'register', text: part });
    } else if (/^(?:0x[0-9a-fA-F]+|[0-9]+h?)$/.test(part)) {
      tokens.push({ kind: 'immediate', text: part });
    } else {
      tokens.push({ kind: 'plain', text: part });
    }
  }
  if (commentPart) {
    tokens.push({ kind: 'comment', text: commentPart });
  }
  return tokens;
}

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { theme, colorProp, boxBorder } = useTheme();
  const safeCode = sanitizeTerminalText(code);
  const isAsm = lang === 'asm' || lang === 'x86asm' || lang === 'armasm' || lang === 'nasm';
  const lines = safeCode.split('\n');

  const asmColorProp = (kind: AsmTokenKind) =>
    kind === 'plain' ? colorProp(theme.colors.text.primary) : colorProp(theme.colors.asm[kind]);

  return (
    <Box
      flexDirection="column"
      {...boxBorder(theme.colors.surface.border, 'single')}
      paddingX={1}
      marginY={0}
    >
      {lang ? (
        <Text {...colorProp(theme.colors.text.dim)} dimColor>
          {sanitizeTerminalText(lang)}
        </Text>
      ) : null}
      {lines.map((line, i) =>
        isAsm ? (
          <Text key={i}>
            {tokenizeAsmLine(line).map((tok, j) => (
              <Text key={j} {...asmColorProp(tok.kind)}>
                {tok.text}
              </Text>
            ))}
          </Text>
        ) : (
          <Text key={i} {...colorProp(theme.colors.syntax.variable)}>
            {line}
          </Text>
        ),
      )}
    </Box>
  );
}
