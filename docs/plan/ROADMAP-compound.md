# ROADMAP — COMPOUND : boucle qui capitalise (compound-engineering) (`/long-run`-exécutable, spike-gated)

> Sujet **CE** (ids `CE01+`). Lancer : `/long-run {planPath:'docs/plan/ROADMAP-compound.md', startFrom:'CE01'}`.
> **Spike-gate** : `CE01` mesure si un 2ᵉ goal similaire coûte moins après capture ; sinon arrêt.
> Discipline : **mirror-first** · **le mur** (capitalisation via `firewall.ViaIdea`→idée→miroir→/goal, JAMAIS `ToKernel`) · **determinism-first** (l'expansion d'une behavior est une fonction pure ; PAS d'apprentissage de la fitness §8).
> But (`everyinc/compound-engineering`) : chaque goal terminé **facilite le suivant**. S'appuie sur la **mémoire EXISTANTE** (claude-mem Layer A / pgvector Layer B — pas de nouvel outil) + les behaviors-macro (§24.6) + QD (`back/archive/qd`, promotion ssi `MirrorGreen`).

## CE01
**Objectif:** Spike — dans `/spike/compound/`, exécuter deux goals similaires et mesurer si capturer le motif du 1er réduit l'effort/tokens du 2nd ; go/no-go.
**Detail:** docs/plan/ROADMAP-compound.md
**Inputs:** S26, S31
**Criteres de done:** un spike confiné mesure le delta d'effort avec/sans capture ; verdict documenté (no-go ⇒ arrêt).

## CE02
**Objectif:** Runtime — ADR « boucle de capitalisation » : post-goal, le motif durable devient procédural+behavior réutilisable, via le mur, sans toucher la fitness.
**Detail:** docs/plan/ROADMAP-compound.md
**Inputs:** CE01
**Criteres de done:** ADR accepté + frontière claire (capitalisation ≠ apprentissage de critères ; tout via /goal) ∧ tracké Linear.

## CE03
**Objectif:** Runtime — gesture/skill `/compound` (fin de goal) : capture le motif en **mémoire procédurale** (`KindProcedural`) + propose une behavior candidate via `firewall.ViaIdea`.
**Detail:** docs/plan/ROADMAP-compound.md
**Inputs:** CE02, S31
**Criteres de done:** miroir fixture ROUGE d'abord — un goal vert produit une entrée procédurale + une idée draft `Status=proposed`, **aucune écriture kernel** (le mur).

## CE04
**Objectif:** Kernel — compléter les behaviors-macro (§24.6) : une behavior attachée s'expanse (fonction pure, dry-run) en attributs/relations/opérations/policies/fixtures.
**Detail:** docs/plan/ROADMAP-compound.md
**Inputs:** CE03
**Criteres de done:** miroir property ROUGE d'abord — l'expansion est déterministe (même behavior→même expansion) ∧ idempotente ∧ ne crée aucune vérité hors /goal.

## CE05
**Objectif:** Runtime + Workbench — le router/`MatchRole` réutilise behaviors+procédures aux goals suivants + panneau `/agents` « Compounding » + e2e + 2 pages Mintlify.
**Detail:** docs/plan/ROADMAP-compound.md
**Inputs:** CE04, S33
**Criteres de done:** fixture — un goal suivant similaire réutilise une behavior/procédure capturée (effort/tokens ▼) ∧ la route rend l'historique de capitalisation (thémée+bilingue) ∧ e2e vert ∧ pages live.
