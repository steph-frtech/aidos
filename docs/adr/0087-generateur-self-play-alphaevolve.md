# ADR 0087 — Le générateur self-play / AlphaEvolve réel : un seam stub, le producteur de variantes spike-gated derrière lui

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §8 (« the judge is deterministic » — le Judge=miroir ; « an override is a recorded decision ») · §6 (determinism-first — l'agent/LLM est l'exception gatée) · KRD §62-66 / §102 (self-play Proposer/Solver + driver AlphaEvolve ; Novelty-Search / POET / MOME comme générateurs) · ADR 0032 (S42 EvolutionSandbox & promotion-gate) · ADR 0023 (S28 exploration gestures) · S26 (curation QD / MAP-Elites) · réutilise `back/mcp/evolve/main.go` (le seam `deterministicSampler`) + `back/runtime/.../evolve` (l'engine `Evolve`) · même régime spike-gated que **ADR 0079** (DiffusionGemma) · renvoie à `docs/plan/ROADMAP-evolve-generator.md` (à écrire) · cf. ADR 0072 (décision-mère : la vérité vit en Go/Postgres ; un générateur ne franchit jamais le mur — il ne peut écrire que branches/reports/ideas)

## Contexte

Le Tome (KRD §62-66, §102) promet un **générateur de variantes réel** pour la boucle moyenne `/evolve` : le **self-play Proposer/Solver** et le driver **AlphaEvolve**, avec **Novelty-Search / POET / MOME comme générateurs** de stepping-stones dans l'archive QD. L'audit `wi2zxij70` classe ce générateur parmi les **intentions oubliées** : le *harness* `/evolve` est bien câblé, mais le **producteur de candidats** ne l'est pas.

**Preuve d'audit.** `back/mcp/evolve/main.go` porte le seam explicite : `deterministicSampler` est un **stub**, et son commentaire le dit verbatim — « the injected, pure sampler used when **no real generator is wired**: it returns a stable parent + a green-evidence variant keyed off the cell. **The real self-play / AlphaEvolve generator lives behind this seam.** » L'engine pur `Evolve(cell, budget, seed, sampler)` reçoit ce sampler par **injection** : la couture est propre, le producteur est un placeholder.

Ce qui est **déjà réel** (et ne change pas) : la **quarantaine** EvolutionSandbox (ADR 0032, S42 — une variante n'écrit que branches/reports/ideas, **jamais le kernel**), la **promotion-gate** (une variante n'entre dans une niche QD qu'avec un miroir vert ∧ vert hors-échantillon ∧ approbation d'autorité), la **sélection QD / MAP-Elites** (S26), et surtout le **Judge = miroir** (§8 : le juge est déterministe, ce n'est pas le générateur qui décide « bon », c'est le miroir).

## Décision

**Le générateur de variantes self-play / AlphaEvolve reste SPIKE-GATED derrière le seam `deterministicSampler` — exactement le même régime que DiffusionGemma (ADR 0079). Le Judge=miroir et la sélection QD sont DÉJÀ réels ; seul le PRODUCTEUR de candidats est différé. On renvoie à `ROADMAP-evolve-generator.md`.**

1. **Le seam est la frontière du spike.** `back/mcp/evolve/main.go::deterministicSampler` reste le **point d'injection** : tant qu'aucun générateur réel n'est branché, l'engine `Evolve` tourne avec le sampler déterministe (parent stable + variante à evidence verte) — la boucle est **complète et testable** sans le producteur. Le générateur réel, quand il viendra, **remplace l'injection**, il ne réécrit ni l'engine, ni la quarantaine, ni la gate (additif, §9).

2. **Proposer/Solver + Novelty-Search / POET / MOME = des GÉNÉRATEURS, pas des juges.** Le self-play Proposer/Solver (un agent propose une variante, un autre tente de la casser) et les explorateurs QD (Novelty-Search, POET, MOME) sont des **producteurs de candidats** : ils alimentent le seam. Ils ne **décident jamais** qu'une variante est bonne — c'est le **Judge=miroir** (§8, déjà réel) qui tranche, déterministe. Le générateur est l'**exception LLM/recherche gatée** (§6), confinée derrière le seam et au-dessus du mur (quarantaine S42).

3. **Spike-gated, même régime que DiffusionGemma (0079).** Le branchement d'un générateur réel passe par : spike (probe la rentabilité du self-play sur une cellule réelle) → ADR (« générateur replaceable derrière le seam `Sampler` ») → si rentable, adapter. Tant que le spike n'a pas eu lieu, **rien n'est armé** : le sampler déterministe tient le chemin vivant. C'est la symétrie exacte avec le bench différentiel DiffusionGemma (0079) — un port `replaceable` derrière un seam, gardé spike-gated.

4. **Le mur tient (§2).** Un générateur, quel qu'il soit, **ne peut écrire que branches / reports / ideas** — jamais le kernel, jamais un miroir, jamais la fitness (la quarantaine EvolutionSandbox, ADR 0032, l'enforce). Une variante n'entre dans une niche QD que par la **promotion-gate** (miroir vert ∧ hors-échantillon vert ∧ approbation d'autorité). `/evolve` **propose**, il ne **gouverne jamais**.

5. **Renvoi à `ROADMAP-evolve-generator.md`** (à écrire). La feuille de route porte le détail du spike : le protocole Proposer/Solver, l'usage de Novelty-Search/POET/MOME comme générateurs dans l'archive QD, le driver AlphaEvolve, et la métrique de sélection (déjà fournie par le Judge=miroir + QD). C'est là que vit la planification du producteur ; cet ADR fixe seulement le **statut** (spike-gated, derrière le seam).

## Conséquences

- **Positif.** L'intention oubliée sort du flou avec un statut net : la boucle `/evolve` est honnête (complète, testable, gouvernée) **sans** prétendre que le générateur réel existe. La partie qui compte pour la sûreté — le Judge=miroir, la quarantaine, la promotion-gate, la sélection QD — est **déjà réelle** et inchangée ; seul le producteur de variantes, l'exception gatée, est différé derrière un seam propre. Le mur, le déterminisme et l'anti-overwrite sont inchangés.
- **Coûts assumés.** (a) Sévérité **medium** : tant que le générateur réel n'est pas branché, `/evolve` explore l'espace des variantes via le sampler déterministe (couverture limitée mais correcte — la boucle ne ment pas sur ce qu'elle fait). (b) Le branchement futur est un step à part entière (spike + ADR `replaceable` + miroir de reproductibilité du sampler), pas une dette latente. (c) `ROADMAP-evolve-generator.md` doit être écrite pour porter le détail — c'est la forward-dep documentaire (ne bloque pas cet ADR).
- **OpenQuestions (forward-deps, ne bloquent pas).** Le choix du protocole exact (self-play pur Proposer/Solver vs driver AlphaEvolve vs combinaison QD) reste ouvert — il dépend du résultat du spike. La persistance Postgres des runs `/evolve` et des variantes promues (aujourd'hui branches/reports — back-fill S17/S31, cf. ADR 0073).
