# MCP server: `pact-verifier` — SCAFFOLD (activated at S36)

> **Status: scaffold / declared spec, NOT a working server.** Per ADR 0009's
> honesty guard, an MCP server is front-loaded only as a *spec*; it is
> **activated at S36** with a working implementation and a fault-injection test.
> A scaffold registers no tools and runs no logic. The working reference is
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for
**Pact provider verification** between cells (CLAUDE.md §3, N3/N5: Pact between
cells + Pact provider verification). It replays a consumer's contract against a
provider and reports whether the provider honours it — the cross-cell contract
mirror. It runs the verification; it never edits the contract or the entities.

## The op

`verify a Pact contract between cells (provider verification)`

Given a consumer Pact (the expected interactions) and a provider under test,
replays each interaction against the provider and reports pass/fail per
interaction with the mismatch detail.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `pact_verify` | run provider verification of a Pact contract | read; run verifier |
| `pact_list` | list known consumer/provider Pacts | read |

### Input / output sketch

```
pact_verify in  { provider: string, pact_ref: string|hash, provider_base_url?: string }
                          → out { status:"green"|"red", interactions: [{description, status, mismatch?}] }
pact_list   in  { provider?: string }
                          → out { pacts: [{consumer, provider, pact_ref}] }
```

## Permissions — read/write zones

- **Reads:** stored Pact contracts (content store), the provider's emitted handlers/projections under test (`back/gen`).
- **Writes:** a verification **report** only; never a contract, never an entity.
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness`. The contract/entity source is truth (N3 entity AST in `kernel`); this server only *verifies*, it never writes the source.

## Related hook

`Stop` / completeness — a cross-cell contract is a mirror; a red `pact_verify`
blocks step close. Fault-injection: break the provider against the contract and
assert the verifier goes red.

## Activated at step **S36**
