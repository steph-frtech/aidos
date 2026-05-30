---
status: accepted
---

# The stack is frozen now, mapped from the Tome bench winners onto Go / Postgres / Next

We **freeze the implementation stack now** rather than leaving it adaptive: the Tome's bench winners (the tools that won each KRD-level comparison) are mapped once onto the repo's three pillars — **back = Go · base = Postgres · front = Next** — and recorded as the table below. We chose this because a *complete harness* (the wall, the sensors, the cert-runners, the version-DAG, the emitters) needs a **fixed topology** to attach to: every hook, MCP server, generator, and completeness check is written against named slots, and a moving stack would mean the harness never stabilises. Freezing trades away requisite variety (Ashby) and runtime adaptability for a buildable, enforceable foundation — accepted deliberately.

Each slot carries a **status**: `mandatory` = the minimum is never substituted (the harness depends on it structurally); `replaceable` = a step may swap the tool for a documented reason, recorded as a new ADR, *within* the slot's role. The per-step tool search (§6 of `CLAUDE.md`) only ever picks the **simplest current (May 2026) option inside a slot** — it never touches the mandatory minimum, and it never adds or removes a slot.

| Role (KRD level) | Frozen choice | Status |
|---|---|---|
| Journey / acceptance (N0) | **Godog** (back) + **Playwright + playwright-bdd** (front) | mandatory |
| Invariants ∀ (N1) | **rapid** (Go) ; **fast-check** (front) | mandatory |
| Workflow (N2) | **Operation DSL interpreted in Go** + fixtures `state→cmd→events` ; XState only for client state in Next | mandatory |
| Contracts / entities (N3) | entities = **AST in Postgres (JSONB)** → emit **Go structs (sqlc)**, **Postgres DDL**, **TS types** ; **Pact** between cells | mandatory |
| Code / unit (N4) | **`go test`** + strict Go ; **Vitest** + strict TS (front) | mandatory |
| Infra / adapters (N5) | **Pact provider verification** + **Testcontainers (Go)** with real Postgres | mandatory |
| DB access (Go) | **sqlc** (SQL→typed Go) + **pgx** | mandatory |
| Migrations | **Atlas** (declarative, expand-contract) on Postgres | replaceable |
| Versioning / archive (truth-store) | **Postgres** (content-addressed, append-only, history tables) ; **git/jj** for code branches ; **pgvector** for embeddings. **Dolt abandoned for the truth-store** (Postgres absorbs it; see ADR 0004 addendum). | mandatory |
| Emitted-app datastore (data-versioning target) | **Doltgres** (Postgres-wire Dolt) — git-for-data for the apps AIDOS *builds* (the "BDD du résultat codé"), **same Postgres dialect** so emitters reuse sqlc/pgx/Atlas (no MySQL) ; beta → spike-validated, plain-Postgres fallback (ADR 0006). NOT the OS truth-store. | replaceable |
| Memory backend (brain, S31) | **native pgvector** on the Postgres truth-store (HNSW + cosine) ; an external memory service (Letta/Mem0/Zep) is a `replaceable` adapter behind the S31 Store/Embedder port, spike+ADR gated, never frozen (ADR 0008). | mandatory |
| Shared source schema | one **source (entity)** → emits Go + TS (codegen), never double-typed | mandatory |
| MCP | **Go MCP SDK** (one tool = one backend op) | mandatory |
| Hooks | **Go binaries** invoked by `PreToolUse / PostToolUse / Stop / PostKernelChange / SessionStart` | mandatory |
| Mutation testing | **gremlins** (Go) + **StrykerJS** (front) | replaceable |
| Budgets (perf/sec) | **Semgrep · gosec · gitleaks · k6** | replaceable |
| Telemetry | **OpenTelemetry** (Go) → Postgres | replaceable |
| Arch-fitness | **go-arch-lint / depguard** (Go) + **dependency-cruiser** (front) | replaceable |
| Formal caps (rare, T2) | Z3 / TLA+ / Dafny / Alloy / UPPAAL — only if catastrophic ∧ unsampleable | replaceable |

## Considered Options

- **Keep the stack adaptive** — re-run the full Tome bench at every step and let each step pick its own winner per KRD level, with no frozen slots. This maximises requisite variety: the toolset can always track the genuinely-best option of the day. Rejected: the harness has nothing fixed to attach to. The wall's `PreToolUse` zones, the cert-runners (Godog/rapid/…), the emitters (entity-AST → sqlc/DDL/TS), the MCP surface (one tool = one backend op), and the completeness law are all written against *named tools and named slots*. If the stack can shift under them, the harness is perpetually rewritten and never reaches a stable phase — the OS cannot enforce a method it cannot itself pin down. A moving foundation also defeats the per-step chainability rule: step N+1 cannot consume step N's stable phase if the slot it depended on changed shape.
- **Freeze the stack now (chosen)** — map the bench winners once onto Go/Postgres/Next, fix the topology of slots, and mark each slot `mandatory` or `replaceable`. Adaptability is preserved *only inside* `replaceable` slots and *only* via a documented ADR. We give up some variety in exchange for a harness that is buildable, enforceable, and stable — the right trade for an OS whose whole value is enforcing the method.

## Consequences

- **A step may swap a `replaceable` tool** (Atlas, gremlins/StrykerJS, Semgrep/gosec/gitleaks/k6, OpenTelemetry, go-arch-lint/depguard/dependency-cruiser, the formal caps) for a **documented reason recorded as a new ADR** — but only for the same role, never below the **mandatory minimum**. The role itself (the slot) stays put.
- **`mandatory` slots are never substituted.** Godog + Playwright/playwright-bdd, rapid/fast-check, the Operation-DSL-in-Go interpreter (XState stays client-only in Next), entities-as-AST-in-Postgres emitting Go/DDL/TS with Pact between cells, `go test` + Vitest, Pact provider verification + Testcontainers on real Postgres, sqlc + pgx, Postgres-as-versioned-store, the single source → Go+TS codegen, the Go MCP SDK, and Go hook binaries are load-bearing for the harness; replacing one means redesigning the harness, not editing a slot.
- **Dolt is abandoned *for the truth-store*, adopted *for the emitted-app datastore*.** The OS truth-store versioning is **Postgres** (content-addressed, append-only, history tables) with **git/jj** for code branches and **pgvector** for embeddings; Postgres absorbs the content-versioning role there, so there is no second engine in the OS core (ADR 0004 + its 2026-05-30 addendum re-rejecting Doltgres). A future reader should not reintroduce Dolt **into the truth-store**. Separately, **Doltgres (Postgres-wire Dolt) IS the data-versioning target for the apps AIDOS emits** (the "BDD du résultat codé") — a new `replaceable` slot, isolated to emitted products, in the **same Postgres dialect** (emitters reuse sqlc/pgx/Atlas; no MySQL), spike-validated for its beta status (ADR 0006). The two are different databases for different jobs — one dialect.
- **Variety is bounded, by design.** Per Ashby, freezing reduces the controller's variety and therefore its adaptability; the formal-caps slot (Z3 / TLA+ / Dafny / Alloy / UPPAAL) is the deliberate escape valve, reachable **only** when a property is both *catastrophic* and *unsampleable* — never as a default. This keeps heavy formal methods out of the everyday loop while leaving a recorded door for the rare case.
- **Hard to reverse.** The frozen slots are wired into the wall, the cert-runners, the emitters, the MCP surface, and the per-step loop; re-opening the stack to full adaptivity later would mean re-deriving the harness against a moving target, not flipping a flag.
