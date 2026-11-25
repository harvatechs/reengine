# precise-scale-index.md — Severity Scale, Budgets, and Recovery (If Work Goes Wrong)

Purpose: give the agent an unambiguous way to **measure** how wrong something is, **how much effort** to spend before escalating, and **exactly how to rebalance** the plan. Guessing severity or "pushing through" is itself a rule violation (R-006, R-007).

## 1. How to use

1. Something fails (test, gate, contract, build, security check, spec contradiction).
2. Classify using §2 (take the **highest** applicable level).
3. Follow that level's procedure in §3 — including the **attempt budget** and **who decides**.
4. Log it in `docs/incidents/<date>-<slug>.md` (S2+), using the template in §3.6.

## 2. Severity scale

| Level | Name | Definition | Examples |
|---|---|---|---|
| **S1** | Local defect | Contained in one file/task; no contract, spec, or security impact | lint error, flaky unit test, typo, snapshot drift from intended UI change |
| **S2** | Task failure | A task's acceptance criteria not met; fixable inside the task's scope | adapter mishandles one stream shape; coverage below threshold; perf budget missed by < 25% |
| **S3** | Phase/contract failure | Reality contradicts a spec/contract, or a fix requires touching another workstream or a frozen interface | REA output differs from fixtures; provider semantics break `ModelStreamEvent`; two spec docs conflict; needs a new runtime dependency |
| **S4** | Architecture/decision failure | An ADR or core principle is invalid; or a security default would be weakened | Ink cannot meet the frame budget; Node SEA/REA bundling impossible; need to change permission defaults |
| **S5** | Safety/security/legal incident | Potential secret exposure, command-execution bypass, license violation, destructive action on user data | Secret in a log; injection fixture executes `shell`; code copied from a proprietary source; `rm -rf` outside roots |

## 3. Procedures

### 3.1 S1 — Fix in place
- **Budget:** ≤ 15 min / 2 attempts.
- **Action:** fix, add/adjust test, commit.
- **Escalate to S2** if the same S1 recurs twice in a task.

### 3.2 S2 — Diagnose, then fix
- **Budget:** 3 distinct hypotheses-driven attempts (each recorded: hypothesis → experiment → result). No random edits.
- **Action:** write a minimal reproducer test first; find root cause; fix cause not symptom; add regression test (R-083).
- **Escalate to S3** if root cause lies outside the task's scope or after 3 failed attempts.
- **Decides:** Builder.

### 3.3 S3 — Stop, freeze, propose
- **Action (in order):**
  1. **Stop** work that depends on the disputed fact. Do not code around it.
  2. Write the **Change Proposal** (§6) with evidence (fixtures, logs, doc links).
  3. Mark affected tasks `BLOCKED` in `docs/PROGRESS.md`; unaffected workstreams continue.
  4. Architect decides within the same session: *accept* (update spec + fixtures + tasks), *reject* (with reason), or *amend*.
  5. Implement the accepted change **spec-first**: update docs/contracts → fakes → code → tests, in one PR.
- **Budget:** 1 session of investigation before proposing. **Decides:** Architect.

### 3.4 S4 — Re-plan
- **Action:** halt the phase; write/amend the ADR with alternatives and measured evidence (benchmarks, spikes); human sign-off required before resuming; re-baseline `division-of-work.md` tasks and gates; tag `replan-<n>`.
- **Decides:** Architect **and** human owner.

### 3.5 S5 — Halt and contain
1. **Halt all work** immediately; no further commits except containment.
2. **Contain:** remove leaked artifacts from the working tree and history *locally*; rotate any exposed credential (tell the human; the agent cannot rotate vendor keys); disable the offending code path behind a hard error.
3. **Assess:** what was exposed/executed, for how long, which versions/commits.
4. **Fix + regression test + red-team test** that reproduces the exploit.
5. **Post-incident review** (`docs/incidents/…`): timeline, root cause, why gates missed it, new guardrail added (test, lint rule, or spec rule).
- **Decides:** human owner. Release is blocked until closed.

### 3.6 Incident note template (S2+)

```
# <YYYY-MM-DD> <slug>
Severity: S? · Task: P?-?? · Detected by: <test/gate/review>
Symptom: …
Evidence: <command + output / fixture / log path>
Hypotheses tried: 1) … → result  2) …
Root cause: …
Fix: <commit> · Regression test: <path>
Spec/doc updates: …
Prevention: <rule/test/lint added>
```

## 4. Quantitative budgets (the "scale")

Budgets are verified in P7-02 and spot-checked at every gate. "Missed" = fails on any supported OS in CI or the reference run.

| Metric | Target | S2 if worse than | S3 if worse than |
|---|---|---|---|
| Cold start to interactive prompt | ≤ 800 ms | 1000 ms | 1500 ms |
| `reengine --version` | ≤ 150 ms | 250 ms | 400 ms |
| `reengine config get`/`doctor --json` start (no Ink import) | ≤ 300 ms | 450 ms | 700 ms |
| Input-to-render latency while streaming | ≤ 50 ms p95 | 80 ms | 150 ms |
| Max render rate | ≤ 30 fps | 40 fps | uncapped |
| Idle RSS (TUI, no REA) | ≤ 200 MB | 250 MB | 350 MB |
| Resume 10 000-message session | ≤ 3 s | 4.5 s | 8 s |
| Cancel to quiescence (turn aborted, no tool running) | ≤ 500 ms | 800 ms | 2 s |
| Installed size (excl. REA) | ≤ 25 MB | 32 MB | 50 MB |
| Runtime dependency count (direct) | ≤ 22 | 25 | 30 |
| Coverage — core/providers/config/tools | ≥ 85% lines, ≥ 80% branches | −3 pts | −10 pts |
| Coverage — ui | ≥ 60% lines | −5 pts | −15 pts |
| Flaky-test rate (CI, 30-day) | 0 | 1 flaky | 3 flaky |
| Orphan child processes after exit | 0 | — | any (S5 if exec tool) |
| Secrets in logs/sessions (seeded test) | 0 | — | any ⇒ **S5** |

## 5. Balancing rules (what to trade when budgets collide)

Priority order of values: **Security > Correctness/Truthfulness > Reliability > Cancel/Responsiveness > Startup/Perf > Features > Polish.**

| Collision | Resolution |
|---|---|
| Feature vs. perf budget | Lazy-load the feature; if still over, cut the feature to *Should→Could* and note in gate report |
| Feature vs. security default | Security wins; ship the feature behind explicit config + ask |
| Polish vs. correctness | Cut polish |
| Coverage vs. deadline | Never lower thresholds (R-082); reduce scope instead |
| Evidence richness vs. context size | Keep raw in artifacts; shrink `modelView`; never drop evidence records |
| More providers vs. quality of three adapters | Quality of the three; additional ones are presets |
| Spec ambiguity vs. progress | Pick the **safer/more restrictive** interpretation, log an assumption, raise S3 in parallel |

**Scope-shedding order** if the schedule must shrink (stop at the first sufficient cut; each cut is a recorded decision):
1. Shell completions (FR-CLI-06) 2. Legacy SSE MCP (FR-MCP-03) 3. MCP resources (FR-MCP-08) 4. Reasoning normalization (FR-PRV-10) 5. Anthropic caching (FR-PRV-11) 6. Cost display (FR-PRV-12) 7. Auto-snapshot (FR-REA-10) 8. Role models (FR-PRV-09) 9. Todo UI (FR-AGT-07).
**Never cut:** security controls, truthfulness (evidence status), cancellation, contract tests, three provider adapters, theme token system, headless mode, REA supervision.

## 6. Change Proposal template

```
# CP-<n>: <title>
Severity: S3|S4 · Raised by: <role/agent> · Date: <>
Trigger: <what failed/contradicted, with evidence paths>
Impact: <tasks, workstreams, contracts, docs affected>
Options:
  A) <description> — cost, risk, reversibility
  B) …
Recommendation: <option + why>
Spec edits required: <files/sections>
Test/fixture edits required: <paths>
Decision (Architect/Human): accepted|rejected|amended · Date · Notes
```
Store in `docs/change-proposals/CP-<n>.md`; reference from commits (`refs CP-3`).

## 7. Rollback and recovery mechanics

- **Checkpoints:** tag every passing gate (`gate-G<n>`); at the start of each phase create branch `phase/<n>` from the gate tag.
- **Bad merge:** `git revert <sha>` (never reset published history). Revert commit message cites the incident note.
- **Broken main:** CI-red `main` is S3 until green; freeze merges; fix-forward only if fix is < 30 min, else revert.
- **Dependency regression:** revert the lockfile change, pin previous exact version, open S3 if it's REA.
- **Corrupt session file:** reader ignores a trailing partial line; for mid-file corruption, load up to the last valid record, rename the file `*.corrupt`, emit notice (test with fuzzed corruption).
- **Corrupt config:** never overwrite; write `.bak` before any programmatic edit; `config validate --fix` only applies safe, listed migrations.
- **Release regression:** `npm deprecate reengine-cli@<bad> "<reason>"`, move `latest` dist-tag to previous good (`npm dist-tag add`), publish patch; never unpublish except for S5 secrets.
- **REA failure at runtime:** supervisor restarts ≤ 3; then `failed` state with doctor guidance; app remains usable without REA.
- **Agent self-check before declaring a phase complete:** re-run `verify`, the phase's gate checklist, `git status` clean, `docs/PROGRESS.md` current, no TODO grep hits, no skipped tests (`grep -R "\.skip(" test` empty).
