import { Box, Text } from 'ink';
import { marked, type Token } from 'marked';
import { formatOsc8Link, sanitizeTerminalText } from '../sanitize.js';
import { useTheme } from '../theme/context.js';
import { CodeBlock } from './CodeBlock.js';

function renderInlineTokens(tokens: Token[] | undefined, linkColor: string | undefined): string {
  if (!tokens) return '';
  return tokens
    .map((tok) => {
      if (tok.type === 'link') {
        const label = sanitizeTerminalText(String(tok.text));
        return linkColor ? formatOsc8Link(label, String(tok.href)) : label;
      }
      if (tok.type === 'codespan') {
        return `\`${sanitizeTerminalText(String(tok.text))}\``;
      }
      return sanitizeTerminalText(
        'text' in tok && typeof tok.text === 'string' ? tok.text : tok.raw,
      );
    })
    .join('');
}

export function Markdown({ text }: { text: string }) {
  const { theme, color, colorProp } = useTheme();
  const safe = sanitizeTerminalText(text);
  const tokens = marked.lexer(safe);
  const linkColor = color(theme.colors.link);

  return (
    <Box flexDirection="column">
      {tokens.map((tok, idx) => {
        if (tok.type === 'heading') {
          return (
            <Text key={idx} bold {...colorProp(theme.colors.brand.accent)}>
              {sanitizeTerminalText(String(tok.text))}
            </Text>
          );
        }
        if (tok.type === 'code') {
          const codeStr = String(tok.text);
          const langStr = typeof tok.lang === 'string' ? tok.lang : '';
          return <CodeBlock key={idx} code={codeStr} {...(langStr ? { lang: langStr } : {})} />;
        }
        if (tok.type === 'list') {
          return (
            <Box key={idx} flexDirection="column" paddingLeft={1}>
              {(tok.items as Array<{ text: string }>).map((item, j) => (
                <Text key={j} {...colorProp(theme.colors.chat.assistant)}>
                  • {sanitizeTerminalText(item.text)}
                </Text>
              ))}
            </Box>
          );
        }
        if (tok.type === 'blockquote') {
          return (
            <Text key={idx} {...colorProp(theme.colors.text.muted)} dimColor>
              ▍ {sanitizeTerminalText(String(tok.text))}
            </Text>
          );
        }
        if (tok.type === 'space') {
          return null;
        }
        const content =
          'tokens' in tok && Array.isArray(tok.tokens)
            ? renderInlineTokens(tok.tokens, linkColor)
            : sanitizeTerminalText(tok.raw.trimEnd());
        return (
          <Text key={idx} {...colorProp(theme.colors.chat.assistant)}>
            {content}
          </Text>
        );
      })}
    </Box>
  );
}
