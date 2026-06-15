# ADR 0086 — Formal caps : statut de SOUPAPE (E7) — enums réservés, runners non branchés PAR DESIGN

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §3 (« Formal caps (rare, T2) — Z3 / TLA+ / Dafny / Alloy / UPPAAL — only if catastrophic ∧ unsampleable », statut `replaceable`) · §1 (Mandat A — l'invariant ∀ se prouve par property test ; la vague de rouge) · KRD FKE-16 (l'échelle de preuve E0-E7 ; E7 = formal/quasi-formal) · ADR 0003 (frozen stack — la ligne « Formal caps ») · réutilise `back/kernel/mirror/prooftype/prooftype.go` (FK05, E0-E7) · cf. ADR 0072 (décision-mère : la vérité vit en Go/Postgres ; aucun runtime ne doit *mentir* sur une capacité — un enum réservé est honnête, un runner « affiché branché » mais absent ne le serait pas)

## Contexte

Le Tome (CLAUDE.md §3, ligne « Formal caps (rare, T2) ») et FKE-16 nomment cinq prouveurs formels — **Z3, TLA+, Dafny, Alloy, UPPAAL** — comme le **plafond E7** de l'échelle de preuve. L'audit `wi2zxij70` les classe parmi les **intentions oubliées** : nommées dans le concept, jamais matérialisées. Avant cet ADR, leur statut flottait — ni branché, ni explicitement renvoyé.

**Preuve d'audit.** `back/kernel/mirror/prooftype/prooftype.go` (FK05) **déclare déjà E7** comme rung réel de l'échelle (`E7 ELevel = 7`, libellé `"formal/quasi-formal"`) et dit verbatim que ces niveaux « **are NOT reachable by** » le mapping N0-N5 seul : seul un kernel dont l'invariant est un **formal cap** — « a kernel whose invariant is catastrophic-and-unsampleable (a T2 formal cap) requires E7 » — l'atteint, et **uniquement** quand l'attribut déclaré `RequiresFormal` est posé (jamais par la facette seule, `req[E7] = true` ssi formal cap). Autrement dit : l'**échelle** réserve déjà la marche E7, mais **aucun runner** Z3/TLA+/Dafny/Alloy/UPPAAL n'est branché — et c'est **voulu**.

Symétriquement, l'audit pose la question des **algorithmes d'essaim** — Boids, ACO (ant colony), PSO (particle swarm) — nommés au pedigree du concept (la stigmergie : des agents simples qui coordonnent via des traces laissées dans l'environnement). Ils n'ont jamais été codés.

## Décision

**Acter que les formal caps E7 sont une SOUPAPE (la soupape d'Ashby) : Z3/TLA+/Dafny/Alloy/UPPAAL sont des enums RÉSERVÉS, leurs runners NON branchés PAR DESIGN — jamais par défaut, seulement pour un invariant catastrophique ∧ unsampleable. Un runner sera ajouté au PREMIER cap T2 réel, pas avant. ADR documentaire : aucune planification active.**

1. **Soupape, pas défaut.** Le régime normal de preuve d'un invariant ∀ reste le **property test** (Mandat A, `rapid`/`fast-check`) — échantillonnable, donc déjà couvert. Le formal cap n'est légitime **que** lorsqu'un invariant est à la fois **catastrophique** (sa violation est inacceptable) **et unsampleable** (aucun tirage de propriété ne peut le couvrir). C'est la **soupape de variété requise** (Ashby) : une capacité tenue en réserve pour la rare T2, jamais armée par convenance.

2. **Enums réservés, runners absents — par design.** La marche E7 est déclarée dans `prooftype.go` (`RequiresFormal` → `req[E7]`), mais **aucun runner formel n'est câblé**. Ce n'est pas un trou : un runner armé « par défaut » serait un coût permanent pour une capacité jamais sollicitée. La marche reste honnête (réservée, atteignable ssi `RequiresFormal`) ; le runner reste absent jusqu'au besoin.

3. **Déclenchement au premier cap T2 réel.** Le **premier** kernel portant un invariant catastrophique-et-unsampleable (le premier `RequiresFormal` réel) **ouvrira** le branchement d'**un** runner — choisi par tool-search dans le slot `replaceable` (Z3 / TLA+ / Dafny / Alloy / UPPAAL selon la nature du cap), avec son ADR et son miroir. Tant que ce cap n'existe pas, **rien n'est planifié** : pas de ROADMAP active, pas de step.

4. **Honnêteté §3 / déterminisme.** Conformément à ADR 0072, un écran ou un statut runtime ne doit **jamais** afficher un runner formel « branché » alors qu'il est absent. Un enum réservé est honnête (« E7 atteignable, runner à armer au premier cap ») ; un mensonge d'écran (« vérifié Z3 » sans Z3) serait un monstre §1. L'attribut `RequiresFormal` reste **déclaré** (au-dessus de la ligne), jamais inféré par un LLM (§8).

5. **Boids / ACO / PSO = pedigree illustratif, jamais codés.** Les algorithmes d'essaim sont actés comme **pedigree** (la généalogie d'idées du concept), **non comme code à écrire** : **la vague de rouge EST la stigmergie d'AIDOS**. Le rougissement d'un miroir qui se propage le long des `composes`/`impacts` — chaque cellule réagissant à la trace (le rouge) laissée par sa voisine — est déjà la coordination stigmergique que Boids/ACO/PSO illustrent. Les coder serait réinventer ce que la vague de rouge fournit. Ils sont **légitimement abandonnables** (documentés, pas planifiés).

## Conséquences

- **Positif.** Une intention oubliée sort du flou sans dette : la marche E7 est honnête (réservée, atteignable, non mentie) et le coût d'un runner formel est différé jusqu'au seul moment où il est justifié (le premier cap T2). Le pedigree d'essaim est tranché — la vague de rouge couvre la stigmergie, on ne code pas Boids/ACO/PSO. Le mur, le déterminisme et l'anti-overwrite sont inchangés.
- **Coûts assumés.** (a) Aucun coût de build immédiat (par design : rien à brancher maintenant). (b) Le jour où un cap T2 réel apparaît, le branchement du runner devient un step à part entière (tool-search + ADR `replaceable` + miroir de reproductibilité) — c'est le déclencheur, pas une dette latente. (c) Sévérité **low**, statut **documentaire** : cet ADR ne planifie rien, il acte un statut.
- **OpenQuestions (forward-deps, ne bloquent pas).** Le choix exact du prouveur au premier cap (Z3 pour SMT, TLA+/UPPAAL pour le temporel, Dafny/Alloy pour le structurel) reste ouvert — il dépend de la **nature** du premier invariant catastrophique-et-unsampleable, pas d'une décision anticipée. Cette résolution sera elle-même une décision humaine au-dessus du mur (§2).
