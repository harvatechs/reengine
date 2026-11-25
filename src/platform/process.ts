import { execFileSync, type ChildProcess } from 'node:child_process';

export async function killProcessTree(
  proc: ChildProcess,
  options: { graceMs?: number; platform?: NodeJS.Platform } = {},
): Promise<void> {
  const pid = proc.pid;
  if (pid === undefined || proc.exitCode !== null) {
    return;
  }

  const platform = options.platform ?? process.platform;
  const graceMs = options.graceMs ?? 3000;

  if (platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Process already exited
      }
    }
    await waitForExit(proc, Math.max(graceMs, 2000));
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      proc.kill('SIGTERM');
    } catch {
      return;
    }
  }

  await waitForExit(proc, graceMs, () => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        proc.kill('SIGKILL');
      } catch {
        // Already exited
      }
    }
  });
}

async function waitForExit(
  proc: ChildProcess,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = (): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve();
      }
    };

    proc.once('exit', done);
    const timer = setTimeout(() => {
      onTimeout?.();
      done();
    }, timeoutMs);
  });
}

export class ResourceScope {
  private readonly disposers: Array<() => Promise<void> | void> = [];

  public register(disposer: () => Promise<void> | void): void {
    this.disposers.push(disposer);
  }

  public async closeAll(capMs = 5000): Promise<void> {
    const items = [...this.disposers].reverse();
    this.disposers.length = 0;

    const run = async (): Promise<void> => {
      for (const dispose of items) {
        try {
          await dispose();
        } catch {
          // Best-effort resource cleanup
        }
      }
    };

    await Promise.race([
      run(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, capMs);
      }),
    ]);
  }
}
