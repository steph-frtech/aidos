# ADR 0085 — Agent Factory / Profile Resolver (FKE-14) : une fonction pure unique qui résout le profil complet depuis le kernel cible

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §2 (le mur) · §6/§8 (determinism-first — « l'algorithme gagne, l'agent défère » ; « weights declared, never learned ») · §7 (la flotte d'agents, `model: inherit`) · KRD FKE-14 (l'Agent Factory promis) / FKE-45 (le delta « à faire ») · ADR 0054→0070 (la couche-agent gatée) · dépend de **ADR 0082** (harness templates / topologies Ashby — pas de harness à résoudre sans templates) · réutilise S52 (`kernel.agent_layer`, BA21 `MatchRole`) + `back/runtime/context/router.go` (le ContextRouter « algorithme, pas prompt ») · cf. ADR 0072 (décision-mère : le Workbench EST Go/Postgres ; les résolutions de vérité passent par le moteur, jamais un jugement front)

## Contexte

Le Tome (FKE-14) promet une **Agent Factory** : une fonction qui, devant un kernel cible (une cellule, un goal, un RedWorkItem), **résout le profil complet de l'agent qui va le traiter** — son **profil**, son **harness** (le bundle guides+sensors par topologie, ADR 0082), ses **skills**, ses **policies**, son **context** (le ContextPack), son **evidence** (le niveau de preuve E0-E7 exigé), son **autonomie** (l'échelle A0-A8) et sa **police** (la gate de gouvernance). FKE-45 liste explicitement cette fonction comme un **delta « à faire »**.

**Preuve d'audit (`wi2zxij70`).** Seuls deux morceaux du résolveur existent, chacun isolé :

- `back/runtime/scheduler/matchrole.go` (BA21, `MatchRole`) résout **un seul attribut** : `Layer → rôle → agent`. Son en-tête est déjà exemplaire — « Role-matching is an ALGORITHM over declared roles, NEVER an LLM prompt. The Layer→role map is DECLARED (`layerRole`), never learned ; same `(item, agents)` ⇒ same `(chosenAgentRef, ok)`. No clock, no rng, no I/O ». C'est exactement le régime determinism-first §8 — mais il ne résout **que le propriétaire**, pas le profil entier.
- `back/runtime/context/router.go` (le ContextRouter) résout **un autre attribut** isolément : le sous-graphe → le ContextPack, « an algorithm, not a prompt ».

Il n'existe **aucune fonction unique** qui compose ces huit attributs en un profil. Chaque cellule reçoit donc un assemblage ad-hoc — le même défaut de variété requise (loi d'Ashby) que le harness ad-hoc dénoncé par ADR 0082. Sans templates de harness à composer, le résolveur n'aurait d'ailleurs rien à résoudre sur l'axe harness : **0085 dépend de 0082**.

## Décision

**Généraliser `MatchRole` et le `ContextRouter` en UNE fonction pure unique — l'Agent Factory / Profile Resolver (FKE-14) — qui résout le profil COMPLET de l'agent depuis les attributs DÉCLARÉS du kernel cible, jamais par un jugement LLM.**

1. **Une signature, huit sorties.** `ResolveProfile(target) → AgentProfile{ profil, harness, skills, policies, context, evidence, autonomie, police }`. La cible (`target`) porte les **attributs lus du kernel** — le render `Layer` (comme `MatchRole`), le sous-graphe affecté (comme le ContextRouter), la topologie de la cellule (crud/workflow/event-processor/dashboard — ADR 0082), le niveau de preuve exigé (E0-E7, cf. `prooftype`), l'autonomie déclarée (A0-A8) et la police de gouvernance applicable. Chaque sortie est **dérivée** d'attributs déclarés, jamais inférée.

2. **Le résolveur est un ALGORITHME, jamais un prompt (§6/§8).** Chaque axe est une table ou une lecture déclarée : harness ← `HarnessFor(topologie)` (ADR 0082, fragments composables) ; rôle/agent ← le `MatchRole` existant (réutilisé tel quel, jamais réécrit) ; context ← le `ContextRouter` existant ; skills/policies/evidence/autonomie/police ← les attributs `SELECT`és depuis `kernel.agent_layer` (S52) et le kernel cible. Les **poids et seuils sont déclarés, jamais appris** (§8). Aucune horloge, aucun rng, aucune I/O dans la fonction de résolution — `same target ⇒ same profile`.

3. **Le mur tient (§2).** `ResolveProfile` est une lecture pure TOTALE au-dessus de données déclarées : elle **CHOISIT** la configuration de l'agent, elle n'écrit **aucune vérité** (ni kernel, ni mirrors, ni fitness). Comme `MatchRole`, elle ne propose jamais une vérité et ne franchit jamais le mur ; un attribut manquant se résout en `ok=false` (jamais un repli silencieux sur un mauvais profil — la famine BA21/E3 reste surfacée, pas masquée).

4. **L'agent défère au code (§6, jamais l'inverse).** Le profil est **calculé**, pas demandé à un LLM. Le LLM reste l'exception gatée pour la seule génération irréductible *à l'intérieur* du profil ainsi résolu ; il ne **choisit pas** le profil. Un résolveur qui appellerait un LLM pour décider un attribut résoluble par table serait un **determinism gap** qui bloque le step (comme une capacité headless ou un monstre).

5. **Réutilisation, pas réinvention.** `MatchRole` et le `ContextRouter` ne sont **pas remplacés** : ils deviennent deux des huit branches que `ResolveProfile` compose. La généralisation est **additive** (§9) — on ajoute un point de composition, on n'altère ni le matcher ni le router.

6. **Une preuve de reproductibilité (§6).** Comme `matchrole_property_test.go` épingle `MatchRole`, `ResolveProfile` porte son **miroir de reproductibilité** (property test : même cible ⇒ même profil byte-stable) — la garantie determinism-first sur le nouveau point de composition.

## Conséquences

- **Positif.** Un seul point de vérité pour « quel agent, configuré comment, devant ce kernel » — la variété requise d'Ashby est résolue par composition de fragments déclarés, jamais par un assemblage ad-hoc. Le régime exemplaire de `MatchRole` (algorithme, déclaré, reproductible) est étendu aux huit axes sans le diluer. Le mur, le déterminisme et l'anti-overwrite sont inchangés ; la Factory les *augmente* (un résolveur qui ne peut, par construction, que **lire des attributs déclarés**).
- **Coûts assumés.** (a) `ResolveProfile` ne peut être complète **qu'après ADR 0082** : l'axe `harness` n'a rien à composer tant que les templates de topologie n'existent pas — c'est la dépendance dure du séquencement (§C du plan : 0082 avant 0085). (b) Sévérité **low-medium** : la fonction est structurante mais non bloquante (les deux résolveurs partiels tiennent déjà le chemin vivant) ; elle se branche au point d'entrée du scheduler (BA21/BA22) sans réécrire le shell de lease.
- **OpenQuestions (forward-deps, ne bloquent pas).** La persistance Postgres des `AgentProfile` résolus (aujourd'hui les attributs vivent en `kernel.agent_layer` + records — back-fill S17/S31, cf. ADR 0073) ; la frontière exacte entre l'autonomie A0-A8 et la maturity ladder (renvoyée à ADR 0083) sur l'axe `autonomie`.
