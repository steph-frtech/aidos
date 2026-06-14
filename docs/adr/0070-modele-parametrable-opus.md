# ADR 0070 — Le modèle d'exécution redevient Opus 4.8, et devient PARAMÉTRABLE

- **Statut :** accepté (décision humaine, 2026-06-13 : « Repasse tout en opus 4.8 partout, rends-le paramétrable, car fable-5 est désactivé »)
- **Date :** 2026-06-13
- **Contexte KRD :** supersede ADR 0054 (qui avait gravé Claude Fable 5) · CLAUDE.md §7 · §8 (« un override est une décision enregistrée »)

## Contexte

ADR 0054 avait basculé toute la chaîne (toolchain + couche-agent du produit) sur **Claude Fable 5**. **Fable 5 a été désactivé** côté fournisseur ; le pipeline headless (piste DP en tmux) tournait donc à vide. Le balayage opus→fable→opus à la main est coûteux et fragile (cf. le piège des octets NUL de `lib/agentlayer.ts`).

## Décision

1. **Retour à `claude-opus-4-8`** partout : toolchain (settings, agents, workflows, scripts, actions runtime) **et** couche-agent déclarée du produit (jeu clos `knownModelsByProvider` / `KNOWN_MODELS_BY_PROVIDER` Go + twin TS, tous les `Modele:`/`model:` de référence, miroirs cohérents dans le même geste).
2. **Le modèle devient PARAMÉTRABLE — un seul point de vérité par plan :**
   - **Sessions + agents** : `.claude/settings.json` `"model"`. Les **84 agents passent à `model: inherit`** — ils suivent le défaut ; basculer toute la flotte = **une ligne** dans `settings.json` (plus jamais un sweep des 74 frontmatters).
   - **Lancements headless** (cron/tmux) : variable d'env **`AIDOS_BUILD_MODEL`** (défaut `claude-opus-4-8`).
   - **Appels LLM runtime** (ai-lab/v2/v3 server actions) : variable d'env **`AIDOS_LLM_MODEL`** (défaut `claude-opus-4-8`).
   - **Orchestrateur `plan:parse`** : alias `'opus'` dans les 4 workflows.
3. La couche-agent du produit reste une **vérité déclarée** : la valeur `claude-opus-4-8` est posée par cette décision enregistrée (ADR), pas une édition en passant ; un futur changement de modèle déclaré repasse par /goal (le jeu reste clos).

## Conséquences

- **Pour changer de modèle demain** : `settings.json` (`model`) + `AIDOS_BUILD_MODEL` + `AIDOS_LLM_MODEL` — trois leviers, zéro sweep de fichiers.
- Le commit-trailer de session suit le modèle réel qui écrit (le harness l'impose par session) ; les builds headless relancés tournent sur `AIDOS_BUILD_MODEL`.
- Piège retenu (déjà dans la mémoire) : `front/web/lib/agentlayer.ts` contient des octets NUL → `grep` le saute (binaire) ; toujours `grep --text` / `sed` direct pour les balayages de modèle.
- ADR 0054 est **superseded** ; les contraintes du mur sont inchangées.
