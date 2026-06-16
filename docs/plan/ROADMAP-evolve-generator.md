# ROADMAP — EVOLVE-GENERATOR : le producteur de variantes self-play / AlphaEvolve réel (`/long-run`-exécutable, spike-gated)

> Sujet **EG** (ids `EG01+`). Lancer : `/long-run {planPath:'docs/plan/ROADMAP-evolve-generator.md', startFrom:'EG01'}`.
> **Gouverné par ADR 0087** (le générateur self-play / AlphaEvolve réel : un seam stub, le producteur de variantes spike-gated derrière lui) ; ADR 0032 (S42 EvolutionSandbox & promotion-gate) ; ADR 0072 (décision-mère : la vérité vit en Go/Postgres — un générateur ne franchit **jamais** le mur, il ne peut écrire que branches/reports/ideas).
> **Spike-gate** : `EG01` est un spike de nécessité ; s'il conclut « le self-play ne produit pas de stepping-stone meilleur que le sampler déterministe / coût non rentable », le sujet **s'arrête là** (à bon escient), comme HR/MK/CE/DG.
> Discipline (toutes les étapes) : **mirror-first** (miroir rouge avant code) · **le mur** (le générateur écrit `branches/reports/ideas` uniquement, **jamais** `kernel/mirrors/fitness` — une variante n'entre une niche QD que si elle porte un **miroir vert** ∧ out-of-sample vert ∧ approbation d'autorité) · **determinism-first** (le générateur LLM est l'exception gatée **derrière le seam** ; le **Judge=miroir est déterministe** §8 ; le sampler déterministe reste l'autorité de repli ; chaque op déterministe-able porte son miroir de reproductibilité) · « Done » calculé, jamais déclaré.
> But : remplacer le **stub** `deterministicSampler` (`back/mcp/evolve/main.go:145`, injecté l. 226 `sampler: deterministicSampler` — « the real self-play generator lives behind this seam ») par un **vrai producteur de candidats** (self-play Proposer/Solver + driver AlphaEvolve ; Novelty-Search / POET / MOME comme **générateurs**, §62-66/§102) **derrière le même seam**, sans rien changer au harness `/evolve` déjà câblé (quarantaine, MAP-Elites, promotion-gate, Judge=miroir). Acter : **Boids/ACO/PSO = pedigree** (jamais codés ; la **vague de rouge EST la stigmergie**).

## EG01
**Objectif:** Spike — dans `/spike/evolve-generator/`, sonder si un producteur self-play (Proposer/Solver) ou un driver AlphaEvolve, **injecté derrière le seam `sampler`**, produit des variantes qui passent le promotion-gate plus souvent / occupent plus de niches QD que le `deterministicSampler` actuel, à coût acceptable ; verdict go/no-go.
**Detail:** docs/plan/ROADMAP-evolve-generator.md
**Inputs:** S42, S26, ADR 0087, ADR 0032
**Criteres de done:** un spike confiné `/spike/` compare, sur ≥1 cellule, le taux de variantes promues (miroir vert ∧ out-of-sample) et la couverture MAP-Elites du self-play vs le sampler déterministe ; OpenQuestion si modèle indisponible offline ; verdict go/no-go documenté (si no-go, le seam reste le stub — rien n'est branché).

## EG02
**Objectif:** Runtime — graver l'**ADR de divergence/port** (générateur replaceable derrière le seam, spike-validé, fallback `deterministicSampler`) + figer le contrat du seam `Sampler{Generate(cell, seed) → (id, Variant, Evidence)}` comme **point d'extension stable** (le harness `/evolve` reste inchangé).
**Detail:** docs/plan/ROADMAP-evolve-generator.md
**Inputs:** EG01
**Criteres de done:** ADR accepté (port replaceable, fallback déterministe) + le seam typé documenté + miroir property : **le harness `/evolve` est invariant au choix de sampler** (même promotion-gate, même Judge=miroir, le générateur n'écrit que `branches/reports/ideas` — le mur, jamais `kernel/mirrors/fitness`).

## EG03
**Objectif:** Runtime — implémenter le **self-play Proposer/Solver** (et/ou le driver AlphaEvolve) comme sidecar/MCP **derrière le seam**, l'IA confinée à la génération de candidats, **re-jugée déterministe** par le promotion-gate avant toute niche.
**Detail:** docs/plan/ROADMAP-evolve-generator.md
**Inputs:** EG02
**Criteres de done:** miroir property ROUGE d'abord — **une variante n'entre une niche QD que si elle porte un miroir vert** ∧ out-of-sample vert ∧ approbation d'autorité (jamais sur la confiance du générateur) ∧ IA éteinte, le harness retombe sur `deterministicSampler` et reste vert ∧ aucune écriture de vérité (les promotions candidates passent par `firewall.ViaIdea` → /goal).

## EG04
**Objectif:** Runtime — brancher **Novelty-Search / POET / MOME** comme **générateurs** (diversité/stepping-stones) alimentant la MAP-Elites existante, derrière le même seam ; acter en commentaire d'ADR que **Boids/ACO/PSO = pedigree illustratif** (jamais codés — la vague de rouge couvre la stigmergie).
**Detail:** docs/plan/ROADMAP-evolve-generator.md
**Inputs:** EG03, S26
**Criteres de done:** fixture — Novelty/POET/MOME élargissent la couverture de niches mesurée vs le sampler seul, **sans** changer le promotion-gate ni le Judge=miroir ∧ déterminisme du gate intact ∧ l'ADR nomme Boids/ACO/PSO comme abandonnés-par-design (pas de runner planifié).

## EG05
**Objectif:** Workbench — section « Générateur d'évolution » du panneau `/evolve` (variantes proposées par self-play vs déterministe, niches gagnées, statut de promotion) + Playwright e2e + 2 pages Mintlify « Pour moi ».
**Detail:** docs/plan/ROADMAP-evolve-generator.md
**Inputs:** EG04
**Criteres de done:** la route rend les variantes + leur verdict de gate (thémée ADR 0010 + bilingue ADR 0011 — FR d'abord) ∧ tout bouton exécute via `send()` (ui-completeness §6/§7, jamais headless) ∧ e2e vert (IA coupée, jeu hermétique — le sampler déterministe) ∧ pages « Pour moi » (concept + internals Implémentation/Méta/Méta-méta) live, `mint validate` + `mint broken-links` clean.
