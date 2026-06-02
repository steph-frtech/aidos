# PreToolUse hook — the wall (LIVE, S04)

> **Status: LIVE.** This is level 1 of the AIDOS wall (CLAUDE.md §2,
> defense-in-depth). It is activated and **fault-injection-tested** at S04 — a
> hook that never fires is dead (§5 hook-honesty).

## Role

The single permission boundary the Runtime mechanically enforces: the agent
writes **projections** (below the waterline), **never** the truth schemas above
it (`kernel` / `mirrors` / `fitness`). A write above the line is **refused** with
an actionable `BlockReason` (code `AGENT_WRITE_ABOVE_WATERLINE`).

## How it fires

- **Phase:** `PreToolUse` — *before* a tool call that would write.
- Reads a JSON event on **stdin** (`tool_name` + `tool_input.file_path`, or a flat
  `path` / `schema`), classifies the write target against the waterline, and:
  - **deny** (exit `2`) above the line → writes the `BlockReason` JSON to stdout;
  - **allow** (exit `0`) below the line → silent.
- **Fail-closed:** an undecodable event is denied (no unparseable write slips by).

## The waterline classifier

`Classify(target string) Decision` is a **pure, total** function (determinism-first,
CLAUDE.md §6/§8): same target → same verdict, no clock/rng/I/O. Deny **iff** the
target resolves to a zone above the line:

- schema names / schema-qualified tables: `kernel`, `kernel.truth`, `mirrors`,
  `mirrors.mirror`, `fitness`, `fitness.waterline`;
- on-disk truth source paths: `back/kernel/**` (which by **ADR 0002** covers
  `back/kernel/mirror/**`), `back/migrations/**`.

Everything else (`back/gen/**`, `front/web/**`, `archive`/`changesets`/`dag`/
`ideas`/`provenance`, docs…) is **allowed**.

## BlockReason emitted

```json
{
  "code": "AGENT_WRITE_ABOVE_WATERLINE",
  "severity": "error",
  "explanation": "Refus du mur : l'agent ne peut pas écrire au-dessus de la ligne de flottaison …",
  "how_to_fix": [
    "… créez une idea (candidate-truth) dans le schéma ideas.",
    "Écrivez son mirror (Gherkin / property / fixture) — le rouge est le /goal.",
    "Ouvrez un /goal et obtenez l'approbation humaine : idea → mirror → /goal → approbation.",
    "Le ChangeSet approuvé est appliqué par le rôle `aidos` — la seule porte vers le noyau."
  ]
}
```

The only door to the kernel: **idea → mirror → /goal → approval**.

## Level 2 — the Postgres GRANTs (fail-closed backstop)

Even if this hook is bypassed, the agent DB role (`aidos_agent`) has **no**
`INSERT/UPDATE/DELETE/TRUNCATE` on `kernel` / `mirrors` / `fitness`
(`back/migrations/wall_grants_baseline.sql`). Only the `aidos` writer role
(approved ChangeSet) writes truth.

## Mirrors (the proof the wall fires)

- **Journey (Godog, N0):** `tests/runtime/wall.feature` — deny kernel/mirrors/
  fitness, allow below — driven by `wall_bdd_test.go`.
- **Invariant (rapid, N1):** `wall_property_test.go` — deny **iff** above the line;
  no third verdict; deny ⇒ code `AGENT_WRITE_ABOVE_WATERLINE`.
- **Fault-injection (Testcontainers, level 2):** `wall_grant_injection_test.go` —
  `aidos_agent` INSERT → permission denied; `aidos` INSERT → ok.
- **Unit (N4):** `wall_test.go` — event decode + the Run→exit-code wiring.

Fault-injection of level 2 is honest: removing a REVOKE in the migration turns the
agent-deny test **red** (`WALL BREACH …`); restored → green.

## Workbench

`/wall` (`front/web/app/wall/`) visualizes the waterline + the block-event feed
(read-only — the wall is enforced here, never operated from a screen).
