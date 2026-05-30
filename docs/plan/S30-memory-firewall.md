# S30 — MemoryFirewall: Memory → ContextPack → Idea → Mirror → Goal → Kernel; block Memory → Kernel

Subsystem: AIDOS Archive | Home: `back/archive/brain/firewall` | Workbench route: `/memory-firewall`

## Objectif

Erect the **MemoryFirewall** in the `/brain` store: the gate that forbids any `MemoryItem` from reaching the kernel except through the mandatory one-way flow `Memory → ContextPack → Idea → Mirror → Goal → Kernel` (KRD §119.1). The done invariant: **a `MemoryItem → Kernel` attempt is blocked** — memory proposes, the kernel declares the true.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (Go package), **persistence** (Atlas migration for the `brain` schema), a **non-bypassable rule** (the MemoryFirewall Go hook), a **behaviour proof** (BDD mirror), and a **visualization** (Next route). It does **not** warrant a new MCP server or a new Skill (justified below).

- **Go package** `back/archive/brain/firewall/` — the `MemoryItem` record per KRD §119.1 (`content`, `provenance`, `validity_scope`, `expires_at`, `confidence`, `taint[] ∈ {unverified, stale, user_claim, incident_derived, external_source}`) — explicitly a **non-truth**, **branch-aware**, with **no `version`/freeze and no `mirror` field** (a memory is context fuel, never a truth — `back/archive/CONTEXT.md` _/brain_ entry). Plus the pure firewall functions enforcing the mandatory flow: `Propose(memoryItem) → ContextPackEntry` (a memory may be packed into context); the **gate** `ToKernel(memoryItem) → BlockReason` that **always** refuses the direct edge `Memory → Kernel`, returning the actionable `BlockReason` (`code: MEMORY_CANNOT_DECLARE_TRUTH`, `severity`, `explanation`, `how_to_fix[]` = "Memory → ContextPack → Idea → Mirror → Goal → Kernel"); and the **only legal path** `ViaIdea(memoryItem) → IdeaCandidate` that hands the memory's content to the **S27 idea-intake** door (`idea_capture` with `provenance` carried forward) — where it becomes a `draft` idea that must still acquire its mirror to ever reach the kernel. Pure functions only, no I/O; this step does **not** write the kernel, does **not** freeze, and does **not** itself author a mirror (the agent has no grant — promotion is the /goal flow, S27). It proves the *firewall and the one-way flow*, not the downstream kernel write.
- **Atlas migration** (`back/migrations/`) — declarative, expand-only: the `brain` schema, one content-addressed append-only table `brain.memory_item` (`id text PK` = hash of canonical JSONB body, reusing the **S01** content-hash scheme — do **not** fork it; `body jsonb NOT NULL` holding `content`/`provenance`/`validity_scope`/`expires_at`/`confidence`/`taint`, `branch text NOT NULL` — memory is branch-aware, `created_at timestamptz NOT NULL`). The table has **no `mirror` and no `version`/freeze column** — by construction a memory cannot carry the thing that would make it a truth. GRANTs: the agent DB role gets **INSERT/SELECT only** on `brain.*` (the `/brain` store is below the waterline — the agent reads and appends memory freely) but **no grant whatsoever on the `kernel`/`mirrors`/`fitness` schemas** (the wall, §2/S04, holds — this is exactly the asymmetry the firewall mirrors at the row level). The kernel write at the far end of the flow is the `aidos` CLI role via /goal, never this role.
- **Go hook** `back/hooks/posttooluse/` (or a dedicated `memory-firewall` binary under `back/hooks/`) — the **MemoryFirewall**: a non-bypassable rule that **refuses any write into the `kernel` schema whose provenance is a `MemoryItem`** (i.e. the `Memory → Kernel` edge), returning the `MEMORY_CANNOT_DECLARE_TRUTH` `BlockReason`. It is the runtime enforcement of KRD §119.1 ("aucun `MemoryItem` ne peut entrer dans `/kernel` sans passer par `Idea → Mirror → Goal → Kernel`"). It composes with — does not replace — the **S04** waterline wall and the **S27** promotion-gate: S04 blocks any agent write above the line, S27 blocks idea→kernel without a mirror, and S30 blocks the specific `memory→kernel` shortcut. Per §5 hook honesty it ships with a **fault-injection test**: forge a kernel write whose provenance is a `MemoryItem` and assert the gate goes red and blocks it with `MEMORY_CANNOT_DECLARE_TRUTH`; flip the provenance to a properly-mirrored idea (the S27 legal path) and assert it stays green.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **MemoryFirewall fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`): `state → command → events` over `capture-memory → propose-to-contextpack → via-idea (S27) → … ` plus the **`memory-to-kernel → Blocked`** done case. Plus a **property invariant** (rapid, `authority: below`) on the flow. These **are** the done criteria (see below).
- **Next route** `front/web/app/memory-firewall/` → `/memory-firewall` — the Workbench panel rendering the firewall: the mandatory flow as a pipeline, the `MemoryItem` cards (content/provenance/taint/confidence/expiry), the **legal path** `Memory → ContextPack → Idea → …`, and the **red blocked shortcut** `Memory → Kernel` (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new MCP server** — the memory store's read/append capability and the idea door already exist (the S27 `idea-intake` MCP receives the `ViaIdea` handoff; a memory store/reader MCP, if warranted, is the later ContextRouter step, not here). Record an OpenQuestion if a distinct memory-store capability emerges. **No Skill** — no new replayable gesture; the flow runs through the existing `/grill → /goal` gestures and the standard loop. **No ContextGraphDecision / Decision Reuse Test** (KRD §119.2) and **no ContextRouter / progressive `ContextPack` compilation** (§119.3) — those are later Archive/context steps; here a memory is merely *proposable* into a ContextPack entry, the compiler is not built. **No actual kernel write / freeze** — the /goal kernel mutation is the S27 flow via the `aidos` CLI role, a later wiring. **No codegen** — a memory is a candidate-fuel, not a frozen source; nothing to emit (no Go structs / DDL / TS types) from a `MemoryItem` body.

## Test minimal (done)

**Done = a `MemoryItem → Kernel` attempt is blocked.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **MemoryFirewall fixture** (`cert_language: fixture`, `authority: above`) — reflects `brain.memory_item`, as `state → command → events`:

  ```
  # mirrors schema · reflects: brain.memory_item "stale-discount-claim" · test_kind: fixture · authority: above
  mirror reflects "stale-discount-claim" {

    given no memory
      when capture_memory {
        content: "regulars always get 20% off",
        provenance: user_claim:"the support lead told me",
        validity_scope: "EU",
        expires_at: "2025-12-31",
        confidence: 0.4,
        taint: [ user_claim, stale ]
      }
        -> events: [ MemoryCaptured ]
        -> memory.version == null        # a memory has no freeze
        -> memory.mirror  == null        # a memory has no mirror — it is fuel, not truth

    # a memory MAY be proposed into a ContextPack (read side, allowed)
    given memory { id: "stale-discount-claim" }
      when propose_to_contextpack { goal: "order-discount" }
        -> events: [ ProposedToContextPack ]
        -> contextpack_entry.taint contains "stale"   # taint travels with it

    # THE done case — the direct Memory → Kernel edge is refused at the firewall
    given memory { id: "stale-discount-claim" }
      when to_kernel { }
        -> events: [ Blocked ]
        -> no kernel write occurs
        -> block_reason.code == "MEMORY_CANNOT_DECLARE_TRUTH"
        -> block_reason.how_to_fix contains "memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel"

    # the ONLY legal door — hand the memory to the S27 idea-intake; it becomes a draft idea
    given memory { id: "stale-discount-claim" }
      when via_idea { }
        -> events: [ HandedToIdeaIntake ]
        -> a draft Idea is captured (S27) with proposes/intent sketched and provenance == "memory:stale-discount-claim"
        -> the new idea.version == null and idea.mirror == null   # still a candidate; it must STILL acquire its mirror to ever reach the kernel
        -> NO kernel write occurs here (promotion is the /goal flow, S27)
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for **any** generated `MemoryItem` (any `content`/`provenance`/`validity_scope`/`expires_at`/`confidence`/any subset of `taint`), the direct edge `ToKernel(item)` **always** returns a `BlockReason{code: MEMORY_CANNOT_DECLARE_TRUTH}` and **never** a kernel write — the firewall holds for *every* memory, regardless of `confidence` (even `confidence == 1.0` and `taint == []` is still blocked: a clean, confident memory is **still not truth**); a `MemoryItem` **never** carries a `version`/freeze nor a `mirror` field (the type makes it unrepresentable); `ViaIdea(item)` yields an idea whose `provenance` points back to the memory's `id`, the idea is `draft` with no version and no mirror (it must still pass the S27 gate), and `ViaIdea` itself performs **no** kernel write; `Propose` (the ContextPack edge) carries the memory's `taint` forward (taint never silently drops); a memory's `id` equals the content hash of its canonical body (content-addressing, S01).

All start **red** (no `firewall` package, no `brain` schema, no `MemoryItem`/`Propose`/`ToKernel`/`ViaIdea`, no MemoryFirewall hook). That red **is** the `/goal`. The canonical done case is green only when the direct `Memory → Kernel` edge is `Blocked` with `MEMORY_CANNOT_DECLARE_TRUTH` (no kernel write) for **every** memory — clean or tainted, confident or not — while the same memory routed through `ViaIdea` becomes a `draft` idea (S27) that *still* needs its mirror to reach the kernel — i.e. **memory proposes; the kernel declares; the only door is `Memory → ContextPack → Idea → Mirror → Goal → Kernel`.**

## Visualisation UI

- **Workbench route:** `front/web/app/memory-firewall/page.tsx` (new route `/memory-firewall`; do **not** touch existing routes). It renders the firewall as a left-to-right **pipeline** — `Memory → ContextPack → Idea → Mirror → Goal → Kernel` — with the mandatory edges drawn green/open and the **direct `Memory → Kernel` shortcut drawn red and crossed out**. One card per `MemoryItem` shows `content`, `provenance`, `taint` badges, `confidence`, `validity_scope`, `expires_at`, and an explicit "not truth — no mirror, no freeze" marker. The attempted direct `Memory → Kernel` renders **red** with the `MEMORY_CANNOT_DECLARE_TRUTH` `BlockReason` (`code` + `how_to_fix` = the full flow). The `ViaIdea` path shows the memory becoming a `draft` idea (linking to `/ideas`, S27) with provenance back to the memory, and makes visible that the idea **still has no mirror** and so is **still** short of the kernel. Reads via the SELECT-grant role; renders the fixture, does not re-implement the firewall.
- **Playwright e2e:** `tests/e2e/memory-firewall.spec.ts` — navigate to `/memory-firewall`, assert a captured memory shows its `content`, `provenance`, `taint` badges and the "not truth" marker; assert the mandatory flow pipeline is visible with all six stages; assert that the direct `Memory → Kernel` shortcut renders **red** with `MEMORY_CANNOT_DECLARE_TRUTH` and a `how_to_fix` naming the full `Memory → ContextPack → Idea → Mirror → Goal → Kernel` flow, with **no kernel write**; assert the `ViaIdea` path shows the memory turning into a `draft` idea (provenance link, "still no mirror" marker) that does **not** by itself reach the kernel. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/archive/brain/firewall/**`, the new `back/migrations/<new>.sql`, the new MemoryFirewall hook under `back/hooks/**`, the `mirrors`-stored firewall fixture/property materialized to `tests/`, `tests/e2e/memory-firewall.spec.ts`, and `front/web/app/memory-firewall/**` — and otherwise **adds new files**. It introduces a new contract (the `MemoryItem` record shape, the `taint` enum, the mandatory-flow functions `Propose`/`ToKernel`/`ViaIdea`, and the `MEMORY_CANNOT_DECLARE_TRUTH` `BlockReason` code) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table; a `MemoryItem` is **kept** (append-only), never deleted. Any change to a **prior contract** it depends on — the S01 content-store substrate, the wall GRANT set (§2/S04), the `BlockReason` shape (S13/KRD §44.5), the S27 idea-intake door / `Idea` record / promotion-gate, or any prior Archive/Kernel attribute — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** on the affected schema (S21), never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance, §8). Note the boundary: the `/brain` store is *below* the waterline — the agent may read and append `brain.*` — yet a memory provably **cannot** declare truth; that asymmetry (writable fuel that can never become truth without the full flow) is the contract this step lands.

## Prompt a lancer

```text
You are step-executor for AIDOS step S30 — "MemoryFirewall: Memory → ContextPack → Idea → Mirror → Goal
→ Kernel; block Memory → Kernel". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed;
the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home =
back/archive/brain/firewall ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §119.1 (MemoryFirewall — "la mémoire propose, le noyau déclare le
vrai"; the MemoryItem record: content, provenance, validity_scope, expires_at, confidence, taint ∈
{unverified, stale, user_claim, incident_derived, external_source}; the MANDATORY flow "Memory →
ContextPack → Idea → Mirror → Goal → Kernel"; the rule "Aucun MemoryItem ne peut entrer dans /kernel sans
passer par Idea → Mirror → Goal → Kernel"), §119.2 (ContextGraphDecision — OUT OF SCOPE here, later step),
§119.3 (ContextRouter / ContextPack compilation — OUT OF SCOPE here, later step), and LIVRE XXIV (§136+:
the six KRD memories — working/episodic/semantic/procedural/structural/evolutionary; /brain is readable,
indexable, branch-aware, but NON-décisoire — an item of /brain can only fail a run if it is promoted to a
mirror or sensor; "incident → idée → miroir"; §44.5 BlockReason: code, severity, explanation, how_to_fix[]
— "tout refus doit être actionnable"). Read CONTEXT-MAP.md + back/archive/CONTEXT.md (l'archive, the /brain
store = the six KRD memories store-side at back/archive/brain/ — context fuel NEVER truth; MemoryFirewall =
"the gate that prevents memory from ever posing as truth … Memory proposes; the kernel declares"; the
_Avoid_ list: NOT access control / ACL / sanitizer / validation layer / RAG store / knowledge base) and
the prior steps you REUSE: S01 (the content-addressed append-only content store — reuse its content-hash
scheme for the memory_item row, do not fork it), S04 (the wall — the agent has no kernel/mirrors/fitness
grant; the /brain store is BELOW the waterline so you ADD a brain-schema read/append grant, you do not
weaken the wall), S13 (the BlockReason shape), S27 (the Ideas lifecycle + idea-intake MCP + promotion-gate
— the ONLY door to the kernel; the ViaIdea handoff feeds idea_capture, and that idea STILL needs its mirror
via /goal). For any Next.js 16, Atlas, Go MCP SDK, or rapid API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/archive/CONTEXT.md: a "MemoryItem" is CONTEXT FUEL stored in the
    /brain store (back/archive/brain/) — branch-aware, indexable, NON-décisoire — with content +
    provenance + validity_scope + expires_at + confidence + taint, and NO version-freeze and NO mirror;
    that absence is EXACTLY what makes it memory and not truth. "MemoryFirewall" is the gate enforcing the
    MANDATORY one-way flow Memory → ContextPack → Idea → Mirror → Goal → Kernel; the direct edge
    Memory → Kernel is ALWAYS blocked. "Memory proposes; the kernel declares." Do NOT use "ACL", "access
    control", "sanitizer", "validation layer", "RAG store", or "knowledge base" as synonyms for the
    firewall or the store (CONTEXT.md _Avoid_ lists). Resolve every branch before coding — especially: a
    memory is blocked from the kernel REGARDLESS of confidence or taint (even a clean, fully-confident
    memory is not truth); the only legal door is ViaIdea → the S27 idea-intake, where it becomes a DRAFT
    idea that STILL needs its mirror; this step does NOT write the kernel, does NOT freeze, and does NOT
    author a mirror. If a term shifts, update back/archive/CONTEXT.md / write an ADR inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - MemoryFirewall fixture (cert_language: fixture, authority: above), reflecting brain.memory_item
        "stale-discount-claim", as state→command→events. Rows: capture_memory (taint [user_claim, stale],
        confidence 0.4) -> MemoryCaptured, version==null, mirror==null ; propose_to_contextpack ->
        ProposedToContextPack, taint travels with it ; to_kernel -> Blocked, NO kernel write,
        block_reason.code==MEMORY_CANNOT_DECLARE_TRUTH, how_to_fix contains the full flow
        memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel (THE done case) ; via_idea ->
        HandedToIdeaIntake, a DRAFT Idea (S27) captured with provenance=="memory:stale-discount-claim",
        idea.version==null and idea.mirror==null (it STILL needs its mirror), NO kernel write here.
      - property invariant (rapid, authority: below): for ANY generated MemoryItem, ToKernel ALWAYS
        returns BlockReason{code: MEMORY_CANNOT_DECLARE_TRUTH} and NEVER a kernel write — independent of
        confidence and taint (a clean, confident, untainted memory is STILL blocked); a MemoryItem never
        carries a version/freeze nor a mirror field (unrepresentable in the type); ViaIdea yields a draft
        idea whose provenance points back to the memory id, with no version and no mirror, and performs no
        kernel write; Propose carries taint forward (taint never silently drops); id == content hash of the
        canonical body (S01 content-addressing).
    Run them; watch them go RED (no firewall package, no brain schema, no MemoryItem/Propose/ToKernel/
    ViaIdea, no MemoryFirewall hook). That red IS the /goal. Do NOT write a truth-test you would then
    satisfy — mirror the human intention only.

(c) TDD red→green→refactor, in back/archive/brain/firewall ONLY (plus the back/migrations/ schema file and
    the back/hooks/ MemoryFirewall binary). Outside-in. REUSE the S01 content-hash content-store substrate
    for the memory_item row shape and the append-only guarantee — do NOT fork it. Feed the ViaIdea handoff
    into the EXISTING S27 idea-intake (idea_capture); do NOT re-implement the idea lifecycle or the
    promotion-gate here. If a real tool choice arises WITHIN a frozen slot, search AT MOST 3 current (May
    2026) options, pick the SIMPLEST, never touch the mandatory minimum (Godog, rapid, the fixture
    interpreter, Atlas, sqlc/pgx, the Go MCP SDK, Go hook binaries are FIXED). The likely genuine choices:
    the canonical-JSONB shape of the MemoryItem body (content/provenance/validity_scope/expires_at/
    confidence/taint, reusing S01's content-hash scheme); the taint enum representation; and how the
    MemoryFirewall hook detects "this kernel write's provenance is a MemoryItem" (keep it minimal — an
    injected provenance-is-memory predicate, do NOT reach into the kernel/mirrors schemas). Record a short
    ADR (docs/adr/) ONLY if a genuine choice is made (e.g. the taint enum shape, or the MemoryItem type
    making version/mirror unrepresentable). The migration is expand-only/append-only; GRANT the agent role
    INSERT/SELECT on brain.* (the /brain store is below the waterline) and NO grant on
    kernel/mirrors/fitness (the wall, §2/S04); the kernel write at the far end of the flow is the aidos CLI
    role via /goal. Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new fixture + property + the hook's fault-injection test.
    Self-certify on the COMPUTATIONAL only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce capture_memory /
    propose_to_contextpack / via_idea AND the blocked to_kernel edge (for a tainted memory AND a clean,
    fully-confident memory — both blocked), state the cause, propose. Check completeness: the firewall
    layer has its living mirror and each required test_kind is present (KRD §33); no monster (no flow edge
    without a fixture row; the MemoryFirewall is the single point that enforces "no memory → kernel
    shortcut") — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/memory-firewall/ →
    /memory-firewall: the mandatory flow as a left-to-right pipeline (Memory → ContextPack → Idea → Mirror
    → Goal → Kernel) with the direct Memory → Kernel shortcut drawn RED and crossed out; one card per
    MemoryItem with content / provenance / taint badges / confidence / validity_scope / expires_at and a
    "not truth — no mirror, no freeze" marker; the attempted direct Memory → Kernel renders RED with
    MEMORY_CANNOT_DECLARE_TRUTH (code + how_to_fix = the full flow) and NO kernel write; the ViaIdea path
    shows the memory becoming a DRAFT idea (link to /ideas, S27, provenance back to the memory, "still no
    mirror" marker) that does NOT by itself reach the kernel. Read via the SELECT-grant role; render the
    fixture, do not re-implement the firewall. Do NOT touch existing routes. Add
    tests/e2e/memory-firewall.spec.ts (use the playwright-e2e skill) asserting the memory card with taint
    and the "not truth" marker, the six-stage pipeline, the red MEMORY_CANNOT_DECLARE_TRUTH shortcut with
    no kernel write, and the ViaIdea → draft idea path with its "still no mirror" marker.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    firewall is a deep, well-named module under back/archive/brain/; that MemoryItem/Propose/ToKernel/
    ViaIdea are pure and depend on the S01 content-store substrate without duplicating it; that the
    MemoryItem type makes version/mirror unrepresentable; that the migration/GRANTs keep the wall intact
    (brain.* read/append below the waterline, kernel/mirrors/fitness NOT); that the MemoryFirewall hook
    owns exactly one concern and COMPOSES with the S04 wall and the S27 promotion-gate rather than
    duplicating them; that the ViaIdea handoff uses the existing S27 idea-intake, not a fork; boundaries
    match back/archive/CONTEXT.md (the /brain store is fuel below the waterline; the kernel write is the
    /goal flow, a later wiring). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the MemoryFirewall hook (non-bypassable rule — with its fault-injection test,
    §5 hook honesty), the firewall fixture + property (behaviour proof), and the Next route
    (visualization). Do NOT add a new MCP server (the S27 idea-intake receives the ViaIdea handoff; a
    memory-store/reader MCP belongs to the later ContextRouter step — OpenQuestion if one emerges), no Skill
    (no new replayable gesture; the flow runs through existing /grill → /goal gestures), no
    ContextGraphDecision / Decision Reuse Test (§119.2, later), no ContextRouter / ContextPack compilation
    (§119.3, later), no kernel write / freeze (the /goal kernel mutation is the S27 flow), and no codegen
    (a memory is candidate-fuel, nothing to emit). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If a BlockReason code, the exact MemoryItem JSONB
  shape, the provenance format, the taint enum, or the MemoryFirewall predicate is not pinned by KRD §119.1
  / LIVRE XXIV / §44.5 / an existing migration / ADR / CONTEXT.md, do NOT guess — record an OpenQuestion
  (provenance) and STOP on that branch. In particular, do NOT invent a taint value beyond {unverified,
  stale, user_claim, incident_derived, external_source}, do NOT give a MemoryItem a version or a mirror
  field (it has neither by definition), do NOT add a "trusted-memory" bypass (every memory is blocked
  regardless of confidence/taint), and do NOT reach into the kernel/mirrors schemas — the firewall uses an
  injected provenance-is-memory predicate.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The firewall
  fixture is a means-test toward the human red, not a new truth; the mirror that a routed idea must acquire
  is the HUMAN's /goal (S27), not one you author to pass the gate.
- Any change to a prior contract (S01 content store, the wall GRANTs §2/S04, the BlockReason shape S13, the
  S27 idea-intake / Idea record / promotion-gate, the /goal flow) goes through a ChangeSet + SemanticDiff
  (S20/S21). Add new files; never silently rewrite a prior artifact, never hand-edit back/gen/**. A
  MemoryItem is kept (append-only), never deleted.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the firewall fixture passes — capture_memory yields a MemoryItem with
version==null and mirror==null; propose_to_contextpack carries the taint forward; to_kernel of ANY memory
is Blocked with MEMORY_CANNOT_DECLARE_TRUTH (how_to_fix names the full Memory → ContextPack → Idea → Mirror
→ Goal → Kernel flow) and NO kernel write occurs (THE done criterion: a MemoryItem → Kernel attempt is
blocked); via_idea hands the memory to the S27 idea-intake as a DRAFT idea whose provenance points back to
the memory and which STILL has no mirror (so still short of the kernel); the rapid invariant holds (ToKernel
always blocks regardless of confidence/taint, no version/mirror field, ViaIdea performs no kernel write,
taint never drops, id == content hash); the MemoryFirewall fault-injection test goes red when a
memory-provenance kernel write is forged and green when the provenance is a properly-mirrored idea;
/memory-firewall renders the pipeline with the red blocked shortcut and a passing Playwright e2e; GRANTs
prove brain.* readable/appendable below the waterline while kernel/mirrors/fitness stay unwritable by the
agent; the migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (MemoryFirewall fixture, rapid property), where stored (mirrors schema) and
  materialized (tests/); the MemoryFirewall fault-injection test.
- Tests run: command + pass/fail counts (fixture, rapid/go test, hook fault-injection, biome, eslint,
  playwright).
- UI route: /memory-firewall — what it renders (six-stage pipeline, MemoryItem cards with taint/confidence,
  red blocked Memory → Kernel shortcut, ViaIdea → draft idea path), e2e file + result.
- ChangeSet status: any prior-contract change (S01 content store, wall GRANTs, BlockReason, S27 idea-intake/
  Idea/promotion-gate, /goal flow) → ChangeSet + SemanticDiff (note the change_type), else "none". Idea/
  kernel writes go through the S27 flow / the aidos CLI role via /goal, never the agent.
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no ContextRouter / ContextPack compilation (§119.3) yet, no ContextGraphDecision /
  Decision Reuse Test (§119.2) yet, no actual kernel write/freeze (the /goal mutation) wired, MemoryFirewall
  predicate is injected provenance-is-memory (not reading the kernel schema), taint values supported,
  BlockReason codes supported.
- Next safe step: the smallest stable next tooth (e.g. the ContextRouter that compiles a bounded,
  goal-aware ContextPack from /brain — §119.3 — or the ContextGraphDecision / Decision Reuse Test of
  §119.2) and why it is safe to chain.
```
