# ROADMAP — DIFFUSIONGEMMA : bench LLM différentiel + métrique de complétude (`/long-run`-exécutable, spike-gated)

> Sujet **DG** (ids `DG01+`). Lancer : `/long-run {planPath:'docs/plan/ROADMAP-diffusiongemma.md', startFrom:'DG01'}`.
> **Gouverné par ADR 0079** (DiffusionGemma : bench LLM différentiel REPLANIFIÉ — un port replaceable spike-gated qui maximise les TYPES de requirement manquants) ; ADR 0072 (décision-mère : le Go est la **référence**, l'agent défère ; un port replaceable derrière un miroir, jamais une autorité).
> **Spike-gate** : `DG01` est un spike de nécessité ; s'il conclut « gain non rentable / déterminisme menacé / pas de modèle exploitable offline », le sujet **s'arrête là** (à bon escient), comme HR/MK/CE.
> Discipline (toutes les étapes) : **mirror-first** (miroir rouge avant code) · **le mur** (rien n'écrit `kernel/mirrors/fitness` — un bench *propose*, il ne gouverne pas) · **determinism-first** (la LLM est l'exception gatée ; le **juge est déterministe** §8 — le score est un comptage de TYPES de requirement manquants, jamais un jugement LLM ; chaque op déterministe-able porte son **miroir de reproductibilité** : même entrée → même sortie) · outil **replaceable derrière un port** (ADR) · « Done » calculé, jamais déclaré.
> But : ne PAS noter pass/fail un recompile, mais **maximiser les TYPES de requirement qu'un recompile oublierait** — `match% = (types de requirement présents) / (types attendus)`, un bench **différentiel multi-LLM** où DiffusionGemma (Gemma diffusion, code/structured) est **un** des modèles comparés, et un volet **multimodal** (mockup image → view-specs) que markitdown (doc→md) ne couvre pas. Le bench tourne **derrière un port replaceable** (la sortie LLM est toujours re-jugée par une fonction pure).

## DG01
**Objectif:** Spike — dans `/spike/diffusiongemma/`, sonder la faisabilité offline d'un bench différentiel multi-LLM sur un corpus de specs AIDOS (entités/operations/views/controls/invariants → app émise) et mesurer si **comparer plusieurs LLM révèle des TYPES de requirement manquants** qu'un seul recompile déterministe oublierait ; verdict go/no-go.
**Detail:** docs/plan/ROADMAP-diffusiongemma.md
**Inputs:** S35, S11, ADR 0079, ADR 0007
**Criteres de done:** un spike confiné `/spike/` mesure, sur ≥1 paire spec↔recompile, le nombre de **types de requirement** (section/champ/action/invariant/policy) que ≥2 LLM divergents font émerger vs le recompile seul ; OpenQuestion si tokenizer/modèle indisponible offline ; verdict go/no-go documenté (si no-go, le sujet s'arrête — rien n'est branché).

## DG02
**Objectif:** Runtime — graver l'**ADR de divergence/port** « bench différentiel replaceable derrière un port » + définir le port Go `RequirementBench{Run(spec, candidates []LLMOutput) → CompletenessReport}` dans `back/runtime/` (la frontière du slot `Formal caps`/replaceable, ADR 0003).
**Detail:** docs/plan/ROADMAP-diffusiongemma.md
**Inputs:** DG01
**Criteres de done:** ADR accepté (port replaceable, spike-validé, fallback « recompile déterministe seul ») + port typé + miroir property du contrat (un report est purement dérivé des sorties LLM, **aucune écriture de vérité** — le mur, lecture seule hors truth-store).

## DG03
**Objectif:** Runtime — implémenter la **métrique de complétude** comme **fonction pure** : `CompletenessReport{ MissingTypes []RequirementKind; MatchPct float }` où `match% = présents/attendus` sur les TYPES de requirement (jamais un score pass/fail, jamais un jugement LLM) + son **miroir de reproductibilité**.
**Detail:** docs/plan/ROADMAP-diffusiongemma.md
**Inputs:** DG02, S35, S11
**Criteres de done:** miroir property ROUGE d'abord — `match%` est **déterministe** (mêmes (spec, sorties) → même report, rejoué 100×) ∧ un type de requirement **présent dans la spec mais absent de toute sortie** est compté manquant ∧ un type couvert par ≥1 candidat n'est jamais faux-négatif (anti-faux-positif, comme le contrôle dissimilaire CE01).

## DG04
**Objectif:** Runtime — adapter **DiffusionGemma** (et ≥1 autre modèle du bench différentiel) en sidecar/MCP **derrière le port** `RequirementBench` ; la sortie LLM est toujours **re-jugée par la fonction pure DG03** avant tout usage.
**Detail:** docs/plan/ROADMAP-diffusiongemma.md
**Inputs:** DG03
**Criteres de done:** miroir property ROUGE d'abord — **le `CompletenessReport` est invariant à l'identité du modèle** (le juge déterministe domine ; un modèle absent → fallback recompile seul, jamais une erreur d'écran) ∧ IA éteinte, le rejeu du report reste vert ∧ déterminisme du juge intact.

## DG05
**Objectif:** Runtime — volet **multimodal** : `mockup (image) → view-specs candidates` derrière le même port (là où markitdown fait doc→md, pas image→view), re-jugé par DG03 ; spike-gated dans la même zone.
**Detail:** docs/plan/ROADMAP-diffusiongemma.md
**Inputs:** DG04, ADR 0039
**Criteres de done:** fixture — une image-mockup produit des view-specs candidates dont la **complétude est mesurée par DG03** (types de zone/champ/action couverts) ∧ aucune écriture de vérité (les candidates passent par `firewall.ViaIdea` → idée → /goal, jamais `ToKernel`) ∧ le multimodal absent → le sujet reste utilisable sur le différentiel texte seul.

## DG06
**Objectif:** Workbench — section « Bench de complétude » (par spec : `match%`, les TYPES de requirement manquants, le différentiel par modèle) + Playwright e2e + 2 pages Mintlify « Pour moi ».
**Detail:** docs/plan/ROADMAP-diffusiongemma.md
**Inputs:** DG05
**Criteres de done:** la route rend le report par spec (thémée ADR 0010 + bilingue ADR 0011 — FR d'abord) ∧ tout bouton exécute via `send()` (ui-completeness §6/§7, jamais headless) ∧ e2e vert (IA coupée, jeu hermétique) ∧ pages « Pour moi » (concept + internals Implémentation/Méta/Méta-méta) live, `mint validate` + `mint broken-links` clean.
