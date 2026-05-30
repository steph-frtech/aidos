# S14 — TruthKind + VerifiabilityLevel; non-verifiable truths routed to /spike

Subsystem: AIDOS Kernel | Home: `back/kernel/truthtyping` | Workbench route: `/truth-typing`

## Objectif

Give every Truth an **epistemic type** (`TruthKind`) and a **verification mode** (`VerifiabilityLevel`) before the ratchet is allowed to bite: a truth with no `TruthKind` is **rejected**, and a truth whose `VerifiabilityLevel` is not certifiable (`unverifiable`, or any level whose `allowed_mode` is not `kernel`) is **routed to `/spike`** instead of entering the kernel. This is the typing-the-true layer of KRD §13.4–13.5 made mechanical — pure classification logic + the schema fields that carry it, proven by a Godog acceptance mirror.

## Sortie attendue

Per CLAUDE.md §5, this step needs **pure logic**, a **persistence field change**, a **behaviour proof** (BDD mirror), and a **visualization** — so exactly these artifacts, and no more:

- **Go package** (`back/kernel/truthtyping/`) — the pure classifier. It exposes the `TruthKind` enum exactly as KRD §13.4 (`behavioral`, `structural`, `experiential`, `economic`, `regulatory`, `statistical`, `exploratory`) and the `VerifiabilityLevel` enum exactly as KRD §13.5 (`deterministic`, `statistical`, `delayed`, `human_judged`, `unverifiable`) with its `allowed_mode` set (`kernel`, `experiment`, `spike`, `manual_review`). It provides `Classify(t Truth) (Routing, error)` over a Truth value read from the `kernel` record: it **rejects** (typed error) a truth with an absent/empty `TruthKind`; it computes whether the truth may enter the kernel or must be **routed to `/spike`** based on its `VerifiabilityLevel`'s `allowed_mode`. Pure: no DB, no clock, no I/O — it reads a Truth value handed to it and returns a `Routing` verdict (`zone: kernel | spike | experiment | manual_review`, plus the `BlockReason` when rejected). Read-only against truth; writes nothing (the wall). Below the waterline (`authority: below`, computational) — the typing rule itself is the human's, this step only enforces it.
- **Postgres migration (Atlas, append-only, expand phase)** — `back/migrations/` — adds two nullable columns to the `kernel` Truth record: `truth_kind text` and `verifiability_level text`, each with a `CHECK` constraint pinning the value to the exact KRD §13.4 / §13.5 enum member set (so an out-of-enum value is a DB-level error, not a silent string). **Expand-contract, additive**: the columns are added nullable so existing rows are untouched; no backfill, no `NOT NULL` flip this step (that contract tightening is a later changeset once every live truth is typed). The agent role gets **no** `GRANT INSERT/UPDATE/DELETE` on the `kernel` schema — only the `aidos` CLI writes truth through an approved changeset (the wall); this migration is authored here but applied by the migration role.
- **BDD mirror — Gherkin/Godog (N0, acceptance)** — the `truth-typing` feature, conceptually stored in the `mirrors` schema (`reflects: kernel.truthtyping`, `test_kind: acceptance`, `cert_language: gherkin`, `authority: above`) and materialized to disk for **Godog** (the frozen N0 back slot). It proves the two done criteria: a truth without a `TruthKind` is rejected; a non-verifiable truth is routed to `/spike`.
- **Next route** (`front/web/app/truth-typing/page.tsx`) — the `/truth-typing` Workbench panel visualizing each truth's `(TruthKind, VerifiabilityLevel)` and the resulting routing verdict (kernel-admitted, rejected, or spike-bound).

> Explicitly **out of scope** (do not create): no MCP server (no new read/write *capability* over the base — the `store` MCP is its own step; classification is pure, it exposes no backend op); no hook (the wall hook from S04 already blocks truth writes — this step adds no new non-bypassable rule, and the `/spike` routing is a verdict the human acts on, not a tool-call gate); no `ExperienceClaim`/`TruthScope`/`AuthorityGraph` fields (KRD §13.6–13.8 are their own later steps — `kernel/scope`, `kernel/authority`, `kernel/experience` per the §4 map); no `NOT NULL` flip / backfill; no sqlc query, no codegen, no Pact. Do **not** invent extra `TruthKind` or `VerifiabilityLevel` members beyond the KRD-listed seven and five.

## Test minimal (done)

**Done = a truth without a kind is rejected; a non-verifiable truth is routed to `/spike`.** Restated failing-first, as the Gherkin mirror to write **before** any classifier code, conceptually stored in the `mirrors` schema (`reflects: kernel.truthtyping · test_kind: acceptance · cert_language: gherkin · authority: above`) and materialized for the Godog runner. It must be **RED** on first run (no `back/kernel/truthtyping` package, no `Classify`, no `truth_kind`/`verifiability_level` columns):

```gherkin
# mirrors schema · reflects: kernel.truthtyping · test_kind: acceptance · cert_language: gherkin · authority: above
Feature: Type the true before the ratchet bites
  A truth must declare its epistemic kind and its verification mode;
  the ratchet only bites what is certifiable, the rest goes to /spike.

  Scenario: a truth without a TruthKind is rejected
    Given a candidate truth with no truth_kind set
    When it is classified
    Then it is rejected
    And the BlockReason code is "missing-truth-kind"
    And it is not admitted to the kernel

  Scenario: a non-verifiable truth is routed to /spike
    Given a candidate truth with truth_kind "experiential"
    And verifiability_level "unverifiable"
    When it is classified
    Then it is routed to zone "/spike"
    And it is not admitted to the kernel

  Scenario: a deterministic behavioral truth is admitted to the kernel
    Given a candidate truth with truth_kind "behavioral"
    And verifiability_level "deterministic"
    When it is classified
    Then it is admitted to zone "kernel"

  Scenario: an out-of-enum truth_kind is rejected at the boundary
    Given a candidate truth with truth_kind "vibes"
    When it is classified
    Then it is rejected
    And the BlockReason code is "unknown-truth-kind"
```

Supporting (same slot, no new tool) — a **property** mirror only if a real ∀ emerges (e.g. "no truth whose `allowed_mode` excludes `kernel` is ever admitted to the kernel"); write it as **rapid** (the frozen N1 back slot) **only** if the human intention in KRD §13.5 genuinely states that invariant — do not invent an invariant to then satisfy (CLAUDE.md §8). The two done scenarios start red; that red **is** the `/goal`. Do **not** write Godog for what is an invariant, nor rapid for what is a journey — match the truth form.

## Visualisation UI

- **Workbench route:** `front/web/app/truth-typing/page.tsx` (new route `/truth-typing`; do not touch existing routes). It renders, read-only, a **truth-typing table**: one row per candidate truth showing its `truth_kind` chip (one of the seven KRD kinds, color-coded), its `verifiability_level` chip (one of the five), and a **routing badge** — green `KERNEL` (admitted), amber `/SPIKE` (non-verifiable, routed to spike), or red `REJECTED` (no kind / unknown kind, with the `BlockReason` code). It consumes the classifier's `Routing` verdict; it never writes truth. Plain React state (no XState unless local panel state genuinely needs it — do not pull it in speculatively).
- **Playwright e2e:** `tests/e2e/truth-typing.spec.ts` — navigate to `/truth-typing`, assert a row for an untyped truth shows the red `REJECTED` badge with reason `missing-truth-kind`, assert a row with `experiential` + `unverifiable` shows the amber `/SPIKE` badge, and assert a `behavioral` + `deterministic` row shows the green `KERNEL` badge. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill (role/text selectors, ordered assertions, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** (`back/kernel/truthtyping/*.go`, the new Atlas migration file under `back/migrations/`, `front/web/app/truth-typing/*`, `tests/e2e/truth-typing.spec.ts`, the new `truth-typing` Gherkin source) and otherwise **adds new files**. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/`), no silent model replacement. The migration is **additive expand-only** — it appends two nullable columns to the `kernel` Truth record; it does **not** alter, drop, or `NOT NULL`-flip an existing column, and it does not touch the S02 Truth record shape beyond these additions. It **reads** the Truth record contract frozen at S02 and the `BlockReason` shape frozen at S04 (the wall) — it does **not** change them. Should a real need arise to change a prior contract (the Truth record shape, the `BlockReason` fields, the meaning of `authority: above|below`, an existing migration, or tightening the new columns to `NOT NULL`), that change goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, cannot reach `APPLIED` while a monster exists) carrying a **SemanticDiff** (`change_type`, `blast_radius`, `requires_authority`, `red_wave`) on the affected Kernel/Mirror record — never an in-place edit, never a passing tweak.

## Prompt a lancer

```text
You are step-executor for AIDOS step S14 — "TruthKind + VerifiabilityLevel; non-verifiable routed to
/spike". Home = back/kernel/truthtyping ONLY (plus the new Atlas migration, the /truth-typing Workbench
route, and its Playwright e2e). Follow CLAUDE.md §6 in order. Read KRD.md §13.4 (TruthKind — the seven
epistemic types: behavioral/structural/experiential/economic/regulatory/statistical/exploratory; the law
"every truth has an epistemic type and its mirror must be the same type"), §13.5 (VerifiabilityLevel —
deterministic/statistical/delayed/human_judged/unverifiable + allowed_mode kernel/experiment/spike/
manual_review; the rule "if the signal is not verifiable, KRD does not certify — it routes to /spike,
experiment, or human review"), §13.4's surrounding §13.3 ("if an artifact cannot fail a run, it does not
exist"), and CONTEXT-MAP.md + back/kernel/CONTEXT.md before touching anything. Do not start without
grilling.

(a) GRILL-WITH-DOCS the intention FIRST. One intention, <=5 scenarios. Pin the ubiquitous language:
    what a TruthKind is (the EPISTEMIC type of a truth, not its test_kind — distinguish the two; a
    truth's mirror must match its TruthKind) vs a VerifiabilityLevel (CAN the ratchet bite this signal
    at all); what "routed to /spike" means (the truth does NOT enter the kernel — the ratchet stays
    OFF, it goes to the exploration zone for /harvest later, it is NOT a failure); what "rejected"
    means (no/unknown TruthKind — it cannot even be considered); what allowed_mode gates admission to
    the kernel. Sharpen these against back/kernel/CONTEXT.md; update CONTEXT.md / an ADR inline if a
    term shifts. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST — a Gherkin feature, conceptually stored in the `mirrors` schema
    (reflects: kernel.truthtyping, test_kind: acceptance, cert_language: gherkin, authority: above) and
    materialized to disk for GODOG (the frozen N0 back slot, §3):
      - a truth with no truth_kind is REJECTED (BlockReason code "missing-truth-kind"), not admitted;
      - a truth truth_kind "experiential" + verifiability_level "unverifiable" is ROUTED to zone
        "/spike", not admitted;
      - a truth_kind "behavioral" + verifiability_level "deterministic" is ADMITTED to zone "kernel";
      - an out-of-enum truth_kind ("vibes") is REJECTED ("unknown-truth-kind").
    Run them; watch them go RED (no package, no Classify, no truth_kind/verifiability_level columns).
    That red IS the goal. Use GHERKIN/GODOG only — NOT rapid (that is the ∀ slot), NOT a fixture (that
    is the workflow slot). Only add a rapid property mirror IF a genuine ∀ from KRD §13.5 emerges (e.g.
    "no truth whose allowed_mode excludes kernel is ever admitted"); do NOT invent a truth-test you
    would then satisfy (CLAUDE.md §8).

(c) TDD red->green->refactor in back/kernel/truthtyping ONLY. Outside-in. Build the pure classifier:
    the TruthKind enum (exactly the seven §13.4 members), the VerifiabilityLevel enum (exactly the five
    §13.5 members) + its allowed_mode set, and Classify(t Truth) (Routing, error) that REJECTS an
    absent/unknown truth_kind (returning a BlockReason) and routes by the level's allowed_mode (kernel
    => admitted; anything excluding kernel => zone "/spike"/experiment/manual_review). Pure: no DB, no
    clock, no I/O — it reads a Truth value, returns a verdict. FROZEN slot (§3): back is Go, the
    acceptance proof is Godog, migrations are Atlas on Postgres — these ARE the mandatory choices, do
    not substitute. If a REAL minor tool choice arises WITHIN a slot (e.g. how to model the enum + its
    allowed_mode lookup in Go — typed string consts vs a small table; how Atlas expresses the CHECK
    constraint pinning the enum), search at most 3 current (May 2026) options, pick the SIMPLEST, and
    record an ADR (docs/adr/) ONLY if a genuine choice was made.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt/go vet, go test (incl. the new Godog feature),
    atlas migrate lint / a dry-run of the migration against a Testcontainers Postgres, biome check at
    root, eslint in front/web. Self-certify on the COMPUTATIONAL only; never declare the behaviour green
    from tests you authored.

(e) DIAGNOSE before finishing (/diagnose): isolate any failing sensor, state the cause, propose. Do
    not finish a code step without it. Check completeness: the truthtyping layer has its living Gherkin
    mirror, no monster (no truthtyping truth without a mirror, no orphan mirror) — else Stop blocks.

(f) ADD THE WORKBENCH ROUTE (a UI is REQUIRED): front/web/app/truth-typing/page.tsx at /truth-typing —
    render a truth-typing table, one row per candidate truth with its truth_kind chip (one of the seven),
    its verifiability_level chip (one of the five), and a routing badge: green KERNEL (admitted), amber
    /SPIKE (non-verifiable), red REJECTED (no/unknown kind, with the BlockReason code). Read-only;
    consumes the classifier verdict; plain React state unless local state truly needs XState. Do NOT
    touch existing routes. Add Playwright e2e tests/e2e/truth-typing.spec.ts asserting the REJECTED
    (missing-truth-kind), /SPIKE (experiential+unverifiable), and KERNEL (behavioral+deterministic)
    badges, per the playwright-e2e skill.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step (/improve-codebase-architecture): check the
    classifier is deep and pure (no I/O leak), the enum + allowed_mode are data (not scattered
    switches), the Routing/BlockReason seams are clean, and the migration is genuinely additive/expand.
    Do not advance without it.

(h) CREATE ARTIFACTS per §5 and ONLY those that apply: the Go package (pure logic), the Atlas migration
    (persistence — two nullable enum-checked columns on the kernel Truth record, expand-only), the
    Gherkin mirror (behaviour proof), and the Next route (visualization). Do NOT add an MCP server, a
    hook (S04's wall already blocks truth writes), the ExperienceClaim/TruthScope/AuthorityGraph fields
    (§13.6–13.8 are later steps), a NOT NULL flip/backfill, sqlc, or Pact — no new capability/rule/
    persistence beyond these is justified at S14.

HONESTY RULES (anti-hallucination, mandatory): never invent a target, a targetId, or a business-rule.
The TruthKind members are EXACTLY the seven of KRD §13.4 and the VerifiabilityLevel members EXACTLY the
five of §13.5 with the four allowed_mode values — do not add, rename, or drop any. If which allowed_mode
a given level carries, whether a level routes to /spike vs experiment vs manual_review, or the exact
BlockReason codes are uncertain, do NOT guess — raise it as an OpenQuestion (provenance) and stop on
that branch. Surface assumptions; present multiple readings rather than silently picking one (CLAUDE.md
working guidelines 1).

DONE is COMPUTED, never declared (CLAUDE.md §8): red set -> green AND prior green intact AND mutation
score >= threshold AND no monster. Concretely: a truth with no truth_kind goes red→green to REJECTED
(missing-truth-kind); an experiential+unverifiable truth is ROUTED to /spike; a behavioral+deterministic
truth is ADMITTED to kernel; an unknown truth_kind is REJECTED; the migration adds the two enum-checked
nullable columns additively; the /truth-typing route shows the three badges and its Playwright e2e is
green; the package is pure; no truth was written by the agent. You cannot force done.

END WITH THE STEP REPORT:
  - BDD added: the Gherkin mirror (truth-typing feature, its scenarios), where stored (mirrors schema,
    test_kind acceptance / cert_language gherkin / authority above) and materialized for Godog.
  - Tests run: command + pass/fail counts (go test incl. Godog, atlas migrate lint/dry-run, biome,
    eslint, playwright).
  - UI route: /truth-typing — what it renders (typed table + routing badges) , e2e file + result.
  - ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent;
    the migration is authored here but applied by the migration role — note its state).
  - Red-set status: which scenarios went red then green; any still red.
  - Known limits: columns added nullable (no NOT NULL flip / backfill yet), no ExperienceClaim/TruthScope/
    AuthorityGraph, no MCP, no hook, no sqlc/Pact, single classifier (no real harvest of spike-routed
    truths back into the kernel).
  - Next safe step: the smallest stable next tooth (e.g. TruthScope fields on the Truth record, or the
    /harvest path that lifts a spike-routed exploratory truth into a kernel candidate) and why it is
    safe to chain.
```
