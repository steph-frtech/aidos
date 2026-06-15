# ADR 0077 — Un seul chemin de déploiement projet + les vrais verbes métier par projet (projection kernel.operation)

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur docs/plan/PLAN-branchements.md)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §3 (Operation DSL interprété en Go, sqlc/pgx, Atlas) · §6/§8 (determinism-first, rebuild reproductible) · §9 (anti-overwrite, anti-double-source) · ADR 0040 (app émise = Hono) · ADR 0043 (IaC = Pulumi) · ADR 0052 (pipeline de déploiement émis) · ADR 0072 (décision-mère : le front Next APPELLE le moteur Go pour toute op de vérité ; généré = Hono) · ADR 0076 (le substrat gelé émis, réellement utilisé) · steps S17/S31 (projection kernel → Operation — forward-dependency à lever)

## Contexte

L'audit `w91305w3q` (2026-06-15) a relevé, dans le chemin de déploiement projet, **trois divergences** entre ce que le concept promet (« une vraie app codée depuis ses specs ») et ce que le code fait :

1. **Double source de déploiement.** Deux écrans déploient un projet par deux chemins distincts. `front/web/app/v3/V3Session.tsx` (createProject) déploie avec une liste d'entités **vide** (`[]`), tandis que `EnvsClient.tsx` (la gestion d'environnements) déploie avec les vraies entités + les `sessionScreenOverrides`. Deux sources pour un même geste : à la création, l'app naît creuse ; ce n'est qu'au passage par les environnements qu'elle reçoit ses entités. C'est une violation de l'anti-double-source (§9) — le même comportement doit avoir **une** source.

2. **Les verbes métier sont figés morts.** `back/cmd/aidospulumi/materialise_hono.go` (l. 391-438) construit le `ServerSpec` Hono depuis les entités du projet, mais l'**ancre d'opérations reste `createOrder`** — le seul verbe que le système connaît « pré-projection kernel ». Le commentaire (l. 397-405) l'écrit noir sur blanc : *« the OPERATIONS cut … stays the demo createOrder anchor for now … until the kernel.operation projection (S17/S31, OpenQuestion) feeds the … »*. Conséquence : toute app émise expose le **même** `POST /createOrder` mort, quelles que soient ses specs. L'app n'a pas ses vrais verbes métier — elle a la démo de la démo.

3. **Le binaire déployeur peut dériver.** Le déploiement passe par le binaire `aidospulumi-bin` (compilé depuis `back/cmd/aidospulumi`). Rien ne garantit qu'il est **rebuild** quand `cmd/aidospulumi` change : un binaire stale déploierait l'ancien comportement tout en affichant le nouveau code — un mensonge silencieux (§8 : « done » calculé, jamais déclaré).

La forward-dependency racine est **S17/S31** : la projection `kernel.operation → []Operation`. Tant qu'elle n'est pas levée, le serveur émis ne peut pas connaître les verbes du projet. L'ADR 0072 ayant tranché que la vérité (donc les operations) vit en Postgres et que le moteur Go la projette, cette projection cesse d'être une fatalité bootstrap : elle devient le chemin normal.

## Décision

**Le déploiement d'un projet emprunte UN SEUL chemin (`deployCurrentProject`), réutilisé par createProject ET EnvsClient ; le serveur émis tire ses VRAIS verbes métier de la projection `kernel.operation` par projet (S17/S31) ; et le binaire déployeur est rebuild de façon déterministe dès que sa source change.**

1. **Un seul `deployCurrentProject()`.** Une fonction unique assemble l'intégralité de l'intrant de déploiement — `emitApp` + les **entités** du projet + les `sessionScreenOverrides` (les `ScreenDesign`/`ViewAdaptation` de l'ADR 0071) — et **createProject** comme **EnvsClient** l'appellent. Fini la liste vide à la création : une app naît avec ses entités dès le premier déploiement. Source unique du geste (anti-double-source, §9). Côté ADR 0072, cet appel passe par le moteur Go (gateway/MCP) pour toute lecture de vérité, jamais par une recopie front.

2. **Projection `kernel.operation` → `[]Operation` par projet (S17/S31).** `projectServerSpec(project, ents)` (l. 405 de `materialise_hono.go`) **lit les operations du store** (le kernel Postgres, via le moteur Go — ADR 0072) au lieu de l'ancre `createOrder` figée. Le `ServerSpec` Hono expose alors les **vrais verbes métier** du projet : chaque `Operation` du kernel devient une route `POST /<op>` interprétée par le sidecar Go (l'Operation DSL interprété, §3). Le `createOrder` mort (l. 408-438) disparaît au profit du cut réel. Cela **lève la forward-dependency S17/S31** sur le chemin de déploiement : la promesse « app codée depuis ses specs » devient vraie pour les operations comme elle l'est déjà pour les entités.

3. **Rebuild déterministe du binaire déployeur.** Un Makefile (ou un hook) **recompile `aidospulumi-bin`** dès que `cmd/aidospulumi` change, de façon reproductible (mêmes sources → même binaire, §6/§8). Plus de binaire stale qui déploierait un comportement périmé : le déployeur exécuté est toujours le déployeur du code courant. C'est une garantie de déterminisme appliquée à l'outil de déploiement lui-même.

L'émission reste **déterministe** de bout en bout : les operations projetées passent par l'émetteur Hono pur (mêmes operations → mêmes routes, mêmes bytes), jamais par une génération LLM de serveur (ce serait un `AGENT_DETERMINISM_GAP`). Les `ScreenOverride` injectés dans le déploiement restent **below-the-line** (voie `ViewAdaptation`, ADR 0071) ; un changement de truth (entité, operation) reste **above-the-line** (`idée → miroir → /goal → approbation`), jamais une écriture en passant depuis l'écran (§2, le mur).

Branche (du plan) : `front/web/app/v3/V3Session.tsx` + `EnvsClient.tsx` (le `deployCurrentProject` unique), `back/cmd/aidospulumi/materialise_hono.go` (l. 391-438 : `projectServerSpec` lit le cut operations au lieu de `createOrder` figé), un Makefile/hook pour le rebuild de `aidospulumi-bin`.

## Conséquences

- **Positif.** Le cœur de « vraie app codée depuis ses specs » devient vrai pour les **operations** : chaque projet expose ses propres verbes métier, plus le `createOrder` universel mort. Une seule source de déploiement supprime la classe de bugs « app créée vide puis remplie ailleurs » (anti-double-source, §9). Le rebuild déterministe ferme le trou « binaire stale » (§8 — l'outil ne ment plus sur le code qu'il exécute). La forward-dependency S17/S31 est **levée** sur ce chemin (conformément à ADR 0072 qui pose Postgres comme vérité live des operations). Determinism-first respecté (projection pure + émetteur pur).
- **Coûts assumés.** (a) `projectServerSpec` dépend maintenant du store kernel : un projet sans operation projetée émet un serveur **op-less** (routes de lecture seules) — état valide et honnête, jamais un faux `createOrder`. (b) Le miroir `materialise_hono_projectview_test.go` (et frères) doit être étendu pour sceller le cut operations réel, pas l'ancre. (c) Le rebuild ajoute une étape au pipeline de déploiement (Makefile/hook) — coût de build assumé contre la garantie de non-dérive.
- **OpenQuestions (forward-deps, ne bloquent pas).** La forme exacte de la projection `kernel.operation` (l'AST Operation → `ServerSpec`) suit S17/S31 ; tant que le store n'expose pas les operations, le chemin retombe proprement sur un serveur op-less (pas sur `createOrder`). La persistance Postgres complète du store (vérité live) suit ADR 0072/0073. Questions ouvertes documentées, jamais des `residual_issues` bloquants (§6, exception bootstrap).
- Le mur reste **inchangé** : déployer une app (below-the-line) agit directement, mais changer une operation ou une entité (truth) passe toujours par `idée → miroir → /goal → approbation`. Cet ADR unifie le chemin de déploiement sans ouvrir une porte dans le mur.
