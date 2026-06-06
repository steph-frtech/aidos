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

---

## Impacts — ADR 0040 / EL00 (app émise = Hono + TypeScript fonctionnel) — track FN

> Décision EL00 / ADR 0040. Le **concept Kernel** et la **logique d'ordre** des étapes sont inchangés ; seule la **cible d'émission** bascule Go→Hono/TS pour l'app *construite*. Inchangés : datastore dialecte Postgres + Atlas (ADR 0006), contrats Pact/OpenAPI, le déterminisme byte-identique de l'émission. **Seule décision forcée : S90** (où l'Operation-DSL s'exécute — ré-émission TS vs callback service Go, OpenQuestion).

| Étape | Delta (cible émise → Hono/TS) |
|---|---|
| **FN01 (spike fonctionnel)** | La cible du spike devient **Hono/TS fonctionnel** au lieu de fonctionnel-Go. Le TS pur-fonctionnel est un fit plus naturel pour le mandat (pas d'ambiguïté goroutine/global). Discipline de verdict inchangée. |
| **FN02 (ADR mandat fonctionnel) / ADR 0036** | ADR 0040 (EL00) est le **pendant langage** de FN02 : les deux doivent se **croiser-référencer** (mandat fonctionnel + langage cible). Invariants (pur, no-global, acyclique) neutres au langage, s'appliquent à TS verbatim. |
| **FN03 (émetteurs fonctionnels)** | « (Go/DDL/TS) » → **drop Go** pour le serveur émis, devient **(DDL/TS)** — TS pour handlers+workers+client, DDL pour Postgres. Miroir de pureté (même entrée→sortie, pas de var mutable de module, ré-émission byte-identique) s'applique à TS inchangé. **C'est ici que se tranche OQ-0040-interpréteur (port TS de l'Operation DSL).** |
| **FN04 (règles arch-fitness)** | Le moteur nommé (`depguard`/`go-arch-lint`) est **Go-only** → pour l'arbre TS émis, les trois règles s'enforcent via **`dependency-cruiser`** (cycles) + linter de pureté TS (ESLint `eslint-plugin-functional`/`no-let`/`no-param-reassign`). `EMITTED_NO_GLOBAL_MUTABLE` (module `let`/binding mutable), `EMITTED_FUNCTION_PURE` (détection d'effets), `EMITTED_CALL_GRAPH_ACYCLIC` (cycles d'import dependency-cruiser). Fault-injection (injecter global/cycle → rouge) survit, écrite contre des fixtures TS. |
| **FN05 (index call-graph)** | L'indexeur doit parser **TS, pas Go** (ts-morph / TS compiler API / madge au lieu d'un walker AST Go). Le miroir « fonction pure du code émis (même code→même graphe) » inchangé. Delta = le **backend de parsing**. |
| **FN06 (visualisation Workbench)** | Neutre au langage (rend le graphe). **Aucun delta** au-delà du fait que le graphe décrit désormais un arbre TS. |
