# Environment & Package Availability Contract (P0-01)

Captured: 2026-11-25 (Windows 11 x64)

## 1. Local Toolchain

| Tool | Observed Version | Requirement (`specs.md` §1) | Status |
|---|---|---|---|
| Node.js | `v24.15.0` | `^22.19.0 \|\| ^24.11.0 \|\| >=26` | PASS |
| npm | `12.0.2` | npm with lockfile | PASS |
| Git | `2.54.0.windows.1` | Git CLI | PASS |
| Platform | `win32` / `x64` | Windows 10+ (x64), macOS, Linux | PASS |

## 2. Network & Registry Checks

- `https://registry.npmjs.org/-/ping` → HTTP `200`
- `https://api.github.com/zen` → HTTP `200`

## 3. npm Package Name & REA Metadata

- `npm view reengine-cli name version`:
  - Result: `npm error code E404` (`404 Not Found`) → **`reengine-cli` is available on npm** (Assumption A2 confirmed).
- `npm view rea-agents version dist.unpackedSize license`:
  - `version = '6.10.1'`
  - `dist.unpackedSize = 186235240` (~177.6 MiB unpacked; excluded from ReEngine's 25 MB budget per `NFR-DIST-01`)
  - `license = 'MIT'`
