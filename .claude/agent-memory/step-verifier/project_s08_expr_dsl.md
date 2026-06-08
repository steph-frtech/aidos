---
name: s08-expr-dsl
description: S08 Expr DSL verification — typed JSON AST (lit/ref/call/obj/arr) closed catalogue + pure Eval, content-addressed kernel.expr, /expr panel; verified green
metadata:
  type: project
---

S08 = the Expr DSL (KRD §24.5): comportement-as-artifact for button conditions (visible_when/enabled_when).

**Done-criteria (MET):** AST parses+type-checks+evaluates lit/ref/call/obj/arr with allowed funcs/$-roots; property mirror proves type-soundness.

- back/kernel/expr: 7-file PURE pkg. expr.go sealed Expr iface 5 KindLit/Ref/Call/Obj/Arr (only this pkg implements, closed grammar) + constructors Lit normalizes int→float64. parse.go two-pass rawNode (read kind THEN fields), typed errors NEVER panic, ref must $-prefix, IsCatalogueFunc gate, arityOK before Eval; Canonicalize = sorted-keys deterministic JSONB hashed via records.Hash (one address space). eval.go Eval pure with `defer recover`→typed err (no-panic invariant), now/uuid/randomToken via INJECTED Providers (FixedProviders for mirrors) = determinism-first no real clock/RNG; resolveRef `.length` on []any/string. catalogue.go CLOSED 9 fns: §24.5-named (lowercase/concat/now/uuid/randomToken) + button-example ops (>/&&/!/length) — honesty rule nothing invented, extend=ChangeSet.
- Property mirror (rapid) 5 props: RoundTrip Parse∘Canonicalize identity, EvalDeterministic, ClosedCatalogue (random non-fn rejected), UnknownKindRejected, EvalNeverPanics (= type-soundness). Fixture mirror 5: visible_when TRUE non-empty/FALSE empty cart ($.cart.items.length>0), lowercase($.auth.user.name)='ada', &&/! composes, exec REJECTED at Parse. Go test RAN GREEN -count=1 7.1s (incl 3 Testcontainers pg16: ASTRoundTripsAsJSONB + RejectsNonContentAddressed + AgentRoleSelectOnly permission-denied).
- migration kernel_expr_baseline.sql: content-addressed kernel.expr (id=version=Hash(Canonicalize), CHECK version=id, superseded_by append-only head); GRANT SELECT-only aidos_agent REVOKE INSERT/UPDATE/DELETE/TRUNCATE = in-DB wall; aidos writer SELECT/INSERT/UPDATE (no DELETE). Self-guarding CREATE SCHEMA IF NOT EXISTS, touches no prior table.
- front lib/expr.ts byte-faithful port (NODE_KINDS, CATALOGUE field-for-field, parse throws ExprRejected, pure evaluate) READ-ONLY no truth-write; /expr Server Component renders 5 kinds+catalogue+sample trees+evaluated result+rejected exec; ui-completeness VACUOUS (Expr=truth written only via aidos ChangeSet, no headless cap — read-only correct). vitest 12/12. e2e expr.spec.ts 6 specs (kinds+catalogue, tree, TRUE/FALSE, rejected "closed allow-list", heading). i18n 3441==3441 expr 20==20 both, rejectedExample contains "closed allow-list" matching e2e assertion.
- gofmt/vet/go build ./... clean; tsc rc=0; biome 2 INFOS only (template-literal suggestions, non-error — matches executor report); docs concept+internals (3 layers Implémentation·Méta·Méta-méta) docs.json:83-84.
- NOTE: NewEnv requires $-rooted data (flat keys → "ref does not resolve") — pre-existing observation, by design (ParseEnv expects {"$":{...}}).
- OQ (by-design fwd-dep, NOT residual): no live kernel.expr SELECT wiring (seeded samples render meanwhile)=later tooth; no MCP evaluator (Eval=pure lib not backend op); no visible_when→TS emitter (S11+ control/action consumes Expr); Linear MCP unauth (cannot move S08 issue Done programmatically).

Verified-green, ZERO corrections.
