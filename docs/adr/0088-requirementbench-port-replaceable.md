# ADR 0088 — RequirementBench : port `replaceable` spike-validé (DG02) — fallback « recompile déterministe seul », oracle de complétude AUTORITAIRE

- **Statut :** accepté (spike DG01 GO-conditionnel, 2026-06-15 ; gravure DG02, 2026-06-16)
- **Date :** 2026-06-16
- **Contexte KRD :** CLAUDE.md §3 (slot `Formal caps` replaceable, T2 ; déterminisme-first — la LLM est l'exception gatée) · §2 (le mur — un bench *propose*, il n'écrit ni `kernel` ni `mirrors` ni `fitness` ; lecture seule hors truth-store) · §6/§8 (le juge est déterministe ; pas de truth-test écrit par l'agent ; chaque op déterministe-able porte son miroir de reproductibilité) · ADR 0007 (réutiliser, ne pas réinventer) · **ADR 0072** (la décision-mère : le Go est la **référence**, l'agent défère ; l'oracle déterministe de complétude reste autoritaire) · **ADR 0079** (DiffusionGemma replanifié comme bench différentiel spike-gated derrière un port `replaceable` + miroir) · même régime que les ports `replaceable` Headroom (HR02/HR03) et MarkItDown · `spike/diffusiongemma/verdict.md` (le spike DG01)

## Contexte

Le spike **DG01** (`spike/diffusiongemma/verdict.md`, confiné `/spike/`, cliquet OFF) a falsifié la question d'ADR 0079 : **comparer ≥2 sorties LLM sur une seule spec révèle-t-il des TYPES de requirement qu'un recompile déterministe oublierait ?** Le verdict est **GO conditionnel**, et il se dédouble honnêtement :

1. **« Un LLM révèle-t-il des types qu'un recompile rate ? »** → **OUI, net et robuste** : surplus de 12 (fixtures) à 17 (échantillon réel `claude-opus-4-8`) types ; un seul modèle fort fait passer la couverture de ~26–42 % à 100 %. Les types ratés sont exactement ceux qu'un recompile happy-path ne peut **structurellement pas inférer** : `invariant.forall`, `policy.authz`, `case.error`, `case.edge`, `view.empty_state`, `action.on_success/on_error`, `operation.guard`, `operation.event`.
2. **« Le DIFFÉRENTIEL (≥2 modèles) bat-il le meilleur modèle seul ? »** → **OUI sous vraie divergence** (deux familles distinctes : fixtures +4), **NON sous deux prompts d'un même modèle fort** (réel : +0).

La thèse multi-LLM est donc **recadrée** : le différentiel ne paie qu'entre modèles **génuinement divergents** (une famille diffusion comme DiffusionGemma vs un autorégressif), **pas** deux températures d'un même modèle. Au **plancher**, un modèle fort vs le recompile suffit déjà à révéler les trous ; le différentiel multi-modèle est un *bonus*, jamais le minimum.

Le spike est un module **standalone** (`spike/diffusiongemma`, propre `go.mod`, jetable-mais-commité, n'importe pas `back/`). DG02 grave le **vrai code ratcheté** sous `back/runtime/requirementbench/` — **sans réimporter le spike** : on en réutilise la taxonomie close (22 `RequirementKind`) et l'extracteur pur, transposés dans un package du module `back/`.

## Décision

**Le `RequirementBench` est un PORT `replaceable` (slot `Formal caps`, §3), spike-validé (DG01), avec un fallback DÉTERMINISTE « recompile seul » DERRIÈRE le port. Le bench PROPOSE des trous de complétude ; il n'écrit AUCUNE vérité ; l'oracle déterministe de la loi de complétude reste AUTORITAIRE (ADR 0072).**

1. **Un port Go typé.** `back/runtime/requirementbench/` définit

   ```go
   type RequirementBench interface {
       Run(spec Spec, candidates []LLMOutput) (CompletenessReport, error)
   }
   ```

   avec les types `LLMOutput{ Role, Text }`, `CompletenessReport{ MissingTypes []RequirementKind ; MatchPct float64 ; … }` et la **taxonomie close** des `RequirementKind` (réutilisée du spike DG01 : view/control/action/operation/entity/invariant/policy + facettes, 22 types, ancrée S11/S35). C'est la frontière du slot `replaceable` (ADR 0003) : on peut brancher 0, 1 ou N modèles derrière, le port ne change pas.

2. **Un fallback DÉTERMINISTE derrière le port — le « recompile seul ».** `RecompileOnlyBench` est une implémentation **sans LLM** : elle dérive les types présents par l'extracteur pur (`Extract`, un match de marqueurs, jamais un jugement LLM) sur les candidates qu'on lui passe — y compris, au plancher, la seule projection déterministe du recompile. **Modèle absent ⇒ ce fallback, jamais une erreur d'écran** (la dégradation est gouvernée, le rejeu reste vert sans IA). Le **vrai** modèle (DiffusionGemma + ≥1 divergent) est branché en **DG04**, derrière le même port ; ici (DG02) on grave le port + le fallback + le contrat.

3. **Le report est une DÉRIVATION PURE — le mur (§2).** `Run` ne lit aucune base, n'écrit ni `kernel` ni `mirrors` ni `fitness`, ne touche pas le truth-store : il **dérive** le `CompletenessReport` des seules `(spec, candidates)`. **Mêmes entrées ⇒ même report** (miroir de reproductibilité, property test ∀, rejoué 100×). C'est la garantie déterministe-first : la sortie LLM (en DG04) est toujours **re-jugée par la fonction pure** avant tout usage.

4. **Le Go reste la référence (ADR 0072).** Le bench ne devient jamais la source de vérité de la complétude. Il *propose* des `MissingTypes` candidats, qui passent le mur comme toute idée : `idée → miroir → /goal → approbation` (via `firewall.ViaIdea`, jamais `ToKernel`). L'oracle déterministe (la loi de complétude, `check-completeness`, la chasse aux monstres) **reste autoritaire** : il ferme les goals, le bench non.

5. **Priorité basse, spike-gated.** Sévérité `low`. Branché en dernier, derrière un spike rentable (DG01 fait), jamais par défaut, jamais dans la boucle runtime.

## Conséquences

- **Positif.** DiffusionGemma cesse de flotter : il a un port typé, un fallback déterministe, un contrat prouvé par un miroir de reproductibilité, et un objectif honnête (la **variété** des types de requirement manquants, jamais un score de qualité). Le déterminisme-first (§6/§8) est respecté : la LLM est isolée à la plus petite surface (DG04), re-jugée déterministe, et le rejeu reste vert sans elle (le fallback `RecompileOnlyBench`). Cohérent avec ADR 0007 (réutiliser le spike plutôt que réinventer) et ADR 0072 (le Go est la référence).
- **Coûts assumés.** (a) Le **vrai** modèle (DiffusionGemma + un divergent réel) reste à brancher en **DG04** — DG02 ne grave que le port + le fallback + le contrat. (b) La métrique de complétude comme fonction pure enrichie (`MatchPct`, `MissingTypes` contre les `ExpectedKinds` déclarés) est **DG03** ; DG02 en pose la forme minimale (le contrat) et son miroir de pureté. (c) **OpenQuestions** (forward-deps, ne bloquent pas) : la vraie diversité de modèles (OQ-DG01-1, DG04) ; la frontière exacte « type de requirement » à figer (OQ-DG01-2, DG03) ; l'extraction sur prose libre vs taggée (OQ-DG01-4, DG03) ; le coût/latence d'un bench multi-modèle (OQ-DG01-5).
- Le mur, le déterminisme-first et l'interdit du truth-test (§8) sont **inchangés** : `RequirementBench` n'est qu'un capteur de complétude gouverné, gaté derrière un spike, qui **propose et ne gouverne jamais**.

## Addendum DG04 — l'adapter MODÈLE derrière le port (model-agnostic), le juge déterministe DOMINE

- **Date :** 2026-06-16 — gravure DG04 (`back/runtime/requirementbench/adapter_dg04.go` + son miroir property `adapter_dg04_property_test.go`).
- **Décision.** Un modèle se branche derrière le port via un **`ModelAdapter{ Propose(spec) → []LLMOutput ; Available() ; Name() }`** injectable. `BenchVia(adapter, spec)` appelle l'adapter puis **re-juge TOUJOURS** sa sortie par la fonction pure DG03 (`Metric`/`Derive`) avant tout usage — le **juge déterministe domine le modèle**. Deux adapters livrés pour le bench différentiel :
  1. **`FixtureModel`** — déterministe, **sans réseau** (le modèle du miroir hermétique). Il dérive purement de la spec trois candidates (un *recompile seul* + une lentille UX « A » + une lentille structurelle « B ») ; le miroir le rejoue 100× sans réseau.
  2. **`ClaudeModel`** — **réel** : shell vers `claude --print --model <AIDOS_LLM_MODEL|claude-opus-4-8>`, **deux lentilles de prompt** (UX « A » + formel « B ») comme deux « modèles » pour le différentiel + une baseline *recompile seul*. Binaire absent / timeout / erreur ⇒ **fallback déterministe** « recompile seul », `usedRealLLM=false` **honnête** (jamais une erreur d'écran).
- **Le contrat prouvé (miroir property ∀, RED d'abord, hermétique via `FixtureModel`).** (1) le `CompletenessReport` est **invariant à l'identité du modèle** — deux adapters différents émettant les MÊMES sorties donnent le MÊME report ; (2) modèle absent ⇒ fallback gouverné « recompile seul », jamais une erreur ; (3) IA éteinte ⇒ le rejeu du report reste vert (100× sans réseau) ; (4) déterminisme du juge intact — `BenchVia == Metric` sur les mêmes candidates, et aucun type présent n'est cru sans que `Extract` ne le re-surface.
- **Note infra honnête (model-agnostic).** Le **vrai** DiffusionGemma (architecture diffusion Gemma) demande des **poids/GPU non garantis** ici. L'adapter est donc **model-agnostic** : le vrai DiffusionGemma se branche comme **un `ModelAdapter` de plus** (un `DiffusionGemmaModel` qui implémente `Propose`), derrière CE même port, re-jugé par CETTE même métrique pure. C'est une **dépendance infra documentée** (OQ-DG01-1) — elle ne **bloque pas** DG04 : le contrat est prouvé par le fixture + l'adapter claude réel.
- **Le mur (§2) inchangé.** `BenchVia` retourne une **valeur** ; les `MissingTypes` restent des trous **proposés** (idée → miroir → /goal via `firewall.ViaIdea`, jamais `ToKernel`). La LLM est l'**exception gatée** (§6/§8) confinée à `ClaudeModel.Propose`, toujours re-jugée par `Extract`. L'oracle déterministe (ADR 0072) reste autoritaire.
