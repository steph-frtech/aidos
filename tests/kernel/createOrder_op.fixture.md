# Mirror · kernel.operation/createOrder · fixture (state → command → events)

- reflects: `kernel.operation/createOrder`
- test_kind: `workflow`
- cert_language: `fixture` (the Operation DSL is interpreted in Go; the fixture IS the N2 truth form)
- liveness: `live`
- authority: `below` (the interpreter is a computational projection of the operation AST; the operation SOURCE truth itself is above the line)

This is the materialized, human-readable form of the **workflow** mirror; the runnable
mirror is `back/kernel/operation/operation_fixture_test.go`. Conceptually this record
lives in the `mirrors` Postgres schema and is persisted there at S06 (bootstrap
exception — the schema predates this step; until the back-fill the file + the Go test
ARE the red→green proof — CLAUDE.md §6 bootstrap exception).

It is the **lien porteur**: the test loads `createOrder/happy`; if the fixture
disappears, the test breaks (the mirror cannot silently rot into a monster).

The operation is the KRD §93 `createOrder.op`, **verbatim** — the agent invents no
step, no event, no total formula, no status:

```
operation "createOrder" {
  input: "CreateOrderInput"
  steps: [
    validate  { schema: "CreateOrderInput" },
    authorize { policy: "canPlaceOrder" },
    read      { entity: "Cart", where: { id: $.input.cartId }, as: $.cart },
    mutate    { entity: "Order", op: create, data: {
                  userId: $.auth.user.id, items: $.cart.items,
                  total: sum($.cart.items, "price"), status: "pending"
                }, as: $.order },
    mutate    { entity: "Cart", op: clear, where: { id: $.cart.id } },
    return    { ref: $.order }
  ]
  emits: [ "OrderCreated", "CartCleared" ]
}
```

The five+one step verbs run **in order** as `state → command → events`. Side-effecting
verbs (`validate`, `authorize`, `read`, `mutate`) reach the world **only** through
injected `deps` (Validator/Authorizer/Reader/Mutator), so the fixture passes **mocks**:
the package is pure — no DB, no HTTP, no clock. Policy/Expr/DB are mocked at their seam
this step (the real Policy ∀ evaluation, the real Expr `sum`, the real sqlc read/write
are later teeth).

## fixture: createOrder/happy (state → command → events)

| given (state `$`) | command | then (events, ordered) | return |
|---|---|---|---|
| `auth.user.id = u1`, `cart{id:c1, userId:u1, items:[{price:10},{price:5}]}` | `createOrder { cartId: "c1" }` | `[ "OrderCreated", "CartCleared" ]` | `{ status: "pending", total: 15 }` |

- events are **ordered, exactly these two** — `OrderCreated` (from the `Order create`
  mutate) then `CartCleared` (from the `Cart clear` mutate). The emit order mirrors the
  step order; deterministic.
- `return.status == "pending"` and `return.total == 15` (= `sum(cart.items, "price")`
  = 10 + 5), computed by the `mutate` `Order create` step.
- **`authorize("canPlaceOrder")` ran BEFORE any `mutate`** — the mock authorizer
  records the call order; the assertion proves the pipeline order is real, not
  coincidental.

## fixture: createOrder/authz-denied (authorize fails ⇒ no events, no mutate)

| given (state `$`) | command | then |
|---|---|---|
| `auth.user.id = u1`, `cart{id:c1, userId:u1, items:[]}` (empty cart → the policy would DENY) | `createOrder { cartId: "c1" }` | `err is AuthorizationDenied` ∧ `events == []` ∧ the mock Mutator was **never** called |

This is the **red guard**: it proves the `authorize` step gates the pipeline — a DENY
short-circuits **before** any `read`/`mutate`, so no event is emitted and no truth-write
is attempted. Without it, an interpreter that mutated first and authorized later could
still pass `happy` by coincidence.

> No Gherkin journey and no rapid property are added for this layer: an operation's
> nature is the **workflow** (N2), so its mirror is the fixture `state → command →
> events`. The journey slot (Godog) and the ∀ slot (rapid) belong to other layers
> (view, policy) — forcing them here would be a double-typed monster (the completeness
> law forbids it).
