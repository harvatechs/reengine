# deployment-and-release.md

## 1. Distribution channels (v1.0)

| Channel | Status | Notes |
|---|---|---|
| **npm** `reengine-cli` (global install, `npx`) | **M** | Primary. Provenance-signed. `npm i -g reengine-cli` · `npx reengine-cli` |
| **Docker image** (headless/CI) | **M** | Non-root; contains JS/.NET/web analysis capability; **no Ghidra/IDA/Hopper** (documented) |
| Homebrew / winget / scoop | C | Post-1.0 (thin wrappers over npm) |
| Single-file binary (Node SEA/pkg) | **No** | REA + native deps make it fragile (N-98) |

## 2. `package.json` essentials (exact fields; versions filled in P0-08)

```json
{
  "name": "reengine-cli",
  "version": "0.0.0",
  "description": "Open reverse-engineering harness: any model, REA built in, themeable terminal UI.",
  "type": "module",
  "license": "MIT",
  "bin": { "reengine": "bin/reengine.js", "ree": "bin/reengine.js" },
  "engines": { "node": "^22.19.0 || ^24.11.0 || >=26" },
  "files": ["dist", "bin", "schemas", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "CHANGELOG.md"],
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "build": "tsup",
    "dev": "tsx src/cli/main.ts",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format:check": "prettier --check .",
    "deps:check": "depcruise src --config .dependency-cruiser.cjs",
    "unused": "knip",
    "schema:gen": "tsx scripts/gen-schemas.ts",
    "schema:check": "npm run schema:gen && git diff --exit-code schemas",
    "test": "vitest run",
    "test:e2e": "vitest run --project e2e",
    "test:rea": "vitest run --project rea-real",
    "contract:rea": "tsx scripts/capture-rea-contract.ts --check",
    "pack:check": "tsx scripts/check-pack.ts",
    "verify": "npm run typecheck && npm run lint && npm run format:check && npm run deps:check && npm run unused && npm run schema:check && vitest run --coverage && npm run build && npm run pack:check",
    "prepack": "npm run build"
  }
}
```

`dependencies`: exact versions of the approved runtime list (specs §2) **including `rea-agents`**; `optionalDependencies`: `@napi-rs/keyring`; everything else in `devDependencies`.

## 3. Build

- **tsup** config: entry `src/cli/main.ts` → `dist/cli.js`; `format: ['esm']`, `target: 'node22'`, `platform: 'node'`, `sourcemap: true`, `splitting: true` (lazy chunks for `ink`, `highlight.js` languages, `marked`), `clean: true`, `dts: false`, `loader: { '.md': 'text' }`, `external`: **all** `dependencies` and `optionalDependencies` (we bundle our code only; third-party code stays in `node_modules` so REA/Ink resolve normally and auditing stays meaningful).
- **`bin/reengine.js`** (committed, plain JS, no transpile):

```js
#!/usr/bin/env node
const [major, minor] = process.versions.node.split('.').map(Number);
const supported = (major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26;
if (!supported) {
  process.stderr.write(`ReEngine requires Node.js ^22.19.0 || ^24.11.0 || >=26 (found ${process.versions.node}).\n`);
  process.exit(2);
}
await import('../dist/cli.js');
```

- **tsconfig** (`strict` family per R-030): `target ES2023`, `module NodeNext`, `moduleResolution NodeNext`, `jsx react-jsx`, `types: ["node"]`, `skipLibCheck: true`, `outDir` unused (tsup emits), `include: ["src","test","scripts"]`.
- **`scripts/check-pack.ts`**: runs `npm pack --dry-run --json`, asserts file list ⊆ whitelist (R-074), asserts `dist/cli.js` exists with no sourcemap `sourcesContent` leaking absolute local paths, asserts unpacked size ≤ 25 MB (NFR-DIST-01), asserts `bin` files are executable.

## 4. CI (GitHub Actions) — `.github/workflows/`

Pin every third-party action to a **full commit SHA** (record in P1-02 with a comment of the human-readable tag). Default `permissions: contents: read`.

**`ci.yml`** (on PR and push to `main`):

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  verify:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node: ['22.x', '24.x']
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run verify
      - run: npm run test:e2e
      - run: npm run test:rea
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24.x', cache: npm }
      - run: npm ci
      - run: npm audit --omit=dev --audit-level=high
  install-smoke:
    needs: verify
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '24.x', cache: npm }
      - run: npm ci && npm pack
      - run: node scripts/install-smoke.mjs   # installs the tarball into a temp prefix, runs --version, doctor --json, run against mock
```

**`rea-drift.yml`** (nightly cron + any PR touching `package.json`/`package-lock.json`): `npm ci && npm run contract:rea`; failure opens/updates an issue labeled `rea-drift` (S3 per scale index).

**`codeql.yml`**: JavaScript/TypeScript analysis weekly + on PR. **Dependabot or Renovate** (choose one in P1-02): weekly grouped PRs, `rea-agents` ungrouped and labeled for SK-06.

**Secrets scan:** `gitleaks` (or equivalent) action on PRs; fixture directories explicitly allow-listed only after redaction review.

## 5. Docker (headless/CI usage)

```dockerfile
FROM node:24-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && mkdir /out && npm pack --pack-destination /out

FROM node:24-bookworm-slim
RUN useradd --create-home --uid 10001 reengine
COPY --from=build /out/reengine-cli-*.tgz /tmp/
RUN npm install -g /tmp/reengine-cli-*.tgz && rm -f /tmp/reengine-cli-*.tgz
USER reengine
ENV REENGINE_HOME=/home/reengine/.reengine \
    REENGINE_NO_UPDATE_CHECK=1
WORKDIR /workspace
ENTRYPOINT ["reengine"]
CMD ["--help"]
```

Usage contract (documented and smoke-tested):

```bash
docker run --rm -v "$PWD":/workspace -e ANTHROPIC_API_KEY \
  reengine-cli run --output json --permission-mode plan \
  --target /workspace/app "Explain how the IPC layer works."
```

- Image published to GHCR on release with the same version tags; `--provenance`/SBOM attestation if the builder supports it.
- Smoke test in CI: build image, run `version`, `doctor --json` (expects `engine:*` pass, native providers `skip/warn`), and a mock-LLM `run`.
- Native engines (Ghidra/IDA/Hopper) are **not** in the 1.0 image; docs explain mounting an external engine via `engine.rea.env` as a post-1.0 recipe.

## 6. Versioning and compatibility

- **Pre-release:** `0.x` while developing; `1.0.0-rc.N` published to npm dist-tag `next` after G6/G7 dry-runs; `1.0.0` to `latest` only after G7.
- **SemVer from 1.0:** breaking = removal/rename of CLI commands/flags, config schema changes without migration, JSON output schema changes, exit-code changes, session format changes without a reader.
- **Stable contracts (documented in `docs/user/reference.md`):** CLI commands & exit codes, `run` JSON/NDJSON schemas, config schema v1, theme schema v1, keybinding schema v1, session JSONL record schema v1.
- **Deprecation:** warn for at least one minor release before removal; migrations ship with the release that introduces the change.
- **REA bumps** (SK-06): `patch` unless REA's change alters ReEngine-visible behavior (then `minor`).
- Changelog by **Changesets**; entries describe user impact.

## 7. Release process

**Dry-run (P7-06), repeatable (SK-15):**
1. `npm ci && npm run verify && npm run test:e2e && npm run test:rea` on a clean checkout.
2. `npm pack`; run `scripts/install-smoke.mjs` on macOS, Linux, Windows (CI `install-smoke` + one manual machine per OS).
3. `docker build` + smoke.
4. `npm publish --dry-run --provenance` in the release workflow with `NPM_CONFIG_DRY_RUN=true`.
5. Review `THIRD_PARTY_NOTICES.md` against `npm ls --omit=dev --all` licenses (no GPL/AGPL runtime deps).

**Release workflow (`release.yml`)** — triggered by merging the Changesets "Version Packages" PR:
- Permissions: `contents: write`, `id-token: write`, `packages: write` (GHCR).
- Steps: checkout → setup-node (registry `https://registry.npmjs.org`) → `npm ci` → `npm run verify` → `npm run test:e2e` → `npm publish --provenance --access public` (npm trusted publishing/OIDC; no long-lived npm token in repo secrets if the org supports it, otherwise a granular automation token scoped to this package) → create GitHub Release from changelog → build/push Docker image.
- The workflow refuses to publish if the Git tag doesn't match `package.json` version or if `1.0.0` is requested without `docs/gates/G7.md` present.

**Release checklist:** `acceptance-checklist.md` complete · changelog reviewed · README quickstart executed verbatim on a clean VM · `engine doctor` on a machine with and without Ghidra · security note reviewed · tag `v<version>` signed if keys exist.

## 8. Post-release

- **Update notifier:** once per 24 h, a plain `GET https://registry.npmjs.org/reengine-cli/latest` (no identifiers, cache in state dir), prints a one-line notice with the exact upgrade command; never auto-updates. Disabled by `updates.check=false` or `REENGINE_NO_UPDATE_CHECK=1`.
- **Rollback:** `npm deprecate reengine-cli@<bad> "<reason>"`; `npm dist-tag add reengine-cli@<good> latest`; ship patch; Docker `latest` retagged; incident note per scale index S2+. Unpublish only for S5.
- **Support surface:** `SECURITY.md` (private reporting address/process), issue templates requesting `reengine doctor --json` output (redacted by design) and REA version.
- **Maintenance cadence:** weekly dependency PRs; nightly REA drift job; monthly review of provider API changes against `docs/contracts/wire-*.md`.
