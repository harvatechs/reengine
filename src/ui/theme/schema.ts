import { z } from 'zod';

const COLOR_TOKEN_RE = /^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|ansi:[a-zA-Z]+|inherit)$/;
const ColorToken = z
  .string()
  .regex(COLOR_TOKEN_RE, 'Expected #RRGGBB, #RGB, ansi:<name>, or inherit');

export const ThemeColorsSchema = z
  .object({
    text: z
      .object({ primary: ColorToken, muted: ColorToken, dim: ColorToken, inverse: ColorToken })
      .strict(),
    brand: z.object({ accent: ColorToken, accentAlt: ColorToken }).strict(),
    status: z
      .object({ success: ColorToken, warning: ColorToken, danger: ColorToken, info: ColorToken })
      .strict(),
    surface: z
      .object({
        border: ColorToken,
        borderFocus: ColorToken,
        codeBg: ColorToken,
        selectionBg: ColorToken,
      })
      .strict(),
    chat: z
      .object({
        user: ColorToken,
        assistant: ColorToken,
        system: ColorToken,
        reasoning: ColorToken,
      })
      .strict(),
    tool: z
      .object({
        name: ColorToken,
        pending: ColorToken,
        running: ColorToken,
        success: ColorToken,
        error: ColorToken,
      })
      .strict(),
    diff: z
      .object({
        add: ColorToken,
        remove: ColorToken,
        addBg: ColorToken,
        removeBg: ColorToken,
        hunk: ColorToken,
      })
      .strict(),
    syntax: z
      .object({
        keyword: ColorToken,
        string: ColorToken,
        number: ColorToken,
        comment: ColorToken,
        function: ColorToken,
        type: ColorToken,
        operator: ColorToken,
        variable: ColorToken,
        punctuation: ColorToken,
      })
      .strict(),
    asm: z
      .object({
        address: ColorToken,
        bytes: ColorToken,
        mnemonic: ColorToken,
        register: ColorToken,
        immediate: ColorToken,
        label: ColorToken,
        string: ColorToken,
        comment: ColorToken,
      })
      .strict(),
    evidence: z
      .object({
        accent: ColorToken,
        observed: ColorToken,
        inferred: ColorToken,
        unknown: ColorToken,
      })
      .strict(),
    link: ColorToken,
  })
  .strict();

export const ThemeSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1).default(1),
    name: z.string().min(1),
    extends: z.string().min(1).optional(),
    surfaceBackground: ColorToken.optional(),
    colors: ThemeColorsSchema,
    textStyles: z
      .object({
        emphasis: z.string().default('bold'),
        heading: z.string().default('bold'),
        link: z.string().default('underline'),
        muted: z.string().default('dim'),
      })
      .strict()
      .default({}),
    glyphOverrides: z.record(z.string()).optional(),
  })
  .strict();

export type ThemeDefinition = z.infer<typeof ThemeSchema>;
