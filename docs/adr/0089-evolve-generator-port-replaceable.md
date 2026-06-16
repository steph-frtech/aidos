# ADR 0089 — Le générateur d'évolution : un PORT replaceable derrière le seam `Sampler`, fallback `deterministicSampler`, le harness `/evolve` INCHANGÉ

- **Statut :** accepté (EG02 ; GO-gaté par le spike EG01 — verdict GO, `spike/evolve-generator/VERDICT.md`)
- **Date :** 2026-06-16
- **Sujet / piste :** EG02 (`docs/plan/ROADMAP-evolve-generator.md`)
- **Contexte KRD :** CLAUDE.md §6 (determinism-first — l'agent/LLM est l'exception **gatée** derrière un seam, **toujours re-jugée** par du code déterministe) · §8 (« the judge is deterministic » — le Judge=miroir ; « an override is a recorded decision ») · §9 (additif — on **ajoute** le port, on ne réécrit pas le harness) · KRD §62-66 / §102 (self-play Proposer/Solver, AlphaEvolve, Novelty-Search/POET/MOME comme **générateurs**)
- **ADR liés :** **ADR 0087** (décision-mère EG : le générateur self-play/AlphaEvolve reste spike-gated derrière le seam ; cet ADR **fige le contrat** du port qu'il annonçait) · **ADR 0032** (S42 EvolutionSandbox & promotion-gate) · **ADR 0072** (décision-mère : la vérité vit en Go/Postgres — un générateur ne franchit **jamais** le mur) · **ADR 0079** (DiffusionGemma — **même régime** : un port `replaceable` derrière un seam, spike-gated, fallback déterministe). Réutilise `back/runtime/evolve/evolve.go` (l'engine pur `Evolve` + le type `Sampler`), `back/runtime/evolve/sampler_contract.go` (le contrat figé + l'extracteur + la 2ᵉ référence), `back/mcp/evolve/main.go` (le `deterministicSampler` câblé).

## Contexte

Le spike **EG01** (`spike/evolve-generator/VERDICT.md`, verdict **GO**) a falsifié la question : *un générateur self-play (Proposer/Solver) injecté derrière le seam `Sampler` couvre-t-il matériellement plus de niches gate-validées que le stub `deterministicSampler` ?* Réponse mesurée : **oui** (+50 pts de couverture MAP-Elites ≥ seuil matériel 33,3 %), le **Judge=miroir** restant l'arbitre déterministe — *le générateur propose, le gate dispose*. Le spike laisse des OpenQuestions (gate du spike = heuristique, une seule cellule, coût du Proposer réel non chiffré) qui sont des forward-deps d'EG03, pas des bloquants.

Ce qui est **déjà réel et ne change pas** (ADR 0032/0087) : la **quarantaine** EvolutionSandbox (une variante n'écrit que `branches/reports/ideas`, **jamais** `kernel/mirrors/fitness`), la **promotion-gate** (`mirror_green ∧ out_of_sample_green ∧ authority_approval`), la **sélection QD/MAP-Elites** (S26), et surtout le **Judge=miroir** (§8). Le seam existe déjà : `evolve.Sampler` (l'engine `back/runtime/evolve`) injecté par `deterministicSampler` (`back/mcp/evolve/main.go`), dont le commentaire dit verbatim « *the real self-play / AlphaEvolve generator lives behind this seam* ».

EG02 ne **branche pas** le vrai générateur (c'est EG03). EG02 **fige le contrat** du port et **grave la divergence** : le générateur est un port `replaceable` derrière `Sampler`, avec le sampler déterministe comme **repli**, et il prouve par un **miroir d'invariance** que le harness `/evolve` est **indifférent au choix de sampler**.

## Décision

**Le générateur de variantes est un PORT `replaceable` derrière le seam `Sampler{ Generate(cell, seed) → (parentID, Variant, Evidence) }`, avec `deterministicSampler` comme FALLBACK obligatoire, et le harness `/evolve` (quarantaine + promotion-gate + Judge=miroir + QD) reste INCHANGÉ. Tout générateur conforme est SUBSTITUABLE : le harness est INVARIANT au choix de sampler — c'est le miroir d'invariance EG02 qui le prouve.**

### 1. Le contrat figé du seam (le point d'extension STABLE)

```go
// back/runtime/evolve/evolve.go (déjà déclaré ; figé ici)
type Sampler func(cell string, seed int64) (parentID string, variant Variant, evidence Evidence)
```

Un `Sampler` conforme **DOIT** :

1. **être PUR et total** de `(cell, seed)` — pas de DB, pas d'horloge, pas de rng ambiant. Même `(cell, seed)` ⇒ `(parentID, variant, evidence)` byte-identiques. La graine est **passée en argument** (rejouabilité, §6/§8). Un vrai générateur LLM/recherche est l'**exception gatée** (§6) : confiné **derrière** le seam, **dans** la quarantaine S42, et sa sortie est **toujours re-jugée** par la gate déterministe `Promote` — il ne s'auto-note jamais.
2. **PROPOSER seulement** — il renvoie une `Variant` candidate + son `Evidence` **consommée** (`mirror`, `out_of_sample`, `authority`, `fitness`). Il ne **décide jamais** « bon » : le **Judge=miroir** (`Promote`) tranche, déterministe. Un sampler qui écrirait une vérité, inventerait une niche *ex nihilo*, ou noterait sa propre variante **romprait** le contrat.
3. **être SUBSTITUABLE** — `Evolve(cell, budget, seed, samplerA)` et `Evolve(…, samplerB)` émettent le **même contrat de sortie** (les mêmes zones `can_write`, dans le même ordre, toutes confinées, aucune écriture de vérité). Le verdict de la gate est une **fonction pure de l'`Evidence`** rapportée, **jamais** du sampler qui la rapporte.

### 2. Le harness `/evolve` est INVARIANT au choix de sampler (le critère EG02)

Le miroir property `back/runtime/evolve/sampler_invariance_property_test.go` (forme ∀, `rapid`) le grave :

- ∀ `(cell≠"", budget, seed)`, ∀ deux samplers conformes A, B : `ExtractContract(Evolve(…, A)) == ExtractContract(Evolve(…, B))` — mêmes zones `can_write`, même ordre, tout confiné, aucune vérité.
- ∀ run, ∀ sampler : chaque écriture émise est sous `can_write` (la boucle ne **gouverne** jamais) et aucune ne touche `/kernel`, `/mirrors`, `/fitness`, `/authority` (le mur).
- ∀ `Evidence` : le verdict de `Promote` dépend de l'**Evidence seule**, jamais du sampler qui l'a produite (le Judge=miroir, §8).
- ∀ sampler **adversarial** (qui nomme « kernel »/« fitness » sa variante/niche) : `Evolve` émet **quand même** uniquement sous `can_write` — le harness **possède** la zone, le générateur ne propose que le **contenu**. (Portée honnête : `Confine` est un préfixe-string, pas un normaliseur de chemin ; le test ne prétend pas défendre contre `..`, il prouve que le sampler ne **choisit pas la zone**.)

Les deux samplers de référence (`FallbackSampler`, `AltReferenceSampler`) sont **réellement distincts** (parent/variant/niche/fitness différents), si bien qu'un harness **non** invariant ferait diverger les contrats et **rougir** le miroir (prouvé par fault-injection : leaker l'id de variante dans le contrat fait échouer le miroir).

### 3. Repli déterministe obligatoire (le chemin vivant)

Tant qu'aucun générateur réel n'est injecté, `evolve.go`/`main.go` tournent avec `deterministicSampler` (parent stable + variante à evidence verte) : la boucle est **complète, testable et gouvernée** sans le producteur. Le générateur réel **remplace l'injection** (EG03) — il ne réécrit ni l'engine, ni la quarantaine, ni la gate (additif, §9). IA éteinte ⇒ le harness retombe sur le sampler déterministe et reste vert.

### 4. Le mur tient (§2)

Un générateur, quel qu'il soit, ne peut causer que des écritures `branches/reports/ideas` (l'engine `Evolve` n'émet **que** des chemins `can_write` ; `Confine` refuse le reste, *fail-closed*). Une promotion est une **PROPOSITION** ; le gel est le `/goal` humain. Les **ideas** candidates qu'un run émet n'atteignent le kernel **que** via `firewall.ViaIdea → /goal` — jamais une écriture kernel directe. `/evolve` **propose**, il ne **gouverne jamais**.

## Conséquences

- **Positif.** Le port est figé et documenté : EG03 peut brancher un vrai self-play Proposer/Solver (ou AlphaEvolve, ou Novelty-Search/POET/MOME) **derrière le même seam** en sachant que le harness ne bougera pas — l'invariance est un miroir vivant, pas une promesse. Le mur, le déterminisme et l'anti-overwrite sont inchangés. La symétrie avec ADR 0079 (DiffusionGemma) est exacte : un port `replaceable`, spike-gated, fallback déterministe.
- **Coûts assumés.** (a) Le contrat **interdit** un générateur impur/stateful : un vrai LLM doit être **enveloppé** d'un adaptateur pur (graine → sortie déterministe ; toute non-déterminisme reste hors du seam, re-jugée par la gate). C'est volontaire (§6). (b) Le miroir d'invariance compare le **contrat** (zones, confinement, no-truth), pas le **contenu** candidat — par construction, car un vrai générateur DOIT proposer des candidats différents ; ce qui est invariant, c'est le **harness autour** d'eux.
- **OpenQuestions (forward-deps, ne bloquent pas).** Le vrai self-play Proposer/Solver = **EG03** (l'IA confinée à la génération, re-jugée déterministe avant toute niche). Novelty-Search/POET/MOME comme générateurs = **EG04** (Boids/ACO/PSO = pedigree illustratif, jamais codés — la vague de rouge couvre la stigmergie). Le coût/latence agrégé d'une vraie boucle (OQ-EG01-3) reste à chiffrer en EG03. La persistance Postgres des runs `/evolve` (aujourd'hui branches/reports — back-fill S17/S31, cf. ADR 0073).

## Addendum EG04 — Novelty-Search / POET / MOME comme GÉNÉRATEURS ; Boids/ACO/PSO = pedigree, **jamais codés**

- **Statut :** accepté (EG04) · **Date :** 2026-06-16 · **Sujet :** EG04 (`docs/plan/ROADMAP-evolve-generator.md`).

**Décision (EG04).** Trois stratégies de recherche — **Novelty-Search** (favorise la nouveauté : distance maximale à l'archive des niches visitées), **POET** (paires problème↔solution, *stepping-stones*), **MOME** (Multi-Objective MAP-Elites, front de Pareto par niche) — sont branchées comme **GÉNÉRATEURS** derrière le **même** seam `Proposer` (que le self-play EG03), alimentant la MAP-Elites **existante**. Elles sont **PUREMENT DÉTERMINISTES** — des algorithmes de recherche **seedés** (splitmix64), **PAS des LLM** : aucun modèle, aucun réseau, aucune horloge. `usedRealLLM` est structurellement **faux** pour EG04. Implémentation : `back/runtime/evolve/generators.go` (`NoveltySearchProposer` / `POETProposer` / `MOMEProposer` + le mètre `NicheCoverage`), câblées dans la capability `evolve_coverage` + le sélecteur `generator` d'`evolve_run` (`back/mcp/evolve/main.go`).

**Ce qui ne change PAS (le critère EG04).** Le **promotion-gate** (`mirror_green ∧ out_of_sample_green ∧ authority_approval`) et le **Judge=miroir** sont **INCHANGÉS** : chaque candidat qu'un générateur propose est re-dérivé par `JudgeCandidate` puis disposé par la gate figée `Promote` — le générateur ne change que **CE QUI** est proposé, jamais **COMMENT** c'est jugé. Le déterminisme du gate est intact : même graine ⇒ même couverture (miroir property `generators_property_test.go`). Mesuré par `NicheCoverage` (le nombre de niches **distinctes** où le générateur obtient ≥ 1 candidat **gate-passing**) : Novelty/POET/MOME couvrent **≥** la baseline déterministe `FixtureProposer`, et **strictement plus** sur une cellule multi-niches sous-couverte (la baseline round-robin gaspille des slots en répétitions / mutations *bold* gate-failing ; les générateurs diversifiants étalent un candidat modeste gate-passing par niche distincte). Le **mur** tient : les générateurs n'écrivent que `branches/reports/ideas`, **jamais** `kernel/mirrors/fitness` (une promotion reste une PROPOSITION ; le gel est le `/goal` humain via `firewall.ViaIdea`).

**Boids / ACO / PSO = pedigree illustratif, ABANDONNÉS-PAR-DESIGN — jamais codés, aucun runner planifié.** Ces stratégies « essaim » (Boids = nuées, ACO = ant-colony / phéromone, PSO = particle-swarm) appartiennent au **pedigree** conceptuel du paradigme (la généalogie des algos de recherche émergente) ; elles ne sont **PAS** implémentées et ne le seront pas. Raison : la **stigmergie** qu'elles modéliseraient (la coordination indirecte par traces déposées dans l'environnement) est **déjà couverte** par la **vague de rouge** du harness — les miroirs rouges qui se propagent dans l'arbre des `composes` SONT la trace partagée qui oriente la recherche, sans agent essaim. Coder un runner Boids/ACO/PSO **doublerait** un mécanisme existant (un déterminisme/honnêteté gap : un sous-système qui refait ce que la vague de rouge fait déjà). Ils restent donc **nommés** ici comme pedigree et **exclus** du `generatorTable` fermé (`back/runtime/evolve/generators_property_test.go`) et de l'`eg04Generators` fermé (`back/mcp/evolve/main.go`) — la fermeture de ces ensembles est elle-même la garantie qu'aucun de ces trois n'a de runner.

**OpenQuestions EG04 (forward-deps, ne bloquent pas).** Le rendu Workbench « Générateur d'évolution » (variantes self-play vs déterministe, niches gagnées, statut de promotion) + e2e Playwright + pages Mintlify = **EG05**. La persistance Postgres des rapports de couverture (back-fill S17/S31, cf. ADR 0073).
