import * as fs from 'node:fs';
import * as path from 'node:path';

export class TargetRegistry {
  private readonly targets = new Set<string>();

  constructor(initialTargets: readonly string[] = []) {
    for (const t of initialTargets) {
      this.add(t);
    }
  }

  public add(targetPath: string, baseDir: string = process.cwd()): string {
    const resolved = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(baseDir, targetPath);
    let canonical = resolved;
    try {
      canonical = fs.realpathSync(resolved);
    } catch {
      // Target may be a URL or not yet on disk
    }
    this.targets.add(canonical);
    return canonical;
  }

  public remove(targetPath: string, baseDir: string = process.cwd()): boolean {
    const resolved = path.resolve(baseDir, targetPath);
    if (this.targets.delete(resolved)) return true;
    try {
      return this.targets.delete(fs.realpathSync(resolved));
    } catch {
      return false;
    }
  }

  public list(): string[] {
    return [...this.targets];
  }

  public detectImplicitTargets(userPrompt: string, cwd: string): string[] {
    const detected: string[] = [];
    const tokens =
      userPrompt.match(/(?:[A-Za-z]:[\\/][^\s"'`]+|(?:\.{0,2}\/|[a-zA-Z0-9_.-]+\/)[^\s"'`]+)/g) ??
      [];
    for (const tok of tokens) {
      const cleaned = tok.replace(/[.,;:!?)]+$/, '');
      const abs = path.resolve(cwd, cleaned);
      if (fs.existsSync(abs) && !this.targets.has(abs)) {
        detected.push(this.add(abs, cwd));
      }
    }
    return detected;
  }

  public loadFromProject(workspaceRoot: string): void {
    const file = path.join(workspaceRoot, '.reengine', 'targets.json');
    if (!fs.existsSync(file)) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { targets?: unknown };
      if (Array.isArray(parsed.targets)) {
        for (const t of parsed.targets) {
          if (typeof t === 'string') this.add(t, workspaceRoot);
        }
      }
    } catch {
      // Ignore corrupt targets file
    }
  }

  public saveToProject(workspaceRoot: string): void {
    const file = path.join(workspaceRoot, '.reengine', 'targets.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ targets: this.list() }, null, 2) + '\n', 'utf-8');
  }
}
