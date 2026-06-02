# MCP server: `telemetry-reader` — ACTIVE (S43)

> **Status: active.** Activated at S43 (the RealityMirror). The server closes the
> **external loop** (boucle ③, KRD §1521/§1524): "le tool qui ferme la boucle
> externe : il rapporte ce que fait le système en vrai." It is **read-only on
> reality** and **write-only into `incidents.*` + the S27 idea-intake door**. It
> carries **no** `incident_to_kernel` tool — there is no such door.

## Purpose

The single capability door (ADR 0009: every backend op is an MCP tool) for
**reading** the OpenTelemetry signals the runtime lands in Postgres and turning a
recurring failure / breached budget into an **incident**, then handing it (via the
`/learn` gesture) to the S27 idea-intake as a **draft Idea** — the only legal
on-ramp from production reality to the kernel. Every decision defers to the pure
`back/runtime/reality` engine; the server only persists / hands off
(determinism-first).

## Tools (one tool = one backend op)

| Tool | Op | Direction |
|---|---|---|
| `telemetry_query` | read OTel spans/metrics landed in Postgres (optional name filter) | read |
| `incident_observe` | a recurring failure / budget breach → an `incidents.incident` row (`incident_derived` taint) | write `incidents.*` |
| `incident_list` | list observed incidents (the external-loop board) | read |
| `incident_learn` | run `reality.Learn` → hand the candidate to S27 `idea_capture` (a draft idea, provenance `incident:#NNNN`) | write `incidents.idea_id` + S27 `ideas.*` |

There is deliberately **no** `incident_to_kernel` tool. The direct edge
`Incident → Kernel` is the pure `reality.ToKernel` gate, which **always** returns
`REALITY_CANNOT_DECLARE_TRUTH`.

## Permissions — read/write zones

- **Reads:** the `telemetry.*` landing (spans/metrics) — SELECT only; and `incidents.*`.
- **Writes:** `incidents.incident` (INSERT observe; UPDATE only to set `idea_id`); the S27 `ideas.idea` capture path (INSERT a draft).
- **Forbidden (the wall, CLAUDE.md §2):** no write to `kernel`, `mirrors`, or `fitness`, and no write to the telemetry landing. A divergence becomes truth only via `incident → /learn → idea → mirror → /goal → approval`, never through this reader.

## Env

`AIDOS_INCIDENTS_DSN` (incidents grant), `AIDOS_TELEMETRY_DSN` (SELECT-only),
`AIDOS_IDEAS_DSN` (S27 capture grant). Transport: stdio.

## Related

- `/learn` skill — the gesture that drives `incident_observe` + `incident_learn`.
- `back/runtime/reality` — the pure engine (`Observe`/`Learn`/`ToIdea`/`ToKernel`).
- `idea-intake` — the S27 door the candidate is handed to (`idea_capture`).

## Activated at step **S43**
