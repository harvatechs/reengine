import * as path from 'node:path';
import type { PermissionDecision, PermissionMode, Tool } from './contracts.js';

export interface PermissionRuleSet {
  allow: string[];
  ask: string[];
  deny: string[];
}

export interface PermissionEvalContext {
  mode: PermissionMode;
  rules: PermissionRuleSet;
  tainted: boolean;
  taintGuard: boolean;
  workspaceRoot: string;
  additionalDirectories: string[];
  serverTrust?: 'ask' | 'readOnlyAuto' | 'trusted' | undefined;
  sessionAllowedKeys?: Set<string> | undefined;
  userExactAllowRules?: Set<string> | undefined;
}

function globToRegex(glob: string): RegExp {
  let regexStr = '^';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob.charAt(i);
    if (ch === '*') {
      if (glob.charAt(i + 1) === '*') {
        regexStr += '.*';
        i++;
      } else {
        regexStr += '[^/\\\\]*';
      }
    } else if (ch === '?') {
      regexStr += '.';
    } else if ('\\^$.|+()[]{}'.includes(ch)) {
      regexStr += `\\${ch}`;
    } else {
      regexStr += ch;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}

function parsePermissionRule(rule: string): { toolPattern: string; argPattern?: string } {
  const openIdx = rule.indexOf('(');
  if (openIdx > 0 && rule.endsWith(')')) {
    return {
      toolPattern: rule.slice(0, openIdx).trim(),
      argPattern: rule.slice(openIdx + 1, -1).trim(),
    };
  }
  return { toolPattern: rule.trim() };
}

export function isExactUserRule(rule: string): boolean {
  const { toolPattern, argPattern } = parsePermissionRule(rule);
  if (toolPattern.includes('*') || toolPattern.includes('?')) return false;
  if (argPattern === undefined) return false;
  return !argPattern.includes('*') && !argPattern.includes('?');
}

function ruleMatches(rule: string, toolName: string, summary: string): boolean {
  const { toolPattern, argPattern } = parsePermissionRule(rule);
  if (!globToRegex(toolPattern).test(toolName)) {
    return false;
  }
  if (argPattern === undefined) {
    return true;
  }
  const normalizedSummary = summary.replace(/\\/g, '/');
  const normalizedPat = argPattern.replace(/\\/g, '/');
  return globToRegex(normalizedPat).test(normalizedSummary);
}

function findMatchingRule(rules: string[], toolName: string, summary: string): string | undefined {
  return rules.find((r) => ruleMatches(r, toolName, summary));
}

export function isToolHiddenInMode(
  tool: Pick<Tool, 'risk' | 'readOnly'>,
  mode: PermissionMode,
): boolean {
  if (mode !== 'plan') return false;
  if (tool.risk === 'write' || tool.risk === 'exec') return true;
  if (tool.risk === 'mcp' && !tool.readOnly) return true;
  return false;
}

function isPathWithinRoots(
  candidatePath: string,
  workspaceRoot: string,
  additionalDirs: readonly string[],
): boolean {
  const resolved = path.resolve(workspaceRoot, candidatePath);
  const roots = [path.resolve(workspaceRoot), ...additionalDirs.map((d) => path.resolve(d))];
  for (const root of roots) {
    const rel = path.relative(root, resolved);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return true;
    }
  }
  return false;
}

function checkPathArgs(
  tool: Pick<Tool, 'pathArgs'>,
  input: unknown,
  ctx: PermissionEvalContext,
): string | null {
  if (tool.pathArgs.length === 0 || typeof input !== 'object' || input === null) {
    return null;
  }
  const rec = input as Record<string, unknown>;
  for (const argName of tool.pathArgs) {
    const val = rec[argName];
    if (typeof val === 'string' && val.length > 0) {
      if (!isPathWithinRoots(val, ctx.workspaceRoot, ctx.additionalDirectories)) {
        return `Path "${val}" is outside allowed workspace roots`;
      }
    }
  }
  return null;
}

function evaluateNonBypassDefault(
  tool: Pick<Tool, 'risk' | 'readOnly'>,
  outsideRootsReason: string | null,
  ctx: PermissionEvalContext,
): PermissionDecision {
  if (ctx.mode === 'plan') return { behavior: 'allow', reason: 'Read-only operation in plan mode' };
  if (ctx.mode === 'acceptEdits') {
    if (tool.risk === 'read') return { behavior: 'allow', reason: 'Read allowed in acceptEdits' };
    if (tool.risk === 'write' && outsideRootsReason === null) {
      return { behavior: 'allow', reason: 'Workspace write allowed in acceptEdits' };
    }
    if (tool.risk === 'mcp' && tool.readOnly && ctx.serverTrust !== 'ask') {
      return { behavior: 'allow', reason: 'Read-only MCP tool allowed' };
    }
    return { behavior: 'ask', reason: 'Confirmation required in acceptEdits mode' };
  }
  if (tool.risk === 'read')
    return { behavior: 'allow', reason: 'Read allowed within workspace roots' };
  if (tool.risk === 'mcp' && tool.readOnly && ctx.serverTrust === 'readOnlyAuto') {
    return { behavior: 'allow', reason: 'Read-only MCP tool allowed by server trust' };
  }
  if (tool.risk === 'mcp' && ctx.serverTrust === 'trusted') {
    return { behavior: 'allow', reason: 'Trusted MCP server' };
  }
  return { behavior: 'ask', reason: `Confirmation required for ${tool.risk} tool in default mode` };
}

function evaluateModeDefault(
  tool: Pick<Tool, 'risk' | 'readOnly'>,
  outsideRootsReason: string | null,
  ctx: PermissionEvalContext,
): PermissionDecision {
  if (ctx.mode === 'bypass') {
    const needsTaintConfirm =
      ctx.tainted && ctx.taintGuard && (tool.risk === 'exec' || outsideRootsReason !== null);
    return needsTaintConfirm
      ? { behavior: 'ask', reason: 'Taint guard requires confirmation in bypass mode' }
      : { behavior: 'allow', reason: 'Bypass mode active' };
  }
  return evaluateNonBypassDefault(tool, outsideRootsReason, ctx);
}

function isUserExactMatch(
  allowRule: string | undefined,
  isSessionAllowed: boolean,
  ctx: PermissionEvalContext,
): boolean {
  if (isSessionAllowed) return true;
  if (allowRule === undefined || !isExactUserRule(allowRule)) return false;
  return ctx.userExactAllowRules?.has(allowRule) ?? true;
}

function needsTaintPrompt(
  tool: Pick<Tool, 'risk' | 'readOnly'>,
  allowRule: string | undefined,
  isSessionAllowed: boolean,
  ctx: PermissionEvalContext,
): boolean {
  if (!ctx.tainted || !ctx.taintGuard) return false;
  const isMutatingOrExec =
    tool.risk === 'write' || tool.risk === 'exec' || (tool.risk === 'mcp' && !tool.readOnly);
  if (!isMutatingOrExec) return false;
  return !isUserExactMatch(allowRule, isSessionAllowed, ctx);
}

export function evaluatePermission(
  tool: Pick<Tool, 'name' | 'risk' | 'readOnly' | 'pathArgs'>,
  input: unknown,
  summary: string,
  ctx: PermissionEvalContext,
): PermissionDecision {
  if (isToolHiddenInMode(tool, ctx.mode)) {
    return { behavior: 'deny', reason: `Tool "${tool.name}" is not available in ${ctx.mode} mode` };
  }
  const denyRule = findMatchingRule(ctx.rules.deny, tool.name, summary);
  if (denyRule) {
    return { behavior: 'deny', reason: `Denied by rule "${denyRule}"`, ruleId: denyRule };
  }
  const outsideReason = checkPathArgs(tool, input, ctx);
  if (outsideReason) {
    return { behavior: 'ask', reason: outsideReason };
  }

  const allowRule = findMatchingRule(ctx.rules.allow, tool.name, summary);
  const isSessionAllowed = ctx.sessionAllowedKeys?.has(`${tool.name}:${summary}`) ?? false;
  if (needsTaintPrompt(tool, allowRule, isSessionAllowed, ctx)) {
    return {
      behavior: 'ask',
      reason: 'Taint guard: untrusted content was observed since last user authorization',
    };
  }
  const askRule = findMatchingRule(ctx.rules.ask, tool.name, summary);
  if (askRule) {
    return { behavior: 'ask', reason: `Ask rule "${askRule}" matched`, ruleId: askRule };
  }
  if (isSessionAllowed)
    return { behavior: 'allow', reason: 'Allowed for this session', ruleId: 'session' };
  if (allowRule)
    return { behavior: 'allow', reason: `Allowed by rule "${allowRule}"`, ruleId: allowRule };
  return evaluateModeDefault(tool, outsideReason, ctx);
}
