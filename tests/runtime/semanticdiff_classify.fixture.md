# Mirror · SemanticDiff classification fixture (S21)

```
reflects:       runtime.semanticdiff.Classify
test_kind:      fixture
cert_language:  operation-dsl/go
liveness:       live
authority:      above
materialized:   back/runtime/semanticdiff/semanticdiff_fixture_test.go
```

The SemanticDiff classifier reads the **nature** of a kernel change between two versions
(`old@hash → new@hash`) — KRD §44.1 — and names it with one member of the closed set
`{add, refine, override, rescope, reweight, deprecate}` (the six S21 lands), or with the
explicit `unclassifiable` verdict (an OpenQuestion, never a fabricated type), or `none`
(identity). The example artifacts are reused from prior steps; this step coins none.

`state` = the OLD kernel version · `command` = the NEW kernel version · `events` = the
classified `change_type`.

```
fixture A — an incompatible enabled_when is an override            # THE done criterion
  state   (old): control "checkout-button" { enabled_when: "$.form.valid && !$.submitting" } @v1
  command (new): control "checkout-button" { enabled_when: "$.form.valid" }                  @v2
  events:  [ change_type == override ]                             # KRD §11/§12 — a revoked promise

fixture B — a scope change is a rescope, not an override           # THE done criterion
  state   (old): rule "refund-policy" { scope: { cells: ["EU"] } }            @v1
  command (new): rule "refund-policy" { scope: { cells: ["EU","US"] } }       @v2
  events:  [ change_type == rescope ]                              # KRD §44.1 — a TruthScope move (S15)

fixture C — cosmetic to load-bearing is a reweight                 # THE done criterion
  state   (old): composes(parent="checkout", child="help-link") { weight: cosmetic }      @v1
  command (new): composes(parent="checkout", child="help-link") { weight: load-bearing }  @v2
  events:  [ change_type == reweight ]                             # KRD §96 — a weight re-qualification

fixture D — a constraint in free space is an add
  state   (old): (no constraint touches the promo-banner region)
  command (new): control "promo-banner" { visible_when: "$.promo.active" } @v1
  events:  [ change_type == add ]                                  # KRD §11 — extension, safe by construction

fixture E — a stricter consistent constraint is a refine
  state   (old): policy "session" { allow: "creds.valid" }                          @v1
  command (new): policy "session" { allow: "creds.valid", deny_after: "3 fails" }   @v2
  events:  [ change_type == refine ]                               # KRD §11 — refinement, safe iff consistent

fixture F — a lifecycle move to deprecated is a deprecate
  state   (old): rule "legacy-checkout" { lifecycle: active }      @v3
  command (new): rule "legacy-checkout" { lifecycle: deprecated }  @v4
  events:  [ change_type == deprecate ]                            # KRD §44.2 — death by succession

fixture G — an unclassifiable change becomes an OpenQuestion, never a guess
  state   (old): rule "x" { foo: "alpha" }            @v1
  command (new): rule "x" { foo: "beta" }             @v2
  events:  [ change_type == unclassifiable ∧ open_question != "" ]   # never a fabricated change_type

fixture H — identity is no change
  state   (old): rule "refund-policy" { scope: { cells: ["EU"] } }  @v1
  command (new): identical @v1
  events:  [ change_type == none ]                                 # identity ⇒ no spurious type
```
