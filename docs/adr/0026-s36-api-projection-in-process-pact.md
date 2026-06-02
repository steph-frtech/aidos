# ADR 0026 — S36 API projection: in-process Pact provider verification

- Status: accepted
- Date: 2026-06-01
- Step: S36 — API projection (Go REST/JSON from operation + entity) + Pact contract
- Deciders: step-executor S36
- Linear: `S36 · API projection`

## Contexte

S36 must (1) project a deterministic Go REST/JSON handler from a kernel **operation**
(N2 workflow, S10) and the **entity** it touches (N3 source, S35), and (2) freeze the
request/response shape as a **Pact contract** verified against the provider — the frozen
N3 "Pact between cells" + N5 "Pact provider verification" slots. The done criterion is:
*the `createOrder` route passes its contract test.*

The canonical Pact-Go provider verifier (`pact-foundation/pact-go`) ships a **native
Ruby/Rust standalone daemon** that must be downloaded and run out-of-process. That is
non-deterministic to provision in CI (network, platform binaries), heavyweight for a
single interaction, and adds a runtime the rest of `back/` does not use.

## Décision

Stay **within** the frozen Pact slot but verify **in-process, deterministically**:

1. **The contract is a Pact-format JSON document** (`pact specification v3`): a single
   interaction `POST /orders` → `201` with the pinned request/response bodies. It is
   emitted by `EmitContract(operation, entity)` as a pure function of the source, and
   stored byte-stable (canonical key order via S02 `Canonicalize`).
2. **Provider verification stands the emitted handler up via `net/http/httptest`** (no
   external server, no Ruby daemon), replays the interaction's request, and asserts the
   response status + the JSON body **field set** match the contract. The request/response
   shapes are exactly those the operation I/O × entity attribute set pins — no extra,
   missing, or renamed field.
3. **The `pact-verifier` MCP** (`back/mcp/pact-verifier/`) exposes this as one callable
   op (`pact_verify`): given the emitted handler + the contract, run provider verification
   and return PASS/FAIL + the matched interaction. It reaches nothing above the wall
   (SELECT-only on `kernel` / `runtime.api_contract`).

This **reuses** the Pact contract format and the provider-verification *gesture* (consumer
expectation → provider stood up → shapes asserted) without the external daemon. If a real
cross-language consumer ever needs the broker/daemon, that is a later tooth (an OQ), not
this step.

## Conséquences

- `EmitAPI` and `EmitContract` are pure/total/deterministic (no I/O, no clock, no RNG);
  byte-stable; content-addressed via S02 `Hash(Canonicalize(operation ⊕ entity))`.
- Provider verification needs only the Go stdlib (`net/http/httptest`, `encoding/json`),
  already in the module — no new heavyweight dependency.
- The handler is a **thin transport adapter**: HTTP/JSON in → the S10 operation interpreter
  → HTTP/JSON out. It re-types nothing (reuses S35 `EmitGo` field shapes) and re-implements
  no business rule (delegates to `operation.Interpret`).
- An operation whose I/O references an attribute the entity AST does not pin is **Blocked**
  with an S13 `BlockReason` (`UNKNOWN_OPERATION_IO`) — no invented field/route/status.

## Alternatives rejetées

- **`pact-foundation/pact-go` with the native daemon** — rejected: non-deterministic
  provisioning, external runtime, disproportionate for one in-process interaction.
- **A bespoke non-Pact JSON contract** — rejected: would leave the frozen "Pact" slot; the
  contract is kept in Pact v3 format so a future broker can consume it unchanged.
