---
name: besoin-capitalisation
description: The need-capitalisation /compound-besoin-capitalisation gesture (EL18) — at a FULLY-RESOLVED BesoinGraph, capitalise the need: capture (a) the resolved graph as a REUSABLE ANCHOR (graph_hash + canonicalised (level, normalized-intent-hash) keys) and (b) the resolution motif as procedural memory + a candidate besoin-behaviour, STRICTLY via firewall.ViaIdea — NEVER ToKernel, NEVER fitness. Use when the user wants to capitalise a resolved need, "compound the need across apps", reuse a prior elicitation, measure cross-app reuse of a BesoinGraph, or hand a resolved need's anchor to a second similar need. The capitalised idea's provenance reconstructs down to the graph_hash (carried in the memory's free-text provenance). Cross-app reuse is a deterministic NAME-MATCH on canonicalised keys (a similar need replays ≥1 unit at ReplayCost; a dissimilar need fabricates NO reuse — the anti-false-positive frontier). The capture is PURE code (anchor extraction, key normalisation, CE05 reuse routing) — no LLM enters. Writes NO truth (WroteKernel always false); promotion stays /goal.
---

# besoin-capitalisation — capitaliser le besoin résolu (EL18)

> La **capitalisation du besoin** — le `/compound` appliqué à l'élicitation. À la résolution complète d'un BesoinGraph, le motif durable devient **capital réutilisable** — mais **uniquement via le mur** (`firewall.ViaIdea`), **jamais** `ToKernel`, **jamais** la fitness.

## Quand l'utiliser

- L'utilisateur veut **capitaliser un besoin résolu** (en faire une ancre réutilisable).
- « compound le besoin à travers les apps », « réutiliser une élicitation antérieure ».
- **Mesurer la réutilisation cross-app** d'un BesoinGraph sur un second besoin similaire.
- Passer l'ancre d'un besoin résolu à un second besoin (le compound **dans le temps**).

## Ce que le geste capture (à la résolution complète)

1. **(a) l'ancre réutilisable** — le `graph_hash` + les **clés canonicalisées** `(level, normalized-intent-hash)` (une `AnchorUnit` par rung SOURCE **mappant** résolu ; les rungs NoEmit `journey`/`view` seedent les ancres mais ne portent pas d'unité réutilisable).
2. **(b) le motif de résolution** — une mémoire `KindProcedural` (fuel `/brain` sous la ligne) + une **behavior-besoin candidate** = un Idea `draft` proposé **via `firewall.ViaIdea`**.

## Les invariants porteurs (le miroir les épingle)

- **Le mur** : `CapitaliseBesoin` n'appelle **JAMAIS** `firewall.ToKernel`, ne touche **JAMAIS** la fitness (poids déclarés, §8). `WroteKernel` **toujours false**. L'idée est un `draft` sans version ni miroir ; sa promotion reste `/goal`.
- **Honnêteté de provenance** : `firewall.ViaIdea` fige `Detail:"memory:<id>"` (artefact du mur) — il n'existe **aucun** slot `provenance: besoin:<graph_hash>` libre. On porte donc le `graph_hash` **dans le champ libre `MemoryItem.Provenance`** (`"besoin:<graph_hash>"`), de sorte que la provenance de l'idée **se reconstruit jusqu'au `graph_hash`** (via `ParseGraphHash`) — sans toucher `ViaIdea`.
- **Honnêteté de réutilisation** : le reuse-router CE05 est un **name-match** ; la réutilisation cross-app n'est fiable que sur des **clés canonicalisées** `(level, normalized-intent-hash)` (`CanonicalIntentKey`). Un second besoin similaire (variations de casse/espaces/ponctuation) réutilise ≥1 unité (`ReplayCost`) ; un besoin dissemblable ne fabrique **AUCUNE** réutilisation (`DeriveCost`) — la **frontière anti-faux-positif**.
- **Déterminisme** : l'extraction de l'ancre, la normalisation des clés, le routage de réutilisation sont des **fonctions pures** — aucun LLM ne re-juge l'ancre. Même `BesoinResolve` → même capture (ids content-adressés stables).

## Procédure

1. Vérifier que le BesoinGraph est **entièrement résolu** (`IsFullyResolved` : chaque rung SOURCE présent est `resolved`, ≥1 rung mappant). Sinon, le geste **capitalise rien** (la porte « green » d'EL18).
2. Appeler `besoin.CapitaliseBesoin(BesoinResolve{Graph, Branch})` (Go) **OU** l'outil MCP `besoin_capitalise` (`{project, reuse_against?}`).
3. Lire l'ancre (`graph_hash` + `AnchorUnits`), la behavior-besoin candidate (un `draft` via le mur), et vérifier `WroteKernel == false`.
4. Pour mesurer la réutilisation : router un second besoin résolu contre l'ancre (`anchor.ReuseFor(next)` / `reuse_against`) — le name-match CE05 sur les clés canonicalisées.

## RÉUTILISE (zéro réinvention)

- `back/runtime/compound` (CE03 `Compound`, CE05 `Reuse`) — la boucle de capitalisation + le reuse-router.
- `back/kernel/behavior` (CE04 `Expand`) — l'expansion behavior-macro (fonction pure).
- `back/archive/brain/firewall` (`ViaIdea`, `MemoryItem.Provenance` champ libre) — la **seule** porte du mur.
- `back/kernel/records` (`Hash`) — l'adressage par contenu, jamais forké.

## Le mur (rappel)

Le geste **PROPOSE** (un Idea draft via `ViaIdea`), il **n'écrit jamais** le kernel/mirrors/fitness. La promotion en vérité reste l'écriture du miroir via `/goal`. Above the line uniquement.

## Surfaces

- Go : `back/runtime/besoin/capitalisation.go` (autorité) + `capitalisation_property_test.go` + `capitalisation_fixture_test.go`.
- MCP : `besoin_capitalise` (`back/mcp/besoin-intake/main.go`, ADR 0009).
- TS twin (byte-équivalent) : `front/web/lib/besoin-capitalisation.ts` + `.test.ts`.
- Workbench : `/compound-besoin-capitalisation` (action-capable, thémé ADR 0010, bilingue ADR 0011) + Playwright `tests/e2e/compound-besoin-capitalisation.spec.ts`.
