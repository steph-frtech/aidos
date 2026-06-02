# Mirror · kernel.links.Resolve · fixture (heads → link → status)

- reflects: `kernel.links.Resolve` (the six versioned link types, KRD §41)
- test_kind: `fixture`
- cert_language: `fixture` (the link `Resolve` is interpreted in Go; the fixture IS the staleness truth form)
- liveness: `live`
- authority: `above` (the staleness RULE — a link to an absent version is red — is the human's, KRD §41–§42: « tout pointe vers une VERSION, jamais une identité »)

This is the materialized, human-readable form of the **versioned-links staleness** mirror;
the runnable mirror is `back/kernel/links/links_fixture_test.go`. Conceptually this record
lives in the `mirrors` Postgres schema and is persisted there at S06 (bootstrap exception —
the schema predates this step; until the back-fill the file + the Go test ARE the
red→green proof — CLAUDE.md §6 bootstrap exception).

It is the **lien porteur**: the test loads these rows; if the fixture intention disappears,
the test breaks (the mirror cannot silently rot into a monster).

## Ubiquitous language (sharpened in /grill-with-docs)

- A **link** points at a **VERSION** (`id@version`), **never** a bare identity — that is the
  whole point (KRD §41). The `to` ref is the **pinned** target.
- The six link kinds are a **CLOSED set**: `projects_to`, `derives_from`, `contracts_with`,
  `triggers`, `binds`, `mirrors` (KRD §41). An unknown kind is **rejected** at `Validate`.
- **green** = the link is pinned **exactly** to the current head of its target.
- **stale** (red) = the target exists, but the link is pinned to a version that is **no
  longer head** (the consumer pinned to an outdated version — the red wave, KRD §42).
- **absent** (red) = the target has **no head at all** (the version is gone / never existed):
  the link **dangles loudly**. *A link to an absent version is red* — THE done criterion.
- `heads` is the map `targetId → headVersion` (where the head comes from — the DAG head
  resolution — is owned by a later step; here it is handed in, so `Resolve` is pure).

This step delivers the link **substrate + its staleness check** (`Resolve`), NOT the
per-kind behaviour (`triggers`/`binds`/`mirrors` semantics are owned by S11/S06 and only
referenced) and NOT the full red-wave/impact computation across the DAG (a later step).

The example targets (`createOrder`, `checkout-submit`, `checkout-button`) are **reused** from
S11's pinned artifacts — no new target is coined.

## fixture rows: heads (state) + link {kind, from, to} (command) → status (event)

| # | given heads | given link {kind, from, to} | then status | why |
|---|---|---|---|---|
| 1 | `{ createOrder: v3 }` | `{binds, checkout-submit@v1, createOrder@v3}` | `green` | pinned exactly to head |
| 2 | `{ createOrder: v3 }` | `{binds, checkout-submit@v1, createOrder@v2}` | `stale` | pinned to a non-head version (§41) |
| 3 | `{ }` (createOrder absent) | `{binds, checkout-submit@v1, createOrder@v3}` | `absent` | **THE done criterion** — link to an absent version is red |
| 4 | — | `{mirrors, checkout-button@v1, checkout-button-fixture}` (unpinned `to`) | `Validate rejects` | an unpinned link is itself a monster |
| 5 | — | `{depends_on, a@v1, b@v1}` (unknown kind) | `Validate rejects` | unknown link kind (closed set) |

- **Row 3 is THE done criterion**: a link to an **absent** version (`heads` has no entry for
  the target) is `absent` — **red**. The link dangles loudly; it is never silently green.
- Row 4 proves an **unpinned** `to` (no `@version`) is refused at `Validate` (an unpinned
  link cannot be resolved — it is a monster), not evaluated.
- Row 5 proves the **closed set**: `depends_on` is not one of the six kinds, refused at
  `Validate`.

These rows are **means-tests toward the human red** (a link to an absent version is red) —
not a new truth the agent invents and then grades.
