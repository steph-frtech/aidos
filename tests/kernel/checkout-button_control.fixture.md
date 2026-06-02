# Mirror · kernel.control/checkout-button · fixture (state → button.visible/enabled)

- reflects: `kernel.control "checkout-button"`
- test_kind: `fixture`
- cert_language: `fixture` (a control-spec's truth IS a state fixture — KRD §24.1, §27)
- liveness: `live`
- authority: `above` (the control-spec is a SOURCE truth above the waterline; the rendered button is a later projection guarded by this mirror)

This is the materialized, human-readable form of the control **state** mirror; the
runnable mirror is `back/kernel/control/control_fixture_test.go`. Conceptually this
record lives in the `mirrors` Postgres schema and is persisted there at S06 (bootstrap
exception — the `mirrors` schema predates this step; until the back-fill the file + the
Go test ARE the red→green proof — CLAUDE.md §6 bootstrap exception).

It is the **lien porteur**: the test loads the three `given` rows below; if a row
disappears the test breaks (the mirror cannot silently rot into a monster).

The control is the KRD §24.1/§94 `checkout-button.control`, **verbatim** — the agent
invents no view, label, condition, or trigger:

```
control "checkout-button" {
  view: "cart"
  label: i18n("cart.checkout")
  visible_when: $.cart.items.length > 0          # Expr DSL (AST typé, pas de code)
  enabled_when: $.form.valid && !$.submitting
  triggers: action "checkout-submit"
}
```

`visible_when` and `enabled_when` are **Expr DSL ASTs** evaluated by the frozen
`back/kernel/expr` interpreter — they are reused, never re-implemented (the closed
catalogue: `>`, `length`, `&&`, `!`). `EvalState` consults `enabled_when` **only when
`visible_when` is true** — a hidden button has no enabled state.

## fixture: checkout-button (given → button.visible / button.enabled)

| given (state `$`) | then |
|---|---|
| `{ cart: { items: [] } }` | `button.visible == false` |
| `{ cart: { items: [x] }, form: { valid: false }, submitting: false }` | `button.visible == true` ∧ `button.enabled == false` |
| `{ cart: { items: [x] }, form: { valid: true }, submitting: false }` | `button.visible == true` ∧ `button.enabled == true` |

- Row 1 — an empty cart hides the button (`$.cart.items.length > 0` is false). When
  hidden, `enabled` is not meaningful; `EvalState` reports `enabled == false`.
- Row 2 — a filled cart shows the button, but an invalid form disables it
  (`$.form.valid && !$.submitting` is false).
- Row 3 — a filled cart + a valid, non-submitting form enables it.

> No Gherkin journey and no operation fixture are added for this layer: a control's
> nature is the **state fixture** (KRD §27), so its mirror is `given → visible/enabled`.
> The ∀ slot (rapid) is carried by the determinism + orphan-trigger property
> (`control_property_test.go`) — `EvalState` is deterministic, and a control whose
> `triggers` does not resolve to a known action ref ⇒ `Validate` errors (no orphan
> trigger = no monster).
