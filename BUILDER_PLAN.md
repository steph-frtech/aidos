# BUILDER_PLAN — app-builder S53→S117 (exécutable par /long-run)

> Colonne vertébrale parseable. Le **Detail** de chaque étape pointe la ligne correspondante de `docs/plan/ROADMAP-app-builder.md` (source complète : objectif + Note KRD) pour garder `plan:parse` léger. Discipline §6 à chaque étape : grill-with-docs → miroir rouge → tdd → senseurs → complétude → diagnose → UI exécutable + e2e Playwright → improve-architecture → accrétion d'artefacts (agent `step-sNN` + skills/hooks/MCP au besoin) + **2 pages Mintlify** + **ticket Linear**. « Done » calculé : red→vert ∧ vert antérieur intact ∧ mutation ≥ seuil ∧ aucun monstre. Le **mur** : toute écriture-vérité = propose→ChangeSet→approbation ; aucun GRANT agent sur kernel/mirrors/fitness. **Stack émise** = Hono/TS fonctionnel (ADR 0040) ; **déploiement** = langage IaC Pulumi/TS (ADR 0043) ; les étapes E9/E10 (S87→S99) consomment AUSSI `docs/plan/ROADMAP-provisioning-deploy.md` (DP01→DP33) + ADR 0043.

---

## S53 — Entité racine `project` + ProjectScope
**Sous-systeme:** Kernel / Archive
**Objectif:** Record `project` (slug, name, owner_ref, created_at, lifecycle active|archived|deleted) content-adressé, concept Kernel de premier rang scopant toute vérité ; schéma Postgres `projects` ; nœud racine DAG par projet ; soft-delete append-only.
**Detail:** ROADMAP-app-builder.md §EPIC 1 (S53). Scope précède toute lecture/écriture scopée — fondation absolue.
**Inputs:** S02 records, S24 DAG, le chemin store (S00/S01).
**Criteres de done:** property — id content-adressé, slug unique par owner, deux graphes-projets disjoints (aucune lecture croisée) ; `/projects` écrit below-the-line via store ; scoping = fonction pure.

## S54 — Project-scope migration du truth-store
**Sous-systeme:** Archive
**Objectif:** Migration Atlas expand-contract ajoutant `project_id` (FK) à kernel·mirrors·ideas·changesets·dag·brain·context ; backfill du graphe singleton dans un projet seed `__system__` (démo Order).
**Detail:** ROADMAP-app-builder.md §EPIC 1 (S54). Réutilise la skill `migrate`, DataTruthScope-gated.
**Inputs:** S53.
**Criteres de done:** `migrate` prouve zéro perte (append-only) + toutes FK résolvent ; fixture — requête scopée A ne renvoie jamais de ligne B ; émission de migration reproductible.

## S55 — Mur project-aware + RLS keyée identité + ContextRouter project-scopé
**Sous-systeme:** Runtime
**Objectif:** Hook PreToolUse + GRANTs RLS : le rôle agent ne lit/écrit below-the-line que pour le projet courant (écriture croisée refusée `AGENT_CROSS_PROJECT_WRITE`) ; RLS keyée sur l'identité propagée (S61) ; ContextRouter ne compile que depuis le sous-graphe du projet actif.
**Detail:** ROADMAP-app-builder.md §EPIC 1 (S55). Défense en profondeur — couche 2 indépendante de la passerelle. S55 livre le mécanisme RLS, S61 le branche sur l'identité réelle (forward-dep documentée).
**Inputs:** S53, S54, S33 ContextRouter.
**Criteres de done:** fault-injection — hook ET RLS rougissent indépendamment ; property — ContextPack de A contient zéro nœud de B ; fixture — identité forgée passerelle refusée par la RLS ; routeur = algorithme.

## S56 — Racines DAG par projet + namespacing content-store + cycle de vie
**Sous-systeme:** Archive
**Objectif:** Genèse DAG + namespace content-adressé par projet ; branch/checkout/rebranch/merge dans la frontière du projet (merge inter-projets refusé `CROSS_PROJECT_MERGE`) ; gestures create/duplicate-from-template/archive/restore via MCP `project`.
**Detail:** ROADMAP-app-builder.md §EPIC 1 (S56).
**Inputs:** S53, S24 DAG, S20 changeset.
**Criteres de done:** fixture — phase coupée dans A invisible des heads de B ; duplicate forke une racine isolée ; archive masque sans détruire (append-only).

## S57 — Shell projet : liste, création, switcher
**Sous-systeme:** Workbench
**Objectif:** Route `/projects` (liste + create flow câblé au MCP S56, blank-vs-template, archive/duplicate) + project switcher dans WorkbenchHeader épinglant le `project_id` actif (cookie, comme NEXT_LOCALE) re-scopant chaque panel.
**Detail:** ROADMAP-app-builder.md §EPIC 1 (S57). Thémé + bilingue.
**Inputs:** S56, S57 nav, S44 cockpit.
**Criteres de done:** Playwright — créer deux projets, switcher, vérifier l'isolation + que `__system__` reste isolé.

## S58 — Passerelle MCP-over-HTTP
**Sous-systeme:** MCP / Runtime
**Objectif:** Service Go exposant CHAQUE outil MCP existant (store, mirror-runner, changeset, dag, idea-intake, memory, context, evolve, backtester, telemetry-reader, pact-verifier, mutation-runner, project) en endpoints JSON-RPC/HTTP project-scopés, mur appliqué côté serveur (below-the-line libre ; vérité via ChangeSet ; BlockReason au refus).
**Detail:** ROADMAP-app-builder.md §EPIC 2 (S58). Débloque tout épic piloté par UI.
**Inputs:** S53-S57, les 14 MCP existants.
**Criteres de done:** Pact par outil + provider-verification ; Godog — appel below-the-line round-trip jusqu'au Postgres live ; Testcontainers — ne contourne pas les GRANTs ; routage pur, zéro LLM.

## S59 — SDK client typé + cutover des fixtures
**Sous-systeme:** Workbench
**Objectif:** SDK TS généré depuis les contrats de la passerelle (jamais double-typé) ; bascule des panels read-only à forte valeur (store, records, mirrors, version-dag, red-wave, completeness, kernel-debt, ideas, goal, changeset) de *-data.ts vers reads live project-scopés ; fallback démo déterministe préservé (source: live|demo).
**Detail:** ROADMAP-app-builder.md §EPIC 2 (S59).
**Inputs:** S58.
**Criteres de done:** Vitest + fast-check — le client ne double-type jamais, le decoder rejette un payload malformé / retombe déterministe quand le DB est injoignable ; e2e par panel converti.

## S60 — Streaming live : red-set, red-wave, BlockReason
**Sous-systeme:** Workbench / Runtime
**Objectif:** La passerelle stream le red set / RedWorkQueue / état senseurs réels du goal ouvert du projet ; panel global `/blocks` + toasts inline rendent les vrais BlockReason (code, severity, explanation, how_to_fix[]) au refus.
**Detail:** ROADMAP-app-builder.md §EPIC 2 (S60).
**Inputs:** S58, S59, S13 BlockReason, S22 red-wave.
**Criteres de done:** le red set streamé égale le red set calculé pour un goal connu ; e2e — une écriture-vérité refusée surface son BlockReason actionnable.

## S61 — Auth + sessions + modèle compte + identité deux couches
**Sous-systeme:** Auth / Runtime
**Objectif:** OAuth/OIDC + sessions (Auth.js front, JWT vérifié par la passerelle) ; record `users` (id, email, identity_provider) dans schéma `accounts` ; l'identité se propage dans chaque appel passerelle ET descend jusqu'à la RLS Postgres (S55) — jamais gateway-only ; auth hors Kernel.
**Detail:** ROADMAP-app-builder.md §EPIC 3 (S61). Gate les portes d'approbation humaine.
**Inputs:** S55 (RLS), S58 (passerelle).
**Criteres de done:** Godog login→session→accès projet scopé ; property — appel non authentifié à un endpoint d'écriture-vérité refusé `UNAUTHENTICATED` + n'atteint aucune donnée ; fixture — identité valide passerelle sans ligne RLS ne lit rien (deux couches).

## S62 — Adhésion & propriété de projet
**Sous-systeme:** Auth / Archive
**Objectif:** Jointure `project_members` (user × project × role owner/editor/viewer) ; requêtes projet filtrent par adhésion ; `project.owner_ref` gagne un owner réel.
**Detail:** ROADMAP-app-builder.md §EPIC 3 (S62).
**Inputs:** S61, S53.
**Criteres de done:** fixture — appel d'un non-membre refusé `NOT_A_MEMBER` ; un viewer ne peut muter ; invite/remove/role via server action below-the-line.

## S63 — Humain lié à l'AuthorityGraph + provenance identifiée
**Sous-systeme:** Kernel / Auth
**Objectif:** Un user réel (via son rôle d'adhésion) mappé à une authority (approver/veto/escalation) par scope ; chaque Idea/ChangeSet enregistre l'humain agissant comme provenance — jamais un placeholder.
**Detail:** ROADMAP-app-builder.md §EPIC 3 (S63). Gate S66/S85/S110/S114.
**Inputs:** S61, S62, S16 AuthorityGraph.
**Criteres de done:** fixture — une proposition d'écriture-vérité exige l'approbation d'un user détenant l'authority du scope, sinon `INSUFFICIENT_AUTHORITY` ; un override = décision enregistrée (ChangeSet + ADR + provenance).

## S64 — « Capturez votre idée »
**Sous-systeme:** Workbench / MCP
**Objectif:** Boîte texte-libre (provenance humain, scopée projet) écrivant un vrai record `ideas` via le MCP idea-intake à travers la passerelle ; inbox d'idées par projet remplaçant la fixture `/ideas`.
**Detail:** ROADMAP-app-builder.md §EPIC 4 (S64). Consomme aussi le BesoinGraph EL16 (emit-ideas).
**Inputs:** S58, S61, idea-intake MCP.
**Criteres de done:** Godog capture → draft idea persisté visible dans le panel ideas live, avec la provenance du user.

## S65 — Boucle de grilling interactive en produit
**Sous-systeme:** Runtime / Workbench
**Objectif:** Surface conversationnelle exécutant le verdict `/grill` (sharp→grilled ; fuzzy→spiking ; bad→rejected avec raison tracée), une intention ≤ 5 scénarios, enregistrant verdict + provenance.
**Detail:** ROADMAP-app-builder.md §EPIC 4 (S65). Routage déterministe faisant autorité ; LLM = exception barricadée pour le dialogue, re-vérifié contre le schéma de verdict.
**Inputs:** S64, skill grill.
**Criteres de done:** fixture par branche de verdict ; logique de routage déterministe.

## S66 — `/goal` piloté par UI
**Sous-systeme:** Runtime / Workbench
**Objectif:** Depuis une idée grilled, OpenGoal (user avec authority) écrit un DRAFT ChangeSet (Truth + Mirror) ; le moteur calcule le vrai red set ; panel affiche la worklist red-set live ; Stop non-gameable.
**Detail:** ROADMAP-app-builder.md §EPIC 4 (S66). Actor placeholder jusqu'à S63 (forward-dep documentée).
**Inputs:** S65, S29 goal, S63 authority.
**Criteres de done:** Godog — fermer un goal refusé tant que ≠ (red→vert ∧ vert antérieur ∧ mutation ≥ seuil ∧ aucun monstre) ; l'écran propose un ChangeSet, n'écrit jamais le Kernel.

## S67 — Attacher un behavior-macro à la capture (§24.6) — consomme S76
**Sous-systeme:** Kernel
**Objectif:** À la capture, surfacer la librairie de behaviours (S79) ; attacher dry-run-expand en attributs/relations/operations/policies/fixtures comme proposition DRAFT, en appelant l'unique `Expand(behavior,entity)` de S76 (jamais une 2ᵉ impl).
**Detail:** ROADMAP-app-builder.md §EPIC 4 (S67). DÉPEND DE S76 — long-run exécute S76 avant S67 (ou S67 mocke l'expander, OpenQuestion).
**Inputs:** S76 (Expand), S64.
**Criteres de done:** property — expansion attachée byte-identique à S76 (une seule fonction) ; rendue comme ChangeSet proposé ; expansion = fonction pure, jamais LLM, jamais dupliquée.

## S68 — Panel d'autorat des trois formes + concurrence draft-level
**Sous-systeme:** Mirror
**Objectif:** Éditeur par forme — Gherkin N0 / propriété ∀ N1 / fixture state→cmd→events N2 — qui dérive la forme depuis la nature de la vérité et persiste un miroir rouge project-scopé dans `mirrors` (via ChangeSet) ; conflit au niveau brouillon (lock/CRDT), distinct de S110.
**Detail:** ROADMAP-app-builder.md §EPIC 5 (S68).
**Inputs:** S58, S06 mirrors, skill derive-mirror.
**Criteres de done:** property — sélection de forme déterministe par nature-de-vérité ; fixture — deux éditions concurrentes du brouillon fusionnent ou se verrouillent, jamais last-write-wins ; parsing de chaque forme = fonction pure.

## S69 — Matérialiser-et-le-voir-rougir
**Sous-systeme:** Mirror
**Objectif:** Chemin déclenché par le user matérialisant le miroir autorisé vers le runner (Godog/rapid/fixture) et streamant le statut rouge/vert live — le « watch it fail » en produit.
**Detail:** ROADMAP-app-builder.md §EPIC 5 (S69). Miroirs above-the-line, écrits par propose→approbation.
**Inputs:** S68, mirror-runner MCP.
**Criteres de done:** Godog auteur → matérialise → rouge contre code absent ; puis stub vert → vert.

## S70 — Librairie de miroirs par projet + vue de complétude
**Sous-systeme:** Mirror
**Objectif:** Miroirs du user listés par app avec liveness + complétude/détection de monstre live scopée au projet (vérité sans miroir vivant, miroir orphelin).
**Detail:** ROADMAP-app-builder.md §EPIC 5 (S70).
**Inputs:** S69, S12 complétude.
**Criteres de done:** fault-injection — le détecteur de monstre scopé projet se déclenche.

## S71 — Relations dans le système de types
**Sous-systeme:** Kernel
**Objectif:** Étendre l'Entity AST avec un nœud de relation distinct `ref` (1-1 / 1-N / N-N, FK/association/composition) + invariants d'intégrité référentielle, en gardant l'ensemble scalaire clos.
**Detail:** ROADMAP-app-builder.md §EPIC 6 (S71). Gate l'émission multi-entités E9 — DOIT atterrir avant S87.
**Inputs:** S35 entity source.
**Criteres de done:** property — relation round-trip comme AST content-adressé ; relation vers entité inexistante refusée `UNKNOWN_RELATION_TARGET` (jamais devinée).

## S72 — Type blob/fichier + provisioning de stockage objet
**Sous-systeme:** Kernel / Generators
**Objectif:** Nouveau type d'attribut `blob`/`file` (nœud AST, ensemble clos préservé) ; provider de stockage objet par projet (scopé project_id, jamais truth-store/git) ; émetteur du handling upload/download (URLs signées, validation MIME/taille).
**Detail:** ROADMAP-app-builder.md §EPIC 6 (S72). ADR du provider (slot replaceable).
**Inputs:** S71.
**Criteres de done:** property — attribut blob round-trip + émet un handler d'upload déterministe ; fixture — blob de A inaccessible de B ; upload hors-MIME/taille refusé.

## S73 — Operation asynchrone/planifiée + outbox
**Sous-systeme:** Kernel
**Objectif:** Étendre l'Operation DSL avec un nœud async/scheduled (cron, queue, webhook-out, email/notification) + pattern outbox transactionnel (exactly-once relatif) + sa forme fixture state→scheduled-cmd→events.
**Detail:** ROADMAP-app-builder.md §EPIC 6 (S73). Gate S74 puis S87/S90. Substrat = Windmill/NATS (DP16, ADR 0043).
**Inputs:** S10 Operation DSL.
**Criteres de done:** fixture — operation planifiée s'exécute à l'échéance + émet events ; outbox rejoue un effet non dispatché après crash sans doublon ; property — planification déterministe sur l'horloge injectée ; scheduler = code.

## S74 — Émetteurs relation-aware (+ async + blob)
**Sous-systeme:** Generators
**Objectif:** EmitGo/EmitTS/EmitDDL rendent FK/join tables/associations typées/navigation SDK depuis l'AST relation S71, les workers/cron/outbox S73, le handling blob S72 — déterministe et hash-protégé. (Cible TS/Hono, ADR 0040.)
**Detail:** ROADMAP-app-builder.md §EPIC 6 (S74). Cible d'émission = TS/Hono (ADR 0040), pas sqlc/pgx — client TS + Atlas.
**Inputs:** S71, S72, S73, S34 émetteurs.
**Criteres de done:** property — même AST multi-entités → sortie byte-identique ; un N-N émet une join table ; FK du DDL référencent de vraies tables ; un nœud async émet un worker + table outbox.

## S75 — Modeleur entité/relation (canvas) + concurrence draft-level
**Sous-systeme:** Workbench / Kernel
**Objectif:** Définir entités (attributs scalaires/blob, types, identifiants) + tracer relations ; persister chaque entity/relation comme source Kernel project-scopée via propose→ChangeSet→approbation ; édition concurrente du canvas gérée au niveau brouillon (présence/lock/CRDT).
**Detail:** ROADMAP-app-builder.md §EPIC 6 (S75). Le modeleur produit un ChangeSet `proposed`.
**Inputs:** S71, S72, S58, skills view/action.
**Criteres de done:** Playwright — modéliser Customer↔Order, proposer, approuver, le voir dans l'entity-map live ; reject laisse le Kernel intact ; deux éditeurs simultanés ne s'écrasent pas.

## S76 — AST behavior-macro + expander dry-run déterministe (l'UNIQUE Expand)
**Sous-systeme:** Kernel
**Objectif:** Record `behavior` (ownable, versioned, taggable, localizable) dont `Expand(behavior,entity)` est une fonction pure UNIQUE et faisant autorité produisant attributs/relations/operations/policies/fixtures — jamais un LLM, jamais ré-implémentée (S67/S77/S79/S80/S81 la consomment).
**Detail:** ROADMAP-app-builder.md §EPIC 7 (S76). ATTERRIT AVANT S67/S79 (note de dépendances §4).
**Inputs:** S71, S26 curation §24.6.
**Criteres de done:** property — même behavior+entité → expansion identique et idempotente ; l'expansion = ChangeSet proposé, jamais vérité appliquée ; code faisant autorité, source unique.

## S77 — Autorat Operation / Policy / Control / Action du domaine du user
**Sous-systeme:** Workbench / Kernel
**Objectif:** Éditeurs typés (pas de code libre) sur les DSL — Operation (validate/authorize/read/mutate/return, dont async/scheduled S73), Policy (arbre ALLOW/DENY), verticale control+action (visible_when/enabled_when/triggers → invoke operation), chacun via ChangeSet.
**Detail:** ROADMAP-app-builder.md §EPIC 6 (S77). Réutilise les interpréteurs S09/S10 + skills action/view.
**Inputs:** S73, S09 policy, S10 operation, S11 control/action.
**Criteres de done:** fixture state→cmd→events — un control autorisé déclenche son operation autorisée ; enabled_when false bloque l'action ; parsing DSL = fonction pure.

## S78 — Régénération project-scopée (« Régénérer mon app »)
**Sous-systeme:** Runtime
**Objectif:** Action liée au Kernel du user exécutant les émetteurs déterministes pour TOUTES les entités/operations (sync+async)/controls/blobs du projet vers la cible d'émission ; détection de projection périmée par source-hash.
**Detail:** ROADMAP-app-builder.md §EPIC 6 (S78). Réutilisée par preview/deploy E10.
**Inputs:** S74, S77.
**Criteres de done:** property — régénération byte-stable + refuse si un fichier généré est hand-edité.

## S79 — Librairie behaviors user-facing (consomme l'Expand de S76)
**Sous-systeme:** Workbench / Archive
**Objectif:** Route `/behaviors` : browse / search (match déterministe type-rg, pas un LLM) / tag / attach / soft-delete / publish / comment, project-scopé ; attacher prévisualise l'expansion (policies+fixtures) en appelant l'unique `Expand` de S76 et l'atterrit via ChangeSet approuvé.
**Detail:** ROADMAP-app-builder.md §EPIC 7 (S79).
**Inputs:** S76, S26 curation.
**Criteres de done:** fixture — attacher `owner-scoping` à une entité prévisualise policies+fixtures scopées et les atterrit via changeset approuvé.

## S80 — Behavior-macro « auth & rôles de l'app émise »
**Sous-systeme:** Kernel / Archive
**Objectif:** Behavior-macro `app-auth` réutilisable (entités user/role/session, operations login/logout, policies authz par rôle) que l'utilisateur attache à son app, s'expansant déterministiquement, mappant l'AuthorityGraph DU RUNTIME de l'app émise (pas les approbateurs AIDOS).
**Detail:** ROADMAP-app-builder.md §EPIC 7 (S80). Expansion = `Expand` S76. Substrat Better-Auth (DP18, ADR 0043).
**Inputs:** S76, S77.
**Criteres de done:** property — attacher `app-auth` expanse des entités+operations+policies d'auth byte-identiques ; fixture — une operation protégée de l'app émise refuse un rôle insuffisant au runtime.

## S81 — Catalogue de templates / starters instanciables
**Sous-systeme:** Archive
**Objectif:** Templates curatés (e-commerce, CRM, booking) packagés comme bundles content-adressés (entités + relations + behaviors dont app-auth + miroirs + operations + sources UI) ; surfacés au duplicate-from-template de S56 ; « fork this app » duplique un projet à une phase stable.
**Detail:** ROADMAP-app-builder.md §EPIC 7 (S81).
**Inputs:** S76, S80, S56.
**Criteres de done:** property — instancier un template produit un projet de départ déterministe et vert (Kernel vert, miroirs présents, aucun monstre).

## S82 — Provisioning de bac à sable par projet + limites de ressources prouvées
**Sous-systeme:** Runtime
**Objectif:** Workspace isolé (conteneur + repo git/jj + worktree + limites CPU/mém/disque/temps) par projet où le code généré vit, compile et exécute ses miroirs ; les zones ADR 0001 réalisées comme workspaces runtime réels. Réutilise le hook sandbox-confinement.
**Detail:** ROADMAP-app-builder.md §EPIC 8 (S82).
**Inputs:** S53 (isolation), S42 sandbox.
**Criteres de done:** fixture — sandbox de A ne peut lire l'arbre/build de B ni le truth-store `SANDBOX_ESCAPE` ; hello-world build+test vert dedans ; fault-injection — sandbox runaway tué par la limite `SANDBOX_RESOURCE_LIMIT`.

## S83 — Service boucle-build (l'agent exécutant) + disjoncteur déterministe
**Sous-systeme:** Runtime
**Objectif:** Red set → ContextRouter compile un ContextPack (algorithme) → appelle le LLM → écrit le code dans le bac à sable → exécute miroirs/senseurs affectés → itère red→green → enregistre AgentRun/AgentAction (S52) ; non-progrès déterministe stoppe une boucle qui dépense sans avancer `BUILD_LOOP_NO_PROGRESS`, câblé au HarnessCostBudget.
**Detail:** ROADMAP-app-builder.md §EPIC 8 (S83). La plus grosse étape — peut nécessiter un sous-découpage. Le juge est le miroir déterministe, jamais le LLM.
**Inputs:** S82, S66 red set, S33 ContextRouter, S52 AgentRun, S51 budget.
**Criteres de done:** Godog — termine vert seulement quand le Stop non-gameable passe ; property — l'agent n'écrit rien above-the-waterline ; property — terminaison = fonction pure de l'historique (même historique → même verdict).

## S84 — Auto-certification computationnelle dans la boucle
**Sous-systeme:** Runtime
**Objectif:** À chaque diff, la boucle s'auto-certifie sur les senseurs réels (types/lint/unit/fixtures/propriétés/Pact/arch-fitness via dependency-cruiser pour l'arbre émis TS), gatant chaque itération.
**Detail:** ROADMAP-app-builder.md §EPIC 8 (S84). Arbre émis = TS → dependency-cruiser ; arch-fitness émis inclut FN02 + EMITTED_NO_HARDCODED_ENDPOINT (ADR 0043).
**Inputs:** S83.
**Criteres de done:** fault-injection — un diff qui casse une frontière arch ou un contrat rougit le senseur et bloque l'itération avant le vert.

## S85 — Vérité proposée par l'agent gatée au mur + approbation humaine UI
**Sous-systeme:** Runtime / Auth
**Objectif:** Quand le travail de la boucle implique une vérité, elle PROPOSE un ChangeSet (proposed, jamais admitted) ; un humain avec authority approuve depuis l'UI (réutilise S52 + S63) ; inbox d'approbation des propositions agent avec leurs miroirs.
**Detail:** ROADMAP-app-builder.md §EPIC 8 (S85).
**Inputs:** S83, S63, S52.
**Criteres de done:** une écriture agent above-the-waterline refusée `AGENT_WRITE_ABOVE_WATERLINE` ; une vérité proposée exige l'approbation humaine avant d'atterrir.

## S86 — Console de build live + métrage coût/tour
**Sous-systeme:** Workbench
**Objectif:** Stream des diffs par tentative, résultats senseurs, consommation HarnessCostBudget (CI minutes, tokens LLM/goal), état disjoncteur S83, timeline AgentRun, porte d'approbation humaine ; calcul de phase stable réel par projet (`aidos stable` enregistre un nœud DAG au verdict S23/S40).
**Detail:** ROADMAP-app-builder.md §EPIC 8 (S86).
**Inputs:** S83, S85, S23 phase.
**Criteres de done:** l'état streamé égale l'AgentRun enregistré ; Playwright — lancer un build, voir un rouge tomber au vert, approuver la vérité proposée ; une coupe incohérente refusée.

## S87 — Scaffold serveur de l'app émise (Hono/TS) + émetteur IaC Pulumi
**Sous-systeme:** Runtime / Generators
**Objectif:** Émetteur déterministe produisant un service **Hono/TS** bootable par projet (main+router+middleware+health+handlers d'operation sync ET async/workers S73) câblé sur TOUTES les operations du Kernel ; + nouveau target `TargetPulumiProgram` (StackManifest → programme Pulumi/TS, ADR 0043).
**Detail:** ROADMAP-app-builder.md §EPIC 9 (S87) + ROADMAP-provisioning-deploy.md DP03/DP05 + ADR 0040 + ADR 0043. Relations S71 doivent être atterries. Sidecar interpréteur Go (ADR 0040 Déc.7) déclaré comme service.
**Inputs:** S71, S74, S73, ADR 0040, ADR 0043.
**Criteres de done:** Godog — le serveur émis démarre, GET /healthz vert, une route d'operation répond end-to-end, un worker async traite un job ; property — même Kernel → scaffold byte-identique qui compile ; le programme Pulumi/TS émis est FN02-pur + byte-stable.

## S88 — Spike + porte go/no-go Doltgres (ADR 0006), plain-Postgres par défaut
**Sous-systeme:** Archive / Runtime
**Objectif:** Spike gatant validant le client TS/Atlas contre Doltgres sous accès concurrent (#2581) et charge (≈5,2×, #2600) ; enregistre une décision (ADR addendum) ; plain-Postgres par défaut, Doltgres opt-in par app.
**Detail:** ROADMAP-app-builder.md §EPIC 9 (S88). Précède S89. Verdict = mesure. Addendum ADR 0006 (couplé à l'élargissement scope.Environment si Doltgres non-prod, cf. ADR 0043 A1).
**Inputs:** ADR 0006, S37 DB projection.
**Criteres de done:** Testcontainers — N connexions concurrentes assertent soit stabilité (go) soit échec reproductible flippant le défaut sur plain-Postgres (no-go) ; décision = record.

## S89 — Provisioning du datastore par app (ADR 0006)
**Sous-systeme:** Archive / Generators
**Objectif:** Provisionner le datastore par app — plain-Postgres par défaut (+ sidecar pgvector si besoin), Doltgres opt-in (Postgres-wire, branch/merge/diff/as-of) si S88 go, réutilisant Atlas + client TS ; migration Atlas expand-contract human-gated via DataTruthScope. Émis comme resource Pulumi (DP15, ADR 0043).
**Detail:** ROADMAP-app-builder.md §EPIC 9 (S89) + ROADMAP-provisioning-deploy.md DP15. Provision au DEPLOY (pre-deploy). ADR addendum défaut/opt-in. Slot replaceable.
**Inputs:** S88, S74, S95 migration.
**Criteres de done:** Testcontainers — le DDL émis s'applique sur la cible par défaut ; CRUD round-trip ; sur Doltgres opt-in une requête `as of` renvoie une ligne antérieure ; isolation par projet.

## S90 — Surface API émise complète (+ callback interpréteur Go)
**Sous-systeme:** Runtime / Generators
**Objectif:** Émission déterministe du routage CRUD + operation complet (sync+async), OpenAPI per-app, un contrat Pact par operation, provider-verification ; handlers Hono exécutent l'Operation DSL **via callback au service-interpréteur Go sidecar** (ADR 0040 Déc.7), policies enforced.
**Detail:** ROADMAP-app-builder.md §EPIC 9 (S90) + ADR 0040 Déc.7 + ROADMAP-provisioning-deploy.md (sidecar comme resource Pulumi).
**Inputs:** S87, S77, S10 interpréteur.
**Criteres de done:** pact-verifier sur tous les endpoints émis ; property — OpenAPI byte-stable ; Gherkin — un createOrder-class persiste une ligne + un policy DENY enforced au runtime ; le callback interpréteur Go donne le même verdict que l'interpréteur natif.

## S91 — Gestion des secrets & connexions de l'app émise
**Sous-systeme:** Runtime / Generators
**Objectif:** Secret store par projet (credentials DB, clés API, secrets OAuth), chiffré au repos, scopé project_id, jamais truth-store/git/source émis ; injection par variables d'env au boot ; rotation. (Branché au bootstrap Pulumi/IaC, DP32 ADR 0043.)
**Detail:** ROADMAP-app-builder.md §EPIC 9 (S91) + ROADMAP-provisioning-deploy.md DP32.
**Inputs:** S87, S55.
**Criteres de done:** property — un secret de A ne fuite jamais vers B ni dans le source émis (scan gitleaks sur l'émission) ; fixture — rotation invalide l'ancien secret ; secret manquant au boot lève un BlockReason actionnable ; scan = code.

## S92 — Observabilité d'exploitation de l'app émise
**Sous-systeme:** Runtime
**Objectif:** Logs, error-tracking, traces de requêtes, dashboard d'exploitation pour opérer l'app au quotidien — séparé de la télémétrie-senseur du Kernel (E12) ; OpenTelemetry JS/TS → un panneau d'ops par app, sans rien écrire au Kernel. Substrat OTel/SigNoz/GlitchTip (DP17, ADR 0043).
**Detail:** ROADMAP-app-builder.md §EPIC 9 (S92) + ROADMAP-provisioning-deploy.md DP17. OTel JS SDK (ADR 0040).
**Inputs:** S87.
**Criteres de done:** Godog — l'app émise émet logs/traces, le dashboard d'ops les rend ; property — l'ops-observabilité n'écrit aucune vérité.

## S93 — App front-end émise (Hono/TS)
**Sous-systeme:** Workbench / Generators
**Objectif:** Émetteur UI déterministe produisant le front-end de l'app construite (pages/navigation/forms sur entités+relations+blobs, verticale control+action en vrais boutons, chaque bouton portant sa fixture control-spec comme senseur), héritant le thème ccup (ADR 0010) + i18n bilingue (ADR 0011) ; câblé sur l'API émise. Cible = Hono front (ADR 0040 ; OQ-0040-front Hono-JSX/SSR vs hc).
**Detail:** ROADMAP-app-builder.md §EPIC 9 (S93) + ADR 0040.
**Inputs:** S90, S11 control/action, skill web-project.
**Criteres de done:** property — composants émis satisfont leurs fixtures control-spec ; Playwright sur un form généré soumettant une vraie operation contre le datastore (dont un upload blob) ; reproductibilité (même Kernel → bundle byte-identique).

## S94 — Environnement de preview éphémère par app (pulumi up)
**Sous-systeme:** Runtime
**Objectif:** Démarrer serveur+datastore+UI émis pour la phase stable active à une URL de preview, démontée déterministiquement, keyée sur une phase content-adressée — via `pulumi up` du programme émis (DP25, ADR 0043).
**Detail:** ROADMAP-app-builder.md §EPIC 10 (S94) + ROADMAP-provisioning-deploy.md DP25. Preview = process Node/Bun/edge Hono.
**Inputs:** S87, S89, S93, S78 ré-projection.
**Criteres de done:** Godog build-green → l'URL de preview sert l'app ; le hash de l'app du preview égale le hash émis de la phase ; Playwright — cliquer un bouton émis exécute l'operation liée contre le datastore.

## S95 — Migration de donnée de l'app émise sur changement breaking
**Sous-systeme:** Runtime / Generators
**Objectif:** Sur une app déployée avec de vraies lignes, prouver rename-de-colonne-avec-backfill, split d'entité, changement de cardinalité de relation, via Atlas expand-contract + backfill, DataTruthScope-gated (skill migrate).
**Detail:** ROADMAP-app-builder.md §EPIC 10 (S95). Gate S96. Driver-neutre (client TS).
**Inputs:** S74, S89.
**Criteres de done:** mirrors — rename-with-backfill préserve toute donnée ; un 1-N→N-N migre sans perte ; une migration breaking sans backfill refusée `BREAKING_MIGRATION_NO_BACKFILL` ; émission de migration reproductible.

## S96 — Pipeline de déploiement keyé sur les phases stables (pulumi up)
**Sous-systeme:** Runtime
**Objectif:** Action « Déployer cette phase » — permise uniquement depuis une phase stable (red→vert ∧ vert antérieur ∧ mutation ≥ seuil ∧ aucun monstre) ; deploy ré-émet l'app depuis la phase (S78) → provisionne datastore → Atlas expand-contract (S95) → `pulumi up` ; provisioning d'URL. Deploy = ré-projection, jamais procédural (DP26, ADR 0043).
**Detail:** ROADMAP-app-builder.md §EPIC 10 (S96) + ROADMAP-provisioning-deploy.md DP26. Hérite le Stop-gate (pas un gate séparé).
**Inputs:** S94, S95, S78, S23 phase, S86 calcul de phase.
**Criteres de done:** fixture refusant le déploiement d'une phase non-stable `PHASE_NOT_STABLE` ; intégration — migration forward-only ; property — l'artefact déployé est ré-projeté depuis la phase, jamais un artefact sandbox périmé.

## S97 — Domaines custom + TLS automatique (Traefik via provider Pulumi)
**Sous-systeme:** Runtime
**Objectif:** Binding de domaine custom + certificats TLS + DNS pour l'app déployée (comme le Workbench derrière Traefik), labels Traefik posés par le provider Docker Pulumi (DP27, ADR 0043).
**Detail:** ROADMAP-app-builder.md §EPIC 10 (S97) + ROADMAP-provisioning-deploy.md DP27.
**Inputs:** S96, Traefik.
**Criteres de done:** fixture — un domaine appartient à exactement un projet `DOMAIN_ALREADY_BOUND` ; Godog — un domaine custom sert l'app en HTTPS ; property — binding domaine→projet injectif.

## S98 — Environnements + rollback-to-phase (ré-projection)
**Sous-systeme:** Archive / Runtime
**Objectif:** Promotion d'environnements (preview→staging→prod) + rollback = checkout d'une phase DAG stable antérieure qui ré-projette déterministiquement l'app (S78) + réconcilie le datastore (Atlas inverse / Doltgres as-of) ; le code sandbox jamais restauré tel quel ; non destructif, append-only, décision enregistrée. Stacks Pulumi par env (DP28, ADR 0043).
**Detail:** ROADMAP-app-builder.md §EPIC 10 (S98) + ROADMAP-provisioning-deploy.md DP28.
**Inputs:** S96, S97, S95, S24 DAG.
**Criteres de done:** Godog — promouvoir N en prod → incident → rollback à N-1 → prod sert l'app ré-émise depuis N-1 avec le vert antérieur intact, l'action provenancée, rien supprimé ni restauré comme artefact stale.

## S99 — Cockpit déploiement & environnements
**Sous-systeme:** Workbench
**Objectif:** Panel par projet montrant phases, environnements, domaines/TLS, profiles, actions deploy/rollback exécutables (pas display-only), URL live de l'app. (DP29, ADR 0043.)
**Detail:** ROADMAP-app-builder.md §EPIC 10 (S99) + ROADMAP-provisioning-deploy.md DP29. Thémé + bilingue.
**Inputs:** S94-S98, S58/S59.
**Criteres de done:** Playwright e2e — déployer une phase, lier un domaine, voir l'URL HTTPS, rollback.

## S100 — Cellule (bounded context) comme sous-scope d'un projet
**Sous-systeme:** Kernel
**Objectif:** Concept `cell` partitionnant le Kernel d'un projet en petits Kernels par cellule, chacun avec son ratchet ; l'agent dans la cellule X charge son propre Kernel + les CONTRATS des voisins seulement ; une cellule ship si localement stable.
**Detail:** ROADMAP-app-builder.md §EPIC 11 (S100). Réutilise S48 GlobalInvariant + S17 contracts_with. OpenQuestion : cell = dimension TruthScope S15 ou record de premier rang ? (à griller).
**Inputs:** S15 scope, S48, S17.
**Criteres de done:** property — le ContextPack d'une cellule exclut les internals des voisins ; un accès cross-cell sans contrat est refusé.

## S101 — Context-Map + contrats inter-cellules
**Sous-systeme:** Kernel / Workbench
**Objectif:** UI pour concevoir quelles cellules existent et comment elles parlent (event storming, aggregates, ACL, paires de contrats) ; les cellules se connectent seulement via des liens contracts_with versionnés vérifiés par Pact ; architecture conçue, jamais générée.
**Detail:** ROADMAP-app-builder.md §EPIC 11 (S101). La Context-Map persiste comme vérité Kernel via ChangeSet.
**Inputs:** S100, S17 links, pact-verifier.
**Criteres de done:** pact-verifier — une paire consumer/provider honore son contrat ; fixture refusant un appel cross-cell qui viole le contrat.

## S102 — Ratchet structurel (le second ratchet, §47)
**Sous-systeme:** Mirror / Runtime
**Objectif:** Arch-fitness global (go-arch-lint/depguard côté AIDOS, dependency-cruiser côté émis) sur le graphe de dépendances inter-cellules (complexité, deps inter-BC, violations de frontière ne peuvent que tenir ou s'améliorer).
**Detail:** ROADMAP-app-builder.md §EPIC 11 (S102). Empêche « tests verts, système pourri ».
**Inputs:** S100, S101.
**Criteres de done:** fault-injection — une nouvelle violation de frontière ou un cycle inter-cell rougit le ratchet structurel et bloque la coupe, indépendamment des miroirs comportementaux verts.

## S103 — Composer les invariants de fédération + changement transverse (§51)
**Sous-systeme:** Runtime
**Objectif:** Câbler S48 GlobalInvariant / S49 SagaInvariant+CoherenceTest / S50 TemporalInvariant sur de vraies cellules multiples ; une policy globale exprimée une fois déclenche un fan-out rougissant chaque cellule violante (red wave global, réconciliation locale).
**Detail:** ROADMAP-app-builder.md §EPIC 11 (S103).
**Inputs:** S100, S48, S49, S50, S22 red-wave.
**Criteres de done:** fixture — une saga (payment_captured ⇒ order_confirmed ∨ compensation) tient sur deux vraies cellules, casser une jambe déclenche compensation ; un changement de policy globale fan-out vers une RedWorkQueue par cellule, les cellules non affectées restent vertes.

## S104 — Absorption de legacy par strangler-fig (§50)
**Sous-systeme:** Archive
**Objectif:** Tailler une cellule autour du legacy, la geler avec des tests de caractérisation (miroirs auto-générés sur le comportement courant), puis laisser la boucle-build refactorer dans la cellule gelée.
**Detail:** ROADMAP-app-builder.md §EPIC 11 (S104).
**Inputs:** S100, S83 boucle-build.
**Criteres de done:** Godog — les miroirs de caractérisation restent verts à travers un refactor interne ; le contrat publié est honoré ; UI pour démarrer une cellule strangler.

## S105 — Cockpit de fédération
**Sous-systeme:** Workbench
**Objectif:** Panel Context-Map / graphe-de-cellules montrant cellules, contrats, statut des deux ratchets, stabilité locale vs globale, red wave fan-out — exécutable (démarrer une cellule, tracer un contrat, voir le red wave global), project-scopé.
**Detail:** ROADMAP-app-builder.md §EPIC 11 (S105).
**Inputs:** S100-S104, S58/S59.
**Criteres de done:** Playwright e2e — deux cellules, un contrat, un red wave transverse ; une cellule montre une coupe locale verte et ship pendant qu'une voisine est encore rouge.

## S106 — Ingestion télémétrie/incident → RealityMirror + draft Idea déterministe
**Sous-systeme:** Runtime
**Objectif:** La prod de l'app émise émet de l'OpenTelemetry vers le telemetry-reader ; une divergence/incident devient un record RealityMirror project-scopé → une draft Idea ; la rédaction du texte de l'Idea est une projection déterministe (template), jamais un résumé LLM.
**Detail:** ROADMAP-app-builder.md §EPIC 12 (S106). Détection de divergence ET rédaction = code.
**Inputs:** S92, S43 reality, telemetry-reader MCP.
**Criteres de done:** fixture — une divergence télémétrie d'un miroir produit un RealityMirror avec provenance=incident ; property — même record de divergence → même texte d'Idea ; la réalité n'écrit jamais de vérité directement.

## S107 — `/learn` — incident → nouveau miroir → nouvelle dent
**Sous-systeme:** Runtime / Workbench
**Objectif:** Un RealityMirror (draft Idea, provenance=incident) re-rentre à idée→grill→goal ; sur approbation humaine un NOUVEAU miroir est ajouté, le hash policy/operation change, un red wave ciblé devient la worklist.
**Detail:** ROADMAP-app-builder.md §EPIC 12 (S107). Rien n'apprend sa propre fitness.
**Inputs:** S106, S65 grill, S29 goal, skill learn.
**Criteres de done:** Godog incident → draft idea → miroir approuvé → red wave ; property — rien n'apprend sa propre fitness ; détection de divergence = comparaison déterministe contre le miroir.

## S108 — Boucle médiane (`/evolve` + QD) par projet (§64-66)
**Sous-systeme:** Archive
**Objectif:** Depuis un miroir FIXE du user, l'EvolutionSandbox génère des variantes d'implémentation n'écrivant QUE branches/reports/ideas ; le miroir + property test tuent les variantes cassant la vérité ; les élites Pareto survivent en niches QD ; promotion gatée par authority (∧ out-of-sample vert).
**Detail:** ROADMAP-app-builder.md §EPIC 12 (S108). Réutilise S42 + promotion-gate. Juge = miroir, pas LLM.
**Inputs:** S42 sandbox, S26 QD.
**Criteres de done:** fixture — une variante cassant le miroir est tuée ; une élite verte n'est promouvable qu'avec approbation ; la sandbox ne peut écrire de vérité.

## S109 — Cockpit réalité & évolution par projet
**Sous-systeme:** Workbench
**Objectif:** Feed incidents→ideas, file RealityMirror, la porte d'approbation `/learn`, l'archive QD des élites — exécutable (approuver un miroir appris, promouvoir une élite).
**Detail:** ROADMAP-app-builder.md §EPIC 12 (S109).
**Inputs:** S106-S108, S58/S59.
**Criteres de done:** Playwright e2e — ingérer un incident, approuver le miroir appris, voir le red wave apparaître.

## S110 — Flux d'approbation multi-humains scopés + concurrence (niveau vérité)
**Sous-systeme:** Kernel / Auth
**Objectif:** Toute écriture-vérité via le cockpit passe propose→ChangeSet→approbation gatée par l'AuthorityGraph (approver/veto/escalation) au bon TruthScope ; détection de conflit content-adressée (optimistic-lock sur head) : deux applies concurrents → le second refusé, jamais last-write-wins.
**Detail:** ROADMAP-app-builder.md §EPIC 13 (S110). Conflit pré-proposal canvas/miroir vit en S68/S75.
**Inputs:** S63, S20 changeset, S25 merge-semantic.
**Criteres de done:** fixture — un veto bloque une approbation, un override enregistré avec provenance ; Godog — deux membres proposent concurremment, aucune écriture n'en écrase une autre (anti-overwrite §9), un conflit résolu en re-rejouant les miroirs.

## S111 — HarnessCostBudget + ValueCase par cellule (§66.3), compteurs réels
**Sous-systeme:** Runtime
**Objectif:** Chaque cellule déclare max_ci_minutes/max_llm_tokens_per_goal/max_mutation_runtime/max_human_review_minutes/expected_risk_reduction ; une contrainte coûteuse sans ValueCase lève un BlockReason advisory ; les compteurs reflètent la consommation réelle d'AgentRun (alimente le disjoncteur S83).
**Detail:** ROADMAP-app-builder.md §EPIC 13 (S111). Métrage = comptage déterministe. Caps déclarés, jamais appris.
**Inputs:** S51 economics, S52 AgentRun, S83.
**Criteres de done:** property — un goal over-budget est flaggé (advisory, jamais bloqué silencieusement) ; plus une contrainte est chère, plus elle doit justifier sa valeur.

## S112 — Jardinage du KernelDebt + `/trim` par projet (§82.4)
**Sous-systeme:** Archive / Runtime
**Objectif:** Surfacer fixtures périmées, mutants survivants, miroirs orphelins, liveness morte, contraintes à faible valeur ; `/trim` propose des réductions (suggère seulement, ne supprime rien — agir passe par idée→miroir→goal→approbation).
**Detail:** ROADMAP-app-builder.md §EPIC 13 (S112). Réutilise S41 trim.
**Inputs:** S41, S40 mutation.
**Criteres de done:** fixture — `/trim` ne supprime jamais une vérité automatiquement ; accepter une proposition de trim ouvre une idée→miroir→goal ; UI pour trier la dette.

## S113 — Substrat de collaboration + échelle d'adoption
**Sous-systeme:** Workbench / Runtime
**Objectif:** Adhésion/partage/invites de projet, provenance identifiée, commentaires sur ideas/miroirs/changesets, feed d'activité, présence/édition concurrente temps réel ; AdoptionStage ladder en produit (stage0 tests+mutation → … → stage5 federation), le projet surface son stage courant + la prochaine dent.
**Detail:** ROADMAP-app-builder.md §EPIC 13 (S113). Réutilise S47 adoption.
**Inputs:** S62, S110, S68/S75 présence.
**Criteres de done:** Godog — un membre sans authority ne peut approuver ; un commentaire/partage enregistré avec le user agissant (provenance jamais placeholder) ; fixture — deux utilisateurs présents sur le même canvas sans écraser ; l'échelle n'avance que quand la porte du stage est atteinte.

## S114 — Plans, métrage & quotas (provider gated par ADR + Pact)
**Sous-systeme:** Billing / Runtime
**Objectif:** Plans au niveau compte, consommation métrée (tokens LLM / minutes build-loop / heures-sandbox / apps déployées) liée à user+projet, enforcement quotas/rate-limits, intégration de facturation via un provider nommé (ex. Stripe) documenté par ADR, webhooks entrants modélisés comme operations async (S73), contrat Pact avec le provider.
**Detail:** ROADMAP-app-builder.md §EPIC 14 (S114). Dépend de S73 + ADR provider. Métrage déterministe depuis les AgentRun.
**Inputs:** S111, S73, S52.
**Criteres de done:** property — un build over-quota refusé `QUOTA_EXCEEDED` + chemin d'upgrade, jamais d'échec silencieux ; métrage déterministe depuis les AgentRun ; pact-verifier sur le webhook provider ; ADR du provider.

## S115 — Vrai funnel d'onboarding (template-first par défaut)
**Sous-systeme:** Workbench
**Objectif:** Réécrire `/first-app` d'une simulation en funnel guidé-mais-RÉEL ; défaut template-first (instancie un starter déterministe vert de S81 → modifie) ; blank-idea→grill→goal→build-loop = chemin avancé ; signup → projet → modif/idée → grill → goal → miroir → build-loop vert → preview/deploy, checklist liée à de vrais artefacts.
**Detail:** ROADMAP-app-builder.md §EPIC 14 (S115). Retire la simulation FirstAppBuilder. Porte d'acceptance « un inconnu peut s'en servir ».
**Inputs:** S81, S115 funnel, toute la chaîne E4→E10.
**Criteres de done:** Playwright-bdd — un compte neuf complète le funnel template-first et atteint une app déployée pilotée par le vrai moteur (chaque étape écrit de la vraie vérité) ; le chemin blank-idea testé séparément.

## S116 — GDPR : export & suppression — deux plans, append-only réconcilié
**Sous-systeme:** Runtime / Archive
**Objectif:** (1) Plan compte AIDOS : suppression dure d'un compte + données de ses projets. (2) Plan app émise : droits des personnes des utilisateurs de l'app construite (export + suppression). Effacement par crypto-shredding/tombstone (clé/PII détruite, structure append-only préservée), décision enregistrée.
**Detail:** ROADMAP-app-builder.md §EPIC 14 (S116). À `/grill-with-docs` D'ABORD (tension append-only vs effacement réelle).
**Inputs:** S53 soft-delete, S103 policy PII.
**Criteres de done:** Godog — un export rend toutes les données d'une personne ; une suppression rend la PII irrécupérable tout en préservant l'append-only (hash de phase reste valide, contenu PII shredé) ; property — après suppression, aucune requête ne retourne la PII, cross-projet et cross-plan ; sélection = requête déterministe scopée.

## S117 — Complétion du CLI `aidos` + Release v0 multi-tenant + limites honnêtes
**Sous-systeme:** Runtime
**Objectif:** Compléter la surface CLI (goal/grill/spike/harvest/trim/init comme vraies sous-commandes sur la passerelle) ; généraliser le pack AdoptionStage/Release S47 en un inventaire content-adressé par compte (projets, surface CLI/Workbench, demo-vs-réel, index docs, inventaire tests, limites honnêtes) conseillant la prochaine tier d'adoption.
**Detail:** ROADMAP-app-builder.md §EPIC 14 (S117). Assemble et conseille, n'installe/ship rien, n'écrit aucune vérité.
**Inputs:** S03 CLI, S47 release, S58 passerelle.
**Criteres de done:** chaque nouveau verbe CLI a un miroir rouge + un vert ; le pack de release énumère honnêtement ce qui EXISTE dans le truth-store live du user.

---

# PISTE FKE — FK01→FK16 (À LA SUITE DE L'APP-BUILDER, après S117)

> Les deltas code de la discipline Fractal Kernel Engineering (LIVRE XXX, ADR 0044+0045). Détail complet : `docs/plan/ROADMAP-fke.md` (épics FK-A coordonnées · FK-B miroirs par facette · FK-C conscience+cockpit · FK-D causalité avant/arrière · FK-E projections/lexique/bascule E). Tout additif (anti-overwrite §9) ; le squelette 6-paires généralise N0-N5 ; les facettes réutilisent les senseurs existants ; le mur intact ; determinism-first partout. Lancé seulement quand S117 est vert.

## FK01 — truth_level stocké + miroir de parité
**Sous-systeme:** Kernel / Archive
**Objectif:** Les 7 niveaux de vérité (Raw→Reconciled) stockés sur les records, écrits uniquement par la transition déterministe (idea/changeset/miroir/evidence/conscience).
**Detail:** ROADMAP-fke.md FK01 ; KRD.md FKE-5/§5. Migration additive.
**Criteres de done:** property — stored_level == computed_level (miroir de parité, divergence=rouge) ; transition = fonction pure totale ; SemanticDiff add ; panel filtre par niveau.

## FK02 — Les 8 facettes déclarées + facet-set effondrable
**Sous-systeme:** Kernel
**Objectif:** Un kernel déclare ses lentilles instanciées (F/I/S/B/R/V/M/X) ; F toujours présente (incompressible = intention + paire de preuve) ; validation refuse facette vide ou requise manquante.
**Detail:** ROADMAP-fke.md FK02 ; KRD.md FKE-1.3. Ensemble clos ; X = vérité molle §13.6. Gate tout le reste.
**Criteres de done:** property — kernel sans facette fonctionnelle refusé ; facette déclarée sans ses paires = monstre ; round-trip content-adressé.

## FK03 — La grille niveau × facette (les deux axes)
**Sous-systeme:** Kernel / Runtime
**Objectif:** Toute vérité porte ses deux coordonnées — niveau (verticale produit→entité, axe latéral couplant) × facette (nature, axe orthogonal séparant) ; le graphe/ContextRouter expose la cellule.
**Detail:** ROADMAP-fke.md FK03 ; KRD.md FKE-1.4. Réutilise S15 (niveau) + FK02 (facette).
**Criteres de done:** property — chaque vérité résout à une cellule déterministe ; un changement bas marque les rungs source au-dessus (couplage latéral) ; les facettes n'interagissent pas.

## FK04 — Complétude facet-aware (le monstre généralisé)
**Sous-systeme:** Mirror
**Objectif:** La complétude vérifie les paires de TOUTES les facettes instanciées ; une paire requise manquante/divergente de n'importe quelle facette = monstre (faille sécu, régression perf, migration qui perd, invariant non prouvé = monstres comme un test manquant).
**Detail:** ROADMAP-fke.md FK04 ; KRD.md FKE-1.3 conséquence 5. Étend S12.
**Criteres de done:** fault-injection — retirer une paire d'une facette instanciée → monstre ; un kernel effondré légal passe ; aucun kernel conforme existant invalidé (additif).

## FK05 — Expand E0-E7 : mapping N→E + types de preuve manquants
**Sous-systeme:** Mirror
**Objectif:** Table N0-N5→E0-E7 (fonction pure) + double-étiquetage additif + types E4 (gosec/gitleaks/evals-injection), E6 (runtime+rollback), E7 (formel) au contrat de preuve.
**Detail:** ROADMAP-fke.md FK05 ; KRD.md FKE-16 (expand ; le contract = FK16).
**Criteres de done:** property — même miroir → même E (mapping total) ; evidence E-typée affichée ; zéro miroir N existant modifié.

## FK06 — Dérivation déterministe de s9 (doc dérivée du code)
**Sous-systeme:** Generators
**Objectif:** Émetteur pur DeriveDoc(kernel)→s9 depuis les ASTs (operations, controls, routes, noms de tests, erreurs), structurée pour la comparaison.
**Detail:** ROADMAP-fke.md FK06 ; KRD.md FKE-1.3 décision (a).
**Criteres de done:** property — même kernel → s9 byte-identique ; s9 structurée (concepts du lexique, behaviors, erreurs).

## FK07 — Les doc-miroirs + data-miroir (comparaison structurelle)
**Sous-systeme:** Mirror
**Objectif:** Comparaison structurelle ensembliste s2↔s9 et s1↔s10 (concepts/behaviors/erreurs) — divergence structurelle bloquante, prose advisory (LLM signale, n'arbitre jamais) ; data-miroir s3↔s7 déclaré.
**Detail:** ROADMAP-fke.md FK07 ; KRD.md FKE-1.3 décision (a). Le juge reste un calcul.
**Criteres de done:** fault-injection — retirer un behavior du code → doc-miroir rouge ; éditer la prose seule → advisory ; property — même paire → même verdict.

## FK08 — Câbler les facettes S/R/V/M/X (les colonnes parallèles)
**Sous-systeme:** Mirror / Runtime / Generators
**Objectif:** Réaliser les 6 paires de chaque facette non-fonctionnelle : S (tests sécu + police/scans, réutilise GV) · R (chaos/fault-injection/failover/restore/disjoncteurs/outbox) · V (migration expand-contract/backfill/restore, réutilise S95) · M (arch-fitness 2e cliquet §47, réutilise S102/FN02) · X (ExperienceClaim §13.6, soft : informe, ne bloque pas).
**Detail:** ROADMAP-fke.md FK08 ; KRD.md FKE-1.3 (les 6 tables de facettes).
**Criteres de done:** par facette, fault-injection — casser une paire rougit la bonne colonne ; X reste advisory (ne cliquette pas dur) ; property — chaque facette = le squelette 6-paires sous son angle.

## FK09 — La conscience : agrégateur déterministe + rapport + decision cards
**Sous-systeme:** Runtime / Workbench
**Objectif:** Reconcile(kernel)→ConsciousnessReport, fonction pure composant les verdicts des juges EXISTANTS (runner/complétude/SemanticDiff/RealityMirror/senseurs/ledger), toutes facettes instanciées ; produit les decision cards ; route /conscience. Aucun nouveau juge.
**Detail:** ROADMAP-fke.md FK09 ; KRD.md FKE-6.3.
**Criteres de done:** property — mêmes verdicts d'entrée → même rapport ; rapport = verdicts sourcés seulement ; e2e — une divergence produit sa decision card.

## FK10 — A0-A8 : 6e axe de l'agentlayer + montée par preuve
**Sous-systeme:** Kernel / Runtime
**Objectif:** autonomy_level ∈ {A0..A8} (ensemble clos) déclaré par CoucheAgent ; enforcement fail-closed ; montée calculée depuis l'historique AgentRun (N runs verts E4+ sans incident).
**Detail:** ROADMAP-fke.md FK10 ; KRD.md FKE-11/34. A8 jamais sur action critique.
**Criteres de done:** fixture — un A1 tentant un merge refusé ; property — promotion = fonction pure de l'historique, jamais déclarée.

## FK11 — L'écran AI Lab : le cockpit trialogue
**Sous-systeme:** Workbench / Runtime
**Objectif:** Route /ai-lab — GAUCHE chat scopé au nœud (slots proposés, jamais de vérité) · CENTRE la couche navigable = kernel + anatomie 1-pour-1, mur dessiné, voyant 🟢/🔴/🟡 par paire de toutes les facettes · DROITE decision cards + blast radius + red wave + promotion gate. 2 modes (conversationnel/navigationnel) = même écran à zoom différent.
**Detail:** ROADMAP-fke.md FK11 ; KRD.md FKE-38. Compose S58+S60+E4+E5+FK09 ; évolution du GraphCockpit.
**Criteres de done:** Playwright e2e — chatter → slot proposé → valider une card → paire 🔴→🟢 ; écriture-vérité directe depuis le chat refusée ; bas du mur read-only ; cliquer une paire scope gauche+droite. Property — écarts = déterministes.

## FK12 — Lien caused_by + red-wave inverse déterministe
**Sous-systeme:** Kernel / Links
**Objectif:** Nouveau type de lien caused_by (arête causale arrière, §17, inverse d'impacts) versionné ; remontée déterministe d'un miroir rouge vers ses dépendances.
**Detail:** ROADMAP-fke.md FK12 ; KRD.md FKE-35.1. Réutilise S17 + S22 (le sens avant existe).
**Criteres de done:** property — caused_by round-trip versionné ; remontée déterministe (même graphe+symptôme → même chaîne de causes) ; cycle refusé.

## FK13 — WhyTree + geste /why (le 5-pourquoi redressé)
**Sous-systeme:** Runtime / Workbench
**Objectif:** /why construit un WhyTree (arbre fishbone content-adressé provenancé) depuis un symptôme : remontée déterministe sur caused_by (FK12) ; LLM gaté pour le pourquoi hors-graphe AVEC cause vérifiée/reproduite (anti-confabulation) ; terminaison OBLIGATOIRE en miroir (racine → /learn → miroir d'anti-récurrence). Extension de /diagnose + /learn.
**Detail:** ROADMAP-fke.md FK13 ; KRD.md FKE-35.1. Pas une facette — geste du loopback, transversal.
**Criteres de done:** fixture — chaque cause du WhyTree reproductible (sinon rejetée) ; un WhyTree sans miroir terminal refusé (WHYTREE_NO_MIRROR) ; property — remontée graphe déterministe ; e2e — incident → arbre → miroir racine → red wave.

## FK14 — Lexicon Kernel + linter inter-couches
**Sous-systeme:** Kernel / Mirror
**Objectif:** Le concept nommé à travers les 16 couches comme source (fork stockage record-kind vs kind:layer, tranché ici) ; linter pur détecte un symbole hors lexique par couche.
**Detail:** ROADMAP-fke.md FK14 ; KRD.md FKE-21.
**Criteres de done:** fault-injection — renommer une table hors lexique → rouge ; property — vérification = fonction pure du lexique + symboles.

## FK15 — Projections d'outillage : CLAUDE.md/AGENTS.md générés
**Sous-systeme:** Generators
**Objectif:** CLAUDE.md/AGENTS.md/.cursorrules/memory-bank émis depuis les kernels (policy/memory/style/architecture/agent-profile), jamais hand-édités (hash-protégés, drift par source-hash).
**Detail:** ROADMAP-fke.md FK15 ; KRD.md FKE-20. D'abord kerneliser le contenu actuel (legacy kernelizer, inferred→validé) sans perte.
**Criteres de done:** property — mêmes kernels → mêmes fichiers byte-identiques ; hand-edit détecté ; contenu actuel kernelisé sans perte.

## FK16 — Contract E0-E7 : bascule du schéma (STRICTEMENT en dernier)
**Sous-systeme:** Mirror / Archive / Workbench
**Objectif:** Bascule mirrors/cert_language/panneaux (/proof-levels → E0-E7)/docs vers E ; N déprécié via lifecycle, jamais supprimé (append-only) ; migration expand-contract gated DataTruthScope.
**Detail:** ROADMAP-fke.md FK16 ; KRD.md FKE-16 (contract). Dernier de la piste (touche le gelé-prouvé). À FK16 vert : rebascule :3000 prod.
**Criteres de done:** zéro perte (chaque miroir N porte son E) ; panels rendent E ; aidos check vert sur tout le corpus re-étiqueté ; docs Mintlify à jour.
