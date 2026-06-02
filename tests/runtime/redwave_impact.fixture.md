# Red-wave impact fixture (state links+heads → command bump → events ordered red set)

- reflects: `runtime.redwave.Impact` / `runtime.redwave.Enqueue`
- test_kind: fixture (N2, KRD §42/§98 — la vague de rouge)
- cert_language: operation-dsl/go
- liveness: live
- authority: above (the human's rule — an entity change reddens api/db/types; a button
  reddens its view iff load-bearing; the wave STARTS at the mirror; KRD §42/§98/§112)

> Conceptually stored in the `mirrors` schema; persisted to Postgres at S06 (bootstrap
> exception). This file is the **lien porteur**: `semanticdiff`-style materialized source
> that the Go fixture interpreter (`redwave_fixture_test.go`) loads row by row. If the
> fixture intention disappears the test breaks (no silent rot into a monster).

The targets (`Order`, `Order.schema.fixture`, `api`/`db`/`types`, `submit-btn`,
`createOrder`, `checkout-view`, `label-btn`) are **reused** from the prior steps' pinned
example artifacts (S11/S17/S21) — the agent coins no new target, no new kind, no new
business rule. The wave is **exactly** the set of stale links after the bump (§42),
ordered **mirror-first** (§42/§98). "Load-bearing" is the **declared composes weight**
(S18/S19, §112; ADR 0020) carried on the edge, not invented here.

---

## Fixture A — an entity bump reddens its mirror FIRST, then api/db/types (THE done criterion, part 1)

- state (links + heads):
  - `Order.schema.fixture@v1  -mirrors->     Order@v1`   (the mirror reflects the entity)
  - `api@v1                   -derives_from-> Order@v1`
  - `db@v1                    -derives_from-> Order@v1`
  - `types@v1                 -derives_from-> Order@v1`
  - heads after the bump: `Order=v2` (the others unchanged)
- command (bump): `Order  v1 → v2`
- events:
  - the wave STARTS at `Order.schema.fixture` (the mirror), then `{api, db, types}` are red
  - order is **mirror-first**: index(mirror) < index(api) < index(db) < index(types)
  - every item `reason == version_stale`
  - the wave has exactly 4 items (one per stale link, §42)

## Fixture B — a load-bearing button change reddens its view (THE done criterion, part 2)

- state (links + heads):
  - `submit-btn@v1     -binds->        createOrder@v1`
  - `checkout-view@v1  -derives_from-> submit-btn@v1`  (load-bearing)
  - heads after the bump: `submit-btn=v2`
- command (bump): `submit-btn  v1 → v2`
- events:
  - `checkout-view` is red (the view's render depends on the load-bearing button)
  - `checkout-view` reason == version_stale

## Fixture C — a cosmetic button change does NOT redden the view (the negative)

- state (links + heads):
  - `checkout-view@v1  -derives_from-> label-btn@v1`  (cosmetic — NOT load-bearing)
  - heads after the bump: `label-btn=v2`
- command (bump): `label-btn  v1 → v2`
- events:
  - `checkout-view` is NOT in the red set (a cosmetic change has empty downstream beyond itself)
  - the only red item is `label-btn`'s own mirror, if any; the view is green

## Fixture D — the wave is enqueued as `open` RedWorkItems

- command (bump): `Order  v1 → v2` (the Fixture A graph)
- events:
  - `red_work_queue` has exactly one row per red item (|wave| rows)
  - every row `status == open`
  - every row `owner_agent == null`, `lease_until == null`
  - every row `wave_id == the bump hash`
  - the targets include the `mirror_id` (`Order.schema.fixture`) FIRST

## Fixture E — no bump ⇒ empty wave, queue unchanged

- command (bump): none (the bumped set is empty)
- events:
  - the wave is empty
  - `Enqueue` writes 0 rows (red_work_queue unchanged)
