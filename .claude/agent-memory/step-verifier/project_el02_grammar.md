---
name: el02-grammar
description: EL02 closed BesoinLevel grammar — pure Go grammar + TS twin, the verticale shape (7 rungs + 2 bands + 3 out-of-scope), above the wall
metadata:
  type: project
---

EL02 fixes ONLY the CLOSED BesoinLevel grammar (the SHAPE, not the record/gate/wizard — those are EL03+).

- back/runtime/besoin/{grammar.go,spec.go}: Level enum = 7 §23 SOURCE rungs (product→journey→view→control→action→operation→entity) in `sourceOrder` (total, closed, declared) + 2 transversal bands (invariant attaches to every rung, policy to operation/entity only — EL02 decision: policy is a BAND not a vertical rung) + 3 out-of-scope-v1 layers (saga/temporal/globalinvariant) NAMED in OutOfScopeLevels(), refused HARD via dedicated `ErrOutOfScopeLevel` (distinct from ErrUnknownLevel), never aliased.
- Per-level `levelSpecs`: RequiredFields + single OutgoingRef (control.triggers→action, action.invoke→operation, operation.mutate→entity); entity leaf + bands have RefTo "".
- **Honest join (no forked set):** `TestMappingRungsSubsetOfProposesKinds` ties the mapping rungs to `kernel/ideas.ProposesKinds()` (6 kinds: control/policy/operation/action/entity/product). journey/view are NoEmit (deliberately NOT in ProposesKinds — they seed anchors). policy band maps to ProposesPolicy.
- **Wall:** grammar.go imports only errors/fmt; spec.go no imports. No kernel/mirrors/fitness write, no INSERT/UPDATE/exec. Pure grammar above the line. The only "kernel" string is a comment.
- TS twin lib/besoin-grammar.ts byte-faithful (SOURCE_ORDER/SPECS identical); vitest+fast-check 9/9. Action-capable /compound-besoin-grammar (list grammar + parse level, both run the pure twin, no headless cap). 24 i18n keys fr+en + nav.besoinGrammar both locales. e2e 2/2 on :3000.
- Determinism-first: every grammar fn pure/total, reproducibility property on both planes.

SCAR (minor, non-blocking): executor reported "biome clean" but biome emits 2 `warnings` (unsafe optional-chain suggestions on attachableTo/AttachableTo `if (!s || !s.x)`). Warnings not errors — code intentionally explicit. Watch for "biome clean" prose that is actually "biome 0 errors, N warnings".

OQ (by-design fwd-dep, PASS): out-of-scope layers get a rung in a later EL via idea→mirror→/goal; BesoinGraph record/CanDescend/wizard = EL03+; Linear MCP unauth = best-effort §7.

docs f5d609d HEAD==origin/main, 3 layers, mint validate ok. verified-green.
