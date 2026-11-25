import React, { createContext, useContext } from 'react';
import type { ColorDepth } from '../../platform/index.js';
import { adaptColorForDepth } from './ansi-map.js';
import { REENGINE_DARK } from './builtins.js';
import type { ThemeDefinition } from './schema.js';

export interface ThemeContextValue {
  theme: ThemeDefinition;
  colorDepth: ColorDepth;
  plain: boolean;
  color: (token: string) => string | undefined;
  colorProp: (token: string) => { color?: string };
  boxBorder: (
    token: string,
    style?: 'single' | 'round' | 'double',
  ) => { borderStyle?: 'single' | 'round' | 'double'; borderColor?: string };
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: REENGINE_DARK,
  colorDepth: 'truecolor',
  plain: false,
  color: (token) => token,
  colorProp: (token) => ({ color: token }),
  boxBorder: (token, style = 'single') => ({ borderStyle: style, borderColor: token }),
});

export function ThemeProvider({
  theme,
  colorDepth,
  plain,
  children,
}: {
  theme: ThemeDefinition;
  colorDepth: ColorDepth;
  plain: boolean;
  children: React.ReactNode;
}) {
  const color = (token: string): string | undefined =>
    plain ? undefined : adaptColorForDepth(token, colorDepth);

  const value: ThemeContextValue = {
    theme,
    colorDepth,
    plain,
    color,
    colorProp: (token: string) => {
      const c = color(token);
      return c ? { color: c } : {};
    },
    boxBorder: (token: string, style: 'single' | 'round' | 'double' = 'single') => {
      if (plain) return {};
      const c = color(token);
      return c ? { borderStyle: style, borderColor: c } : { borderStyle: style };
    },
  };
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
