---
name: s65-grilling-loop
description: S65 in-product grilling loop (intention ≤5 scenarios, deterministic verdict routing, barricaded LLM gate) over S28 exploration; verified green after 1 correction
metadata:
  type: project
---

S65 = the IN-PRODUCT conversational grilling loop (app-builder track, KRD §75/§118). A human grills an Intention (prose intent + ≤5 candidate scenarios) and routes it on the closed 3-value verdict (sharp→grilled / fuzzy→spiking / bad→rejected,traced), recording verdict + HUMAN provenance. DONE-CRIT (fixture par branche de verdict ; logique de routage déterministe) MET.

**REUSE-DONT-REINVENT:** back/runtime/grillingloop.Route DELEGATES every transition to exploration.Grill (S28) which delegates to ideas.Grill/Spike/Reject — no transition reimplemented, no 4th verdict. The genuinely-product additions: bounded session (MaxScenarios=5, 6th REFUSED not truncated), barricaded LLM gate (VerifyLLMVerdict re-checks raw string against closed schema, exact+case-sensitive, off-schema→ErrOffSchemaVerdict never coerced), VerdictRecord. PURE/TOTAL no clock/rng/IO, writes NOTHING (persistence rides ideas schema below the wall).

**CORRECTION APPLIED (1):** grillingloop_property_test.go genIntention generated intent matching `[a-z ]{1,40}` which permits whitespace-only " " → Validate rejects ErrIntentEmpty → TestRoutedStatusInClosedSet asserted no-error → rapid FAIL (seed-found after 7 tests, intent=" "). Fixed generator to `[a-z][a-z ]{0,39}` (guarantee ≥1 non-space char; whitespace-only is covered by TestEmptyIntentRefused). RECURRING PATTERN: rapid StringMatching `[a-z ]{1,N}` for a field that TrimSpace-validates non-empty produces a blank counterexample — always anchor the first char to a non-space class. (Same class of bug worth watching in any twin where front uses .trim() and Go uses strings.TrimSpace.)

**Why PASS after fix:**
- go test ./runtime/grillingloop ./mcp/grilling-loop GREEN (gofmt/vet clean). Fixture per verdict branch (3 rows sharp/fuzzy/bad each asserting status+verdict+reason+human-provenance+verbatim-intent) + traced-reject + ≤5-bound + empty-refused + unknown-verdict-refused + LLM-schema-gate + verified-LLM-drives-routing. Property: Route determinism, closed routed-status set, verdict-schema-gate closed.
- MCP back/mcp/grilling-loop writes NOTHING (no SQL/pgx/postgres — grep clean), 3 pure-computation tools (grill_route/grill_verify_verdict/grill_verdicts). main_test ok.
- Front twin lib/grilling-loop.ts byte-twin reuses routeVerdict (S28) + captureIdea (S64) → id agrees with Go authority. vitest 11/11. tsc clean. biome clean.
- Wall: actions.ts writes ideas schema DIRECTLY via Server Action (below-line, agent has INSERT/SELECT/UPDATE on ideas.idea per S27) — NEVER kernel/mirrors/fitness (grep clean). project from S57 cookie. on-conflict-update idempotent.
- UI /grilling-loop action-capable: 17 testids; e2e 5/5 (renders, verdict-picker exactly 3 closed options in canonical order, inbox lanes, sharp routes+executes, bad-without-reason refused). Demo fallback offline.
- i18n parity 3616==3616, grillingLoop + nav.grillingLoop namespaces present.
- Docs concept+internals s65-grilling-loop.mdx, internals 3 layers (Implémentation/Méta/Méta-méta), docs.json:199-200, mint validate PASS, committed 6dd398a, pushed (## main...origin/main 0 ahead).

**OpenQuestions (by-design forward-deps, NOT residual):** (1) canonical write door = idea-intake MCP via S58 passerelle; screen writes ideas directly, reconcile at S59 cutover (same as S64). (2) Mirrors Postgres persistence of fixture/property mirrors = files+executable tests (bootstrap exception, back-filled). (3) Linear MCP unauthenticated (OAuth) — S65 issue not moved programmatically. (4) Mintlify deployed-index reindex lag.

verified-green AFTER 1 correction (property-test generator blank-intent counterexample).
