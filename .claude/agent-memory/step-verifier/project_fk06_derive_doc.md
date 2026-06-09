---
name: fk06-derive-doc
description: §FK06 verification — pure emitter DeriveDoc(kernel)→s9, the lower half of the doc-mirror (FKE-1.3 décision a), structured concepts/behaviors/errors for FK07's structural comparison
metadata:
  type: project
---

§FK06 (after FK05, ROADMAP-fke FKE-1.3 décision (a)) — the PURE deterministic emitter DeriveDoc(kernel)→s9, the LOWER HALF of the doc-mirror, structured for FK07's structural set-comparison vs s2 (human upper half). back/runtime/generators/derivedoc PURE write-NOTHING.

WHAT IT IS: DeriveDoc(Kernel{Operations,Controls,Actions ASTs})→Derived{S9,Bytes,Hash}. S9 = 3 ENUMERABLE SORTED+DEDUPED sets: Concepts (kind-prefixed lexicon operation:/control:/action:/entity:/event:/policy:), Behaviors (one per op + one per control→action→operation binding + one per emit), Errors (op:ErrAuthorizationDenied from AuthorizeStep, control:ErrOrphanTrigger per control). Bytes via records.Canonicalize(json.Marshal), Hash via records.Hash — content-addr parity with truth-store.

DETERMINISM/PURITY (load-bearing done-crit «même kernel→s9 byte-identique»): no clock/rng/map-leak/LLM. 2 REAL non-determinisms the property caught + fixed: op-name collision (descByID keeps lexicographically MINIMAL description, not first/last-write-wins which leaks slice order) and action-name collision (actByName keeps min (Invoke,On.Control) via actLess). Both order-independent total rules. Behaviors rebuilt sorted-by-ID; set.sorted() canonicalizes each section.

DONE-CRIT PROVEN: property (derivedoc_property_test.go) DeriveDoc(k)==DeriveDoc(k) byte-identical + OrderInvariant (reversed-slice kernel → identical bytes, proves canonicalizes-not-echoes) + HashStable. fixture (derivedoc_fixture_test.go) checkout-slice → exact 8 concepts (action:checkout-submit/control:checkout-button/entity:Cart/entity:Order/event:CartCleared/event:OrderCreated/operation:createOrder/policy:canCheckout), behaviors contain binding:checkout-button->checkout-submit->createOrder + emits, errors contain ErrAuthorizationDenied+ErrOrphanTrigger, all sections sorted, empty-kernel→well-formed-empty-s9.

SENSORS: gofmt CLEAN, vet clean, go test green, PROPERTY ROBUST -count=2 -rapid.checks=3000 1.197s (from PKG dir — recurring scar). WALL grep CLEAN (no INSERT/UPDATE/DELETE/Exec/pgx/sql/GRANT). broad-build exit0. prior-green operation/control/action/records intact. MCP aidos-derivedoc 1 tool derive_doc PURE read-only (flat-JSON kernelIn→toStep maps verbs, branch/unknown→names-nothing) main_test green. TS twin lib/derivedoc.ts mirrors Go faithfully (same min-description/min-action collision rules, canonicalize key-sorts matching records.Canonicalize) Go-authoritative vitest 5/5. tsc only PRE-EXISTING behavior-capture.test.ts:101 'Kind' (S64-S77, NOT FK06, confirmed in HEAD). biome clean AFTER 1 cosmetic e2e line-wrap fix (RECURRING biome-format scar --write).

UI: /derive-doc action-capable useActionState, control DÉRIVER S9 bound to deriveAction→pure twin, writesTruth=false (s9 projection). FIXTURES moved to ./fixtures.ts (use-server module may export only async Server Actions — executor hit .map-is-not-a-function SSR crash from FIXTURES const export, fixed). testids match e2e (fixture-select/derive-submit/identical-badge[data-identical]/concepts/behaviors/errors/bytes/kernel-id). i18n fr5185==en5185, deriveDoc 18==18 keys, nav deriveDocNav registered WorkbenchHeader:203. title matches e2e regex (fr "La dérivation déterministe de s9" / en "The deterministic derivation of s9"). next build exit0 ƒ /derive-doc. Playwright 3/3 GREEN on fresh server :3242 (config honors PLAYWRIGHT_WEB_PORT for baseURL).

DOCS: concept+internals mdx, internals 3 layers Implémentation:9/Méta:34/Méta-méta:42, docs.json:465-466, mint validate PASS, HEAD 1037be8==origin/main pushed.

OQ by-design: Linear-unauth (only authenticate/complete exposed)/s9-consumption-by-s2↔s9-structural-comparison-is-FK07/Mintlify-reindex-lag. verified-green AFTER 1 cosmetic biome e2e line-wrap fix (RECURRING). Executor's 2 real non-determinism fixes (name collisions) were genuine — property under elevated checks surfaced them, same pattern as S108 flaky-passing under default rapid.checks.
