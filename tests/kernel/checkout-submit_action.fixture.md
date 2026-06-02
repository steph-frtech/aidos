# Mirror · kernel.action/checkout-submit · fixture (event → invoke / effect)

- reflects: `kernel.action "checkout-submit"`
- test_kind: `fixture`
- cert_language: `fixture` (an action-spec's truth IS an event→effet fixture — KRD §24.2, §27)
- liveness: `live`
- authority: `above` (the action-spec is a SOURCE truth above the waterline; the rendered `onClick` handler is a later projection guarded by this mirror)

This is the materialized, human-readable form of the action **event** mirror; the
runnable mirror is `back/kernel/action/action_fixture_test.go`. Conceptually this record
lives in the `mirrors` Postgres schema and is persisted there at S06 (bootstrap
exception — CLAUDE.md §6).

It is the **lien porteur**: the test loads the rows below; if the bind row disappears
the test breaks (the mirror cannot silently rot into a monster).

The action is the KRD §24.2/§94 `checkout-submit.action`, **verbatim** — the agent
invents no `on`, `invoke`, effect verb or operation ref:

```
action "checkout-submit" {
  on: click("checkout-button")
  invoke: operation "createOrder" with { cart: $.cart, user: $.auth.user }
  on_success: [ navigate("/orders/{result.id}"), toast("order.created") ]
  on_error:   [ toast.error($.error.message) ]
}
```

The action **binds** (`binds`) the control to an operation. `Plan(action, event)`
resolves the bind **without executing it** — it returns the operation ref, the resolved
`with {…}` args (Expr ASTs), and the `on_success` / `on_error` effect lists. The actual
handler is a later projection (S38 web emitter), not this step.

## fixture: checkout-submit (event → invoke / effect)

| on (event) | then |
|---|---|
| `click("checkout-button")` | `invoke operation "createOrder"` with args `{ cart: $.cart, user: $.auth.user }` |
| `on_success` | `[ navigate("/orders/{result.id}"), toast("order.created") ]` |
| `on_error` | `[ toast.error($.error.message) ]` |

- The fixture is **green only when `Plan(action, click("checkout-button"))` resolves to
  `invoke operation "createOrder"`** — i.e. the action BINDS the operation (the S11 done
  criterion).
- The `with {…}` args are Expr DSL refs (`$.cart`, `$.auth.user`), reused from the frozen
  Expr DSL, never re-implemented.
- The effect verbs (`navigate`, `toast`, `toast.error`) are taken **verbatim** from KRD
  §24.2; they are opaque effect descriptors (a verb name + an arg expression) — `Plan`
  lists them, it does not execute them (no invented effect semantics).

> No Gherkin journey and no rapid property are added for this layer: an action's nature
> is the **event fixture** (KRD §27). The ∀ slot for the slice (rapid) lives with the
> control (determinism + orphan-trigger) and the action's own
> `action_property_test.go` (a `binds` that does not resolve ⇒ `Validate` errors).
