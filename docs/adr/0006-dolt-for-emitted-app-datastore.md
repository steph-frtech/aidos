---
status: accepted
---

# Emitted apps run on Doltgres — one Postgres dialect everywhere, git-for-data on the product's data

There are **two distinct databases**, both speaking the **Postgres dialect**:

1. **The AIDOS truth-store** — the OS's own governance base (`kernel · mirrors · ideas · changesets · dag · brain · context · fitness`). Always **Postgres** (ADR 0004): pgvector for `brain`, sqlc/pgx/Atlas, the wall via GRANTs, single-writer at human-approval cadence.
2. **The emitted-app datastore** — the **runtime database of an application AIDOS builds for a user** (the "BDD du résultat codé"), living in that user's workspace, not in this repo. We adopt **Doltgres** (Dolt's Postgres-wire build) as the first-class **data-versioning emitter target**: git-for-data — branch / merge / diff / `as of` time-travel / content-addressed prolly-tree storage — on the *built product's* data.

We chose **Doltgres over Dolt-MySQL** so the **whole system stays one dialect (Postgres)**: the db-projection emitter reuses the **same sqlc + pgx + Atlas** tooling for both the Postgres truth-store and the Doltgres emitted-app store — **no MySQL split**, one mental model, one set of generators. The one scenario that genuinely needs a versioned database — *large operational datasets with cheap data-scale branching, time-travel and audit* (the "projets énormes") — is the emitted product's data, and Doltgres serves it in the Postgres dialect.

## Considered Options

- **Dolt (MySQL-flavored, mature) for emitted apps.** Rejected: forces a **MySQL dialect** for the emitted store (sqlc-mysql + Atlas-mysql), fragmenting the emitter into two dialects. Maturity is higher, but the dialect split costs more than it is worth given everything else is Postgres.
- **Plain Postgres for emitted apps.** Kept only as a **fallback target** (`replaceable` slot) for apps that need no data versioning or need heavy write concurrency / pgvector that Doltgres lacks today. Rejected as *the* versioning answer: vanilla Postgres gives the built app no cheap data-scale branching/time-travel.
- **Doltgres (Postgres-wire Dolt) for emitted apps (chosen).** One dialect end-to-end, git-for-data on the product's data, same sqlc/pgx/Atlas. We **knowingly accept Doltgres's beta status here** because this is the *emitted product's* data (not the OS truth-store), the slot is `replaceable` (per-app fallback to plain Postgres), and it is validated by a spike before we build on it.

## Consequences

- **Blast radius is the emitter/target slots only.** Frozen-stack slot (ADR 0003): *Emitted-app datastore (data-versioning target) = **Doltgres**, `replaceable`*. The OS truth-store steps stay Postgres and are **unchanged** (S01/S20/S24/S25/S26/S31). Affected: **S34 (emitters)** register a Doltgres target; **S37 (db-projection)** emits **Postgres-dialect** schema/migrations validated against **Doltgres in Testcontainers** (reusing sqlc/pgx/Atlas, no MySQL); **S46 (targets registry)** registers Doltgres as a data-store target.
- **One dialect, reused tooling.** Because Doltgres is Postgres-wire, the same source entity emits one Postgres-dialect schema for both stores; the emitter does not learn MySQL.
- **Doltgres beta caveats are the emitted product's concern, flagged and gated.** As of 2026-05 Doltgres is beta (no GA, ~5.2× slower, no pgvector, thread-unsafe parser under concurrent pgx #2581, missing lock primitives #2600). For the emitted app these are tolerable and bounded: the slot is `replaceable` (fall back to plain Postgres per app), an app needing embeddings adds a Postgres+pgvector sidecar, and a **spike validates sqlc/pgx/Atlas against Doltgres** when S37 is reached. They do **not** touch the OS truth-store (ADR 0004 keeps it on Postgres precisely because of these gaps).
- **KRD invariants unaffected.** Mirrors, changesets, the version DAG, and the wall live in the Postgres truth-store; the emitted app's Doltgres data versioning is a *product* capability governed by the same mirrors/contracts as any projection — never a second truth-store.

## Open questions (resolve when S34/S37/S46 are reached)

- Is Doltgres the **default** emitted-app datastore, or **opt-in** alongside a plain-Postgres target (for apps needing heavy concurrency or pgvector)?
- If the emitted app needs vector/embedding data, does that part run on a Postgres+pgvector sidecar (Doltgres lacks pgvector) or Dolt-native `VECTOR` (reduced)?
