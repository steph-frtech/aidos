# ADR 0014 — S07 sensor runner: changed-set resolution + archtest adapter

- **Status:** Accepted
- **Date:** 2026-05-31
- **Step:** S07 (Runtime — Sensors / PostToolUse computational checks, on_fail block)
- **Deciders:** step-executor S07, against CLAUDE.md §3 (frozen stack), KRD §19 / §74

## Context

S07 wires the **computational sensors** at `PostToolUse` (KRD §74,
`run: ["typecheck","lint","archtest","run-mirrors --affected"], on_fail: block`;
§19, the per-diff *computational* drawer). The hook must, after each agent diff
**below the waterline**, resolve the **changed code** set, run the deterministic
checks on it, and `block` on any failure with an actionable `BlockReason`
(`code = SENSOR_FAILED`). It records every run append-only in
`runtime.sensor_runs`.

Two genuine choices arise inside the frozen slots — both must be recorded
(CLAUDE.md §6 tool-search, anti-écrasement §9), because guessing them silently
would be inventing a business rule (the honesty rule).

### Choice 1 — how is the "changed code" / affected set resolved?

Options considered (≤3, CLAUDE.md §6):

1. **Event payload paths** — the `PostToolUse` event already carries the written
   file(s) (`tool_input.file_path`, the same shape S04's `PreToolUse` decodes).
   The hook reads them directly. Zero extra process, fully deterministic from the
   event, no working-tree assumptions.
2. `git diff --name-only` — re-derive the changed set from the working tree.
   Couples the per-diff sensor to git state (staged vs unstaged, untracked),
   non-deterministic w.r.t. the event, and slower (a subprocess per diff).
3. `go list -deps`-driven full reverse-dependency closure — precise affected
   *package* set, but heavyweight and out of proportion for a per-diff drawer.

### Choice 2 — which archtest tool?

The frozen Arch-fitness slot (ADR 0003) is **`go-arch-lint` / depguard**, marked
`replaceable`. Neither is wired in this repo yet (no `.go-arch-lint.yml`, no
depguard config) and no arch-fitness step has landed. Inventing a config now
would be inventing a rule the kernel never declared.

## Decision

**Choice 1 — event payload is the source of the changed set.** The runner takes
the changed file paths from the decoded event. From the changed `*.go` files it
derives the affected **package directories** (the file's directory) and runs
`go vet` / `go test` scoped to those packages. This keeps the sensor a pure
function of the event (determinism-first, CLAUDE.md §8) and matches the S04
precedent (the wall reads `tool_input.file_path`). `git diff` / full `go list`
closure are recorded as an **OpenQuestion** for a later precision pass.

**Choice 2 — the archtest sensor is a pluggable adapter with a deterministic
default boundary check.** Until a dedicated arch-fitness step wires
`go-arch-lint`/depguard with a declared config, the `archtest` adapter runs a
deterministic, in-process boundary check that enforces the **one boundary the
repo already declares as truth**: nothing below the waterline may `import` the
truth zone `back/kernel/**` in a way ADR 0002 forbids (the Mirror is a plane
inside the Kernel; projections never import the kernel source tree). The adapter
interface is stable, so swapping in `go-arch-lint` later is an adapter change,
not a redesign. Recorded as an OpenQuestion: *wire go-arch-lint/depguard with a
declared config at the arch-fitness step; until then the default boundary check
stands.*

## Consequences

- The hook is a **pure function of the PostToolUse event** plus the on-disk code
  it points at — same event ⇒ same verdict (a reproducibility mirror holds).
- The four KRD checks map onto the frozen Go stack as:
  - `typecheck` → **gofmt** (format drift) + **go vet** (build/type) — split into
    two named sensors `gofmt` and `vet` so each can block on its own fault.
  - `lint` → **go vet** strict + the repo linter (Biome at root for non-Go;
    Go diffs use `go vet`); the `lint` sensor is the strict-Go gate here.
  - `archtest` → the deterministic boundary adapter above.
  - `run-mirrors --affected` → **go test** on the affected package(s) + the
    affected Godog/rapid mirrors in them (`affected` sensor).
- An **errored/unknown check is itself a failure** (KRD §82 `.passthrough()`
  anti-pattern): a crashing or missing sensor `block`s, it never silently allows.
- No new mandatory-minimum tool is touched; both choices live inside replaceable
  slots and are reversible (adapter swap / resolver swap).

## OpenQuestions (recorded, not invented)

- **OQ-S07-1:** precision of the affected set — upgrade event-paths → `go list`
  reverse-dependency closure when a later step needs transitive affected tests.
- **OQ-S07-2:** wire `go-arch-lint`/depguard with a declared config at the
  arch-fitness step; the default boundary check is the placeholder until then.
- **OQ-S07-3:** a `sensors` MCP server for on-demand rerun (out of scope here —
  the hook is harness-invoked, not a callable op).
