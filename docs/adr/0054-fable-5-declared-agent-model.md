# ADR 0054 — Le modèle déclaré de la couche-agent du produit passe à Claude Fable 5

- **Statut :** accepté (approbation humaine explicite, 2026-06-12 : « Oui on passe tout en Fable 5 ultracode »)
- **Date :** 2026-06-12
- **Contexte KRD :** S52 (agent layer) · BA01-BA03 (knobs gouvernés) · GV (gouvernance) · CLAUDE.md §8 (« un override est une décision enregistrée »)

## Contexte

La couche-agent gouvernée du produit (S52 `agentlayer`, BA `agentimpl`, GV `governance`) **déclare** le modèle de chaque agent au-dessus de la ligne : `AgentSpec.Modele`, le jeu clos `knownModelsByProvider`, et les implémentations de référence. Depuis S52 la valeur déclarée était `claude-opus-4-8`. Anthropic a publié **Claude Fable 5** (`claude-fable-5`), nouveau palier au-dessus d'Opus ; la **toolchain de build** d'AIDOS est déjà épinglée Fable 5 + ultracode (commit `20912ff`).

## Décision

1. **Le modèle Anthropic déclaré par défaut devient `claude-fable-5`** partout dans la couche-agent du produit : `AgentSpec.Modele` des agents de référence (bdd-writer, executor…), `ReferenceImpl()` (governance), les couches `agentimpl`/`agentloop`, et les données Workbench (`agentlayer-data.ts`).
2. **Le jeu clos** `knownModelsByProvider[ProviderAnthropic]` devient `{claude-fable-5, claude-sonnet-4-5, claude-haiku-4-5}` — Fable 5 **remplace** Opus 4.8 en tête (le jeu reste clos, déclaré, jamais découvert au runtime ; sonnet/haiku restent déclarés pour les rôles légers et les tests de perturbation).
3. Les **miroirs** (fixtures + property tests, 8 fichiers) sont mis à jour de façon **cohérente avec la vérité** qu'ils épinglent — même geste, même commit (un miroir qui épingle l'ancienne valeur après la décision serait un monstre inversé).
4. Côté **harness/headless**, « ultracode » n'est pas une valeur `--effort` du CLI : l'ultracode headless = le **mot-clé `ultracode` dans le prompt** (détecté par le harness → orchestration multi-agents armée) + `--effort xhigh` (+ `effortLevel: xhigh` en défaut projet) + les instructions d'orchestration. Les scripts de lancement portent les trois.

## Conséquences

- Les hash content-adressés (`AgentSpec.ID`) qui couvrent `Modele` changent ; les fixtures qui les épinglaient sont régénérées dans le même commit.
- Ce changement est une **décision enregistrée** (le présent ADR + provenance = l'approbation humaine du 2026-06-12), pas une édition silencieuse (§8/§9).
- `claude-opus-4-8` n'est plus déclarable pour un agent du produit ; le re-déclarer passerait par un nouveau /goal (le jeu est clos).
