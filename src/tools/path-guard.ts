import * as fs from 'node:fs';
import * as path from 'node:path';
import { ToolError } from '../util/index.js';

function realpathAncestor(targetPath: string): string {
  const abs = path.resolve(targetPath);
  const trailing: string[] = [];
  let cur = abs;
  while (!fs.existsSync(cur)) {
    const parent = path.dirname(cur);
    if (parent === cur) {
      return abs;
    }
    trailing.unshift(path.basename(cur));
    cur = parent;
  }
  const realBase = fs.realpathSync(cur);
  return path.join(realBase, ...trailing);
}

function isWithinRoot(realTarget: string, realRoot: string): boolean {
  const rel = path.relative(realRoot, realTarget);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function resolveSafeWorkspacePath(
  candidatePath: string,
  workspaceRoot: string,
  additionalDirs: readonly string[],
): string {
  const normalized = candidatePath.replace(/\\/g, '/');
  if (
    normalized.startsWith('/dev/') ||
    normalized.startsWith('//./') ||
    normalized.startsWith('\\\\.\\')
  ) {
    throw new ToolError('DEVICE_FILE_FORBIDDEN', `Device paths are not allowed: ${candidatePath}`);
  }

  const candidateAbs = path.resolve(workspaceRoot, candidatePath);
  const realTarget = realpathAncestor(candidateAbs);
  const roots = [workspaceRoot, ...additionalDirs].map((r) => realpathAncestor(r));

  if (!roots.some((root) => isWithinRoot(realTarget, root))) {
    throw new ToolError(
      'PATH_OUTSIDE_ROOTS',
      `Path "${candidatePath}" resolves to "${realTarget}", outside allowed workspace roots.`,
    );
  }

  if (fs.existsSync(realTarget)) {
    const stat = fs.statSync(realTarget);
    if (stat.isCharacterDevice() || stat.isBlockDevice() || stat.isFIFO() || stat.isSocket()) {
      throw new ToolError(
        'DEVICE_FILE_FORBIDDEN',
        `Special/device files are not allowed: ${candidatePath}`,
      );
    }
  }

  return realTarget;
}
