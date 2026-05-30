# S03 — aidos CLI stub (check/impact/stable/diff/explain), deterministic, exit 0

Subsystem: AIDOS Runtime | Home: `back/cmd/aidos` | Workbench route: `/cli`

## Objectif

Stand up the `aidos` CLI skeleton in Go: the five core commands `check`, `impact`, `stable`, `diff`, `explain` each print their own contract (name, purpose, the inputs/outputs they will eventually own) and exit `0`, deterministically. This is the tracer-bullet entrypoint of the AIDOS Runtime — no truth is written, no Postgres is touched yet; the commands are stubs whose job is to declare their future contract and be wired, tested and visualizable.

## Sortie attendue

Only the artifacts that apply per CLAUDE.md §5 (decision table) — this is "pure logic / a CLI skeleton + a visualization", so:

- **Go package** (§5 "pure logic"): `back/cmd/aidos/` — the cobra root command + one subcommand per `check / impact / stable / diff / explain`, each emitting a stable, hand-written contract string and returning exit `0`. Keep each subcommand in its own small file; the root wires them.
- **Unit tests** (§5 "behaviour proof", code/unit layer N4): `go test` over the contract-string + exit-code behaviour, plus a `rapid` property (determinism: same args → byte-identical output) if a real invariant emerges.
- **BDD mirror** (§5 "behaviour proof", journey/acceptance N0): a Godog `.feature` for "operator runs `aidos <cmd>` and reads its contract", source-of-truth conceptually stored in the `mirrors` schema, materialized to `tests/` for the runner.
- **Next route** (§5 "visualization"): `front/web/app/cli/page.tsx` — the `/cli` Workbench panel listing the five commands and their printed contracts.
- **Playwright e2e** (§5 "visualization" proof): `tests/e2e/cli.spec.ts` covering `/cli`.

NOT in scope (do not create — the §5 answer is "no" this step): no Postgres/Atlas migration (the stub touches no truth, no persistence), no MCP server (no backend capability yet — the commands print, they don't query), no Go hook (no new non-bypassable rule; the wall already exists from earlier steps). If a command *looks* like it needs the base, that is a later step — keep it a stub here.

## Test minimal (done)

Done is **computed**, not declared (CLAUDE.md §8). Restated as a red-first BDD mirror written **before** any CLI code:

- **Red mirror (Godog `.feature`, N0)** — one scenario per command, ≤ 5 total:
  - `Given the aidos CLI is built` `When I run "aidos check"` `Then it prints the "check" contract` `And it exits with code 0`.
  - Repeat for `impact`, `stable`, `diff`, `explain` (one scenario each; the data table holds `command → contract heading`).
- **Determinism property (rapid, N1, only if a real invariant)** — for any command in the set, running it twice yields byte-identical stdout and the same exit code `0`.
- **Done criteria (the red set going green ∧ prior green intact):**
  1. Each of the five commands prints its contract heading and body.
  2. Each exits `0`.
  3. Output is deterministic (no timestamps, no `Date.now()`/random, no env-dependent ordering).
  4. The Godog mirror is green; `go test ./back/cmd/aidos/...` is green; prior steps' green stays green; no monster (the mirror has its truth, the contract has its mirror).

The mirror must be observed **red first** (commands don't exist → Godog fails to find the contract / build fails) before a single line of CLI code is written.

## Visualisation UI

- **Workbench route:** `front/web/app/cli/page.tsx` at `/cli`. A read-only panel: one card per command (`check`, `impact`, `stable`, `diff`, `explain`) showing the exact contract string the binary prints. This route is **new** — do not touch existing routes.
- **Playwright e2e:** `tests/e2e/cli.spec.ts` — navigate to `/cli`, assert all five command names render and at least one full contract block is visible. Follow the `playwright-e2e` skill; rely on the `webServer` block in `playwright.config.ts` (`npm run dev -w @aidos/web`, baseURL `http://localhost:3000`). Use role/text selectors, no brittle nth-child.

## Regle anti-ecrasement

This step edits only its **own** declared files (`back/cmd/aidos/*`, its `tests/` mirror, `front/web/app/cli/*`, `tests/e2e/cli.spec.ts`) and otherwise **adds** new files. It does not rewrite prior artifacts. Any change to a prior contract (a kernel record, a mirror, an earlier command's signature, a shared entity) is forbidden in passing — it must go through a **ChangeSet** (`DRAFT → APPLIED`, append-only) plus a **SemanticDiff**, per CLAUDE.md §9. Generated files are never hand-edited; truths are never deleted; supersede via version, deprecate via lifecycle. A new artifact may **ADD** a guardrail, never remove one (§5 meta-loop rule).

## Prompt a lancer

```text
ROLE: step-executor for AIDOS step S03 — "aidos CLI stub (check/impact/stable/diff/explain)".
Home (the ONLY directory you write Go in): back/cmd/aidos. Frozen stack (do NOT substitute):
back = Go, truth = Postgres (you have NO write grant to kernel/mirrors/fitness), front = Next.js
(the Workbench). Follow the CLAUDE.md §6 per-step loop IN ORDER. Do not go prompt → code.

(a) GRILL-WITH-DOCS FIRST. Run /grill-with-docs on the intention before any code. One intention,
    ≤ 5 scenarios. Sharpen the ubiquitous language: what does each of check/impact/stable/diff/
    explain mean in AIDOS terms (check = run the red set?, impact = red-wave preview?, stable =
    show the current stable phase?, diff = SemanticDiff between phases?, explain = provenance of a
    truth?). Read node_modules/next/dist/docs for any Next-16 specifics; use context7 for cobra /
    Godog / Playwright current (May 2026) APIs. Update the relevant CONTEXT.md / ADRs inline as the
    terms crystallize. HONESTY RULE: never invent a target, a targetId, or a business rule. If the
    real meaning of a command is unknown, do NOT guess — make the stub print "contract: <name> —
    not yet specified" and record the gap as an OpenQuestion (do not fabricate behaviour).

(b) WRITE THE RED BDD MIRROR BEFORE CODE. Author a Godog .feature (journey/acceptance N0): one
    scenario per command, ≤ 5 total — Given the CLI is built, When I run "aidos <cmd>", Then it
    prints the <cmd> contract And exits 0. The mirror's source-of-truth conceptually lives in the
    mirrors Postgres schema and is materialized to tests/ for the runner. Run it and OBSERVE RED
    (no commands exist yet). That red IS the /goal. If a true determinism invariant emerges, add a
    rapid property (same args → byte-identical stdout, exit 0) — also red first.

(c) TDD RED → GREEN → REFACTOR, in back/cmd/aidos ONLY. Use /tdd. Outside-in. Pick the best
    current (May 2026) tool WITHIN the frozen Go slot — search AT MOST 3 options, compare, pick
    the SIMPLEST. cobra is the conventional CLI choice for this repo; if you genuinely weigh it
    against an alternative (e.g. urfave/cli, stdlib flag) and make a real choice, record an ADR in
    docs/adr/ (one decision, one file). If there is no real choice, do NOT write a ceremonial ADR.
    Each command prints a stable hand-written contract string and returns exit 0. Output must be
    deterministic: NO timestamps, NO Date.now()/new Date()/random, NO env-dependent ordering.

(d) KEEP SENSORS GREEN AT EACH DIFF. The PostToolUse sensors (gofmt/vet/lint, type-checks) stay
    green on every change. Self-certify on the COMPUTATIONAL only — never declare behaviour green
    from tests you wrote yourself.

(e) DIAGNOSE BEFORE FINISHING. Run /diagnose: isolate any failing sensor, reproduce, propose the
    fix. Do not finish a code step without it.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is required). Create front/web/app/cli/page.tsx
    at /cli — a read-only panel, one card per command showing the exact contract it prints. Do NOT
    touch existing routes. Write tests/e2e/cli.spec.ts (playwright-e2e skill): navigate to /cli,
    assert all five command names and one full contract block render. Rely on the webServer block
    in playwright.config.ts.

(g) IMPROVE-CODEBASE-ARCHITECTURE BEFORE THE NEXT STEP. Run /improve-codebase-architecture: look
    for deepening opportunities (shared contract-printing helper, command registry), guided by
    CONTEXT.md and docs/adr/. Apply only surgical, in-scope improvements.

(h) CREATE ARTIFACTS PER §5 — only the ones whose answer is YES this step: the Go package
    (back/cmd/aidos), its unit tests, the BDD mirror (tests/ + mirrors schema), the Next /cli
    route. Create NO migration (no persistence), NO MCP server (no backend capability), NO hook
    (no new non-bypassable rule) — those answers are NO for a print-only stub. If you think you
    need one, you are doing more than the step asks — stop and keep it a stub.

HONESTY / WALL RULES (non-negotiable): you have NO write grant to kernel/mirrors/fitness — never
write truth in passing. Never invent a target, targetId, or business rule; any uncertainty becomes
an OpenQuestion, not a fabricated behaviour. "Done" is COMPUTED, never declared by you: red set →
green ∧ prior green intact ∧ no monster ∧ deterministic output. You cannot force done. Anti-
overwrite: edit only this step's declared files; any change to a prior contract goes through a
ChangeSet + SemanticDiff.

DONE CRITERIA: all five commands print their contract and exit 0; output is deterministic; the
Godog mirror is green; go test ./back/cmd/aidos/... is green; prior green intact; /cli renders the
five contracts and its Playwright e2e passes.

END WITH THE REQUIRED STEP REPORT:
  - BDD added: the .feature/property files + the behaviours they pin.
  - Tests run: exact commands and pass/fail (go test, godog, vitest if any, playwright).
  - UI route: /cli — confirm it renders and the e2e covering it passes.
  - ChangeSet status: none / DRAFT / APPLIED (and whether any prior-contract change was needed).
  - Red-set status: was it observed red first, is it now green, any still-red.
  - Known limits: stubs only, which command meanings are OpenQuestions (not invented).
  - Next safe step: the smallest chainable next tooth that consumes this stable phase.
```
