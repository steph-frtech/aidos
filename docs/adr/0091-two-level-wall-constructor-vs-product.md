# ADR 0091 — Le mur a deux niveaux : constructeur d'AIDOS (non gaté) vs utilisateur final (gaté)

- **Statut :** accepted (2026-06-16)
- **Contexte KRD :** CLAUDE.md §2 (le mur), ADR 0075 (le hook PreToolUse `wall.sh`), §5 (« un artefact AJOUTE une garde, n'en RETIRE jamais »).
- **Déclencheur :** en matérialisant `kernel.operation` (ADR 0090), le hook `wall.sh` a refusé l'écriture de l'agent dans `back/migrations/` (`AGENT_WRITE_ABOVE_WATERLINE`). Le propriétaire a clarifié : *« le mur, ce sera l'utilisateur final ; toi, ici, tu CONSTRUIS AIDOS — fais en sorte que le constructeur n'ait jamais ce souci. »*

## Le constat

Le mur (CLAUDE.md §2) protège la **vérité de l'utilisateur final** : quand quelqu'un construit *son* app **avec** AIDOS, l'agent qui bâtit son app ne peut pas écrire la vérité de son app directement — seul `idée → miroir → /goal → ChangeSet` (approbation humaine) le fait. Cette garantie est enforced **CÔTÉ SERVEUR** :

1. la **passerelle S58** (le routeur server-side refuse un truth-write, `GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET`) ;
2. les **GRANTs Postgres** (le rôle de l'utilisateur n'a aucun GRANT d'écriture sur les tables de vérité) ;
3. l'**agentlayer S52** (`MayWrite`/`Validate`/`Propose`/`Approve`).

Le hook **`wall.sh`** (ADR 0075), lui, gate l'**agent Claude-Code qui édite l'arbre source d'AIDOS** — c'est-à-dire **l'agent-CONSTRUCTEUR de l'OS lui-même**. Or, *bâtir le substrat EST le travail du constructeur* : **toutes** les migrations kernel (`kernel_records`, `kernel_control_action`, `kernel_expr`, …) ont été créées ainsi. Gater le constructeur sur `back/migrations/` était une **erreur de niveau** : `wall.sh` démontrait le mur produit en l'appliquant au mauvais agent.

## Décision

`wall.sh` devient **conscient de deux niveaux**, via le signal `AIDOS_BUILD_MODE` (posé **uniquement** dans l'environnement de **construction d'AIDOS** — `settings.json` `env` + les launchers headless `autoresume-build.sh`/`restart-and-build.sh` ; **jamais** le runtime produit) :

| | `wall.sh` (hook Claude-Code) | Enforcement produit (serveur) |
|---|---|---|
| **Constructeur d'AIDOS** (`AIDOS_BUILD_MODE=1`) | **audite + AUTORISE** (jamais bloqué) | s.o. (le constructeur EST le développeur de l'OS) |
| **Utilisateur final / produit** (pas de flag) | **REFUSE** (inchangé, `AGENT_WRITE_ABOVE_WATERLINE`) | passerelle + GRANTs + agentlayer (la vraie garantie) |

Le **classifieur Go** (`back/hooks/pretooluse`, l'autorité déterministe) est **INCHANGÉ** — il continue de refuser en mode produit, et ses miroirs (`wall_property_test`/`wall_bdd_test`) restent verts. La conscience du mode vit dans le **shim** (la couche d'intégration Claude-Code), pas dans la logique du mur.

## Ce n'est PAS retirer une garde (§5)

- La **garantie produit** (pour l'utilisateur final) est **intacte** : elle n'a JAMAIS dépendu de `wall.sh` — elle est server-side (passerelle + GRANTs + agentlayer). Prouvé : la passerelle refuse `kernel_write` (`GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET`), `aidos_agent` n'a que `SELECT`.
- `wall.sh` **REFUSE toujours** en l'absence du flag (le défaut, le mode produit/démo) — la démonstration tient.
- En mode construction, le hook **AUDITE** (une ligne `🏗 [wall · construction] … audité`) — on **AJOUTE** de la traçabilité, on ne retire rien.

## Conséquences

- **+** le constructeur d'AIDOS bâtit le substrat (migrations, kernel) sans être faussement bloqué — « ce souci » ne se reproduit plus.
- **+** la frontière conceptuelle est explicite et documentée (produit vs construction).
- **+** miroir de fault-injection au niveau shim : `.claude/hooks/wall_build_mode_test.sh` (produit REFUSE / construction AUDITE+AUTORISE / below-line libre dans les deux).
- **−** un signal d'environnement de plus (`AIDOS_BUILD_MODE`) à maintenir dans les launchers — fait (settings.json + les 2 scripts).
- **garantie produit inchangée** : à l'exécution, l'utilisateur final reste gaté côté serveur.

## Alternatives écartées

- *Désactiver `wall.sh`* : non — on perdrait la démonstration produit + l'audit. On le SCOPE, on ne le supprime pas.
- *Modifier le classifieur Go* : non — il est l'autorité du mur produit ; on garde sa logique + ses miroirs purs. La conscience du contexte vit dans le shim.
- *Détecter le repo plutôt qu'un flag* : fragile (l'utilisateur final peut avoir un repo). Un flag explicite, posé dans l'environnement de construction, est le signal sûr.
