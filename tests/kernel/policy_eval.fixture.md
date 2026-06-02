# Mirror · kernel.policy/canPlaceOrder · fixture (state → command → events)

- reflects: `kernel.policy/canPlaceOrder`
- test_kind: `fixture`
- cert_language: `go` (Operation-DSL-style fixture, interpreted in Go)
- liveness: `live`
- authority: `above` (a policy is a SOURCE truth above the waterline)

This is the materialized, human-readable form of the fixture mirror; the runnable
mirror is `back/kernel/policy/policy_fixture_test.go` (and the ∀ generalization is
`back/kernel/policy/policy_property_test.go`). Conceptually this record lives in the
`mirrors` Postgres schema; it is persisted there at S06 (bootstrap exception — the
`mirrors` schema does not exist before S06). Until then the file + the Go test ARE
the red→green proof.

The policy is the KRD §93 anchor, **verbatim** — the agent invents no rule:

```
policy "canPlaceOrder" {
  scope: OPERATION "createOrder"
  rule: all([
    exists($.auth.user),
    eq($.cart.userId, $.auth.user.id),
    gt($.cart.items.length, 0)
  ])
  effect: ALLOW    # tout ALLOW passe ; n'importe quel DENY bloque
}
```

Combination law: `effect ALLOW` ⇒ the policy authorizes (ALLOW) **iff** its rule
holds, else DENY.

| # | state (`$`-rooted Ctx) | command | events (Decision) |
|---|---|---|---|
| 1 | `auth.user.id=u1`, `cart.userId=u1`, `cart.items=[{…}]` | `Eval(canPlaceOrder, ctx)` | `ALLOW` |
| 2 | `auth={}` (no user), matching non-empty cart | `Eval(canPlaceOrder, ctx)` | `DENY` |
| 3 | `auth.user.id=u1`, `cart.userId=u1`, `cart.items=[]` | `Eval(canPlaceOrder, ctx)` | `DENY` |
| 4 | `auth.user.id=u1`, `cart.userId=u2`, non-empty cart | `Eval(canPlaceOrder, ctx)` | `DENY` |

Row 1 is the only ALLOW: all three §93 conditions hold. Rows 2–4 each break exactly
one condition (missing auth, empty cart, mismatched owner) → DENY, proving "any DENY
blocks" at the leaf level.

> No Gherkin journey is added for this layer: a policy's nature is the invariant
> `∀`, so its mirror is the rapid property test + this fixture. Forcing an acceptance
> mirror here would be a double-typed monster (the completeness law forbids it).
