# Gate G5 Security Review (SK-14)

- **Terminal Escape Injection:** `src/ui/sanitize.ts` strips ANSI/CSI/OSC/DCS/PM/APC/SOS and C0/C1 control characters from all untrusted text (model output, tool previews, filenames, CWD, banner, user input) before Ink rendering; `formatOsc8Link` validates `http:`/`https:` schemes only.
- **No Hard-Coded UI Literals:** ESLint rule `no-ui-literals` enforces semantic theme tokens outside `src/ui/theme/`.
- **Terminal Restore:** `launchInteractiveSession` wraps Ink in `try ... finally { restoreTerminalState(); }` to prevent stuck raw mode/cursor/alternate-screen states.
- **Tainted Permission UI Guard:** `PermissionPrompt` disables `[p] Project rule` when `request.tainted` is `true`.
- **Result:** PASS.
