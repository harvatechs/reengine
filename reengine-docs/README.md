# ReEngine CLI — Build Documentation Set (v1.0 MVP)

> **ReEngine CLI** is an open, model-agnostic terminal harness that fuses the *interaction design* of modern coding-agent CLIs (Claude Code, Gemini CLI, OpenCode/Crush) with the *reverse-engineering core* of **REA — Reverse Engineer Anything** (`morluto/rea`, npm `rea-agents`), shipped as a built-in, supervised MCP engine.

This folder is the complete, strict build contract for an AI engineering agent (or a team of them). It is written to be **fed to the agent as-is**. Nothing here is pseudocode: every interface, schema, command, and gate is meant to be implemented literally.

---

## 1. Reading order (mandatory)

| # | File | Purpose | Read when |
|---|------|---------|-----------|
| 1 | `AGENTS.md` | Auto-loaded operating contract (short, non-negotiable) | Every session start |
| 2 | `intent.md` | Why this exists, principles, non-goals | Once, fully |
| 3 | `user-requirements.md` | Personas, journeys, FR/NFR with IDs + priority + acceptance | Once, then per task |
| 4 | `specs.md` | Architecture, contracts (real TypeScript), agent loop, CLI surface | Per task |
| 5 | `integrations-spec.md` | Model providers, MCP client, REA engine supervisor | WS-B, WS-E |
| 6 | `config-reference.md` | Every config key, defaults, precedence, example | WS-A, any config work |
| 7 | `ui-design-spec.md` | TUI layout, components, theme tokens, keybindings, fonts reality | WS-F |
| 8 | `security-and-permissions.md` | Threat model, permission engine, hardening | WS-C/D/E, review |
| 9 | `rules.md` | Hard MUST/MUST NOT rules | Every session |
| 10 | `guidelines.md` | Code style, naming, errors, git, PRs | Every session |
| 11 | `skills.md` | Step-by-step playbooks for recurring tasks | When task matches |
| 12 | `division-of-work.md` | Phases, workstreams, task IDs, gates | Planning + every task |
| 13 | `precise-scale-index.md` | Severity scale, budgets, recovery/rebalancing if work goes wrong | When anything fails |
| 14 | `what-not-to-do.md` | Anti-pattern catalogue | Before each PR |
| 15 | `testing-and-quality.md` | Test strategy, suites, coverage, DoD | Per task |
| 16 | `deployment-and-release.md` | Build, package, CI/CD, Docker, release | WS-G |
| 17 | `decisions.md` | Architecture Decision Records (ADR-001…) | When challenging a decision |
| 18 | `acceptance-checklist.md` | Final go/no-go for v1.0.0 | Phase 7 |

**Precedence when documents conflict:** `rules.md` > `security-and-permissions.md` > `specs.md` > `integrations-spec.md` > `config-reference.md` > `ui-design-spec.md` > `guidelines.md` > everything else. A conflict is itself a defect: log it (see `precise-scale-index.md`, S3) and propose a fix; do not silently pick one.

---

## 2. How to feed this to an AI agent

**Single agent.** Put the whole folder in the repo under `docs/spec/` (or point the agent at it). Make `AGENTS.md` available at repo root (copy it there). Paste the kickoff prompt below as the first message.

**Multi-agent.** Assign one agent per workstream (WS-A … WS-G, see `division-of-work.md`). One *Architect/Reviewer* agent owns gates, `src/core/contracts.ts`, and merges. Workers may only touch their workstream's directories unless a Change Proposal is approved.

### Kickoff prompt (copy verbatim)

```text
You are the Builder Agent for ReEngine CLI, a production-grade open harness.
Your complete requirements are in /docs/spec (this documentation set).

Before writing any product code:
1. Read, in order: AGENTS.md, intent.md, user-requirements.md, specs.md,
   integrations-spec.md, config-reference.md, ui-design-spec.md,
   security-and-permissions.md, rules.md, guidelines.md, skills.md,
   division-of-work.md, precise-scale-index.md, what-not-to-do.md,
   testing-and-quality.md, deployment-and-release.md, decisions.md.
2. Write docs/PROGRESS.md and record a one-paragraph summary of your
   understanding of the product, the architecture, and Gate G0's criteria.
3. Begin Phase 0 (Discovery & Contract Capture) exactly as defined in
   division-of-work.md. Do NOT write product code until Gate G0 is passed
   and its report is committed.

For every task: follow its Definition of Done, run `npm run verify`, paste real
command output into docs/progress/<task-id>.md, and commit with a Conventional
Commit message. Never claim completion without evidence. If anything in the spec
is wrong, ambiguous, or contradicts reality, STOP and raise a Change Proposal
per precise-scale-index.md instead of guessing.
```

---

## 3. Honest limits of this documentation (read this)

These documents were written against **public information about REA and the three reference harnesses**. Three categories of fact are *deliberately not hard-coded* and are instead captured in **Phase 0** from the real artifacts, because guessing them is exactly how sloppy projects are born:

1. **REA's exact MCP tool catalog and Evidence JSON shapes.** REA publishes a generated catalog and contracts (`docs/mcp-contracts.md`). Phase 0 captures them from the *pinned installed version* into committed fixtures; the Evidence renderer is built against those fixtures.
2. **Provider wire formats** (OpenAI-compatible, Anthropic Messages, Gemini). These change. Adapters are built from the *current official API documentation* fetched in Phase 0, verified with recorded fixtures.
3. **Exact dependency versions.** Pinned in Phase 0 after a compatibility spike (Ink/React/Node), then locked.

If the agent finds that this documentation disagrees with the real artifacts, **the artifacts win** and a Change Proposal is filed.

**Terminal font family and size cannot be set by a CLI process** — the terminal emulator owns them. ReEngine fully themes colors, borders, glyphs, density, and layout, and ships a **terminal-profile exporter** for font/size. See `ui-design-spec.md` §10.

---

## 4. Document control

- Version: **1.0.0-spec** · Target product version: **ReEngine CLI 1.0.0**
- Minimum Node.js: aligned with REA — `^22.19.0 || ^24.11.0 || >=26`
- License of this documentation: same as the project (MIT)
