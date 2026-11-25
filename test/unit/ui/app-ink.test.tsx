import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { ReengineApp } from '../../../src/ui/App.js';

describe('src/ui ReengineApp Ink rendering (P5-05..P5-11)', () => {
  it('renders banner, status bar, composer, and streams a turn into <Static>', async () => {
    const inst = render(
      <ReengineApp
        banner="ReEngine 0.1.0 · REA 6.4.0 · type /help"
        initialMode="default"
        model="mock/gpt-test"
        cwd="/tmp/ws"
        engine={{ state: 'ready', version: '6.4.0', provider: 'auto', stderrLines: [] }}
        targets={[]}
        onSendTurn={async (_prompt, emit) => {
          emit({ type: 'turn_start', turnId: 't1' });
          emit({ type: 'assistant_text_delta', text: 'Observed main export.' });
          emit({
            type: 'assistant_message',
            message: {
              id: 'm1',
              role: 'assistant',
              parts: [{ type: 'text', text: 'Observed main export.' }],
              ts: Date.now(),
            },
          });
          emit({ type: 'turn_end', turnId: 't1', reason: 'complete' });
          await Promise.resolve();
        }}
      />,
    );

    const frame0 = inst.lastFrame() ?? '';
    expect(frame0).toContain('▄████');
    expect(frame0).toContain('Welcome to ReEngine CLI!');
    expect(frame0).toContain('ReEngine 0.1.0');
    expect(frame0).toContain('mock/gpt-test');
    expect(frame0).toContain('REA ● auto');

    inst.stdin.write('Analyze main.js');
    await new Promise((r) => setTimeout(r, 30));
    inst.stdin.write('\r');
    await new Promise((r) => setTimeout(r, 80));
    const frame1 = inst.lastFrame() ?? '';
    expect(frame1).toContain('Observed main export.');
    inst.unmount();
  });
});
