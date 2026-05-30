---
status: accepted
---

# Two memory layers: claude-mem for the build-agent (A), native pgvector behind the firewall for the OS brain (B)

There are **two unrelated memories** in the AIDOS world, and conflating them would breach the wall:

- **Layer A — the build-agent's memory.** The cross-session memory of the **Claude Code agent that *builds* AIDOS** in this repo. We use **claude-mem** (github.com/thedotmack/claude-mem, Apache-2.0, already installed v13.4.0 and already capturing project `aidos`). It is a **developer-ergonomics convenience**, **not** part of the AIDOS product and **not** a runtime dependency of the OS. Its observations are context-fuel for the human/build-agent, **never** AIDOS truth and **never** AIDOS `MemoryItem`s; they never enter any kernel (the same memory-is-not-truth law).
- **Layer B — the OS's own brain (S30–S33).** AIDOS's `brain` subsystem that the OS uses when it operates on user projects. Backed by **native pgvector inside the single Postgres truth-store** (exactly as S30–S33 + ADR 0004 already specify): `brain.memory_item` (MemoryItem + embeddings, HNSW + cosine, kind/branch-filtered recall) and `context.context_graph_decision`. **No external memory service on the truth side.**

We chose this because the value of Layer B is **100% the four non-delegable KRD invariants**, which **no memory product provides** and which must be hand-built regardless of the store underneath: (1) **MemoryFirewall** (S30) — `Memory → ContextPack → Idea → Mirror → Goal → Kernel`; `Memory → Kernel` blocked for *every* item regardless of confidence/taint (`BlockReason MEMORY_CANNOT_DECLARE_TRUTH`); (2) **deterministic `ContextGraphDecision`** (S32) — pure, false-dominant, clock-passed-in, **no LLM in the layer** (KRD §119.2); (3) the **GRANT wall** (agent: `SELECT`+`INSERT` only on `brain.memory_item`; never the kernel/mirrors/fitness); (4) **taint/provenance + content-addressing (id = hash) + append-only supersession + byte-reproducible** ContextRouter (S33). The commodity a tool would own is genuinely tiny (vector type registration + `ORDER BY embedding <=> $1 LIMIT k` + one Atlas migration), so wrapping a service costs more operational surface than it saves — consistent with ADR 0007 (reuse *libraries*, not services).

## Considered Options

- **claude-mem as the Layer-B backend.** Rejected — wrong category: SQLite + Chroma + ONNX (≠ Postgres/pgvector, breaks Mandat B / ADR 0004), an *observation-from-transcript* data model (≠ MemoryItem taxonomy keyed to user projects/branches/red-sets), and LLM-summarized **auto-injection** (non-deterministic) exactly where S32/S33 require a deterministic, auditable, firewalled gate. Excellent for Layer A; categorically wrong for Layer B. Its observation taxonomy + SessionStart-injection pattern are a useful **conceptual reference** for S33, not a dependency.
- **Letta (MemGPT) as the Layer-B backend.** Rejected *now*: a Python server (no Go client) that owns its own Alembic-managed Postgres+pgvector schema scoped under `agent_id`, re-opening the exact second-engine objection ADR 0004 used to reject Doltgres; and its defining design (the agent self-edits memory via `core_memory_append/replace`, sleep-time agents asynchronously rewrite memory via LLM) is the **direct opposite** of §119.2. Its archival `passages.insert/search` (hybrid vector+keyword, RRF, no agent loop) *could* serve as a dumb store behind the S31 port — so Letta stays a **possible future swap** (below), never the frozen choice.
- **Native pgvector on the single Postgres truth-store (chosen for B), claude-mem for A.** Library-level reuse (`pgvector-go`/pgx, sqlc, Atlas, Testcontainers) inside the frozen pgvector slot; the four invariants stay AIDOS-owned; the S31 `Store`/`Embedder` ports keep an external backend swappable. claude-mem owns Layer A, ungoverned by KRD, guaranteed-separate by the wall + the memory-is-not-truth law.

## Consequences

- **S30–S33 are unchanged** — native pgvector behind the firewall, as planned. No external memory service enters the truth side.
- **Reuse is library-level, gated for services.** An external store (Letta/Mem0/Zep) may be adopted **only behind the S31 `Store`/`Embedder` port, after a recorded spike behind the wall**, and only as a *dumb* store/recall backend (`passages.insert/search/list/get`; sleep-time agents disabled; `core_memory_*` never called; must satisfy content-addressing + append-only + taint-preservation by construction or be disqualified). It is a `replaceable` adapter, never the frozen choice.
- **claude-mem (Layer A) is sanctioned but bounded:** optional build-agent convenience; its heuristic LLM injection must **never** decide Layer-B context for a user-project goal (that would smuggle non-determinism into S32/S33). Optional retention/scope limits on what it records are the user's call.
- **Letta is the better candidate for a *different* concern — memory for the apps AIDOS *emits*** — pairing with the Doltgres emitted-app datastore (ADR 0006), not the Postgres truth-store. Deferred as its own decision.

## Open questions (resolve before the relevant step, not now)

- **Embedding model + dimension** for `brain.memory_item` — pin in an ADR before S31 codes (a model change later forces a reindex of the append-only table). Index = HNSW, distance = cosine, pgvector 0.8.x.
- **Confidence scale seam:** S31 stores a numeric confidence; KRD §138 / S33 filters on ordinal `observed_once | repeated | proven_by_sensor`. Pick one shape the store and router both speak, before S33.
- **Memory for emitted apps** (Letta + Doltgres) — decide as its own concern when emitted-app features are scoped.
