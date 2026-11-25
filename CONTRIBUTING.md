# Contributing to ReEngine CLI

## Prerequisites
- Node.js `^22.19.0 || ^24.11.0 || >=26`
- npm 10+

## Development Workflow
```bash
npm ci
npm run verify
```

`npm run verify` runs:
1. `tsc --noEmit` (strict TypeScript with `exactOptionalPropertyTypes` & `noUncheckedIndexedAccess`)
2. `eslint .` (complexity ≤ 15, max-lines ≤ 400, `no-console`, `no-ui-literals`)
3. `prettier --check .`
4. `depcruise src --config .dependency-cruiser.cjs` (layer boundaries)
5. `knip` (unused exports/dependencies)
6. `npm run schema:check` (JSON Schema parity)
7. `vitest run --coverage`
8. `npm run build` & `npm run pack:check`

## Architecture Boundaries
- `src/core/` never imports `src/ui/`, `src/providers/`, `src/mcp/`, or `src/engine/`.
- `src/core/contracts.ts` is frozen; changes require an ADR / Change Proposal.
- No `TODO`/`FIXME`, stubs, or `console.*` in `src/`.
