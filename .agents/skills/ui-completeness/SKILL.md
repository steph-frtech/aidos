---
name: ui-completeness
description: The UI-reachability completeness law — every capability a step develops must be reachable AND executable from a Workbench screen (a control bound to its operation, with a Playwright mirror); every screen must also teach (a tutorial explaining the concepts + a worked example); and the home page is a re-questioned hub (« comment est codé AIDOS » · créer son app · le résultat de son app). No headless capability. Use at every step's UI phase, before declaring a step done, when auditing whether all operations are doable via the UI, or when the user says "tout doit se faire par écran / make every screen do every action / chaque écran doit avoir un tuto / is this op reachable in the UI?".
---

# ui-completeness (KRD gesture)

## Purpose

A capability that exists only in the backend — an MCP tool, an operation, a server action with no button — is a **headless capability**: a monster of the UI plane. AIDOS's rule is **« tout se fait par écran »**: every operation a step develops must be **reachable** (a control exists on a Workbench screen) **and executable** (triggering the control actually performs the operation, proven by a Playwright mirror). This gesture is the completeness law applied to the UI: it pairs every operation with a control+action+mirror, and blocks the step until the set is complete.

It is the sibling of [check-completeness](../check-completeness/SKILL.md) (truth ↔ mirror): there, no truth without a living mirror; here, **no operation without a living screen-action**.

> The wall (CLAUDE.md §2) is NOT weakened by "everything via screen". A truth-write is reachable via the UI as a **propose → ChangeSet → human approval** control — never a direct write from the screen. Below-the-line ops (e.g. the `archive` content store) are direct actions through the op's handler. See "Wall reconciliation" below.

## When to use

- The UI phase of a step (CLAUDE.md §6 step 7): not just a read-only route — every op the step added must have its control + action + e2e.
- Before declaring a step done: run the audit; a headless op blocks the step.
- When the user asks to make a screen action-capable, or asks "can I do X from the UI?".

## The audit (what it computes)

1. **Enumerate the step's operations.** Every backend op the step introduced: MCP tools (`back/mcp/<name>` — ADR 0009: every op is an MCP tool), operation-specs, server actions, route handlers. This is the op set `O`.
2. **For each op `o ∈ O`, find its control.** A control = a button/form/menu on a Workbench screen (`front/web/app/<route>/`) bound to `o` via an **action-spec** (the `action` gesture: control → operation, `on_success`/`on_error`). Missing control ⇒ **headless capability** (a gap).
3. **Classify the action path by the wall:**
   - **Below the line** (archive store, projections, read ops): the control triggers `o` directly (a server action / MCP call). Real, executable now.
   - **Above the line** (writes to `kernel`/`mirrors`/`fitness`): the control MUST trigger the **propose → ChangeSet → approval** flow, not a direct write. A control wired to write truth directly ⇒ **wall breach** (block, not a pass).
4. **Require a living mirror per control.** A **Playwright** e2e that drives the control and asserts the operation happened (the side effect is visible / the success path renders). A control with no e2e is asserted, not proven.
5. **Report coverage** `op → control → screen → mirror`, with every gap flagged.

## Stop conditions (done is computed)

The UI plane of a step is complete iff:
- Every op in `O` has a control on a screen (no headless capability), **and**
- Each control's action respects the wall (below-line = direct; above-line = propose-ChangeSet), **and**
- Each control has a green Playwright mirror proving it executes, **and**
- **Each screen teaches** — it carries a **tutorial** (explains the concepts) **and a worked example**, bilingual and tested (see below), **and**
- **The home page is the re-questioned hub** with its three zones (see below).

Else the step is **not done** — the gap is a UI-monster, surfaced like a completeness violation.

## Forward-dependency (bootstrap exception)

If an above-the-line action's path is not built yet (the `idea-intake`/`changeset` engine arrives at S20/S27), the control is still **present** on the screen, but its handler is a **documented stub** that records an OpenQuestion ("propose-ChangeSet wired at S20") and disables/marks the action « à venir ». This is a by-design forward-dependency (CLAUDE.md §6) — it does NOT block the step, but the control must exist and the gap must be recorded. Never silently omit the control.

## Wall reconciliation (the key rule)

| Op writes to | UI control does | Executable now? |
|---|---|---|
| `archive` (content store), read ops, projections | the operation directly (server action / MCP) | yes |
| `kernel` / `mirrors` / `fitness` (truth) | opens a **ChangeSet proposal** (idea → mirror → /goal → approval) | only once S20+ exists; until then the control is present + stubbed + OpenQuestion |

"Tout réalisable via écran" = every op has a control and is **triggerable through its legitimate path** — a direct action below the line, a governed proposal above it. The screen never bypasses the wall.

## Chaque écran est auto-pédagogique : tutoriel + exemple

Un écran qui ne montre que des contrôles ne suffit pas — il doit **enseigner**. **Tout** écran du Workbench porte, en plus de ses contrôles, deux choses :

1. **Un tutoriel** — un panneau (« Tutoriel », un `<Steps>`/accordéon) qui explique, dans le **langage ubiquitaire** (FR par défaut + EN), les **concepts** que l'écran incarne : ce que c'est, pourquoi ça compte, le vocabulaire. Le concept d'abord, pas le jargon d'implémentation.
2. **Un exemple** — un **exemple concret et travaillé** de la capacité : un échantillon illustratif pré-rempli **ou** un mini-walkthrough « essayez ceci » qui démontre l'opération de bout en bout (exécutable quand l'op est sous la ligne).

Tutoriel et exemple sont **bilingues** (ADR 0011) et **tokenisés** (ADR 0010), exposés par un `data-testid`, et le **mirror Playwright assère qu'ils s'affichent**. Un écran sans tutoriel **ni** exemple est **incomplet** — au même titre qu'une capacité headless.

## La page d'accueil — le hub (toujours re-questionnée)

La page d'accueil (`/`) n'est **jamais figée** : à **chaque étape**, elle est **refaite et re-questionnée** — « reflète-t-elle ce qu'AIDOS sait faire *maintenant* ? ». C'est un livrable vivant, jamais laissé périmé. Elle présente **trois zones** (chacune marquée « à venir » honnêtement tant que sa substance n'est pas construite) :

1. **« Pour moi » — comment est codé AIDOS** : la vue interne du build d'AIDOS lui-même (le contrat, noyau/miroir/archive, le DAG, les étapes) — liens vers les panneaux internes (`/contract`, `/store`, `/records`, …) et la doc « Pour moi » (Mintlify).
2. **AIDOS — créer votre application** : la vraie surface produit, **tout ce qu'il faut pour qu'un utilisateur construise son application** (les gestes, le cycle KRD, les panneaux pour décrire entités/opérations/vues/actions et piloter le build) — lien vers le guide « Pour les futurs utilisateurs ».
3. **Le résultat de votre application** : l'**app émise** et son **résultat** (aperçu / exécution / inspection de la projection qu'AIDOS a produite — web/mobile/cli/api/db).

Comme tout écran, le hub est tokenisé + bilingue et porte son **tutoriel + exemple**. Les zones non encore construites (créer-son-app, résultat) affichent un état « à venir » honnête avec un lien vers la doc — jamais une fausse promesse.

## Outputs

- A **coverage report**: for the step, the list `op → control(screen) → action-spec → mirror`, and the gaps (headless ops, wall breaches, missing mirrors).
- For each gap: a fix (add the control via the `action`/`view` gestures, route the mirror via `derive-mirror`/`write-bdd-scenario`) or an OpenQuestion (forward-dep).

## Related

- `action` — author the control-spec + action-spec (control → operation) that this gesture requires.
- `view` — the screen the control lives on (themed + bilingual: ADR 0010/0011).
- `check-completeness` — the truth↔mirror sibling; this is the op↔screen-action law.
- `playwright-e2e` — the mirror that proves the control executes.
- MCP: `mirror-runner` (run the e2e), `store`/others (the ops being surfaced).
