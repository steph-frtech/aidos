# CLAUDE.md — AIDOS / KRD Implementation Agent Contract

> **`KRD.md` is the source of truth of this project's *concept*.** This file is a **guide** (feedforward), not the truth. The truth is the executable **mirrors** + the **Postgres** truth-store. If this file contradicts a green mirror, the mirror wins. Read `KRD.md` (the Tome) and `CONTEXT-MAP.md` before architectural work.

## What we are building

- **Category:** AI Development Operating System.
- **Product:** **AIDOS** (this repo). **Method:** **KRD** (Kernel-Ratchet Development, `KRD.md`).
- **Runtime:** AIDOS Runtime. **IDE / cockpit:** AIDOS Workbench. **CLI:** `aidos`.
- **Five subsystems:** AIDOS **Runtime · Kernel · Mirror · Archive · Workbench** — each in its own dedicated directory.

The concept is invented; the **implementation is to be reused** — at every step choose the best existing tool (as of May 2026), never reinvent the wheel.

## Core rule — never go prompt → code directly

```
Idea → BDD Mirror → Goal (red set) → Kernel/Truth → Implementation → Green → Stable Phase
```

The **human owns truth**. The **agent owns implementation**. The **harness enforces the wall**.

---

## 0. Vocabulary — lift the ambiguity first

- **BDD** = **Behavior-Driven Development** (the method): every behaviour is `Given / When / Then` *before* code. It is the form of every mirror.
- **Postgres** / **the base** = the database. When a human says "BDD" meaning storage, the canonical term here is **Postgres**. Never write "BDD" for the database.
- **AIDOS ≠ KRD**: AIDOS is the product; KRD is the method it implements. Never use them interchangeably.
- See `CONTEXT-MAP.md` + each subsystem's `CONTEXT.md` for the full glossary (noyau/Kernel, miroir/Mirror, cliquet/ratchet, mur/wall, vague de rouge, etc.).

---

## 1. The two non-negotiable mandates

### Mandat A — Every behaviour is proven in BDD, written before the code

- **No line of code without a red scenario first.** Write the mirror, watch it fail, code to green, refactor. `red → green → refactor`.
- **The mirror IS the behaviour spec.** A truth without a mirror is a wish (a **monster**). An orphan mirror is a monster. The completeness law forbids monsters.
- **Three mirror forms, one per nature of truth:**
  - **Journey / acceptance (N0)** → **Gherkin** `.feature`, run by **Godog** (back) + **Playwright + playwright-bdd** (front).
  - **Invariant (∀)** → **property test** (**rapid** in Go; **fast-check** front).
  - **Workflow (N2)** → **fixture** `state → command → events` (Operation DSL interpreter in Go).
- `.feature` language = the **ubiquitous language** (DDD). Same words in Go and Next.

### Mandat B — All truth + its meta live in Postgres (never in scattered files)

The "kernel" of AIDOS is **not** a folder of files: it is a **Postgres schema**. Stored as data (JSONB for ASTs), **content-addressed** (version = hash) and **append-only** (nothing destroyed, head is mutable):

| Postgres schema | Holds |
|---|---|
| **kernel** | DSL ASTs: entities, policies, operations, controls, actions, expr + invariants + budgets |
| **mirrors** | mirror records (`reflects, test_kind, cert_language, liveness`) **and** the mirror source (Gherkin text, property spec, fixture data) |
| **ideas** | candidate-truths (no freeze, no mirror) + provenance (human / incident) |
| **changesets** | transactional history (`DRAFT / APPLIED / REVERTED`, append-only) |
| **dag** | stable phases (nodes) + changesets (edges) — branches, reverts, merges |
| **brain** | `MemoryItem` (episodic, semantic, procedural…) + embeddings (**pgvector**) |
| **context** | the derived ContextGraph + `ContextGraphDecision` (reuse allowed or not) |
| **provenance** | "who wanted what, when, why" |
| **fitness** | NIVEAU 3 grammar + waterline + definition of "passed" (read-only) |

> **Practical consequence.** Code (Go, `.feature`, Next components) lives in the repo (git) — it is **projection** / **mirror implementation**, regenerable. **The source of truth is Postgres.** Canonical `.feature` files are stored in the base and **materialized** to disk for the runner; the disk copy is derived, the base is authoritative.

---

## 2. The wall — what you NEVER touch

The agent writes **code** freely (`back/gen`, projections, `front/web` adapters). The agent **never** writes truth:

- **Write-forbidden:** the `kernel` / `mirrors` Postgres schemas (above the line), the `fitness` schema.
- **Defense in depth (two levels):**
  1. **`PreToolUse` hook** (Go binary): refuses any write to those zones, returns an actionable `BlockReason` (`code, severity, explanation, how_to_fix[]`).
  2. **Postgres GRANTs:** the agent's DB role has **no** write GRANT on truth tables. Only the `aidos` CLI (via an approved changeset, dedicated role) writes truth.
- **The only door to the kernel:** `idea → mirror → /goal → human approval`. Never write in passing.

If you "need" to change a truth: create an **idea**, write its **mirror**, open a **`/goal`**. Never bypass.

---

## 3. The stack — FROZEN now (back = Go · base = Postgres · front = Next)

Derived from the Tome bench winners, mapped to Go/Postgres/Next. `mandatory` = never substitute; `replaceable` = a step may swap it with a documented reason (ADR). Tool search at step start picks the **simplest current (May 2026)** option **within** these slots; it never touches the mandatory minimum. Full table + rationale: `docs/adr/0003-frozen-stack.md`.

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
| Versioning / archive (truth-store) | **Postgres** (content-addressed, append-only, history tables) ; **git/jj** for code branches ; **pgvector** for embeddings. **Dolt abandoned for the truth-store** (ADR 0004 addendum re-rejects Doltgres). | mandatory |
| Emitted-app datastore (data-versioning target) | **Doltgres** (Postgres-wire Dolt) — git-for-data for the apps AIDOS *builds* (the "BDD du résultat codé") ; **same Postgres dialect**, reuses sqlc/pgx/Atlas (no MySQL) ; beta → spike-validated, plain-Postgres fallback. NOT the OS truth-store (ADR 0006). | replaceable |
| Memory backend (brain) | **native pgvector** on the Postgres truth-store ; external memory service = `replaceable` adapter behind the S31 port, spike+ADR gated (ADR 0008). **claude-mem** is the *build-agent's* memory (Layer A), not the OS brain. | mandatory |
| Shared source schema | one **source (entity)** → emits Go + TS (codegen), never double-typed | mandatory |
| MCP | **Go MCP SDK** — one tool = one backend op ; **every backend op/API is exposed as an MCP tool, no exception** (ADR 0009) | mandatory |
| Hooks | **Go binaries** invoked by `PreToolUse / PostToolUse / Stop / PostKernelChange / SessionStart` | mandatory |
| Mutation testing | **gremlins** (Go) + **StrykerJS** (front) | replaceable |
| Budgets (perf/sec) | **Semgrep · gosec · gitleaks · k6** | replaceable |
| Telemetry | **OpenTelemetry** (Go) → Postgres | replaceable |
| Arch-fitness | **go-arch-lint / depguard** (Go) + **dependency-cruiser** (front) | replaceable |
| Formal caps (rare, T2) | Z3 / TLA+ / Dafny / Alloy / UPPAAL — only if catastrophic ∧ unsampleable | replaceable |

> **Reuse, don't reinvent (ADR 0007):** the kernel stores behaviour/contracts as ASTs in Postgres (the *source*), but eval/exec/codegen **reuse mature libs** — **CEL / `expr-lang`** for Expr eval, an existing statechart runner for Operation fixtures, **sqlc** + templates for emission. Only the Operation step-interpreter is ours. XState stays client-only in Next.

---

## 4. Repository structure (AIDOS — additive, never reorganized)

```
aidos/
├── back/                     # the OS ENGINE — Go module + Postgres (only writer of truth)
│   ├── go.mod
│   ├── cmd/aidos/            # the `aidos` CLI: check·impact·stable·diff·explain·trim·goal·grill·spike·harvest·init
│   ├── runtime/<step>/       # AIDOS Runtime — harness: hooks, sensors, generators, compiler, context, goal, evolution, reality, release, adoption, cost, vitality
│   ├── kernel/<step>/        # AIDOS Kernel — records, DSL ASTs (expr/policy/operation/control/action/entity), links, composes, propagation, lifecycle, truth-typing, scope, authority, weights, targets, sagas, temporal, experience
│   │   └── mirror/<step>/    # AIDOS Mirror — schema/liveness, completeness, cert-runners (godog/rapid/…), fault-injection, reality-mirror   (bicephalous plane of Kernel)
│   ├── archive/<step>/       # AIDOS Archive — content store, changesets, phases, dag, merge, curation, qd, brain (memory-firewall + adapters + context-graph/router)
│   ├── mcp/<server>/         # Go MCP servers: store · mirror-runner · sensors · changeset · dag · idea-intake · memory · context · evolve · backtester · telemetry-reader · pact-verifier
│   ├── hooks/<phase>/        # Go hook binaries: pretooluse · posttooluse · stop · postkernelchange · sessionstart
│   ├── migrations/           # Postgres (Atlas) — the truth schemas (expand-contract, append-only)
│   ├── gen/                  # code generated by emitters (Go handlers, TS types, DDL) — NEVER hand-edited
│   └── internal/             # shared Go helpers
├── front/
│   └── web/                  # AIDOS Workbench (Next.js) — one route per panel (app/<route>/)
├── docs/
│   ├── adr/                  # decisions (0001..)
│   └── plan/                 # ONE .md per implementation step (S00..) + PLAN.md index
├── .claude/
│   ├── skills/               # SKILL.md per gesture
│   ├── agents/               # step-executor · step-verifier · playwright-tester
│   ├── workflows/            # long-run.js (sequential) · test-suite.js (parallel)
│   ├── hooks/                # claude-code hook scripts
│   └── settings.json
├── PLAN.md  TEST_PLAN.md  playwright.config.ts  CLAUDE.md
└── tests/e2e/                # Playwright specs (one per critical flow)

# TRUTH does NOT live in files: kernel · mirrors · ideas · changesets · dag · brain · context · fitness
# are POSTGRES SCHEMAS. The agent has no GRANT to write them (§2, the wall).
```

`mirror` is a **plane inside the Kernel context** (`back/kernel/mirror/`), co-versioned (bicephalous) — see `docs/adr/0002`.

---

## 5. When to create a Skill / Hook / MCP / Package / Migration / Mirror / UI

At **every** step, ask in this order and create the artifact **iff** the answer is yes:

| Question | Create a… | Where |
|---|---|---|
| Repeatable **gesture** (a procedure the agent replays)? | **Skill** (`SKILL.md`) | `.claude/skills/<name>/` |
| **Non-bypassable rule** (the wall, a sensor, a stop condition, completeness)? | **Hook** (Go binary) | `back/hooks/<name>/` |
| **Capability / action** (read-write the base, run a runner, query a service, trigger a migration)? | **MCP server** (Go) | `back/mcp/<name>/` |
| **Pure logic or schema**? | **Go package** | `back/<subsystem>/<step>/` |
| **Persistence**? | **Postgres migration** (append-only / content-addressed) | `back/migrations/` |
| **Behaviour proof**? | **BDD mirror** (stored in base, materialized to run) | `tests/` + `mirrors` schema |
| **Visualization**? | **Next route** (Workbench) | `front/web/app/<route>/` |

> **Hook honesty:** a hook that never fires is dead. Before adding a sensor/hook, require it has failed at least one real run. Every hook has a **fault-injection test** (break what it watches, assert it goes red).
> **Meta-loop rule:** a new artifact may **ADD** a guardrail, **never REMOVE** one.

---

## 6. The per-step loop (follow at EVERY step)

Each step is **minimal** (one verifiable capability), **autonomous** (testable alone, mocks what doesn't exist yet — never the reverse), **visualizable** (a Workbench UI route + a Playwright e2e), **non-destructive**, **chainable** (leaves a stable phase the next step consumes).

1. **`/grill-with-docs`** the intention first — you do **not** start a step without it. One intention, ≤ 5 scenarios; sharpen the ubiquitous language; update `CONTEXT.md`/ADRs.
2. **Write the BDD mirror first** (Gherkin / property / fixture), stored in the `mirrors` schema, materialized for the runner. It is **red**. That red **is** the `/goal`.
3. **`/tdd`** to code — you do **not** code without it. `red → green → refactor`, outside-in, in this step's own package only.
4. **Sensors green at each diff** (PostToolUse hook). Self-certify on the **computational** only.
5. **Completeness:** the layer has its living mirror? No monster? Else `Stop` blocks.
6. **`/diagnose`** — you do **not** finish a code step without it (isolate any failing sensor, propose).
7. **UI:** add the Workbench route (don't touch existing routes) + a **Playwright** e2e for the visualization. I want a UI at every step.
8. **`/improve-codebase-architecture`** — you do **not** move to the next step without it.
9. Create this step's migration/projection artifacts per §5.
10. **Artifact accretion (end of step, ADR 0009).** Using the official **`skill-creator`** skill and the **`agent-creator`** agent, create the **skills + agents** this step (and the near future) needs; **scaffold** the **hooks + MCP servers** it implies (activated + fault-injected only at the step that needs them — a hook that never fires is dead). Think MCP for **both planes**: the **AIDOS code/codegen** *and* the **emitted app**. Every backend op gets an **MCP tool** (no exception). S00–S01 carry a larger upfront batch (the §6 skill/agent inventory + MCP/hook scaffolds).

> **Bootstrap exception (forward dependencies).** Early steps build the substrate later steps rely on: the `mirrors` Postgres schema doesn't exist until **S06**, the wall hook until **S04**, the changeset engine until **S20**, etc. A step whose mirror cannot *yet* be persisted to Postgres **materializes it as a file + an executable test** (that test IS the red→green proof); Postgres persistence is **back-filled at the step that builds the schema** (S06 for mirrors). More generally a step may mock/defer substrate owned by a later step ("mocks what doesn't exist yet"), recorded as a **documented OpenQuestion** — and this **does NOT block the step**. By-design forward-dependencies are OpenQuestions, never failing `residual_issues`.

> **Tool search per step:** only at the step start, only if a real tool choice is needed: search current best, compare ≤ 3, pick the simplest within the frozen slot, record an ADR. Never search globally for future steps.

---

## 7. Execution — dynamic workflows (the last 4.8 workflow paradigm)

There is **no** `orchestrator` agent. The exec → verify → next-step loop lives in a **JS script** (`.claude/workflows/long-run.js`): state, gating and resume are in the script, not the context.

- **All execution agents run on Opus (ultracode):** the orchestrator (`plan:parse`, pinned `model: 'opus'`), `step-executor`, `step-verifier`, `test-runner`, `suggestion-compat-checker`, `playwright-tester` — `model: opus`, high effort. The executor/verifier must **always emit their StructuredOutput report, even if incomplete** (a Sonnet executor twice burned its turn budget on S01 and never reported). Custom step agents carry **no strict `tools:` allowlist** (a strict list excludes the workflow's `StructuredOutput` tool and the web tools the per-step tool-search needs).
- **`/long-run`** reads `PLAN.md`; per step, `step-executor` implements, `step-verifier` validates/corrects; advances only after a pass; hands back on unrecoverable failure (resume from cache).
- **`/test-suite`** runs `TEST_PLAN.md` scenarios in parallel via `test-runner`, gates on failures.
- **Playwright** e2e per flow via `playwright-tester` + the `playwright-e2e` skill; `playwright.config.ts` has a `webServer` block (`npm run dev -w @aidos/web`, baseURL `http://localhost:3000`).
- JS scripts must not use `Date.now()`, `Math.random()`, or arg-less `new Date()` (breaks resume) — pass dates via `args`.

---

## 8. Stop condition & honesty (anti-Goodhart)

- **"Done" is computed, never declared by you:** red set → green **∧** prior green intact **∧** mutation score ≥ threshold **∧** no monster. You cannot force `done`.
- You **never** write a truth-test (a new invariant you'd then satisfy — the circularity). You write means-tests toward the human red.
- The **judge is deterministic** (mirror + reality). A second agent validating a first reduces toil, is **not** a proof.
- **Everything versioned in Postgres:** an override is not an edit, it is a recorded decision (changeset + ADR + provenance).
- Weights/thresholds are **declared** (above the line), never learned.

## 9. Anti-overwrite

Forbidden: rewriting prior artifacts without a ChangeSet; silently replacing a model; deleting truths directly; changing a mirror without a SemanticDiff; hand-editing generated files; changing authority/scope without explicit reason.
Allowed: add new files; add a ChangeSet; supersede via version; deprecate via lifecycle; new branch; new projection from a source.

## 10. Tooling notes

- **Do NOT use Slack** (or any chat-notification MCP) for this project.
- Match the existing style of each file. **Biome** owns formatting (tabs, double quotes) at the monorepo root; **ESLint** owns Next rules in `front/web`. `back/` is Go (`gofmt`).
- The Karpathy working guidelines (`STACK.md`) still apply: simplicity first, surgical changes, think before coding, goal-driven execution.
- A `Stop` hook (`.claude/scripts/audit.sh`) runs an `agentshield` scan after each session — keep it.

### In one sentence

> **Every behaviour is proven in BDD before it exists; all truth lives in Postgres, out of your reach; each step adds one isolated, tested, visualized tooth — with its skills/hooks/MCP when needed — and nothing, ever, silently breaks what came before.**
