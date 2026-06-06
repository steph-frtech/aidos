---
name: ce04-behavior-expansion
description: CE04 behavior-macro EXPANSION (§24.6) — pure dry-run Expand(Attachment)→Expansion, deterministic+idempotent+WroteKernel always false; verified-green
metadata:
  type: project
---

CE04 builds the §24.6 behavior-macro EXPANSION: a behavior (ownable/soft-deletable/auditable) attached to an entity expands (PURE, TOTAL, DRY-RUN, IDEMPOTENT) into attributes/relations/operations/policies/fixtures it implies — the §24.6 "ne réécris pas le boilerplate owner-scoping pour la 50ᵉ fois".

**The done-criterion = a RED-first rapid property mirror** pinning exactly: DETERMINISM (same Attachment → byte-identical Expansion + stable ExpansionID), IDEMPOTENCE (re-attach to already-expanded shape → PieceCount 0), THE WALL (WroteKernel always false). The property test references `behavior.Expand`/`Attachment` which only this step created ⇒ red-first is structurally guaranteed (didn't compile before).

**Key facts checked:**
- `back/kernel/behavior/behavior.go`: catalogue inline in a `catalogueExpansion map[Kind]Expansion` (the report called it `catalog.go` — cosmetic doc inaccuracy, file doesn't exist; not a gap). ExpansionID = records.Hash(records.Canonicalize(body)) reuses S02.
- Wall holds STRUCTURALLY: behavior pkg imports only `records` + stdlib (encoding/json, errors, fmt, sort). NO pgx/database/sql/changeset/migrations import — no write path exists. WroteKernel=false pinned by property test.
- ownable on Order = 6 pieces (1 attr owner_id + 1 rel owner→User + 1 op transferOwnership + 1 policy owner-scoping + 2 fixtures); e2e asserts data-count=6 then 0 after idempotent re-run.
- TS twin lib/compound.ts `expand()` + CATALOGUE mirrors Go verbatim; 20 vitest pass (3 new CE04 incl. fast-check repro+idempotence). NB compound.ts now carries 4 steps' twins (CE01 decide / CE02 boundary / CE03 compound / CE04 expand) — one growing file.
- Action-capable ExpansionPanel on /compound (behavior+entity selectors, EXPANSER + EXPANSER À NOUVEAU idempotent). ui-completeness on action-path (executes from screen); write-path vacuous (dry-run, no truth).
- i18n: compound.expansion.* (15 keys) + expansionHeading/expansionIntro present in BOTH fr+en — cross-checked.

**Sensors all clean (NO scar this step):** gofmt clean, vet clean, go test kernel/... all pass, tsc --noEmit clean for CE04, biome clean (5 files), vitest 20/20, e2e 4/4 on :3000 (server was on 3000 not 3100), mint validate success, docs fae58ab local HEAD == origin/main (pushed, in sync, 3 layers in internals).

Linear: linear-server MCP unauthenticated (OAuth pending) → OpenQuestion, not a residual issue.
Forward-dep OQ (non-blocking): freezing the expanded source into the real kernel (attributes as entity source, policies as policy AST) goes via idée→miroir→/goal — CE04 deliberately stops at the dry-run VALUE (the wall).

verified-green.
