# mirror · api-projection fixture (S36)

- reflects: `runtime/generators.EmitAPI` (operation + entity → Go REST/JSON handler) ⇄ `EmitContract` ⇄ `VerifyContract`
- test_kind: workflow/fixture · cert_language: operation-dsl/go · liveness: live · authority: below
- lien porteur of `back/runtime/generators/api_fixture_test.go` (the Go interpreter mirrors this row by row)

The API projection EXPOSES a kernel operation over HTTP. It is a PROJECTION (role=projection,
below the waterline), DERIVED from TWO sources — the `createOrder` operation (the N2 workflow, S10)
and the `Order` entity it touches (the N3 source, S35) — materialized to `back/gen/api/order.go`,
NEVER hand-edited. The handler is a THIN transport adapter: HTTP/JSON in → the operation interpreter
(S10) → HTTP/JSON out; it re-types nothing and re-implements no business rule.

## Fixture A — createOrder emits a Go REST/JSON handler

```
state   (operation): createOrder { input: CreateOrderInput, mutate create Order, emits [OrderCreated, CartCleared] }
state   (entity):    Order (from S35, read SELECT-only from kernel)
command (emit api):  EmitAPI(createOrder, Order)
events:  [ Emitted ]
-> output is a valid Go net/http handler with the protected header        # back/gen/api, never hand-edited
-> the method+route are POST /orders, taken from the operation (not invented)
-> the request body type reuses the Order field shape (S35 EmitGo Go types), never re-typed
-> the handler delegates the body to the operation interpreter (S10), never re-implements the rule
```

## Fixture B — the emitted api artifact is content-addressed to its source

```
state   (operation+entity): createOrder ⊕ Order
command (compute):  canonical-hash(operation ⊕ entity)
events:  [ artifact.source_hash == Hash(Canonicalize(operation ⊕ entity)) ]
-> a byte change in either source ⇒ a new source_hash ⇒ the artifact is stale (feeds the red wave, S22)
-> EmitAPI is byte-identical on a re-emit of the same sources
```

## Fixture C — an operation referencing an unpinned entity is rejected, not guessed

```
state   (operation): createOrder mutating an entity the provided AST does not match
command (emit api):  EmitAPI(createOrder, <wrong/empty entity>)
events:  [ Blocked ]
-> block_reason.code == OUT_OF_SCOPE, explanation names UNKNOWN_OPERATION_IO     # reuse S13 BlockReason shape
-> no handler is emitted (no silent fallback route, field, or status code)
```

## Contract — createOrder honours its Pact contract (THE done criterion)

```
given   the createOrder provider (the emitted Go handler) is stood up (in-process, httptest)
when    POST /orders with the pinned Order request body
then    the response status (201) and JSON body field set match the contract's Order response shape
-> the pact-verifier MCP runs provider verification and the interaction PASSES
-> the request/response field set == the operation I/O × entity attribute set (no extra/missing/renamed field)
```
