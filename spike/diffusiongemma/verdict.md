# DG01 — VERDICT : bench LLM différentiel (DiffusionGemma)

> Spike confiné `spike/diffusiongemma/` (KRD §84 : cliquet OFF, rigueur T0, jetable-mais-commité).
> Gouverné par **ADR 0079** + `docs/plan/ROADMAP-diffusiongemma.md` (étape **DG01**).
> Reproduire : `cd spike/diffusiongemma && go test ./...` puis `go run ./cmd/verdict [--real]`.

## La question à falsifier (ADR 0079)

> Comparer **≥2 sorties LLM** sur **une seule spec** révèle-t-il des **TYPES de requirement** qu'un
> seul **recompile déterministe** oublierait ? i.e. `|types(LLM_A) ∪ types(LLM_B)|` est-il
> **sensiblement >** `|types(single)|` pour la **même spec** — et le surplus vaut-il un port LLM gaté ?

## Ce qui a été mesuré (déterministe — §8)

- Une **spec checkout-ish** (`CheckoutSpec`, BesoinGraph-like, intention *terse*) comme donnée pure.
- Une **taxonomie CLOSED de 22 types** de requirement ancrée dans la verticale AIDOS
  (view/control/action/operation/entity/invariant/policy + facettes — S11, S35).
- Un **extracteur PUR** `Extract(output) → set(types)` (match de marqueurs, **aucun LLM ne juge** ;
  le juge est déterministe §8) → la métrique est un **comptage de TYPES**, jamais un score de qualité.
- La **métrique différentielle** : `union(A,B)` vs `single`, le **surplus** `union \ single`, le test
  *« le différentiel bat-il le meilleur modèle seul ? »* (`union \ best(A,B)`), et la **couverture
  match%** contre les `ExpectedKinds` déclarés (l'oracle humain de la spec : 19 types attendus).
- Le **seam LLM injectable** (interface `LLM`) : `FixtureLLM` (déterministe, sans réseau — le test de
  repro) + `ClaudeCLI` (réel, optionnel, **2 prompts distincts** comme A/B).

## Résultats — DEUX mesures (le verdict honnête se dédouble)

### (1) FIXTURES — deux modèles GÉNUINEMENT divergents (A instruct/UX · B diffusion/structuré)
*(déterministe ; `TestReproducible` rejoue la métrique 100× → même entrée → même métrique)*

| métrique | valeur |
|---|---|
| single recompile | **8** types |
| model A | 14 types |
| model B | 16 types |
| **union(A,B)** | **20** types |
| **surplus over single** (floor 4) | **12** ✅ |
| union over best single model | **4** ✅ |
| couverture match% | **42.1% → 100%** ✅ |

→ **GO sur les fixtures** : la divergence des deux modèles ajoute **4 types par-delà le meilleur seul**.

### (2) ÉCHANTILLON RÉEL claude-CLI — `claude-opus-4-8`, 3 appels (single/A/B), **2 runs concordants**
*(A et B = le MÊME modèle fort sous deux LENTILLES de prompt : UX vs formel)*

| métrique | valeur |
|---|---|
| single recompile | **5** types |
| model A | 22 types |
| model B | 22 types |
| **union(A,B)** | **22** types |
| **surplus over single** (floor 4) | **17** ✅ |
| **union over best single model** | **0** ❌ |
| couverture match% | **26.3% → 100%** |

→ **NO-GO/INCONCLUSIVE sur le différentiel** : `A ≈ B` (22 == 22), le 2ᵉ appel n'ajoute **rien**
au-dessus du meilleur seul. **Un** modèle fort suffit déjà à révéler les trous.

## La distinction que le spike tranche (les deux runs s'accordent)

1. **« Un LLM révèle-t-il des types qu'un recompile rate ? »** → **OUI, net et robuste.**
   surplus 12 (fixtures) / **17 (réel)** ; un seul LLM fort fait passer la couverture de **~26–42 % à
   100 %**. Les types ratés sont exactement ceux qu'un recompile happy-path **ne peut pas inférer** :
   `invariant.forall`, `policy.authz`, `case.error`, `case.edge`, `view.empty_state`,
   `action.on_success/on_error`, `operation.guard`, `operation.event`.
2. **« Le DIFFERENTIEL (≥2 modèles) bat-il le meilleur modèle seul ? »** → **OUI sous vraie
   divergence** (fixtures : +4), **NON sous deux prompts d'un même modèle fort** (réel : **+0**).

## Verdict calculé (jamais déclaré) : **GO conditionnel**

La valeur du bench est **réelle** mais ne réside **pas** dans le différentiel multi-prompt d'un seul
modèle. Elle réside dans :
- **(a) LLM-vs-recompile** — un **capteur de trous puissant**, déjà rentable avec **un** modèle fort
  (surplus 17, couverture 26 % → 100 %) ;
- **(b) le différentiel** — **seulement** entre modèles **génuinement divergents** (familles
  différentes : DiffusionGemma *diffusion* vs un autorégressif), **pas** deux températures du même.

**Donc** : **DG02 vaut la peine** — un port `RequirementBench{Run(spec, candidates) → CompletenessReport}`
**replaceable** qui **propose** des trous (`idée → miroir → /goal`), avec l'oracle déterministe (la loi
de complétude) qui **reste autoritaire** (ADR 0072). **Mais** la thèse « multi-LLM » est **recadrée** :
le port doit comparer des modèles **réellement distincts** et peut, **au plancher, n'utiliser qu'un
modèle fort vs le recompile** (le différentiel multi-modèle est un *bonus*, pas le minimum). Le sujet
**ne s'arrête pas** ; sa thèse est précisée. Le verdict programmatique reste `GO=true` sur les
fixtures représentatives (deux modèles divergents — le cas que DG04 doit instancier pour de vrai) et
honnêtement `GO=false` sur l'échantillon mono-modèle (deux prompts ne font pas deux modèles).

## Honnêteté (anti-Goodhart)

- **Fixtures vs réel clairement séparés.** Les fixtures ne sont **pas truquées** : le « single
  recompile » est la borne haute honnête d'une projection déterministe (il re-déclare *littéralement*
  la spec) ; A et B n'émettent que des types qu'un modèle de leur saveur émettrait plausiblement.
- **Échantillon réel réel.** `usedRealLLM=true` : 3 appels `claude --print --model claude-opus-4-8`,
  **2 runs concordants** (single=5, union=22, surplus=17, union-over-best=0). Aucun chiffre fabriqué.
- **Le mur intact.** Aucune écriture `kernel/mirrors/fitness` ; module standalone n'important pas
  `back/`. Le `CompletenessReport` est une **dérivation pure** ; les trous proposés passent le mur
  comme idées.
- **Determinism-first.** La métrique est pure et reproductible (test 100×) ; la LLM est l'exception
  gatée derrière un seam, **re-jugée** par `Extract`.

## OpenQuestions (forward-deps, ne bloquent pas)

- **OQ-DG01-1** — *vraie diversité de modèles* : l'échantillon réel n'a qu'**un** modèle ⇒ A≈B.
  DG04 doit brancher un **2ᵉ modèle réel divergent** (DiffusionGemma diffusion) et re-mesurer.
- **OQ-DG01-2** — *taxonomie* : les 22 kinds sont déclarés ici ; frontière exacte « type de
  requirement » à figer (réutilise check-completeness ou propre) — DG03.
- **OQ-DG01-3** — *oracle humain* : `ExpectedKinds` (dénominateur match%) est une vérité **déclarée** ;
  en prod la loi de complétude est autoritaire, le bench ne fait que proposer.
- **OQ-DG01-4** — *extraction* : `Extract` parse une sortie **taggée** (le prompt impose le
  vocabulaire) ; une prose libre serait sous-comptée. DG03 contraint le format ou ajoute un parseur
  structuré déterministe (jamais un LLM-juge).
- **OQ-DG01-5** — *coût/latence* : 3 appels réels ~ dizaines de s chacun ; coût d'un bench
  multi-modèle par spec à budgéter (ADR 0079).
