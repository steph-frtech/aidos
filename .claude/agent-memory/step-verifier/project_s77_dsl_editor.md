---
name: project-s77-dsl-editor
description: S77 typed DSL editor verification — no-free-code typed forms over the 4 DSLs, propose DRAFT changeset, verticale fixture, wall holds
metadata:
  type: project
---

S77 dsleditor = TYPED EDITOR surface over the four behaviour DSLs (operation/policy/control/action, KRD §24) — every edit is a TYPED FORM (no `code`/`script`/`eval` field → ErrFreeCode), parsed PURE into the existing ASTs (REUSES policy.Parse/control.Parse/action.Parse/operation.* via parse_*.go, NO fork ADR0007), then ProposeEdit wraps canonical AST into a DRAFT changeset.ChangeSet (target `dsl-edit@<kind>:<name>`, spec_delta+mirror_delta) NEVER APPLIED, WroteKernel=false (the wall).

DONE-CRIT ALL met & re-verified:
- VERTICALE fixture (dsleditor_fixture_test.go state→cmd→events): all 4 ASTs authored via ProposeEdit → control.EvalState(visible∧enabled) → action.Plan resolves invoke=createOrder → operation.Interpret runs to OrderCreated event. Uses FROZEN S09/S10/S11 interpreters, no second evaluator.
- enabled_when FALSE → control.EvalState enabled=false → action blocked (TestVerticale_EnabledWhenFalseBlocksTheAction).
- parsing DSL = pure function (dsleditor_property_test.go rapid: same doc→byte-identical Canonical+changeset.ID, always StatusDraft, AppliedAt==nil).

VERIFIED-GREEN ZERO corrections: go test ./kernel/dsleditor + ./mcp/dsl-editor 0.029s/0.005s GREEN, gofmt -l CLEAN, go vet CLEAN. MCP 3 PURE tools (dsl_kinds/dsl_parse/dsl_propose) NO apply tool, no SQL/exec/pgx (wall). Front twin lib/dsl-editor.ts vitest 7/7 (parseDoc/proposeEdit pure, hasFreeCode, DRAFT-always, wrote_kernel false). actions.ts Server Action WRITES NOTHING (proposeEdit returns VALUE). e2e dsl-editor.spec.ts 6 tests, all 10 testids present in DslEditorPanel (propose-button rendered via Submit testId prop). i18n parity 3948==3948, nav link /dsl-editor present. Docs: concept+internals mdx, internals has 3 layers Implémentation/Méta/Méta-méta, docs.json:223-224, mint validate PASS, pushed 5dfaa9d 0-ahead of origin/main.

OQ by-design: front canonical id is local sha256 NOT Go-byte-pinned (Go records.Hash authoritative); apply=S20 commit-gate/AuthorityGraph (the wall); Linear MCP unauth (only authenticate/complete tools) → could not move S77 issue. None block.

NOTE: front lib uses canonicalEncode (recursive sorted-key) as a stable handle, NOT byte-identical to Go records.Canonicalize — acceptable, Go is authoritative content-address (same pattern as S70/S75 front-id-vs-Go-hash OQ).
