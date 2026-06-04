# ROADMAP — FONCTIONNEL : mandat de code émis fonctionnel (Understand-Anything) (`/long-run`-exécutable, spike-gated)

> Sujet **FN** (ids `FN01+`). Lancer : `/long-run {planPath:'docs/plan/ROADMAP-functional.md', startFrom:'FN01'}`.
> **Spike-gate** : `FN01` émet le slice checkout en fonctionnel pur ; si infaisable/sans valeur → arrêt.
> **Scope tranché : le code ÉMIS (app de l'utilisateur) seulement** — PAS le Go d'AIDOS lui-même.
> Discipline : **mirror-first** · **le mur** · **determinism-first** (la pureté EST le mandat de déterminisme appliqué à la sortie ; règle arch-fitness fail-closed, jamais un jugement LLM).
> Intention (`Lum1104/Understand-Anything`) : **chaque fonction = une couche + un nœud de graphe ; style fonctionnel ; AUCUNE variable globale mutable ; code-par-fonction-graphe acyclique**.

## FN01
**Objectif:** Spike — dans `/spike/functional/`, ré-émettre le slice checkout (S46) en style fonctionnel pur (fonctions pures, zéro globale, composition explicite) ; mesurer faisabilité/coût ; go/no-go.
**Detail:** docs/plan/ROADMAP-functional.md
**Inputs:** S34, S46
**Criteres de done:** un spike confiné prouve qu'un émetteur peut produire le slice en fonctionnel pur ; verdict documenté (no-go ⇒ arrêt).

## FN02
**Objectif:** Runtime — ADR « mandat fonctionnel du code émis » (comme determinism-first, un mandat) : pur, no-global, graphe acyclique typé, sur l'arbre `gen/`.
**Detail:** docs/plan/ROADMAP-functional.md
**Inputs:** FN01
**Criteres de done:** ADR accepté définissant les invariants émis + leur portée (`gen/` uniquement) ∧ tracké Linear.

## FN03
**Objectif:** Runtime — étendre les émetteurs (`back/runtime/generators`) pour émettre du code fonctionnel pur (Go/DDL/TS) + miroir de pureté.
**Detail:** docs/plan/ROADMAP-functional.md
**Inputs:** FN02, S34
**Criteres de done:** miroir property ROUGE d'abord — chaque fonction émise est pure (même entrée→même sortie), aucune var mutable de module ; re-émission byte-identique (déterminisme S34 préservé).

## FN04
**Objectif:** Runtime — règles arch-fitness `EMITTED_NO_GLOBAL_MUTABLE` + `EMITTED_FUNCTION_PURE` + `EMITTED_CALL_GRAPH_ACYCLIC` (étend `agentloop/archfitness.go` + `arch-fitness.json`) + fault-injection.
**Detail:** docs/plan/ROADMAP-functional.md
**Inputs:** FN03
**Criteres de done:** miroir fault-injection ROUGE d'abord — injecter une globale/un cycle dans `gen/` → la règle passe rouge ; fail-closed, déterministe (depguard/go-arch-lint), jamais un jugement.

## FN05
**Objectif:** Runtime — index call-graph (style Understand-Anything) de l'app émise, fourni comme **contexte de l'agent** (complète le ContextRouter S33).
**Detail:** docs/plan/ROADMAP-functional.md
**Inputs:** FN04, S33
**Criteres de done:** miroir property — l'index est une fonction pure du code émis (même code→même graphe) ∧ le router peut le consommer pour cibler le sous-graphe affecté.

## FN06
**Objectif:** Workbench — visualiser le graphe fonctionnel de l'app émise dans `/emitters` ou `/web-preview` + Playwright e2e + 2 pages Mintlify.
**Detail:** docs/plan/ROADMAP-functional.md
**Inputs:** FN05
**Criteres de done:** la route rend le graphe (thémée+bilingue) ∧ e2e vert ∧ pages « Pour moi » live.
