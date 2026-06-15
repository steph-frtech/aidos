# ADR 0079 — DiffusionGemma : bench LLM différentiel REPLANIFIÉ — un port replaceable spike-gated qui maximise les TYPES de requirement manquants

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md ; décision « on remet diffusiongemma »)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §3 (slot `Formal caps` replaceable, T2 ; déterminisme-first — la LLM est l'exception gatée) · §6 (tool search par step, mandat déterminisme-first) · §8 (le juge est déterministe ; pas de truth-test écrit par l'agent) · ADR 0007 (réutiliser, ne pas réinventer) · ADR 0072 (la décision-mère : le Go est la référence, l'agent défère) · steps S42 (EvolutionSandbox), S40 (MutationRunner), FKE des ports `replaceable` derrière un miroir ; même régime spike-gated que `ROADMAP-headroom.md` / `ROADMAP-markitdown.md` / `ROADMAP-compound.md`

## Contexte

L'audit `w91305w3q` (2026-06-15) a relevé DiffusionGemma comme un item **spéculatif, never-materialized** : `grep -ln "diffusiongemma|DiffusionGemma|Gemma"` ne renvoie aujourd'hui qu'un seul hit, `docs/plan/PLAN-branchements.md` — aucun code Go, aucun port, aucun miroir. Le risque d'un tel item flottant est double : soit on l'abandonne en silence (un terme du concept qui se perd), soit on le laisse traîner comme un « à trancher » indéfini.

L'intention sous-jacente n'est pas un gadget LLM. AIDOS émet une app **par recompilation déterministe** depuis ses specs (les émetteurs, jamais une « génération LLM d'écran » — sinon `AGENT_DETERMINISM_GAP`). La question légitime qu'un bench LLM peut éclairer est : **quels TYPES de requirement un recompile oublierait-il ?** Pas « le code généré est-il bon » (jugement subjectif interdit comme truth-test, §8), mais « quelle est la variété de requirements qu'un modèle de génération différentielle ferait apparaître et que la spec actuelle ne couvre pas ». C'est une **mesure de complétude de couverture**, pas un score pass/fail.

La décision humaine du 2026-06-15 (« on remet diffusiongemma ») tranche : on ne l'abandonne pas, on le **replanifie** — sous le même régime que les autres ports `replaceable` du projet (Headroom, MarkItDown, Compound) : une ROADMAP spike-gated, derrière un port qui défère au déterministe, avec un miroir de reproductibilité. La famille Gemma diffusion (génération de code/structuré par diffusion plutôt qu'autorégressif) devient **un des modèles** du bench différentiel, pas le bench lui-même.

## Décision

**DiffusionGemma est GARDÉ et REPLANIFIÉ comme un bench LLM différentiel spike-gated, derrière un port `replaceable` accompagné d'un miroir de reproductibilité — jamais branché par défaut, jamais dans la boucle runtime, jamais un truth-test.**

1. **Une ROADMAP, pas du code maintenant.** On écrit `docs/plan/ROADMAP-diffusiongemma.md` (calque exact de `ROADMAP-headroom.md` / `ROADMAP-markitdown.md`) : spike → ADR de bilan « bench différentiel replaceable derrière un port » → si rentable, adapter un port Go. Aucun code n'est gravé par cette décision : c'est une décision de cadrage et de séquencement.

2. **L'objectif est la VARIÉTÉ, pas un score.** Le bench différentiel **maximise les TYPES de requirement manquants** qu'un recompile oublierait — il révèle des trous de couverture (une section, un champ, un contrôle, un invariant ∀ que la spec n'a pas capté). Il ne produit jamais une note de qualité du code généré (ce serait un jugement LLM hissé en vérité, §8). La métrique candidate (match% = couverture des types de requirement) reste **annexée**, jamais écrite dans la `fitness` (read-only, au-dessus de la ligne).

3. **Derrière un port `replaceable` + un miroir.** Le bench, s'il est adopté, vit derrière un port Go (slot `replaceable`, §3 — les caps formelles / LLM-judge ne sont jamais le minimum mandatory). La LLM est l'**exception gatée** (§6/§8) : ce qu'elle propose est **re-jugé déterministe** avant tout usage, et le port porte son **miroir de reproductibilité** (property test : même graphe de specs + même seed → mêmes types-de-requirement révélés ; modèle éteint → le rejeu reste vert, la dégradation est gouvernée). DiffusionGemma (Gemma diffusion, code/structured) est l'un des modèles candidats du bench, comparé aux autres derrière le même port.

4. **Le Go reste la référence (ADR 0072).** Le bench différentiel ne devient jamais la source de vérité de la complétude — l'oracle déterministe (la loi de complétude, `check-completeness`, la chasse aux monstres) reste autoritaire. Le bench *propose* des trous candidats, qui passent le mur comme toute idée : `idée → miroir → /goal → approbation`. Il ne ferme aucun goal, n'écrit ni kernel ni mirrors ni fitness.

5. **Priorité basse, en dernier.** Sévérité `low` (spéculatif, spike-gated). Séquencé tout en fin de plan (étape 9 du séquencement de `PLAN-branchements.md`), avec `ROADMAP-evolve-generator` (ADR 0087) et le générateur self-play réel — même régime de seam spike-gated.

## Conséquences

- **Positif.** Le terme cesse de flotter : il a une décision claire (gardé, replanifié), un chemin (la ROADMAP), un régime (spike-gated derrière un port `replaceable` + miroir) et un objectif honnête (la variété des requirements manquants, pas un score). Le déterminisme-first (§6/§8) est respecté : la LLM est isolée à la plus petite surface, re-jugée déterministe, et le rejeu reste vert sans elle. Cohérent avec ADR 0007 (réutiliser un modèle existant plutôt que réinventer) et ADR 0072 (le Go est la référence, l'agent défère).
- **Coûts assumés.** (a) La ROADMAP `ROADMAP-diffusiongemma.md` reste à écrire (item explicite de `PLAN-branchements.md` §D) ; elle intègrera les 3 sous-items orphelins : le bench différentiel multi-LLM, la métrique de complétude (match% = types de requirement manquants), et le multimodal mockup→view-specs (markitdown fait doc→md, pas image→view). (b) Le port Go + son miroir de reproductibilité ne seront gravés qu'**après** un spike rentable — pas avant. (c) **OpenQuestions** (forward-deps, ne bloquent pas) : le coût/latence d'un modèle de diffusion en bench différentiel ; la frontière exacte « type de requirement manquant » (réutilise-t-elle la taxonomie de `check-completeness` ou une métrique propre ?) ; l'intégration éventuelle avec `/ai-lab` (patron LLM gaté partagé).
- Le mur, le déterminisme-first et l'interdit du truth-test (§8) sont **inchangés** ; DiffusionGemma n'est qu'un capteur de complétude gouverné, gatée derrière un spike, qui propose et ne gouverne jamais.
