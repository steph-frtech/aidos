# Mirror · kernel.composes.Aggregate · fixture (composes DAG + own_mirror verdicts → aggregate)

- reflects: `kernel.composes.Aggregate` (the 7th link + the recursive completeness law, KRD §108–§112)
- test_kind: `fixture`
- cert_language: `fixture` (the recursive `Aggregate` is interpreted in Go; the fixture IS the compositional-truth form)
- liveness: `live`
- authority: `above` (the recursive RULE — a composite is green iff its own mirror AND all its
  children are green — is the human's, KRD §109; the SPECIFIC edges/weights/thresholds of a real
  project are human-declared truths, NOT invented here)

This is the materialized, human-readable form of the **compositional-truth aggregate** mirror;
the runnable mirror is `back/kernel/composes/composes_fixture_test.go`. Conceptually this record
lives in the `mirrors` Postgres schema and is persisted there at S06 (bootstrap exception — the
schema predates this step; until the back-fill the file + the Go test ARE the red→green proof,
CLAUDE.md §6 bootstrap exception).

It is the **lien porteur**: the test loads these rows; if the fixture intention disappears, the
test breaks (the mirror cannot silently rot into a monster).

## Ubiquitous language (CONTEXT.md, /grill-with-docs)

- **composes (the 7th link)** — the *mereology* link: a whole contains a part, versioned and
  **weighted** (`load-bearing | cosmetic`). `truth(composite) = Σ truths(parts) + own emergent
  truth`. *Down is a constraint the agent reconciles; up is a signal that may need human override;
  weights are DECLARED, never learned* (KRD §108, §112).
- **own_mirror(L)** — L's own *emergent* mirror verdict (`GREEN | RED`), computed by S06's
  completeness law over L alone. The aggregate **consumes** it; it never re-derives or re-types it.
- **aggregate_complete(L)** (KRD §109) — `own_mirror(L)==GREEN ∧ ∀ child via composes(L) :
  aggregate_complete(child)`. A red child reddens the aggregated parent. *THE done criterion.*
- **activation / activation_threshold** (KRD §112) — when children change, `activation ←
  Σ weight(load-bearing children changed)`; the parent's aggregate reopens only when
  `activation ≥ activation_threshold`. A **cosmetic** change stays below threshold and does NOT
  redden the parent — « épingle un défaut, pas un changement ».
- **drill-down / fall-back-up** (KRD §110) — a red parent drills down to the red child that caused
  it; a red leaf tints its load-bearing ancestors red up to threshold.
- **cycle** — `composes` is a **DAG** over layers. A cycle is a typed error (an OpenQuestion),
  never a silent infinite recursion, never an invented edge.

The worked KRD §114 example shape is `product → journey → view → control` (a composite chain).

## fixture rows: composes DAG + per-node own_mirror (state) → Aggregate verdict (event)

The DAG (edges are `parent → child`, weight in brackets):

```
P → C1 [load-bearing]
P → C2 [cosmetic]
```

P.activation_threshold = `1.0` (load-bearing weight = `1.0`, cosmetic weight = `0.0` — declared).

| # | own_mirror verdicts | changed children | then Aggregate(P) | why |
|---|---|---|---|---|
| 1 | P=GREEN, C1=GREEN, C2=GREEN | — | `GREEN` | own mirror green ∧ all children green (§109) |
| 2 | P=GREEN, C1=RED, C2=GREEN | C1 (load-bearing) | `RED` | **THE done criterion** — a red load-bearing child reddens the parent; drill-down names C1 |
| 3 | P=RED, C1=GREEN, C2=GREEN | — | `RED` | own mirror red ⇒ aggregate red even with all children green |
| 4 | P=GREEN, C1=GREEN, C2=GREEN | C2 (cosmetic) | `GREEN` | a cosmetic change below threshold (activation 0.0 < 1.0) does NOT redden the parent (§112) |
| 5 | cycle: P→C1, C1→P | — | `cycle error` | a cycle yields a typed error naming the layers, never infinite recursion / an invented edge |

- **Row 2 is THE done criterion**: a red **load-bearing** child reddens the aggregated parent, and
  the drill-down path names the red child (C1).
- **Row 3** proves the own invariant alone is not enough in the other direction either: a red own
  mirror reddens the aggregate even when every child is green.
- **Row 4** proves **cosmetic isolation**: a change confined to a cosmetic child keeps `activation`
  below `activation_threshold`, so the parent stays GREEN (the own mirror is green, no child is
  red). « épingle un défaut, pas un changement. »
- **Row 5** proves the **cycle guard**: a typed error, never a hang, never a fabricated edge.

These rows are **means-tests toward the human red** (a red child reddens the parent) — not a new
truth the agent invents and then grades (CLAUDE.md §8). The weights (`1.0`/`0.0`) and the
threshold (`1.0`) are **example-only** declared values; a real project's weights/thresholds are
human-declared above the line (honesty rule — never guessed, never learned).
