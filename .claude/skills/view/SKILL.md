---
name: view
description: Author a view/screen source (spec-écran — goal, zones, displayed data) as a Kernel source layer with its mirror. Use whenever a screen, panel, or Workbench route must be specified before it is built, a UI's goal/zones/displayed-data need to become a typed source, or someone is about to design what a screen shows and why.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# view (KRD gesture)

## Purpose

Author a **view source** — the *spec-écran* of one screen — as a Kernel **source layer** (a contract, N3), and give it its **mirror**. A view declares the screen's **goal** (the one job it does for the user), its **zones** (the regions that compose it), and its **displayed data** (which entity fields each zone reads). It is the *source* the front projection is emitted from (TS types + the route shell), never hand-built UI. Like every source, a view is a wish until a mirror proves it; this gesture produces the source draft **and** routes its mirror so the screen's goal is provable, not asserted.

> The wall (CLAUDE.md §2): this gesture never writes the `kernel`/`mirrors`/`fitness` schemas. It drafts a view source as an `idea`/changeset and routes the mirror via MCP. The only door to the kernel is `idea → mirror → /goal → human approval`.

## Design system & bilingue (always)

Every view is specified against two standing conventions, baked into the source and the mirror:

- **Design system (ADR 0010):** the screen renders on the Workbench tokens (ccup zinc + blue-600, Tailwind v4 + shadcn) — `bg-background`/`text-foreground`/`bg-card`/`border-border`/`text-muted-foreground`/`bg-primary`, radius via `rounded-lg`. **No hardcoded `zinc-*`/hex** in the emitted route; the theme is swappable in one file. The spec names zones in token terms, not raw colours.
- **Bilingue par défaut (ADR 0011):** every displayed label/string is **translatable, français par défaut + EN**. Static UI strings → a next-intl namespace in `messages/{fr,en}.json`; entity/content text → the Postgres `i18n.translation` table (FR required, FR fallback). The view source marks each `displayed_data` text field translatable; the mirror asserts the screen renders in `fr` (default) and that switching to `en` swaps the strings. Never bind a screen to a single-language literal.

## When to use

- A new screen/panel/Workbench route is needed and must be specified *before* anyone builds it (step loop point 7: "a UI at every step").
- A truth (entity / operation) needs a place to be *seen*, and you must decide what that screen's goal, zones, and displayed data are.
- An existing view source is being refined (a zone added, displayed data changed) — via a SemanticDiff, never a silent rewrite (§9).

## Inputs

- The sharpened intention (from `/grill-with-docs`) in **ubiquitous language**: what is this screen *for*?
- The **entities/operations** the screen displays or triggers — their Kernel ids, read-only from the base (`store` MCP). Never invented.
- The **target** (subsystem / cell) the screen belongs to and its `CONTEXT.md` — only from an existing target or a human-supplied hint.
- `CONTEXT-MAP.md` for the glossary (view vs emitted projection vs the Workbench panel).

## Outputs

- A **view source draft** recorded as an `idea`/changeset (via `idea-intake` / `changeset` MCP), shaped as:
  - `goal` — one sentence, the screen's single job (in ubiquitous language).
  - `zones[]` — named regions, each with its role.
  - `displayed_data[]` — per zone, the entity `field` references (resolved Kernel ids) and the operation(s) a zone can trigger.
  - `target` / `targetId` — only if resolved from an existing target.
- A **mirror** routed for it (see below) so the goal is provable.
- Zero or more **OpenQuestion** records for every gap (unknown entity field, unresolved target, ambiguous goal).

## BDD / mirror required before use

A view is a source, so — like every truth — it earns nothing until a mirror can go **red** on it. Author the draft, then route its mirror *before* any front code:

- **Journey (N0) → Gherkin** is the usual form: *Given* the screen's data, *When* the user opens the view, *Then* each zone shows its displayed data and the goal is reachable. Run by **Playwright + playwright-bdd** against the emitted route.
- **Workflow (N2) → fixture** when the screen is mostly a `state → command → events` flow (a wizard, a multi-step panel).
- Hand the form choice to `derive-mirror`, then the red source to `write-bdd-scenario`. This gesture ends at a routed-but-red mirror, never at green and never at front code.

## Steps

1. **State the goal in one sentence.** If the screen needs two sentences, it is two screens — split it, or raise an OpenQuestion.
2. **Resolve what it shows.** Confirm each entity/operation id via the `store` MCP. An undefined field or unknown operation → **OpenQuestion**, never a placeholder field.
3. **Decompose into zones.** Name each region by its role (e.g. `header`, `red-work-queue`, `detail`). Keep zones few and purposeful — a zone with no displayed data and no operation is dead weight.
4. **Bind displayed data per zone.** For each zone, list the resolved entity `field`s it reads and the operation(s) it can trigger. Bind only to ids that exist; gaps become OpenQuestions.
5. **Bound the target.** Set `target`/`targetId` only from an existing target or a human hint; otherwise leave empty + OpenQuestion.
6. **Record the source draft** as an `idea`/changeset via MCP (a recorded decision, append-only — not a kernel edit). Attach all OpenQuestions.
7. **Route the mirror:** hand to `derive-mirror` (form by nature) → `write-bdd-scenario` (red source). The red mirror **is** the `/goal` for building the screen.
8. **Hand off** to `/tdd` for the emitted projection + the Workbench route (don't touch existing routes) once the mirror is red.

## Stop conditions

- **Done is computed, not declared:** the view source has a one-sentence `goal`, ≥ 1 zone, displayed data bound to real entity ids (or OpenQuestions), and a mirror routed for it.
- Every zone has a purpose (data and/or an operation); no decorative-only zones.
- All ids `reflect`/bind to real Kernel truths; no invented fields, targets, or operations.
- You have written **no** front code and produced **no** green — this gesture ends at a red, routed mirror.

## Failure modes

- **Two-goal screen.** The goal needs an "and" → it is two views. Split it.
- **Invented field.** Binding displayed data to an entity field that does not exist in the base → monster. Leave empty + OpenQuestion.
- **Dead zone.** A zone with no displayed data and no operation. Remove it or justify it.
- **Source skips the mirror.** Drafting the view, then building the route with no red mirror → a wish, not a proof. Route the mirror first.
- **Hand-built UI.** Writing the Next component instead of the emitted projection → drift; the view is the source, the UI is its emission (§3, shared-source schema).
- **Wall breach.** Writing the view straight into `kernel`/`mirrors` → blocked; it belongs on an `idea`/changeset via MCP.

## Related hooks

- `pretooluse` — the wall: refuses any write to `kernel`/`mirrors`/`fitness`; route the view source via MCP.
- `stop` — completeness: a view source with no living mirror, or an orphan view-mirror, blocks the stop (a monster).
- `posttooluse` — sensors stay green at each diff (arch-fitness: the emitted route must not import outside its cell).

## Related MCP tools

- `store` — read entity/operation ASTs (read-only) to resolve the ids the view's displayed data binds to.
- `idea-intake` — record the view source draft + its OpenQuestions as a candidate-truth.
- `changeset` — wrap the source as a recorded, append-only decision (and a SemanticDiff when refining an existing view).
- `mirror-runner` — once the form is derived, store + materialize + run the screen's mirror (Playwright-bdd / fixture).
- `context` — resolve the `target`/`targetId` and reuse decisions against the ContextGraph.

## Workbench visualization

`front/web/app/<route>/` — the screen the view source emits to (one route per panel, never touch existing routes). The Workbench also surfaces the view source itself in a **Screens / Source** panel: its `goal`, `zones`, and bound `displayed_data`, with OpenQuestions flagged. Add/extend that route's **Playwright** e2e to assert each zone renders its displayed data and the goal is reachable.

## Honesty rules

Never invent a `target`, `targetId`, an entity field, or a business rule to complete a view — every gap (ambiguous goal, unknown field, unresolved target, undecided zone) becomes an **OpenQuestion** (an idea/provenance entry), never a guess written into the source.
