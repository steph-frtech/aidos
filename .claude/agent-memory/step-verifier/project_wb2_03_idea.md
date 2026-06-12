---
name: wb2-03-idea
description: §WB2-03 V2 idea-capture wizard (XState) + pure twin; verified-green after 2 corrections (tsc cast + prototype-pollution flake in WB2-00 glossary)
metadata:
  type: project
---

§WB2-03 (after WB2-02, spec WB2_PLAN.md) — /v2/idee = the ENTRY rung: capture a BESOIN (intent + coordinate niveau×facette×échelle + provenance) → an IDÉE (candidat-vérité §115, hasMirror=false/wroteKernel=false, content-addressed FNV-1a id).

TWIN lib/v2/idea.ts PURE: composeIdea/validateBesoin/ideaHash, closed sets PROVENANCES(humain/incident)/FRACTAL_SCALES(cellule/kernel/feuille)/FACET_LETTERS(reused from lib/facets FKE-1.3), expectedMirrorForm REUSES levelMirrorForm (besoin-completeness EL10) — NOT a fork. Levels reused from besoin-grammar (allLevels/isLevel/SOURCE_ORDER). Deterministic, no LLM/clock/rng/IO.

XState app/v2/idee/IdeaWizardMachine.ts: 5 visible states intention→coordonnee→provenance→revue→proposee; transitions PATCH/SUIVANT/PRECEDENT/PROPOSER/RECOMMENCER; guard besoinValide + action compose DELEGATE to twin (machine judges nothing). Client IdeaWizardClient.tsx useMachine + shadcn stepper, themed+bilingue FR-default (i18n v2Idee 40 keys fr==en==40, all required keys present). page.tsx Server Component: static /v2/idee primes over /v2/[slug], KEEPS v2-concept-title/def from glossary entry("idee") to preserve WB2-02 nav contract (anti-overwrite §9).

DONE-CRIT MET: twin pur+property (vitest 10) + machine fixtures (8) = 18 GREEN; e2e tests/e2e/v2-idee.spec.ts 4 (executor-run): full wizard→idée amber (hash /^[0-9a-f]{8}$/, mirror-form, hasMirror/wroteKernel false) WITH anti-write guard (writes[]===[] no POST/PUT/PATCH/DELETE) + PRECEDENT recule + RECOMMENCER reset (entity→property_n1 verified) + coexistence /v2/idee 200∧/ 200. Contract values verified vs EL10 source: operation→fixture_n2, entity→property_n1. WALL clean (no fetch/POST/axios; "kernel" hits = FractalScale enum only).

VERIFIED-GREEN AFTER 2 CORRECTIONS:
1. tsc: idea.test.ts:184-185 ideaHash(coord,b.provenance) — b.level/scale/provenance widened to string from Besoin type, Coordinate wants Level/FractalScale → 2 TS2345. FIXED: derive coord+provenance from composeIdea(b).idea (already narrowed) instead of raw b. tsc 0 after.
2. PRIOR-GREEN FLAKE (WB2-00 glossary.test.ts): property "term/def totaux: slug inconnu→undefined" intermittently RED (35/36, seed-dependent). ROOT: FR_BY_SLUG was plain object via Object.fromEntries → FR_BY_SLUG["constructor"/"toString"/"__proto__"] resolves to Object.prototype member ≠ undefined; fast-check fc.string() occasionally generates a poison key → totality property fails. FIXED: FR_BY_SLUG = new Map(...) (null-prototype-equivalent), entry/term/def use .get(). 36/36 across 5 runs after. NOT introduced by WB2-03 but glossary is consumed by /v2/idee page (entry("idee")) + WB2-02 schema + WB2-00 home — hardening benefits active step. tsc 0, biome clean, build green (/v2,/v2/[slug],/v2/idee,/v2/lab all ƒ).

DOCS: concept+internals(3-layer Implémentation·Méta·Méta-méta) wb2-03-idee.mdx, docs.json:495-496, mint validate PASS, HEAD 9d928da==origin/main pushed.

OQ (by-design, non-blocking): Linear MCP unauth (only authenticate/complete exposed, can't move WB2-03 In Progress→Done — needs OAuth+restart); Mintlify MCP index lag (wb2-03 pushed+validated but search shows wb2-00/01, propagates next cycle); imports under app/** must be RELATIVE (vitest.config has no @/ alias), client components use @/.

RECURRING SCAR (NEW): plain-object lookup maps (Object.fromEntries / Record<string,T>) make a "unknown key → undefined" totality property FLAKY under fast-check fc.string() — prototype keys (constructor/toString/__proto__/hasOwnProperty) resolve to inherited members. ALWAYS use new Map() + .get() for content-addressed/slug lookup tables whose totality is a property mirror. Check any V2 twin with a *_BY_SLUG / *_BY_ID object.

RECURRING (from prior steps, confirmed again): executor's vitest twin imports widen to base type (Besoin.level:string) — passing through to a fn wanting the narrowed union (Coordinate.level:Level) trips tsc even though runtime values are valid; fix by routing through the compose result that already narrows, not by casting.
