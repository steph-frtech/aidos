# MCP server: `idea-intake` — ACTIVE (S27)

> **Status: active** (activated at S27). The working server is
> [`main.go`](./main.go) + [`store.go`](./store.go), with the end-to-end smoke
> mirror [`main_test.go`](./main_test.go) (Testcontainers). Reference:
> [`back/mcp/store/main.go`](../store/main.go).

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for the
**`ideas` schema** — candidate-truths that have **no freeze and no mirror yet**
(KRD §118). This is the legal on-ramp toward truth: a human
("finalement je veux que…") or an incident (#NNNN) captures an Idea with
provenance, then the lifecycle advances it
`draft → grilled → {spiking → harvested | harvested}`, with a traced `rejected`
lane. The server captures and advances candidates; it is structurally incapable of
freezing them into the kernel — there is **no** `idea_promote_to_kernel` tool.
Promotion = writing the idea's mirror = the `/goal` = the freeze, gated by the
`promotion-gate` hook (`NO_MIRROR_NO_KERNEL`); the kernel write is the `aidos` CLI
role, never this server.

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `idea_capture` | human\|incident → draft (records a candidate-truth + provenance) | write `ideas` |
| `idea_grill` | draft → grilled | write `ideas` |
| `idea_spike` | grilled → spiking (exploration, ratchet OFF) | write `ideas` |
| `idea_harvest` | grilled\|spiking → harvested | write `ideas` |
| `idea_reject` | → rejected (traced, kept; never deleted) | write `ideas` |
| `idea_status` | read one idea + its provenance + status | read `ideas` |
| `idea_list` | list candidate-truths (triage queue), optional status filter | read `ideas` |

All lifecycle DECISIONS are the pure `back/kernel/ideas` functions; this server
only persists an already-decided transition (determinism-first).

## Permissions — read/write zones

- **Reads/Writes:** `ideas` schema only — `INSERT/SELECT/UPDATE` on `ideas.idea`
  (capture + advance; candidate-truths are staging *above* the wall). **No
  `DELETE`** — a rejected idea is kept (append-only/traced).
- **Forbidden (the wall, CLAUDE.md §2):** **never** writes `kernel`, `mirrors`, or
  `fitness`. Capturing/advancing an Idea must not — and cannot, by GRANT — touch
  the kernel. The door from Idea to truth is `idea → mirror → /goal → human
  approval`, gated by the `promotion-gate` hook.

## Related hook

The `promotion-gate` PreToolUse hook (`back/hooks/promotion-gate`) guarantees a
kernel write whose provenance is a mirror-less idea is refused with
`NO_MIRROR_NO_KERNEL`. DSN: `AIDOS_IDEAS_DSN`. Transport: stdio.
