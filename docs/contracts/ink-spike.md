# Ink Compatibility Spike (P0-07)

- **Tested Stack:** `ink@5.1.0` + `react@18.3.1` + `ink-testing-library@4.0.0` on Node `v24.15.0` (Windows 11 / Windows Terminal)
- **Reference Run:** Verified via `ink-testing-library` test suite in `packages/ui` (rendering `<Static>`, live region, `useInput`, `App`, `SetupWizardScreen`, `ThemeStudioScreen`).

## Findings
1. **`ink@5.1.0` + `react@18.3.1` vs `ink@8.0.0` + `react@19.3.1`:** `ink-testing-library@4.0.0` targets `@types/react >= 18.0.0` and Ink 5 reconciler semantics. Pinning `ink@5.1.0` + `react@18.3.1` eliminates the `ReactCurrentOwner` runtime mismatch and ensures deterministic frame testing.
2. **`<Static>` + Live Region:** `<Static>` renders finalized transcript items once without re-rendering on live updates; live region must remain bounded (streaming text batched at 33 ms, maxFps 30) to prevent frame duplication.
3. **Terminal Resize & Narrow Widths:** Layout wrapping requires `string-width` + `wrap-ansi` and explicit `gap` between flex children to avoid adjacent text collision (`StatusRail`).
4. **Bracketed Paste & Terminal Restore:** Raw mode, cursor visibility, and bracketed paste (`\x1b[?2004h` / `\x1b[?2004l`) must be restored on normal exit, `Ctrl+C`, `SIGTERM`, and uncaught exceptions.
5. **Windows Terminal:** TrueColor (`COLORTERM=truecolor` or `WT_SESSION`) works natively; Unicode box-drawing and glyphs (`✓`, `✗`, `⠋`, `◆`, `❯`, `▍`) render cleanly.

## Decision
- Pin `ink: "5.1.0"`, `react: "18.3.1"`, `ink-testing-library: "4.0.0"` in P0-08.
