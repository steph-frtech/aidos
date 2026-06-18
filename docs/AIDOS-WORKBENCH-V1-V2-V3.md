# AIDOS Workbench — V1 · V2 · V3, la référence complète

> Toute la documentation des trois générations du Workbench AIDOS et de leur contenu : les panneaux par route (V1), l'échelle fractale vivante (V2/WB2, legacy), la refonte user-friendly (V3 : 5 groupes de nav, 25 lentilles conceptuelles, un chat à 37 gestes), l'évolution V1→V2→V3, le design system + i18n, le câblage live (ADR 0092), l'inventaire exhaustif des routes, le déploiement. Généré par fan-out read-only sur les vraies routes front/web/app/* et les ADR/mémoires.

## Sommaire

1. Vue d'ensemble
2. V1. La première génération : routes app/<route>/ (lignée S38/S44)
3. V2 / WB2 — L'échelle fractale vivante
4. V3 — NAV & LENTILLES
5. V3 — Le chat conversationnel
6. Évolution — Les trois générations du Workbench
7. Design System et Internationalisation
8. Le câblage live (ADR 0092) — comment le Workbench lit la vérité
9. INVENTAIRE DES ROUTES
10. Déploiement du Workbench

---

## Vue d'ensemble

Le Workbench est l'IDE/cockpit du gouvernement de l'OS AIDOS (front/web, Next.js). Son principe cardinal est **ui-completeness** : tout se fait par écran — aucune capacité headless ; chaque opération dispose d'un contrôle exécutable et visible.

### Architecture générale : trois générations coexistantes

Le Workbench existe en **trois générations simultanées en production**, déployées sur les mêmes serveurs :

| Génération | Routes | Motif | Statut |
|---|---|---|---|
| **V1** | `/` (racine) + panneau-par-route (`/projects`, `/goal`, `/app-builder`, etc.) | Panneaux isolés, une route = une URL = une fonction métier | Production — lignée S38/S44 (§9 anti-overwrite : jamais supprimée) |
| **V2** | `/v2/*` | Échelle fractale vivante (diagramme KRD entier, navigation conceptuelle par glossaire, descente dans le code) | Legacy — la « WB2 », dépréciation annoncée, conservation intégrale |
| **V3** | `/v3/*` | Refonte user-friendly : une session partagée, cinq sections de nav, 25 lentilles conceptuelles, chat IA conversationnel (ai-lab) | Production nouvelle — parcours utilisateur coordonné |

Aucune génération ne supprime les autres (ADR 0009, §9 anti-overwrite) : les routes V1 restent intactes sous leurs URLs originales, les panels V2 coexistent avec V3 sans collision. La barre latérale du layout racine (WorkbenchHeader) ne change pas ; V2 et V3 remplacent cette navigation par leurs propres shells (V2Header + V2Nav, V3Nav + Palette).

### Le shell racine (V1)

- **Layout racine** (`app/layout.tsx`) : enveloppe bilingue (next-intl, français par défaut — ADR 0011), typage Geist + shadcn tokens (ADR 0010, zinc+blue-600, radius 0.5rem).
- **Barre latérale fixe** (`WorkbenchHeader`, `components/WorkbenchHeader.tsx`) : navigation par groupes de concepts (GROUPES : « start », « brain », « kernel », « mirror », « archive », « runtime ») ; chaque groupe est un sous-menu repliable ; le groupe contenant la route active s'ouvre automatiquement.
- **Contenu principal** (`<main>`): chaque route V1 occupe `flex-1`, centré, texte de foreground sur background.
- **Comportement réseau** : `dynamic = "force-dynamic"` sur les panels lisait le Postgres en live (ex. `/projects/page.tsx`).

### La session partagée V3 (`/v3/*`)

V3 fonde son architecture sur une **session rejouée** (ADR 0060, lib/v3/session) : le transcript (un tableau de messages) est la **seule source de vérité** d'écran. L'état n'est jamais stocké, il est recalculé via `turnsOf()` à chaque ouverture (déterminisme-first).

- **Fournisseur de session** (`V3SessionProvider`, `app/v3/V3Session.tsx`) : enveloppe les dix lentilles (`/v3/lab`, `/v3/specs`, `/v3/operation`, `/v3/policy`, `/v3/kernels`, `/v3/parcours`, `/v3/grille`, `/v3/anatomie`, `/v3/liens`, `/v3/arbres`, `/v3/conscience`, `/v3/cellules`, `/v3/code`, `/v3/emetteurs`, `/v3/parametrage`, `/v3/design`, `/v3/environnements`, `/v3/history`, `/v3/instance`, `/v3/bench`, `/v3/version-dag`, `/v3/arch-fitness`, `/v3/why-tree`, `/v3/evolve`) dans une session unique clée par `projectId`.
- **Contrat de session** (`V3SessionValue`) :
  - `messages: string[]` — le transcript (source unique)
  - `turns: SessionTurn[]` — rejeu annoté (verdict, événements, impacts)
  - `state: BuilderState` — l'état calculé au bout du transcript
  - `send(text)` — envoyer un message (IA active → Claude propose des gestes canoniques jugés localement)
  - `rewindTo(n)` — voyage dans le temps (rejouer un préfixe)
  - `aiEnabled` — bascule IA conversationnelle (défaut ON)
  - `projectId`, `projectName`, `projects[]` — gestion multi-tenant
  - `ladder` — l'échelle d'instance (environnements Dev/Staging/Prod, injectée en donnée à la création)
  - `strings` — libellés i18n (un client ne peut pas appeler `getTranslations()`
  
- **Projet persistant** (ADR 0061, `app/v3/projects-actions.ts`) : le cookie `aidos-v3-project` désigne le projet actif ; au layout, le projet est chargé côté serveur (fail-closed) via `loadProjectAction()` ; sans cookie, le plus récemment sauvé ; sans aucun projet, « Mon application » est auto-créé. Rouvrir un projet replaye le même transcript → tout l'historique réapparaît (lentilles, parcours, environnements, même état). Chaque `send()` et `rewindTo()` déclenche une sauvegarde déboncée (800 ms) via `saveProjectAction()`.

- **Chat IA et gestes canoniques** : la lentille `/v3/lab` offre un chat bilingue. Quand IA est active, Claude propose des gestes (ex. `capt-idée`, `greffer-arbre`, `promouvoir-besoin`) qui repassent par `understand()` + `applyIntent()` ; un geste invalide devient un refus doux. Défaut : IA ON ; un bouton `aiToggle` permet le mode déterministe pur (aucun geste proposé, user tape directement).

### Navigation et palettes (V2 et V3)

| Élément | V2 | V3 |
|---|---|---|
| **Header** | `V2Header.tsx` : marque V2, note de coexistence, retour V1, langue | `ProvisioningBanner` : état du déploiement provisoire |
| **Sidebar** | `V2Nav.tsx` : 26+ concepts (glossaire `lib/v2/glossary`) → écrans clickables | `V3Nav.tsx` : 5 sections logiques (Concevoir/Comprendre/Construire/Évoluer/Réglages) → 25 lentilles |
| **Palette** | N/A | `Palette.tsx` : ⌘K → tous les écrans classés (V1 + V3 lentilles + code graph) — « tous les écrans au meilleur endroit » |
| **Routes V1 inventoriées** | N/A | Scannées au layout (`readdirSync(app/)`, hors `v2`, `v3`, `api`, `_*`) → injectées comme `ScreenRef[]` dans la session |

### L'opérateur (workbench-human)

Chaque panneau, chaque lentille connaît :
- **L'utilisateur courant** (via auth, `app/auth/`, middleware implicite par next-intl)
- **Le projet actif** (`projectId`, cookie `aidos-v3-project`, provider V3)
- **La langue** (cookie `NEXT_LOCALE`, défaut FR, ADR 0011)
- **La scope du projet** (`project-scope`, les vérités qui appartiennent à ce projet ; S53)

Le **workbench-human** est simplement l'agent humain qui conduit une session — opérateur = reader + writer proposer (jamais writer kernel/mirrors/fitness directement — toujours via idea → mirror → /goal → approval).

### Intégrité du mur (§2 CLAUDE.md)

Aucune route V1/V2/V3 n'écrit directement au kernel/mirrors/fitness. Les écrans **proposent** :
- **Lire (SELECT)** : les panels affichent l'état via des Server Components + les twins `lib/v2/` (purs, projections).
- **Écrire (PROPOSE)** : les actions traversent des MCP ou des Server Actions qui créent une **idée** (schema `ideas`, append-only) ; une idée devient vérité **seulement** après son mirror + son /goal + approbation humaine → ChangeSet → CLI `aidos commit`.
- **Bloquer (PreToolUse hook)** : toute tentative de write directe aux zones interdites est refusée par le hook Go (le mur est biface).

### Design tokens et i18n (ADR 0010, ADR 0011)

- **Thème** : Tailwind v4 + shadcn tokens, zinc + blue-600, Geist, radius `0.5rem` ; aucune couleur en dur.
- **Langues** : FR par défaut + EN ; namespaces i18n (`v3`, `v2Shell`, `common`, `nav`, `navGroups`, `projects`, `goal`, etc.) ; strings stockées dans `messages/{fr,en}.json`.

### Déterminisme-first : les twins

Les panels V1/V2/V3 ne font jamais de calculs métier :
- `lib/v2/builder.ts` — réducteur pur du builder (état + gestes → nouvel état)
- `lib/v2/composition.ts` — arbre de nœuds (graphe)
- `lib/v2/code-extract.ts` — graphe de code extrait du Typescript
- `lib/v3/session.ts` — rejeu pur (messages → turns + state)
- `lib/v3/instance.ts` — ladderOf (config → échelle)

Ces twins sont **projections du moteur Go** (back/kernel, back/runtime) ; les tests (`lib/v2/builder.test.ts`, `lib/v3/session.test.ts`) sont des property tests (fast-check, déterminisme vérifié). Aucun LLM ne participe aux calculs d'état (les gestes conversationnels passent par Claude, mais leur application est déterministe).

---

À présent, je vais générer la section complète en organisant toutes les routes par catégorie logique. Voici ma réponse :

---

## V1. La première génération : routes app/<route>/ (lignée S38/S44)

La première génération du Workbench suit le pattern **un panneau = une route**. Chaque route est une **Server Component** Next.js action-capable, déterministe-d'abord (twin pur du moteur Go), bilingue (ADR 0011), thémée (ADR 0010 zinc + blue-600 + Geist), et respectueuse du mur (§2 : lecture below-the-line, propose→ChangeSet pour les truth-writes).

### Moteur KRD core (vérité, miroirs, fitness)

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/kernel-garden`** | Jardinage du KernelDebt + /trim par projet (S112, §82.4). Surface les cinq pourritures : orphelin miroir, fixture périmée, mutant survivant, LIVENESS MORTE, CONTRAINTE À FAIBLE VALEUR. Action-capable : sélectionner projet, JARDINER, ACCEPTER proposition → OpenIdea. | Lecture-seule ; scan isolé par projet ; aucune suppression sans approbation |
| **`/mirrors`** | Inventaire de miroirs + deux scénarios candidats. Déterminisme-d'abord : la suite computational + les runs sont déclarés statiquement en lib/mirrors.ts (twin de back/mcp/mirror-runner/regression.go). RatchetRunner client-island exécute le cliquet sur un candidat déclaré. | Regression-first ; E0–E7 proof-levels couvertes |
| **`/ideas`** | Tableau des idées (KRD §115–§119). Idée = vérité-CANDIDATE (proposes + intent + provenance) SANS gel ET SANS miroir. Cinq voies lifecycle : draft → grilled → {spiking → harvested \| harvested}, rejected (tracée). « Promouvoir » = ACTE d'écrire le miroir via /goal (NO_MIRROR_NO_KERNEL). | Lit live via gateway (idea_list) ; lecture-seule ; aucun write du kernel |
| **`/goal`** | Moteur de goal (KRD §56–§59, §63①). ChangeSet DRAFT + SET ROUGE (miroirs échouants). Stop NON-GAMEABLE : rouge→vert ∧ vert antérieur intact ∧ mutation ≥ seuil ∧ aucun monstre — jamais sur déclaration agent. « Done » calculé, jamais déclaré. | Lecture-seule ; ouvrir/fermer = truth-write via CLI aidos (S20) |
| **`/kernel-debt`** | Diagnostic KernelDebt par tranche (S41). Détecte : orphelin, périmé, survivant, liveness-morte, trop-cher. Proposition de réductions SANS suppression. | Composition moteurs déclarés (debt.Scan, economics.Evaluate, costmeter) |
| **`/changeset`** | Journal ChangeSet du projet actif. Lifecycle : open/apply/edit/revert. Determinism-d'abord : lib/changeset.ts (twin de back/archive/changeset). Lit live via gateway. | Lit live sur chaque requête (force-dynamic) ; S59 cutover |

### Miroirs et fitness

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/mirror-watch`** | « Matérialiser-et-le-voir-rougir ». Observe un miroir DÉCLARÉ, le materialise, capture son run in situ, mesure la divergence. | Sensor-integrated ; live watch |
| **`/mirror-library`** | Librairie de miroirs par projet (S45). Browse / search / tag / soft-delete / publish / comment. Determinism-d'abord : lexicon intégré (S34). | Project-scoped ; aucune ré-implémentation |
| **`/mirror-health`** | Santé du miroir : exécutions historiques, taux d'échec, drift, causale ancestry. | Historical telemetry ; sensors intégrés |
| **`/mutation-score`** | Score de mutation — densimètre du serrage du kernel (S50). Seuil bar lu de fitness, jamais-authored. Mutatnt.Survive bloque la coupe. | Lecture-seule du threshold ; S50 projections |
| **`/proof-levels`** | Les couches de preuve E0–E7 (KRD §Preuve). Graphique interactif des conditions d'admission pour chaque étage. | Determinism-d'abord ; lib/proof-levels.ts |
| **`/proof-type`** | Types de preuve (Gherkin, property, fixture, HTTP mirror, etc.). Mapping LevelMirrorForm. | Énumération déterministe ; pas de LLM |

### Architecture & domaine

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/entity-relation`** | Nœud de relation Entity AST (S71, KRD §23/§26). Relation (1-1 / 1-N / N-N, fk / association / composition) content-adressée. Action-capable : épingler → résoudre + hasher. UNKNOWN_RELATION_TARGET refusé. | Lecture-seule ; validation + résolution sans truth-write |
| **`/truth-level`** | Les 7 niveaux de vérité (Raw → Reconciled, S72). Projections de chaque niveau dans le StackManifest + contrats inter-étages. | Determinism-d'abord ; raw → kernel → emitted → deployed → observed → reconciled → learned |
| **`/facet-completeness`** | Complétude facet-aware (le monstre généralisé, S36, KRD §21.2). Deux axes : niveau × facette. Matrice de vérification. | Sensor-gated ; grid engine intégré |
| **`/completeness`** | Complétude + monstre (S36). Dépendance fermée, aucune omission (aucune entité « oubliée » qui affecte une autre). | Deterministic solver ; S36 completeness engine |
| **`/entity-map`** | Cartographie entité par projet. Browse / search entités scalaires + relations. | Live ; force-dynamic |
| **`/entity-modeler`** | Modéleur entité/relation. Action-capable : ajouter entité, relation, attribut scalaire. PROPOSE ChangeSet DRAFT. | Lecture-seule du moteur ; propose via ChangeSet |
| **`/context-map`** | Context-Map & contrats inter-cellules (S25, KRD §18). Bounded contexts + domaines d'implémentation + interfaces échangées. | DDD-aligned ; force-dynamic |
| **`/lexicon`** | Lexicon Kernel — linter inter-couches (S34). Vocabulaire déclaré + règles de dénomination (e.g., Event suffixe, Entity singulier). | Deterministic linter ; aucun LLM |
| **`/domain-bind`** | Domaines custom + TLS pour l'app déployée. Routing DNS + certificats. | Provision-aware ; DP06 bindings |
| **`/contract`** | Step Execution Contract — contrat étape/étape de la StackManifest (S20). Conditions de précédence + postconditions. | Determinism-d'abord ; S20 lifecycle |

### Le mur & accessibilité

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/wall`** | Le mur (S04, §2). Zones gardées (au-dessus = kernel/mirrors/fitness, gelé ; au-dessous = projections). Feed de BlockReason. | Lecture-seule ; aucune truth-write de l'écran ; PreToolUse hook Go + Postgres GRANT à niveau 1/2 |
| **`/why-blocked`** | Pourquoi bloqué ? Décode un BlockReason (code, sévérité, explication, how_to_fix). | Porte /explain-block des refusals |
| **`/project-wall`** | Mur project-aware (S04 + isolation par projet). Zones filtrées au scope du projet actif. | Project-scoped ; même enforcement |

### Idées → Goals → Changesets

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/capture-idea`** | Boîte texte-libre : capturer intention humaine (provenance=human), scopée à projet. Inbox d'idées par projet. Idée = vérité-CANDIDATE SANS gel SANS miroir. | Staging au-dessus de la ligne ; jamais kernel direct |
| **`/emit-ideas`** | Émetteur déterministe EmitIdeas(graph) → []Idea (EL16). Fonction PURE de BesoinGraph + LevelToProposes mapping. Aucun LLM n'entre. | Déterministic emitter ; idempotent (byte-identical re-emission) |
| **`/red-backlog`** | RedBacklog ordonné — tri topologique Kahn (EL17) sur les Ideas émises, le long des constrains/seeds edges. Ordre EXACT d'ouverture des /goals. Refusé si cycle sur rung émetteurs. | Pure Kahn ; déterministe tie-break |
| **`/compound-besoin`** | Tunnel level-by-level FORCÉ (EL19) : « tunnel de besoin » vertical. DISPATCH à grill (produit) / view (vue) / action (control+action) / générique. Off-altitude réponse refusée SCHEMA (EL12). | Grell-second ; fuzzy → /spike |
| **`/besoin-intake`** | Porte MCP capacité au-dessus de BesoinGraph (EL15). Lit l'état BesoinGraph + niveau enterable. Valide pré-flight. Capture réponse par rung (MAPPING → Idea, NoEmit → aucune). | Déterministic MCP ; aucun LLM ; RLS project-isolated |
| **`/compound-besoin-graph`** | Visualiseur graphe de besoin. Les rungs (product, journey, view, control, action, operation, entity, invariant) comme nœuds ; contrains/seeds edges. | Live ; ancestry traced |
| **`/compound-besoin-branchtree`** | Les branches ouvertes d'une fiche besoin par rung. Open questions à chaque rung. | Forced interview ; LLM phrase, code juge |
| **`/compound-besoin-candescend`** | Computed CanDescend verdict par rung : faut-il descendre ? L'état du rung permet-il CanDescend.enough ? | Deterministic ; S66 logic |
| **`/compound-besoin-completeness`** | Graphe de besoin : complétude par rung + contraintes transverses (invariants). Monstre appliqué au graphe. | Completeness solver ; @Besoin rungs |
| **`/compound-besoin-capitalisation`** | Capitaliser le besoin résolu : ancre réutilisable (graph_hash + clés canonicalisées), mémoire procédurale (candidat behaviour). **ViaIdea uniquement** — jamais ToKernel, jamais fitness. Cross-app reuse déterministe (NAME-MATCH). | Purement code ; aucune LLM ; WroteKernel = false |
| **`/compound-besoin-proposes`** | Mapping rungs → Idea.proposes (LevelToProposes). Matrice déterministe. | LevelMirrorForm annexed |
| **`/compound-besoin-mirrorform`** | Expected mirror form par rung (acceptance → Gherkin, invariant → property, workflow → fixture). | Annexé (attached) au Backlog item, jamais écrit |
| **`/compound-besoin-cascade`** | Cascade de besoin : impact de résoudre rung N sur rungs ≤ N. Propagation sourced et forced. | Lattice traversal ; upstream impact |
| **`/compound-besoin-gate`** | Gate (Stop) de CompoundBesoin : prérequis satisfaits pour descendre ? Off-altitude ? Circulaire ? Mono-path ou multi-path ? | Non-gameable stop |
| **`/compound-besoin-grammar`** | Grammaire Gherkin « When/Then/Given » pour chaque rung. Parsed déterministiquement, jamais re-implemented. | lib/compound-besoin-grammar.ts |
| **`/compound-besoin-metadata`** | Métadonnées : author, created_at, modified_at, last-approval, pedigree, authority. | Audit trail ; immutable |
| **`/compound-besoin-thresholds`** | Fitness thresholds appliqués au graphe (mutation score minimal par niveau, e.g. level=control doit avoir ≥5 fixtures prouvées). | CanDescend.enough logic |
| **`/besoin-invariant`** | Entrevue transversale des invariants ∀ croisées à tous les rungs (EL14). L'humain ÉNONCE, le code enregistre + classifie (circularity ban §8). ∃ refusé (NOT_FORALL). Policy-band ≤ 1 Idea{Proposes:policy}. | Lecture-seule de l'humain ; code juge ; aucune auto-génération |
| **`/besoin-necessity`** | Justifier la nécessité du besoin par projet + cycle de besoin. ReferenceModel tracing. | Necessity model ; ancestry link |
| **`/truth-approval`** | Approbation vérité multi-humains + concurrence content-adressée. Propose → ChangeSet → approbation. Workflow d'approbation step-by-step. | Deterministic ordering ; aucun race condition |
| **`/red-wave`** | Vague de rouge — targeted red wave (mirror-first, S107). Incident → RealityMirror → new mirror attached → hash BUMP → worklist rouge ciblée. | Impact-ordered ; sensor-triggered |
| **`/red-propagation`** | Propagation pondérée du rouge. Un miroir échouant → quels autres rouges transitifs ? Poids par impact. | Graph solver ; weights configurable |
| **`/learn`** | Incident → nouveau miroir → nouvelle dent (S107, E12). RealityMirror (idée draft, provenance=incident) re-entre à idée→grill→goal. Approbation humaine → nouveau miroir attaché → hash BUMP → red wave ciblé. WroteKernel=false ; arête Reality→Kernel toujours refusée. | Boucle externe fermée ; deterministic hash bump |
| **`/incidents-to-ideas`** | RealityMirror — la réalité injecte des idées, pas des vérités (S106). Capturer signal prod, le projeter en candidat-truth au-dessus de la ligne. | Seule porte légale Reality→Ideas |

### Grill & Spike (pré-grille)

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/grilling-loop`** | Boucle de grilling (S65, app-builder EPIC 4). Challenge intention ABOVE the wall (§1). Verdict : sharp → grilled ; fuzzy → spiking ; bad → rejected + traced. Records verdict + provenance. | Aucune truth-write ; cliquet OFF |
| **`/exploration`** | Exploration — Grill & Spike Lab (S65/S66). Grill fuzzy idées → spiking, ou spike → throwaway code pour falsifier. S66 zone quarantine : générer variantes (branches/reports/idées seulement), variante promue en QD niche si ✓ green mirror + out-of-sample green + authority approval. | Deterministic evaluator ; zero I/O ; no LLM |

### Opérations & contrôles

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/operation`** | Operation AST shape — six-verb set, §93 createOrder anchor, pipeline projection, fixture interpreter. Registry statique en lib/operation.ts (twin de back/kernel/operation). | Rendering-only ; aucun I/O, aucun clock, aucun rng |
| **`/control`** | Control & Action (S27). Spécification contrôle (visible_when/enabled_when/triggers) + spec action (bind → operation, on_success/on_error). | Projection deterministic ; aucune hand-authored UI |
| **`/action`** | Authoring control-spec + action-spec avec state/event fixtures. Wire contrôle → opération. | Spec-first ; mirror-gated |
| **`/expr`** | Expr DSL (S30) — parse + evaluate expressions dans condition guards (visible_when / enabled_when / validators). Determinism-d'abord ; lib/expr.ts (twin Go parser). | Typed ; no LLM |
| **`/policy`** | Policy DSL (S31) — rule tree. Évaluation déterministe des rules (no clock, no rng). Root policy hash ancre opération/control. | Deterministic evaluator ; S31 semantic |
| **`/dsl-editor`** | Éditeurs typés des DSL (Expr / Policy / Gherkin / Saga). Syntax highlighting + type-aware completion. | Déterministic parlers ; mirrors gated |
| **`/shape-editor`** | Éditeur de miroir par forme — build Gherkin/Property/Fixture via form wizard. | Proposition ChangeSet DRAFT ; non truth-write |

### Comportement (behaviors, macros, sagas)

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/behaviors`** | Librairie behaviors user-facing, project-scopée (S79). Browse / search / tag / attach / soft-delete / publish / comment. Match déterministe type-rg. | Deterministic search ; aucun LLM |
| **`/behavior-capture`** | Attacher behavior-macro à la capture (S67). DRY-RUN-EXPANSE en attributs/relations/operations/policies/fixtures → DRAFT ChangeSet. S76 Expand UNIQUE + PURE ; byte-identical. | Fonction pure ; aucun LLM ; propose-seul |
| **`/behavior-expander`** | Expander behavior-macro (S76). Fonction UNIQUE PURE Expand(behavior, entité) → attributes/relations/operations/policies/fixtures. Jamais ré-implémentée. | S67/S79/S80/S81 consumers |
| **`/emitters`** | Emitters — la suite complète. Chacun re-emet le MÊME twin pur du moteur Go (aucun I/O, aucun clock, aucun LLM). | Deterministic projections ; back/gen/ sourced |
| **`/sagas`** | Sagas — orchestration comportements complexes (S62). Stepwise progression, conditional branching, timeout/retry logic. Evaluateur pure par ligne ; déterministe verdict. | Determinism-d'abord ; lib/sagas.ts |

### Déploiement & stack

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/deploy`** | Déploiement keyé sur les phases stables (DP01). Sélectionner stable-phase → déclencher DEPLOYMENT job (Pulumi / docker-compose orchestration). | DP piste (DP01 → DP33) |
| **`/build-loop`** | Boucle de build (DP02–DP05). StackManifest → docker-compose emit → build images → run E2E. | Build orchestration ; step-by-step feedback |
| **`/build-approvals`** | Approbations de build. Gater chaque étape (build, tests, deploy) sur human sign-off. | Multi-étape consent |
| **`/build-console`** | Console de build — logs streaming + live progress. Journalisation déterministe des étapes. | Live telemetry ; force-dynamic |
| **`/preview`** | Preview éphémère (DP04). Déployer une variante du StackManifest sur env preview pour user-facing testing. | Staging-isolated ; aucun prod impact |
| **`/app-builder`** | App Builder — développez VOTRE app (S64). Le cockpit principal pour scaffolding entités, opérations, miroirs, behaviors. | Core AIDOS UX ; action-capable |
| **`/app-ops`** | Opérations de l'app — Sauvegardes déterministes (DP07). Backup / restore Postgres truth-store. Encryption at-rest + audit log. | Deterministic checkpoints ; append-only log sourced |
| **`/stack-manifest`** | StackManifest — source Kernel (DP02). Version 2.0 schema : datastore + services + emitters config. Read-only Kernel projection. | Determinism-d'abord ; lib/stack-manifest.ts |
| **`/stack-emit`** | Émetteur docker-compose (DP03). StackManifest → docker-compose.yml + Pulumi IaC. Determinism-d'abord. | back/gen/ sourced ; aucun hand-edit |
| **`/stack-spike`** | Spike StackManifest — throwaway proof-of-concept. One-shot deterministic bootstrap de Postgres + services. | Ratchet OFF ; cliquet détaché |
| **`/substrate`** | Services de données (fragments StackManifest, DP06). Dépôt des configurations service. | Service registry ; scoped par app |
| **`/provision`** | Provisioning datastore par app (DP06). Allouer Postgres schema (DDL auto-générée, RLS rules, secrets binding). | Deterministic DDL ; migrations Atlas |
| **`/environments`** | Environnements — bindings par environnement (DP06). dev / staging / prod secrets + domain + certs. | Env-scoped ; secret-store intégré |
| **`/domain-bind`** | Domaines custom + TLS (DP06). Routing DNS + certificat provisioning. | TLS-terminator aware |

### Émission (projections déterministes)

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/tool-projection`** | Outil projection. Kernel → Go structs (sqlc) ou TS types. Determinism-d'abord. | Mirroring back/gen/ |
| **`/api-projection`** | API projection — Kernel → OpenAPI schema + SDK stub. Determinism-d'abord. | Route spec → emitted OpenAPI |
| **`/api-surface`** | Surface API émise. Browse endpoints + payloads + exemples de requête/réponse. | Live ; gateway-queried |
| **`/hono-emitter`** | Scaffold serveur Hono/TS + émetteur Pulumi (S77–S78). Kernel → routes boilerplate + middleware. | Deterministic codegen ; back/gen/ sourced |
| **`/front-emitter`** | Front-end émis (Next.js components). Kernel control/action AST → React button/form wire. Determinism-d'abord. | Projection S11 ; never hand-authored |
| **`/web-preview`** | Web-preview panel. Rendu live du front-end émis. Éphémère ; aucune vérité-write. | Client-rendered ; sandbox |
| **`/db-projection`** | Projection base de données. Kernel entity → Postgres table DDL. Atlas migration. | Deterministic DDL ; schema versioned |
| **`/relation-emitter`** | Émetteurs relation-aware (+ async + blob, S75). Entity relations → foreign-key constraints + join tables. | back/gen/ sourced |

### Graphe & visualisation

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/truth-tree`** | Arbre de vérité. Kernel structures en arborescence : Entity → Attribute / Relation → Operation → Policy → Mirror. | Interactive drill-down ; force-dynamic |
| **`/why-tree`** | WhyTree — geste /why. Traçabilité causale : une vérité X pourquoi existe-t-elle ? Remonte l'ancestry (idea source → mirror decision → policy anchor). | Parentage traced ; audit trail |
| **`/project-dag`** | DAG par projet. Dépendances inter-cellules (entity, operation, policy). Visualise cycles (violation arch-fitness). | Graph layout live ; cycle detection |
| **`/version-dag`** | DAG de versions. Historique commits → phases stable. Branchement + merges. | Git-sourced ; semantic-merge aware |
| **`/_graph`** | Routes administratives (`_graph`) pour debug de cliquet interne. Aucun user-facing UI ; inspection-only. | Debug console |
| **`/grid`** | La grille niveau × facette (les deux axes, S36). Matrice complétude : rungs (7 truth-levels) × facettes (completeness aspects). | Grid engine intégré ; sensors gated |

### Semantic & debugging

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/semantic-diff`** | SemanticDiff — classifier kernel change (add/refine/override/rescope/reweight/deprecate) + compute blast radius. | Non-truth-write ; classifier-only |
| **`/semantic-merge`** | Fusion sémantique — merge branch en re-courant tous les miroirs (la décision du miroir gère le merge, pas le diff texte). Red mirror bloque le merge. | Deterministic rebase ; mirror-first |
| **`/goal-piloting`** | /goal piloté — interactif dashboard du goal en cours (progress, red-set state, budgets). | Live ; dashboard-style |
| **`/mutation-score`** | Score de mutation (S50). Densimètre du serrage kernel. Mutant.Survive bloque la coupe. | Threshold bar lu, jamais authored |
| **`/arch-fitness`** | Cliquet structurel (S102, KRD §47). Quatre métriques inter-cellules : violations frontière, cycles, arêtes inter-BC, complexité max. TENIR ou S'AMÉLIORER seulement. Nouvelle violation ou cycle → rouge + coupe bloquée. | Déterministic metrics ; mur-respecté |
| **`/harness-economics`** | Économie du harnais — coût par row. HarnessCostBudget par cellule (S51). Evaluateur pure ; aucun I/O. | S51 economics engine |
| **`/endpoints-fitness`** | Fitness des endpoints HTTP. Couverture des contrats vs implémentation. | API-surface aligned |
| **`/mirror-health`** | Santé du miroir — taux d'exécution, drift, causale ancestry. | Telemetry-sourced ; sensors |

### Agents & gouvernance

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/agents`** | Agents (couches gouvernées). Autonomy staircase A0–A8 (S81). Contrôle + action-capable par tier autonomie. | A-tier gated ; role-based access |
| **`/autonomy`** | L'autonomie A0–A8 — décrire chaque tier, ce qu'un agent peut faire autonomously. Gated par approval + audit trail. | Tier-centric ; S81 model |
| **`/governance`** | Gouvernance — rôles + permissions (app-builder role, approval-multisig role, etc.). Audit log accès + truth-writes. | Multi-tenant ; RLS project-scoped |
| **`/authorities`** | Authorities — liste des autorités (app-builder, subject-matter expert, etc.). Binding rôle → email → persona. | Kernel-sourced ; immutable |
| **`/authority-binding`** | Liaison autorités / rôles. Multi-autorité + quorum approval logic. | Deterministic evaluation ; no LLM |
| **`/conscience`** | La conscience — self-introspection harnais. Détecte circularity, mutant-survivor, orphelin, non-convergence. | Guardrail engine ; self-audit |

### Expérience utilisateur & onboarding

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/first-app`** | Votre première application (S23 path → StackManifest). Wizard step-by-step : entity → operation → mirror → deploy. | Onboarding flow ; demo data seeded |
| **`/demo-checkout`** | Démo checkout — la verticale complète (Idée → Goal → Kernel → Miroir → Src → Stable). Bouton checkout déclenche createOrder. Lecture-seule contre vérité. | Tracer-bullet ; E2E slice |
| **`/bootstrap`** | Bootstrap one-shot déterministe. Créer app skeleton (stack-manifest.v2.yaml) à partir de template. | Determinism-d'abord ; aucun LLM |
| **`/bootstrap-spike`** | Spike bootstrap one-shot go/no-go. Essayer bootstrap sur throwaway branch avant commit. | Ratchet OFF ; aucune vérité |
| **`/cli`** | CLI aidos (S05) — documenter surface CLI (aidos idea capture, aidos goal open, aidos trim, etc.). | Reference sheet ; action-capable items linked |

### Ingestion & migration

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/ingestion`** | Ingestion document→markdown (S114, DocConverter). PDF / DOCX / PPTX / XLSX / HTML → markdown candidat-truth. Déterminisme-d'abord. | Deterministic conversion ; idempotent |
| **`/data-migrate`** | Migration de donnée breaking (S73). Atlas migration → Postgres DDL versioned. Backfill logic. | Deterministic migrator ; forward-only |
| **`/records`** | Records browser — parcourir archive schema (ideas, changesets, mirrors, truthstore). | Read-only Postgres ; force-dynamic |
| **`/context-compression`** | Context-compression — compresser ContextPack pour un goal (S2). Kernel chargé + red mirrors croisés. | ContextRouter algorithm |
| **`/context-pack`** | Context-Pack — une tranche chargée (kernel, red mirrors, contracts, scoped memory). Utilisé par step next. | Deterministic routing ; isolation par goal |

### Réutilisabilité & archive

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/archive-curation`** | Curation d'archive + niches QD (S66, qualité diversity). Explorer spike results, candidates pour promotion en reusable behavior/pattern. | Archive browser ; evolution-niche tracker |
| **`/decision-reuse`** | Réutilisation de décision — un même besoin dans deux apps, peut-on réutiliser la BesoinGraph résolu + sa compoundification (capitalisation)? NAME-MATCH deterministic ; cross-app reuse tracker. | Cross-app linked ; provenance + pedigree |
| **`/evolve`** | Evolution sandbox quarantine (S66, medium loop QD). Générer variantes (branches/reports/idées). Variante promue si ✓ green mirror + out-of-sample green + authority approval. | Ratchet OFF ; cliquet détaché ; aucune truth-write |
| **`/project-evolve`** | Project evolution — amélioration automatique d'une cellule. Self-play + QD exploration. | Autonomy-gated ; expert approval |

### Sécurité, confidentialité & observation

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/gdpr-erasure`** | GDPR EXPORT & ERASURE (S116, art. 17). Append-only truth-store : crypto-shredding / tombstone. Droit d'oubli. | Audit log ; aucun write-path delete |
| **`/secret-store`** | Secret store par projet (S115). Stockage clés API / JWT / certs. Encryption at-rest + audit trail. | Vault-backed ; project-scoped |
| **`/auth`** | Authentification & sessions. OAuth2 / OIDC backend. Session JWT lifecycle. | next-auth intégré ; session cookie |
| **`/app-auth`** | Auth & rôles de l'app émise (S84). Middleware Hono pour enforce role-based access dans app émise. | Deterministic RBAC ; aucun LLM |
| **`/ops-observability`** | Opérations observabilité — metrics (latency, error-rate, throughput). Alertes de regression. | Telemetry-sourced ; sensors |
| **`/cost-meter`** | Cost meter — billing par projet, par operation exécutée, par storage. HarnessCostBudget burndown (S51). | Metered ; economically-gated |

### Administration & monitoring

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/projects`** | Projets — listing + gestion (create/edit/delete). Admin view. | Multi-tenant admin ; RLS enforced |
| **`/project-members`** | Adhésions de projet — inviter/révoquer/changer rôle. Multi-tenant isolation. | Auth-gated ; audit trail |
| **`/project-scope`** | Scope projet — définir frontière entre le code du projet et le reste. Isolation. | Kernel-scoped ; dependency audit |
| **`/project-wall`** | Mur project-aware (S04 + project isolation). Zones filtrées au scope du projet. | Inherited from /wall ; project-filtered |
| **`/app-docs`** | Docs app émise (S22). Markdown → statique documentation (OpenAPI + guide utilisateur). | Deterministic rendering ; force-dynamic |
| **`/doc-mirror`** | Mirror de documentation. S22 contract : docs vs réalité API. | Contract-gated |
| **`/check`** | aidos check — couverture des lois (S108). Couvrez-vous tous les canaux publics d'une opération ? Tous les niveaux de preuve E0–E7 ? | Completeness linter ; deterministic |
| **`/check-completeness`** | Vérifier complétude : toutes les entités, relations, opérations, policies sont documentées ? | Deterministic audit ; S36 solver |
| **`/meta`** | Métadonnées système. Versioning AIDOS Workbench, health-check harness. | Diagnostic console |
| **`/account-release`** | Account release — release notes par projet. | Release archive |
| **`/adoption`** | Adoption — mesurer l'adoption (T0 → T4 ladder). Quel est le prochain tier ? | Deterministic ratchet ; no LLM |

### Connecteurs & extensibilité

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/connectors`** | Connecteurs déclarés (S83). Liste des plugins AIDOS (Slack, GitHub, Jira, etc.). Configuration par projet. | Plugin registry ; deterministic dispatch |
| **`/connectors-spike`** | Spike nouveau connecteur — throwaway POC intégration externe. | Ratchet OFF ; sandbox |
| **`/cell-federation`** | Fédération cellules — partager entités/operations entre deux apps AIDOS. | Cross-project contract |
| **`/federation`** | Fédération — topologie multi-app. Contrats limites inter-app. | Federated mesh ; contract-gated |
| **`/federation-cockpit`** | Cockpit fédération — visualiser topologie + alertes de drift inter-app. | Federation dashboard ; live |

### Spécifications & templates

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/tech-spec`** | Tech spec — template spécification technique. Structured markdown. | Template-driven ; i18n |
| **`/templates`** | Templateslib — réutilisable templates (entity, saga, mirror, etc.). | Registry ; deterministic search |
| **`/derive-doc`** | Dériver documentation à partir du kernel. Entity refs → documentation fragments. | Deterministic rendering |

### Invariants & temporalité

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/temporal-invariants`** | Invariants temporels — règles qui doivent TOUJOURS tenir (ex. « une commande ne peut jamais revenir à draft après shipped »). | Invariant engine ; S99 logic |
| **`/global-invariants`** | Invariants transverses (EL14). Énoncées par humain, classifiées par code. ∀ croisées à tous les rungs. Policy band ≤ 1 Idea. | Policy-band limited ; no LLM authoring |
| **`/caused-by`** | Lien caused_by — relation causale entre deux truthes (opération X causée par policy Y). | Audit trail ; provenance link |

### Debugging & introspection

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/why-tree`** | WhyTree — geste /why, traçabilité causale backwards (idea → mirror → policy). | Parentage audit ; force-dynamic |
| **`/mirror-watch`** | Mirror-watch — observe miroir, materialise, capture run, mesure divergence. | Live sensor ; telemetry |
| **`/goal-stream`** | Goal stream — feed de goals en cours (status, red-set, budgets). | Real-time ; SSE-capable |
| **`/collab`** | Collab — panel pour co-authoring (live cursors, conflict resolution). | Multi-user sync ; CRDT-backed |
| **`/brain`** | Brain cockpit — self-introspection harnais (détecte bugs, circularity, non-convergence). | Guardrail engine ; offline |

### Incubation & vérification

| Route | Rôle | Propriété |
|-------|------|-----------|
| **`/ai-lab`** | AI Lab — sandbox pour expérimentation LLM-backed features (jamais truth-write). | Ratchet OFF ; cliquet détaché |
| **`/doltgres-spike`** | Spike Doltgres (versioned Git-like Postgres). Throwaway PoC. | Ratchet OFF |
| **`/stack-spike`** | Spike StackManifest — throwaway bootstrap test. | Ratchet OFF ; cliquet détaché |
| **`/strangler`** | Strangler pattern — progressivement remplacer vieux système. Gates migration step-by-step. | Feature-flag aware ; safe cutover |
| **`/env-rollback`** | Rollback environnement — revenir à antérieure stable-phase. | Phase-keyed ; DP01-aware |

### Notes structurales

1. **Determinism-d'abord** : Chaque route se synchronise avec son **twin pur Go** dans back/mcp ou back/kernel — lib/\*.ts (TS projection) réflète exactement le Go source, couvert par fast-check tests et E2E Playwright.

2. **Le mur** (§2) : Aucune truth-write depuis l'écran. L'accessibilité action-capable est soit (a) lecture-seule (rendering du verdict calculé Go), soit (b) propose-seul (ouvre ChangeSet DRAFT, jamais apply kernel direct). L'approbation humaine ou automatique (gate non-gameable) gère la promotion.

3. **Bilingue & thémé** : ADR 0011 (next-intl, FR par défaut + EN) + ADR 0010 (zinc + blue-600 + Geist tokens + Tailwind).

4. **Live & force-dynamic** : Routes qui lisent live l'état du projet (ideas, changesets, records, gateway MCP) ont `export const dynamic = "force-dynamic"` pour contourner Next.js ISR + réfléchir l'état courant.

5. **Project-scoped** : La plupart des routes isolent par projet actif (via activeProjectContext) ; le mur projet-aware + l'isolation RLS Postgres garantissent l'étanchéité multi-tenant.

6. **Cliquet ON/OFF** : Routes de prod (kernel, mirrors, goal, deploy) ont le cliquet ACTIVÉ (ratchet=ON) ; routes d'exploration (spike, evolution-sandbox, bootstrap-spike, ai-lab) ont cliquet OFF (write-only branches/reports/ideas, jamais kernel).

7. **Nomenclature V1** : Toutes les routes suivent le pattern kebab-case, correspondent à une S-number ou EL-gate, et sont nommées verbalement (kernel-garden, mirror-watch, learn, deploy) plutôt que par numéro interne.

---

**Inventaire complet** : 178 routes V1 (hors /v2, /v3, /api) couvrent la verticale complète de KRD (S23 → S112), du besoin (/compound-besoin) au déploiement (/deploy), avec gels de vérité, miroirs, fitness, émission, gouvernance, et observation déterministe.

---

Perfect! Now I have all the information I need. Let me compose the comprehensive French reference section about V2 / WB2:

---

## V2 / WB2 — L'échelle fractale vivante

La deuxième génération du Workbench (Workbench V2, étape WB2-00 · ADR 0055/0056/0057) est un **système de lentilles conceptuelles KRD** organisé autour du **schéma canonique** (idée → mur → kernel → verticale → facette → paires-miroir → liens → arbres → cellules). Contrairement à V1 où chaque route était un panneau isolé, V2 rend la **descente fractale vivante** : le modèle conceptuel devient navigable, le code devient un graphe, et un chat déterministe orchestre l'ensemble.

### Fondation : glossaire canonique et shell V2

Le vocabulaire de V2 vit dans une **source unique** : `lib/v2/glossary.ts`. Le glossaire déclare neuf concepts KRD (verbiage français, verbatim du domaine, aucun franglais), chacun avec son libellé (FR + EN) et sa définition :

| Concept | Label | Définition |
|---------|-------|-----------|
| `idee` | Idée | Un candidat-vérité capturé au-dessus du mur : un besoin sans gel ni miroir (§115) |
| `mur` | Mur | La frontière : au-dessus on déclare, en dessous on prouve ; on ne la franchit que par idée → miroir → /goal |
| `kernel` | Kernel | Une vérité gelée, content-adressée et append-only ; la version est son empreinte |
| `verticale` | Verticale | L'axe architectural couplant : produit → parcours → vue → contrôle → action → opération → entité (§23) |
| `facette` | Facette | L'axe orthogonal de la nature d'une vérité : les huit lentilles F·I·S·B·R·V·M·X (FKE-1.3) |
| `paires-miroir` | Paires-miroir | L'anatomie 1-pour-1 d'un kernel autour du mur : six paires déclaré ↔ prouvé |
| `liens` | Liens | Les six liens du §17 (composes, depends_on, supersedes, provenance, triggers/binds, mirrors), tous pinnés @version |
| `arbres` | Arbres | Les arbres fractals de composition : un kernel par niveau, dépliable, du produit à l'entité (§49) |
| `cellules` | Cellules | Les contextes délimités (features = kernels grossiers) reliés par contrats Pact (§49) |

Le **shell V2** (`layout.tsx`, `V2Header`, `V2Nav`, `V2LegacyBanner`) enveloppe tous les écrans /v2 :
- **En-tête** (`V2Header`) : marque V2, lien vers le lab, retour vers V1, bascule langue (next-intl, FR par défaut · ADR 0011)
- **Navigation latérale** (`V2Nav`) : liste des concepts cliquables, active selon `usePathname()`, générée depuis le glossaire (aucune chaîne en dur)
- **Bandeau de dépréciation** (`V2LegacyBanner`) : affiché en tête de **chaque écran /v2**, indique que V2 est legacy et redirige vers `/v3/lab` — les routes V2 restent (anti-overwrite §9), jamais supprimées

Le thème respecte ADR 0010 (tokens Geist zinc+blue-600 shadcn, jamais de couleur en dur) et ADR 0011 (bilingue, FR en priorité).

### Écran d'accueil : le schéma KRD interactif

**`/v2`** rend le **schéma complet du domaine KRD** :

1. **Diagramme React Flow** (lecture seule) : chaque bloc représente un concept ; les nœuds sont cliquables et naviguent vers `/v2/<slug>` du concept
2. **Repli accessible** : même carte en liste HTML (sans canvas) pour les navigateurs sans support Flow
3. **Carte de concepts en grille** : 9 cartes cliquables (une par concept du glossaire), chacune montrant libellé + définition localisée
4. **Registre complet d'écrans** (section « Tous les écrans ») : énumère toutes les routes V2 existantes, avec empreinte `screensHash()`

L'accueil est **déterministe-first** : le schéma est une projection pure du glossaire ; même glossaire → même schéma, l'empreinte est calculée (`schemaHash()` et `screensHash()` affichés, content-addressed). **Le mur est intact** : l'accueil navigue, ne propose aucune idée, n'écrit aucune vérité.

### Routes dynamiques et écrans par concept

**`/v2/[slug]`** est un **catch-all** qui rend la définition canonique d'un concept (depuis le glossaire). La route :
- Vérifie que le slug existe dans le glossaire (sinon 404)
- Affiche le titre + la définition localisée (FR ou EN selon `useLocale()`)
- Affiche un rappel du mur (« au-dessus on déclare »)
- Propose un lien vers le **geste action-capable** du concept, si applicable (ex. « mur » → `/v2/goal`)

**Slugs avec écrans dédiés** : certains concepts ont leur propre écran (route statique prioritaire sur le catch-all) :
- `idee` → `/v2/idee` (wizard de capture d'idée)
- `mur` → `/v2/goal` (wizard d'ouverture de /goal)
- `liens` → `/v2/liens` (visualisation des six liens, React Flow)
- `cellules` → `/v2/cellules` (fédération et contrats Pact)
- `verticale` → `/v2/verticale` (alias vers grille niveau × facette)
- `arbres` → `/v2/arbres` (alias vers arbre fractal de composition)

### Gestes action-capables (wizards)

#### `/v2/idee` — Capturer une idée

Un **wizard XState + React Hook Form + Zod** (twin pur `lib/v2/idea.ts`, stepper shadcn). Le flux :
1. **Intention** : libellé libre de l'idée (textarea)
2. **Coordonnée** (niveau, facette, échelle) : sélection de la position dans la verticale
3. **Provenance** : humain ou incident (radio)
4. **Review** : affichage récapitulatif
5. **Proposé** : création d'une Idea amber (hasMirror=false, wroteKernel=false, id content-addressé)

**Action-capable** : clique « Proposer » → crée une `Idea` DRAFT (aucune écriture vérité, propose une entrée dans le backlog). Le verdict est **calculé par le code**, jamais par LLM.

#### `/v2/goal` — Franchir le mur

Un **wizard XState** (twin pur `lib/v2/goal.ts`) : idée → miroir → /goal gelé. Le flux :
1. **Idée** : affichage récapitulatif de l'idée proposée
2. **Miroir** : choix du **formulaire attendu** (Gherkin, property, fixture) et **rédaction du texte du miroir**
3. **Gelé** : affichage de la version hash, du ChangeSet DRAFT, de la coordonnée finale, du statut hasMirror/wroteKernel

**Gestionnaire de refus** : une tentative d'écriture-vérité directe (contournant le miroir) est REFUSÉE par un `BlockReason` (code, message de correction). Le wizard PROPOSE un ChangeSet DRAFT, jamais une écriture directe.

#### `/v2/grill` — Affûter une intention

Un **wizard XState** (twin pur `lib/v2/grill.ts`) : affûtage d'une intention brute via scénarios Gherkin. Le flux :
1. **Intention** : libellé brut
2. **Scénarios** : ajout de plusieurs cas Given/When/Then
3. **Review** : récap des scénarios
4. **Affûtée** : verdict du grill (sharp / fuzzy / incomprise), ADRs candidats extraits de la doc

L'écran propose un **seul geste** de cet étage (pas d'écriture-vérité).

#### `/v2/builder` — Un chat qui fait tout

**Écran unique**, un **chat conversationnel déterministe** (twin pur `lib/v2/builder.ts`, grammaire fermée, ADR 0057). La grammaire d'intentions est **jeu clos**  : `{capturer_idee, greffer, promouvoir, impacter, interroger, deployer}`. Pas d'invention, pas d'action non déclarée.

Le **pipeline du tour** (transparent à l'écran) :
1. **`understand(message)`** : classification lexicale (not LLM) des intentions, retourne verdict (`comprise` / `ambigue` / `incomprise`) + candidats triés
2. **`applyIntent(état, intention, message)`** : réducteur pur event-sourcé ; même input → même output
3. **Rendu ultra-explicite** :
   - **L'attente** : candidat en tête
   - **Types de réponse possibles** : tous les candidats cliquables (chips)
   - **La réponse** : événements typés (jamais prose libre)
   - **Les impacts** : vague calculée (arbre composes, idées affectées, kernels proposés)

Sur ambiguïté, l'écran peut invoquer Claude (`claude-fable-5`) pour reformuler le message ; le texte reformulé repasse par `understand` — **le code juge toujours, le LLM propose et ne décide jamais**. Toute panne → repli sur chips déterministes.

**Le mur est une propriété ∀** : aucune suite de messages ne produit écriture-vérité (idées restent amber, kernels proposés DRAFT, déploiements gatés ADR 0052). Épinglé par test fast-check du miroir `lib/v2/builder.test.ts`.

### Lentilles : visualisation et navigation

#### `/v2/grille` / `/v2/verticale` — Grille niveau × facette

Un **tableau interactif** (niveau vertical, facette horizontal) rendant la complétude d'un kernel ou d'une cellule sur les huit facettes. Cliquer une case ouvre les specs de cette coordonnée.

**Reuse** : mêmes données + comportement pour V2/verticale, V2/grille, V2/cellules (drill-down sur cellules).

#### `/v2/kernels` / `/v2/arbres` — Arbre fractal de composition

Vue **expansible** de l'arbre `composes`, du produit aux entités. Chaque nœud porte sa position (racine/feuille), ses enfants, ses specs. Cliquer un nœud descend ; cliquer une case ouvre l'anatomie.

#### `/v2/liens` — Les six liens (React Flow)

**Graphe interactif** montrant tous les kernels connectés par les six liens du §17 (composes, depends_on, supersedes, provenance, triggers/binds, mirrors) — tous pinnés @version, jamais naked. Filtre par **famille de lien** (select) ; cliquer un lien affiche détail (kind, from, to @version). Pan/zoom activé.

**Action-capable** : le filtre change les arêtes affichées ; cliquer une arête ouvre son détail. **Mur intact** : lecture seule, promotion passe par idée → miroir → /goal.

#### `/v2/cellules` — Fédération et contrats Pact

Vue **tri-niveaux** : 
1. **Sélection** : liste des cellules (bounded contexts = kernels grossiers)
2. **Drill-down** : grille niveau × facette de la cellule sélectionnée
3. **Contrats** : liens `depends_on` (Pact) vers autres cellules, in/out

Cliquer une case ouvre les specs. Cliquer un contrat ouvre son détail.

#### `/v2/dag` — Versions et ChangeSets (React Flow)

Le **VERSION DAG** (S24, §120-§125) : nœuds = versions (hash content-addressé), arêtes = ChangeSets. APPEND-ONLY (lignes abandonnées dimmées). Deux bandes (§124) : `bandAbove` (vérité humaine), `bandBelow` (évolutionnaire). Cliquer un nœud ouvre détail (hash, parents, stratum, reachability).

**Mur intact** : lecture seule.

#### `/v2/code` — La descente fractale dans le code

**Écran unique d'exploration** (WB2-26, ADR 0056). La descente fractale se **continue sous la feuille** : requirement (chemin `composes`) → **fichier** → **classe** → **fonction** → **version** (hash du corps) → **ligne** (span).

Le **graphe de code** est **extrait déterministiquement** (TypeScript AST, `lib/v2/code-extract.ts` côté serveur, réutilise graphify + Bazel) :
- Nœuds : `file | class | function | method` (jeu clos), portant `span`, `version` content-adressée, `parentId`
- Arêtes : `calls | imports`, taguées par confiance (`extracted` / `inferred`)
- `impactOf` (Bazel `rdeps`) : clôture des appelants, vague de rouge au grain code
- `actionKey` (invalidation fine) : hash(corps + versions dépendances directes)

Le **twin pur client-safe** (`lib/v2/code-graph.ts`, aucun import TypeScript) calcule impact, ancrage, god nodes, diff.

**L'écran rend la descente exécutable** :
1. **Sélecteur requirement** : choisir un chemin
2. **Symboles ancrés** : suggestion lexicale des symboles candidats (score déterministe)
3. **Arbre fichiers** : déroulant interactif
4. **Détail : span, version, clé Bazel**
5. **Simuler impact** : affiche la vague red (fichiers/symboles impactés)
6. **Ouvrir dans VS Code** : `vscode://file<path>:<line>` directement

**Mur intact** : lecture + simulation, aucune écriture-vérité ; promouvoir un constat (refactoriser, ancrer) passe par idée → miroir → /goal.

#### `/v2/graphe` — Graphe 3D Obsidian-like

Quand il y a **beaucoup de specs**, une liste ne tient pas — un **graphe 3D oui**. Les axes :
- **x** = verticale (niveau : produit→entité)
- **y** = facette (F·I·S·B·R·V·M·X)
- **z** = profondeur d'anatomie (spec → sous-spec)

Les nœuds = specs (proposées/validées/réalisées) + nœuds du DAG existant. Les liens = arêtes `composes` (descente) + `depends_on` (impact sur DAG). Les couleurs portent l'état (proposé/validé/réalisé; impacté/résolu).

**Réutilisation** (ADR 0007) : données du graphe = `buildSpecGraph` (réutilisé de V1, pur, déterministe), résolution rouge→vert lit le même `impactResolved` que liste/grille/cellules (cohérent partout).

**Mur intact** : lecture + proposition.

#### `/v2/emetteurs` — Projections déterministes

**Émission DEPUIS les entités** (WB2-21, S34/S35). Une source d'entité (nom + attributs ordonnés, typés sur scalaires fermés) est projetée déterministiquement en trois cibles : DDL Postgres, struct Go (sqlc), type TypeScript. Un **contrat** liste les champs partagés.

**Reuse** (ADR 0007) : cœur émetteur = `emit/project` (byte-identique Go back/kernel/entities), twin pur `lib/v2/emetteurs.ts`.

**Bouton « Émettre »** : rend les trois cibles ; **« Ré-émettre »** relance jusqu'à stabilité (fixed-point). **Mur intact** : modifier une source PROPOSE → /goal, jamais écriture directe.

#### `/v2/operations` — Fixtures rejouables

Index des **fixtures Operation DSL** (S10) déclarées. Chaque entrée → écran de rejeu `/v2/operations/[op]`, affichant le verdict (pass/fail). **Mur intact** : lecture seule.

### Statut LEGACY et coexistence V1

**Dépréciation honnête** (ADR 0011, anti-overwrite §9) :
- **Bandeau V2LegacyBanner** : affiché en tête de **chaque écran /v2**, rappelle que V2 est legacy et propose CTA vers `/v3/lab`
- **V2Header** : lien « Retour au Workbench » (`/`) pointe V1
- **Routes conservées** : aucune route V2 n'est supprimée ; `/v2/*` reste toujours accessible
- **Glossaire, twins, tests intacts** : `lib/v2/**` reste maintenable (jamais dead code)

La **transition progressive** (plan de passage V2→V3) préserve le domaine conceptuel KRD tout en améliorant l'UX de V3.

### Déterminisme et miroirs

V2 applique **CLAUDE.md §6/§8** (déterminisme-first) strictement :
- **Glossaire** : `isTotal()` et `glossaryHash()` prouvent totalité + stabilité (zero-arg pure functions)
- **Schéma** : projection pure du glossaire ; même glossaire → même schéma
- **Graphe de code** : extraction déterministe (AST TypeScript) ; même source → même graphe
- **Classification d'intentions** : lexique déclaré, poids déclarés (jamais appris)
- **Réducteur builder** : event-sourced pur ; même `(état, message)` → même `(état', événements)`

**Miroirs** (tests fast-check dans `lib/v2/*.test.ts`) :
- `glossary.test.ts` : totalité, absence franglais, déterminisme empreinte
- `code-graph.test.ts` + `code-extract.test.ts` : extraction, impact, clé Bazel, diff, ancrage, god nodes
- `builder.test.ts` : aucune intention ne franchit le mur, refus explicable, propriété ∀

### Défi d'architecture vs V3

La **V2 était la descente » : construire le modèle conceptuel vivant complet. La **V3 est la remontée » : rendre le Workbench user-friendly sans perte de domaine. Les lentilles V2 (~28 écrans) se condensent en V3 (~5 sections, ~13 lenses), mais le domaine KRD (glossaire, liens, twins, tests) reste partagé et maintenable. **Jamais de suppression** : V2 demeure accessible, legacy mais vivant.

---

Parfait ! Maintenant j'ai l'inventaire complet. Je vais structurer ma réponse en markdown selon les 5 groupes de la nav.

---

## V3 — NAV & LENTILLES

La refonte user-friendly du Workbench introduit une navigation logique articulée autour de **cinq parcours utilisateur**, régroupant 25 lentilles conceptuelles portées en propre. Le shell V3 (`V3SessionProvider` + `V3Nav` via `app/v3/layout.tsx`) enveloppe toutes les routes ; chaque lentille hérite automatiquement de la session partagée, de l'échelle d'instance parametrable et de l'historique rejoué.

### Architecture du shell V3

| Composant | Rôle |
|-----------|------|
| **V3Nav.tsx** | Navigation coordonnée en 5 sections + commutateur de projets (ADR 0061) + palette ⌘K. Les 28 lentilles porées sont réelles ; les concepts (policy, kernels, etc.) annoncés sont présents comme routes actives, jamais des liens morts. |
| **V3SessionProvider** | Fournit la session partagée rejoué (turnsOf/replayTo) + l'échelle d'instance (ladderOf config) ; chaque lentille lit depuis `useV3Session`. |
| **layout.tsx** | Charge côté serveur : le projet actif (cookie aidos-v3-project), la liste des projets, l'inventaire V1 (fs-scan app/), le graphe de code extrait des twins lib/v2/, la config d'instance. Injecte les données en propriétés. |

---

### Groupe 1 : CONCEVOIR (5 lentilles)

Espace de composition de la logique métier au-dessus du mur (vérités déclarées, source humaine).

| Lentille | Route | Rôle | Source |
|----------|-------|------|--------|
| **Lab** | `/v3/lab` | Chat partagé (façon GPT) de la session V3. Tout vient de `useV3Session` — une lentille pure. | Client (session) |
| **Spécifications** | `/v3/specs` | Grille niveau × facette + liste coordonnées des specs. Compte des kernels par cellule, statut amical, scénario replié. Le twin specsOf/gridOf conserve les comptes ; impacts du dernier tour en ambre. | Client (session) |
| **Autoring d'opération** | `/v3/operation` | Éditeur typé d'opération (AST Workflow : six verbes de la grammaire fermée). Dérive la fixture Given/When/Then (miroir N2). « Proposer » émet une idée candidate via idea_capture. Pas de chat — tout est construit (B) et dérivé (C) par réducteurs purs (déterminisme-first §6/§8). | Client (réducteurs purs, lib/v3/operation) |
| **Autorisation** | `/v3/policy` | Policy comme artefact (KRD §24.4, §93). Montre le scope/effet, l'arbre de règles typé (combinateurs all/any/not, comparaisons eq/gt/lt, prédicats exists/matches sur sélecteur $-enraciné), l'adresse contenu (id@version). Atelier « essayer un contexte » évalue ALLOW/DENY. Twin pur autoritatif `lib/policy.ts`, byte-identique au Go. | Client (twin pur lib/policy.ts) |
| **Vérités du noyau** | `/v3/kernels` | Table adressée par contenu : chaque kernel.truth rangée par hash du corps (S02, append-only), lue par store_get (serveur `store` dispatché). Chaque ligne porte sa facette (expr, policy, operation, control, action, entity, invariant, budget), énoncé, corps JSONB, badge source (live/demo). | Go moteur (store_get) + repli démo (lib/v3/kernels-data) |

---

### Groupe 2 : COMPRENDRE (10 lentilles)

Espace de lecture & diagnostic du modèle vivant (projections, analyses transversales, signatures de vérité).

| Lentille | Route | Rôle | Source |
|----------|-------|------|--------|
| **Parcours produit** | `/v3/parcours` | Graphes React Flow (ADR 0053) sur la session. Greffe faite dans le chat apparaît en direct. | Client (session) |
| **Grille niveau × facette** | `/v3/grille` | Matrice 7×8 : niveau (verticale couplante §23) × facette (F·I·S·B·R·V·M·X, FKE-1.3). Compte kernels par cellule, cohérence Σ. Sélection → descente aux kernels/specs. **Lecture LIVE du moteur** (gridLive, readVia, serveur `grid` dispatché, grid.Build autoritatif). Twin lib/v2/grid repli-démo déterministe. | Go moteur (grid_build) + repli démo (lib/v2/grid-data) |
| **Anatomie** | `/v3/anatomie` | Six paires-miroir autour du mur (Spec↔Doc · Comportement↔Résultats · Scénarios↔Tests · Modèle↔Projection · Contrat↔Code · Evidence-attendue↔Evidence-observée). Au-dessus = déclaré ; en dessous = prouvé (machine, read-only). Voyant 🟢/🔴/🟡 par paire, computé Go (anatomy_build), jamais déclaré. | Go moteur (anatomy_build) + repli démo (lib/v2/anatomy-data) |
| **Liens** | `/v3/liens` | Six familles typées (projects_to · derives_from · contracts_with · triggers · binds · mirrors) en React Flow. Filtre par famille. Détail : cible pinnée id@version (§41, vague de rouge §42). **Lecture LIVE** (links_graph, serveur `links` dispatché). | Go moteur (links_graph) + repli démo (lib/v3/liens-data) |
| **Arbre des pourquoi** | `/v3/why-tree` | Arbre des causes (geste /why, FK13) : incident → causes ordonnées → cause racine + miroir terminal d'anti-récurrence. **Réutilise le composant partagé** `components/WhyTreePanel` (même Server Action buildAction, décodeur pur live.ts, registre WHY_TREE_CASES). Lit LIVE serveur Go `why-tree`. Badge source (live/demo). | Go moteur (why-tree) + repli démo (twin pur) |
| **Arbres de composition** | `/v3/arbres` | Fractal des kernels : produit → parcours → … → entité. Nœuds dépliables/repliables (virtualisé React Arborist). Verdict §109 + drill-down §110 lus LIVE (serveur `kernel-tree`, tree_aggregate). Structure/libellés composés côté serveur (repli démo), jugement délégué Go. | Go moteur (tree_aggregate) + repli démo (lib/v2/kernel-tree) |
| **Conscience** | `/v3/conscience` | Agrégateur déterministe (FK09, FKE-6.3) : fonction pure composant verdicts des juges existants (runner, complétude/monstre, facettes S/R/V/M/X, SemanticDiff, RealityMirror, senseurs, ledger) en ConsciousnessReport + decision cards (§FKE-31). **Réutilise telle quelle** `app/conscience/ConsciencePanel`, Server Action `reconcileAction` (readVia serveur `conscience` dispatché), décodeur pur `reportDecoder`, scénarios `conscience-data`. | Go moteur (conscience) + repli démo (demoReport) |
| **Fédération des cellules** | `/v3/cellules` | Grosse app = fédération de cellules (bounded contexts) reliées par contrats. Policy globale fan-out vers RedWorkQueue par cellule. Vague de rouge lue par outil Go `fan_out` (serveur `federation` dispatché, §51). | Go moteur (fan_out) + repli démo (lib/federation-cockpit) |
| **DAG de versions** | `/v3/version-dag` | Espace des versions : têtes courantes (dag_heads) + DAG entier — nœuds, arêtes (ChangeSets), stratifiés par ligne de flottaison (§124). Têtes surlignées, nœuds hors-tête estompés. **Lecture LIVE** (dag_get/dag_heads, serveur `dag` dispatché). | Go moteur (dag_get, dag_heads) + repli démo (live.ts pur) |
| **Historique** | `/v3/history` | Timeline de la session. Tout vient de `useV3Session` — lentille pure. | Client (session) |

---

### Groupe 3 : CONSTRUIRE & DÉPLOYER (4 lentilles)

Espace de matérialisation du code et de l'infrastructure (éditeurs, générateurs, environnements).

| Lentille | Route | Rôle | Source |
|----------|-------|------|--------|
| **Code** | `/v3/code` | Éditeur en direct (openvscode-server, Traefik, AIDOS_VSCODE_URL env). Réécrit le paramètre `folder` par onglet (dev/staging/prod → workspace projet). Jeton dans `.env.local`, jamais en code suivie. | Client (iframe) |
| **Émetteurs** | `/v3/emetteurs` | Émission depuis les entités : DDL Postgres + struct Go + type TypeScript. **Twin pur autoritatif** `lib/v2/emetteurs.ts` (emitView/reEmitStable/appPreview, byte-identiques Go back/kernel/entities). Registre clos ENTITY_CASES. Entités émises par l'app courante (emitApp state). | Client (twin pur lib/v2/emetteurs.ts) |
| **Environnements** | `/v3/environnements` | Échelle de la session. Tout vient de `useV3Session` — lentille pure. | Client (session) |
| **Instance** | `/v3/instance` | Config persistée (.aidos-instance.json, parse fail-closed twin lib/v3/instance). Tuiles, sonde (au montage), formulaire réglages. | Client (config instance) |

---

### Groupe 4 : FAIRE ÉVOLUER (4 lentilles)

Espace de croissance & dérivation (évolution, bench, qualité structurelle, design).

| Lentille | Route | Rôle | Source |
|----------|-------|------|--------|
| **Évolution** | `/v3/evolve` | Générateur d'évolution (EG05, ADR 0089). Variantes par auto-jeu (self-play seedé) ou sampler déterministe, avec niche + verdict gate (promue/refusée + motif). **Twin pur** `lib/v3/evolve-view.ts` (projectCellRun/runCanonical, byte-cohérent Go). Juge = miroir déterministe. | Client (twin pur lib/v3/evolve-view.ts) |
| **Bench de complétude** | `/v3/bench` | Match% par spec (barre progression), types requirement manquants, différentiel par modèle (single vs A∪B). **Twin pur** `lib/v3/bench-view.ts` (deriveBenchReport/deriveModelDiffs/runCanonical, byte-cohérent Go). | Client (twin pur lib/v3/bench-view.ts) |
| **Cliquet structurel** | `/v3/arch-fitness` | Deuxième cliquet (§47) : quatre métriques inter-cellules (violations frontière, cycles inter-BC, arêtes inter-BC, complexité max) ne peuvent que tenir/s'améliorer. Quatre gestes action-capables (mesurer live, cliqueter, porte fault-injection, proposer). **Lecture LIVE** (serveur `arch-fitness` dispatché, readVia measure). | Go moteur (arch-fitness) + repli démo (lib/arch-fitness) |
| **Studio de design** | `/v3/design` | Geste de design inversé (Onlook, ADR 0071) : ne s'écrit jamais en code, devient ScreenDesign requirement content-addressé (twin lib/v3/design), compilateur reproduit écran byte-stable sur 3 enfants. | Client (session) |

---

### Groupe 5 : RÉGLAGES (1 lentille)

Espace de configuration de l'instance.

| Lentille | Route | Rôle | Source |
|----------|-------|------|--------|
| **Paramètres** | `/v3/parametrage` | Vérités déclarées de la session (ADR 0060). Tout vient de `useV3Session` — lentille pure. | Client (session) |

---

### Lentille bonus : ÉTAGE D'ENTRÉE (1 lentille, groupe implicite)

| Lentille | Route | Rôle | Source |
|----------|-------|------|--------|
| **Idée** | `/v3/idee` | Capture d'étage d'entrée : où en est le BesoinGraph du projet. Niveau entrable (EL07), rungs capturés, résolution, verdicts par rung. Grammaire fermée niveaux (champs requis + émission d'idée ?). **Lecture LIVE** (besoin_graph_state, serveur `besoin-intake` dispatché, EL15). Badge source (live/demo). | Go moteur (besoin_graph_state) + repli démo (reproduit twin pur) |

---

### Couverture des lentilles réelles

En résumé, **28 lentilles** portées en propre, réparties ainsi :

- **Concevoir** : 5 (lab, specs, operation, policy, kernels)
- **Comprendre** : 10 (parcours, grille, anatomie, liens, why-tree, arbres, conscience, cellules, version-dag, history)
- **Construire & déployer** : 4 (code, emetteurs, environnements, instance)
- **Faire évoluer** : 4 (evolve, bench, arch-fitness, design)
- **Réglages** : 1 (parametrage)
- **Étage d'entrée (bonus)** : 1 (idee, sans groupe de nav affiché mais routable `/v3/idee`)

**Chaque lentille lit depuis la même source** : soit la session partagée (`useV3Session`), soit le moteur Go via la passerelle (`readVia`), soit un twin pur déterministe, jamais un doublon de logique. Le mur intact : aucune écriture-vérité directe depuis l'écran. La V3SessionProvider keying par projet assure que basculer de projet remonte la session entière — le rejeu repart du bon transcript.

---

---

## V3 — Le chat conversationnel

Le chat V3 est le cœur user-friendly du Workbench — un **réducteur pur event-sourcé** (lib/v2/builder.ts) piloté par une **grammaire fermée de 39 intentions** (INTENT_KINDS), sans LLM au-dessus de la ligne (§8, déterminisme-first). La session est **rejoue depuis le transcript** (lib/v3/session.ts, turnsOf) : aucun état ne survivrait un rechargement.

### La grammaire fermée des 39 gestes

Le réducteur accepte EXACTEMENT 39 types de réponse, déclarés dans INTENT_KINDS. Aucune autre intention n'existe. L'écran V3 expose les gestes par groupe dans sa navigation (5 sections × 25 lentilles conceptuelles).

#### Gestes de cycle de vie (6)

| Geste | Verbes lexicaux | Effet | Cible |
|-------|-----------------|-------|-------|
| `capturer_idee` | capture, note, enregistre | Place une Idea DRAFT au nœud d'attache ; l'intent est EXTRAIT verbatim (« capture l'idée : au checkout, débiter une seule fois ») | chemin dans l'arbre (produit) |
| `greffer` | greffe, ajoute, crée | Ajoute un nœud enfant sous un parent explicite (« greffe les remboursements sous app/paiement ») ; slug = libellé normalisé | app/paiement/remboursements |
| `promouvoir` | promeus, promotion, gèle | Promeut la DERNIÈRE idée capturée en ChangeSet DRAFT (kernel proposé, wroteKernel=false) ; route /v2/goal | version du kernel (contenu-adressée) |
| `generer` | génère, émets, construis | Projette les kernels proposés en AppProjection PURE (une entité par kernel, version = hash des versions triées) ; pas de stockage | app:<hash8> |
| `deployer` | déploie, livre, déploiement | Pose l'app à un barreau d'env (dev → staging → prod) ; le cliquet : barreau i exige i-1 OK ; re-arme les barreaux supérieurs | env (dev/staging/prod) |
| `delta` | delta, diff, compare | Calcule les kernels d'écart vs un env donné (défaut = prod) ; aucune mutation d'état | env visée (prod par défaut) |

#### Gestes de navigation et requête (2)

| Geste | Verbes lexicaux | Effet | Cible |
|-------|-----------------|-------|-------|
| `ouvrir` | ouvre, navigue, écran | Résout un écran depuis l'inventaire déclaré (ALL_SCREENS) ; lexique strict (route tokens +3, label +1) ; slug exact +4 ; fail-closed | route de l'écran résolu |
| `interroger` | montre, affiche, liste, état | Affiche un résumé : nombre de nœuds, idées, kernels, état des envs | (pas de cible) |

#### Gestes d'adaptation (1)

| Geste | Verbes lexicaux | Effet | Cible |
|-------|-----------------|-------|-------|
| `adapter` | adapte, style, design | Re-style une coordonnée existante en tokens ADR 0010 (couleur, radius, espacement…) ; phrase : « adapte <coord> : <property>=<token> » ; fail-closed sur le catalogue de tokens ; aucune écriture-vérité, un requirement SOFT below-the-line | coordonnée re-stylée (ex. section heros) |

#### Gestes structurels (1)

| Geste | Verbes lexicaux | Effet | Cible |
|-------|-----------------|-------|-------|
| `impacter` | impact, impacte, touche | Calcule le sous-arbre d'une cible (descendants) ; la vague rouge visuelle | tous les nœuds du sous-arbre |

#### Gestes de capacité lancée (2)

| Geste | Verbes lexicaux | Effet | Route | Nature |
|-------|-----------------|-------|-------|--------|
| `lancer_bench` | bench, benchmarque, complétude | ROUTE vers RequirementBench (DG06/ADR 0088) — un run hermétique below-the-line sur une spec (ex. « createOrder ») ; la cible est citée verbatim ; types manquants = propositions DRAFT, jamais gravés | /v3/bench | port |
| `explorer_evolution` | explore, évolution, cellule | ROUTE vers EvolutionSandbox (ADR 0046) — un run de self-play/QD en quarantaine sur une cellule ; verser une variante = idée → miroir → /goal, jamais écrite ici | /v3/evolve | port |

#### Lectures live (19)

Chaque lecture est un geste LIVE (ADR 0092) : le réducteur POINTE le serveur Go dispatché (`via = { server, tool, args }`) SANS faire I/O. L'aval (V3Session/actions) résout par `readVia(scope, tool, args)` ; **le moteur Go est la SOURCE unique**, jamais réimplémentée front.

| Intention | Serveur | Outil MCP | Ancre lexicale | Route Workbench |
|-----------|---------|-----------|-----------------|-----------------|
| `voir_pourquoi` | why-tree | build | incident | /v2/why-tree |
| `piloter_goal` | goal-piloting | goal_pilot_open | objectif | /v2/goal |
| `voir_federation` | federation | fan_out | federation | /federation-cockpit |
| `reconcilier` | conscience | reconcile | decisions | /v2/conscience |
| `mesurer_archfit` | arch-fitness | measure | architecturale | /arch-fitness |
| `voir_boucle` | build-loop | buildloop_terminate | construction | /build-loop |
| `mesurer_cout` | cost-meter | cost_meter_cell | cellule | /cost-meter |
| `parcourir_comportements` | behaviors | behaviors_search | comportements | /behaviors |
| `jardiner_kernel` | kernel-garden | garden_tend_project | jardin | /kernel-garden |
| `enforcer_autonomie` | autonomy | enforce | autonomie | /autonomy |
| `voir_console` | build-console | buildconsole_project | construction | /build-console |
| `voir_facturation` | billing | billing_meter | facturation | /billing |
| `parcourir_gabarits` | templates | templates_list | gabarits | /templates |
| `voir_besoin` | besoin-intake | besoin_graph_state | besoin | /besoin-intake |
| `auto_certifier` | self-cert | selfcert_gate | batterie | /self-cert |
| `verifier_auth` | app-auth | app_auth_check_access | auth | /app-auth |
| `explorer_espace` | workspace | workspace_provision | espace | /workspace |
| `modeler_entites` | entity-modeler | schema_validate | entités | /entity-modeler |
| `inspecter_forme` | shape-editor | shape_derive | forme | /shape-editor |
| `mapper_contexte` | context-map | verify_all | contexte | /context-map |
| `griller_intention` | grilling-loop | grill_route | challenge | /v2/grill |

#### Propositions (le mur §2, 4)

Une proposition NE GRAVE JAMAIS une vérité. Un geste propositionnel POINTE un serveur dispatché et atteste sa nature DRAFT : Idea (hasMirror=false) ou ChangeSet (wroteKernel=false). La porte légale reste idée → miroir → /goal.

| Intention | Serveur | Outil | Nature | Ancre | Route |
|-----------|---------|-------|--------|-------|-------|
| `apprendre_incident` | learn | bump_hash | idée | incident | /learn |
| `editer_dsl` | dsl-editor | dsl_propose | changeset | dsl | /dsl-editor |
| `provisionner_substrat` | provision | stack.emit | changeset | substrat | /v3/environnements |
| `ingerer_realite` | idea-intake | idea_capture | idée | réalité | /v2/idee |

### La classification lexicale (pure, déterministe, sans LLM)

L'algorithme `classifyIntent(text)` plie le texte (NFD, accents retirés, minuscule) en tokens (≥3 chars) puis score chaque intention : **+2 points par verbe fort** (lexique fermé), **+1 par indice faible** (vocabulaire d'ancrage). Les candidats sont triés score ↓ puis ordre déclaré. **Tous les candidats sont retournés** (les « types de réponse possibles »).

Fonction `understand(state, text)` :
- **Comprise** : un seul candidat en tête (score > 0) ; l'attente est cet intent
- **Ambiguë** : deux candidats au même score > 0 ; l'écran offre le choix (jamais tranché en silence)
- **Incomprise** : aucune accroche (top score = 0) ; refus doux

**Règle déclarée impérative** : « ouvre »/« ouvrir »/« navigue » en TÊTE de message force l'intention `ouvrir` (sinon on tirerait les noms d'écrans comme des autres intentions). Déterministe, épinglée au miroir.

### Le réducteur pur applyIntent

```
applyIntent(state, text) → ApplyResult
  ├─ Understanding u = understand(state, text)
  ├─ si u.status ≠ "comprise" → finish(state, [refus], [])
  └─ switch(u.attente)
      ├─ greffer       → growComposes(arbre, parent, label)
      ├─ capturer_idee → composeIdea(nœud, arbre) ; Idea DRAFT
      ├─ promouvoir    → promoteIdea(dernière-idée) ; ChangeSet DRAFT
      ├─ generer       → emitApp(kernels) ; AppProjection pure
      ├─ deployer      → cliquet-check, pose Deployment
      ├─ delta         → soustrait les kernels déployés
      ├─ ouvrir        → resolveScreen(inventaire, text)
      ├─ interroger    → résumé d'état
      ├─ adapter       → parseAdapt, tokens ADR 0010
      ├─ impacter      → subtreePaths(nœud)
      ├─ lancer_bench  → liveEvent(RequirementBench)
      ├─ explorer_evolution → liveEvent(EvolutionSandbox)
      └─ [19 lectures + 4 propositions] → liveEvent(g, text) ; via pointe le serveur
```

Chaque branche :
- **NE FAIT JAMAIS I/O** (pur, déterministe)
- **Produit un événement typé** (BuilderEvent.kind)
- **Calcule une vague d'impacts** (BuilderImpact[] : cibles affectées)
- **APPEND-ONLY** : événements ajoutés au log, jamais modifiés

### Les événements (types de réponse)

| Événement | Cas | Détail | Exemple ref |
|-----------|-----|--------|-------------|
| `idee_capturee` | capturer_idee | Idea DRAFT placée | idea-uuid |
| `arbre_greffe` | greffer | Nœud ajouté sous parent | app/paiement/remb |
| `kernel_propose` | promouvoir | ChangeSet DRAFT, version gelée | kernel-v1a2b3 |
| `app_generee` | generer | AppProjection émise | app:a1b2c3d4 |
| `deploiement` | deployer | Pos sur barreau env, kernels embarqués | app:a1b2c3d4 |
| `delta_calcule` | delta | Écart calculé | env |
| `impact_calcule` | impacter | Sous-arbre listé | app/scope |
| `etat_lu` | interroger | Résumé texte | (vide) |
| `ecran_ouvert` | ouvrir | Route ouverte | /v2/goal |
| `ecran_adapte` | adapter | Tokens appliqués (SOFT) | section-heros |
| `bench_lance` | lancer_bench | Port RequirementBench | /v3/bench#createOrder |
| `evolution_exploree` | explorer_evolution | Port EvolutionSandbox | /v3/evolve#cellule |
| `lecture_live` | [lectures] | Serveur dispatché, `via` pointe la source | /v2/why-tree#incident |
| `proposition` | [propositions] | Idea/ChangeSet DRAFT, `via`, `propose` atteste | /learn#incident |
| `refus` | (toutes) | Ambiguë/incomprise/validation échouée | (dépend) |

Les événements AVEC `via` (lectures/propositions) portent `{ server, tool, args }` permettant à l'aval de invoquer le serveur Go sans que le réducteur connaisse sa logique.

### La session rejoue (V3Session.tsx, turnsOf)

La session est UNE CLASSE REACT partagée (`useV3Session()`) sous V3SessionProvider (layout /v3) :

**Données principales** :
- `messages: string[]` — transcript APPEND-ONLY (la source de vérité unique)
- `turns: SessionTurn[]` — annotation complète (index, msg, understanding, events, impacts)
- `state: BuilderState` — l'état rejoué au bout du transcript (arbre, idées, kernels, envs, écrans, log)

**Actions**
- `send(text)` — ajoute un message ; si aiEnabled, Claude propose des actions canoniques (chatTurnAction, re-jugées par understand/applyIntent)
- `rewindTo(n)` — tronque transcript à n messages, rejeu automatique (voyage dans le temps)
- `aiEnabled / setAiEnabled` — bascule mode déterministe pur ↔ IA conversationnelle

**Persistance (déboncée, 800 ms)** :
- Chaque send/rewindTo → saveProjectAction (le projectId/projectName du cookie)
- aucun tour n'est perdu au switch de projet (persistNow immédiate)

**Projets** :
- `createProject(name)` — nouveau projet (transcript vide, bareTree()) + bascule + montée de stack (piste DP)
- `switchProject(id)` — persiste en-cours, pose cookie, router.refresh() (rejeu complet)
- `projects: ProjectSummary[]` — résumés triés (plus récent d'abord)

### Impact et vague (code-graph, composition)

Chaque événement calcule une **vague de cibles affectées** (BuilderImpact[]) :
- `type: "composes"` — nœud d'arbre (branche/feuille)
- `type: "idee"` — Idea touchée
- `type: "kernel"` — Kernel proposé

La vague est **VISUELLE**, visualisée rouge sur les routes /v3/parcours, /v3/kernels. Elle reste **below-the-line** (jamais une mutation du kernel).

Pour un `delta` ou `impacter`, la vague = tous les nœuds du sous-arbre (descendants). Pour un `capturer_idee`, double impact : le nœud + l'idée capturée. Pour une lecture live, aucun impact local (le serveur Go produit les siennes).

### Les 5 lentilles V3 (accès à la même session)

| Lentille | Route | Composant | Vue |
|----------|-------|-----------|-----|
| Lab | /v3/lab | LabClient.tsx | Chat + arbre vivant (V2 visual remappé) + preview |
| Parcours | /v3/parcours | ParcoursClient.tsx | Arbre cartographié, impacts rouges, contrôles drag-drop |
| Design | /v3/design | DesignClient.tsx | Adapter geste, styling tokens ADR 0010 |
| Environnements | /v3/environnements | EnvsClient.tsx | Déployer geste, échelons (cliquet visuel) |
| Parametrage | /v3/parametrage | ParamsClient.tsx | Config instance, toggle IA conversationnelle |
| History | /v3/history | HistoryClient.tsx | Timeline annotée (turnsOf), rewindTo |

Chaque lentille lit la **même session** via `useV3Session()`, voit **le même état rejoué**, le même transcript. Aucune duplication.

### Les règles de mur (§2 — aucune écriture-vérité)

1. **Aucune intention n'écrit un kernel** : promouvoir crée un ChangeSet DRAFT (wroteKernel=false), c'est tout
2. **Aucune idée n'a un miroir gravé** : capturer_idee crée une Idea DRAFT (hasMirror=false)
3. **Les lectures live pointent, ne réimplémentent pas** : classifyIntent, understand, applyIntent ne connaissent que la table déclarée LIVE_GESTURES ; chaque lecture POINTE le serveur Go (`via`)
4. **Aucun déploiement n'écrit de workspace réel** : déployer crée un événement `deploiement` ; l'aval (emitOnDeploy callback) émet une AppProjection PURE via emitWorkspaceAction (tir-et-oublie)
5. **Aucune proposition n'est appliquée** : editer_dsl, apprendre_incident, ingerer_realite pointent leurs serveurs ; l'idée/ChangeSet reste DRAFT jusqu'à /goal → /idea-intake
6. **L'état n'est jamais stocké** : c'est une **PROJECTION** du transcript rejouée à chaque usages (turnsOf)

### Registre canonique des actions (CANONICAL_ACTIONS)

La table déclarée des **37+ actions que l'OS expose** (boutons de cockpit) avec leur phrase canonique exacte + l'intent attendu. Le miroir iterate cette table pour prouver : ∀ action du registre, understand(phrase).attente === expect. Une action absente ici ou retombant en « incomprise » est un **MONSTRE** (l'inverse d'un miroir orphelin). Déclaré, jamais appris.

Exemples :
- `"capture l'idée : au checkout, débiter le compte une seule fois"` → `capturer_idee`
- `"ouvre l'écran idee"` → `ouvrir`
- `"montre l'arbre pourquoi de l'incident debit-double"` → `voir_pourquoi`
- `"lance le bench de complétude sur la spec createOrder"` → `lancer_bench`
- `"adapte la section heros : text=primary radius=lg"` → `adapter`

---

**CHAQUE GESTE PASSE PAR LE MÊME PIPELINE** : message → classify (lexical) → understand (candidat net/ambiguë/incompris) → applyIntent (switch sur intent, réducteur pur) → événement(s) → impacts → écrans rejoués.

---

---

## Évolution — Les trois générations du Workbench

Le Workbench a connu trois générations coexistantes (§9 anti-overwrite), chacune représentant un tournant dans l'équilibre entre exhaustivité, cohérence conceptuelle et accessibilité utilisateur. Aucune n'a été supprimée ; chacune reste joignable, la suivante y réutilisant les concepts gelés de la précédente.

### V1 — L'exhaustif d'expert (160 panneaux-par-route)

La première génération (`app/` en racine, 160 routes individuelles : `/federation-cockpit`, `/arch-fitness`, `/compound-besoin-graph`, `/semantic-diff`, etc.) était une **implémentation mécanique du cliquet KRD**. Une route = une dent du ratchet = une capacité du système. Le vocabulaire était **complet et KRD-natif** : chaque écran supposait l'utilisateur familier des termes (miroirs, kernel, red-wave, changesets, autorité). Le rendu était exhaustif mais éclaté — 160 surfaces indépendantes, une barre de recherche pour se repérer, aucune prise en charge du parcours humain. Accès via un lien de sortie « Workbench complet » depuis les générations ultérieures.

**Logique :** chaque opération métier du système avait SON écran. Pas d'abstraction, pas de navigation intelligente — l'exhaustivité était la clarté.

### V2 — La refonte par concept (27 écrans, sous `/v2`)

Vers juin 2025, une **refonte cohérente par concept KRD** a porté les 160 routes sous l'arborescence `/v2/`, les regroupant par thème (idée, mur, kernel, verticale, facette, paires-miroir, liens, cellules, arbres). Les écrans étaient **27 panneaux conceptuels** (`/v2/builder`, `/v2/idee`, `/v2/policy`, `/v2/dag`, etc.), chacun restituant un versant du système. Un seul écran portait le **cycle de vie complet conversationnel** : `/v2/builder` — le chat IA à grammaire fermée — qui synthétisait le flux idée → miroir → kernel → déploiement. WB2 (selon les tags de projet) était la désignation interne.

**Logique :** regrouper par concept, éduquer au vocabulaire, laisser l'utilisateur naviguer le cycle de vie en conversant dans `/v2/builder`.

**État aujourd'hui :** passée en **legacy** (ADR 0060 addendum, décision propriétaire 2026-06-17). Un **bandeau de dépréciation** (`V2LegacyBanner.tsx`, en tête de chaque route V2) invite l'utilisateur à migrer vers V3. Les routes V2 restent intactes et accessibles — c'est la **base servant de fallback** et de source pour les réducteurs de V3 (les twins V3 composent les twins V2, ADR 0060 §7). Aucune suppression.

### V3 — L'UX end-user (5 groupes de lentilles, `/v3`)

Janvier 2026 marque le lancement de la **V3 end-user-friendly** (ADR 0060). Elle abandonne le modèle « 160 panneaux » et « 27 écrans conceptuels » pour une **architecture de session unique, cinq lentilles** (cinq perspectives sur le même état) regroupées en **cinq parcours utilisateur** :

| Groupe | Lentilles | Propos |
|---|---|---|
| **1. Concevoir** | Lab (chat), Specs, Opération, Politique, Kernels | Imaginer et définir le produit en conversation ; explorer les métamodèles |
| **2. Comprendre** | Parcours (graphes), Grille, Anatomie, Liens, Why-Tree, Arbres, Conscience, Cellules, Version DAG, Historique | Visualiser la structure, le code, les dépendances, l'historique ; rejouer le passé |
| **3. Construire & déployer** | Code (VS Code live), Émetteurs (projections), Environnements, Instance | Regarder le code généré, les routes émises, configurer la plateforme d'exécution |
| **4. Faire évoluer** | Évolution (sandbox IA), Bench, Arch-Fitness, Design | Lancer des variantes, mesurer la performance, auditer l'architecture |
| **5. Réglages** | Paramétrage | Consulter la surface déclarée (agents, modèles, échelle d'autonomie, budgets, autorités) — en **lecture seule** |

**Trois transitions architecturales structurent V3 :**

1. **Session unique, lentilles multiples** : au lieu de 160 routes indépendantes ou 27 écrans, V3 expose une **`V3SessionProvider`** partagée (fichier `app/v3/V3Session.tsx`). Chaque lentille ne lit que le **transcript partagé** — un flux d'événements event-sourcé (ADR 0057). L'état est **recalculé pur** à chaque lentille (pas de duplication, pas de divergence possible). Deux écrans V3 ne peuvent **jamais** être en désaccord.

2. **Historique comme conséquence, pas feature** : parce que le builder est event-sourcé, l'écran `/v3/history` n'implémente pas un « undo ». Il utilise le twin pur `lib/v3/session.ts` qui expose `replayTo(messages, n)` — **rejeu du réducteur du builder sur les n premiers messages**. L'historique n'existe que si on trace le transcript (ADR 0060, propriété 14). Brancher une suite différente = changer le transcript à partir d'un point donné. Le miroir (`lib/v3/session.test.ts`) prouve que rejeu ≡ fold, que l'état à `n` ne dépend jamais de `n+1…`, et que chaque point d'histoire est sûr.

3. **Chat IA puissant, réducteur autoritaire** : l'AI Lab (`/v3/lab`) est une vraie conversation (Claude en live, plein écran, bulles, saisie épinglée, Entrée envoie). Mais chaque réponse du modèle est **décomposée en gestes canoniques** (les 9 intentions prouvées par le miroir du builder, ADR 0057/0059) — le modèle **propose**, le code **juge**. Une action invalide devient un refus doux, jamais un effet silencieux. Un toggle garantit que la V3 entière fonctionne **sans IA** (mode pur-déterministe), ce qui rend les e2e hermétiques et l'UI-completeness non-contournable.

**Vocabulaire zéro** : la surface parle français simple (« Votre idée a été ajoutée », « Application déployée en test »). Le jargon KRD vit en bloc replié « Détails techniques » pour ceux qui le veulent — la rigueur ne baisse pas, elle change d'étage (ADR 0060 §5).

**Navigation logique** : la barre latérale ne présente plus une liste plate. Les cinq groupes structurent l'expérience selon le **parcours de l'utilisateur**, pas la taxonomie système. Un utilisateur qui « crée une app » sait où aller : d'abord Lab (concevoir), puis Parcours (comprendre la structure), puis Environnements (le déployer).

### Pourquoi chaque transition

**V1 → V2** : l'exhaustivité sans organisation pédagogique n'aide pas. V2 a cherché à _grouper par concept_ et à _mettre en avant le cycle de vie_ — des progrès cruciaux. Mais le modèle « chat expert dans un seul écran » n'échappait pas aux 26 autres écrans : il fallait quitter le builder pour explorer le reste. V2 restait une **IDE d'expert**.

**V2 → V3** : le besoin humain n'était pas « plus d'écrans » mais « une seule surface conversationnelle qui fait tout sans quitter le chat ». V3 unifie autour de la session event-sourcée : tout ce qu'on voit en Parcours, Historique, Environnements, c'est une **conséquence pure du transcript**. On peut converser, voir les effets partout en même temps, revenir en arrière, sans asynchronisme. C'est aussi l'occasion de **supprimer le jargon** de la surface primaire — l'IA Lab mène, le détail technique attend en coulisse. V3 devient une **plaque tournante end-user** où même un développeur junior, à son premier jour, sait par où commencer.

### Dépréciation vs conservation

**V2 est legacy** : elle porte un bandeau de dépréciation dans chaque route V2 (composant `V2LegacyBanner.tsx`), qui invite à migrer vers `/v3/lab`. Les routes V2 continuent de fonctionner (aucune suppression, §9 anti-overwrite) — par exemple, un utilisateur peut ouvrir `/v2/builder` et utiliser le chat original, qui fonctionne exactement comme avant.

**Les twins V3 composent les twins V2** (ADR 0060 §7) : les réducteurs purs du builder (idée, miroir, kernel, déploiement) vivent dans `lib/v2/builder.ts`. Les twins V3 (`lib/v3/session.ts`, `lib/v3/flow.ts`) _appellent_ ces réducteurs du builder ; on ne les réimplémente jamais. Corriger un bug du réducteur corrige V2 ET V3 — la source demeure unique.

**V1 n'est jamais supprimée** : chaque route reste navigable (`/federation-cockpit`, `/arch-fitness`, etc.). Un lien de sortie « Workbench complet » dans la barre V3/V2 renvoie à `/projects` (le hub V1).

### Portée des lentilles KRD en V3

Les lentilles V3 ne sont pas juste des écrans : ce sont des **projections déterministes du même état**.

- **Lab** : le chat ; chaque message → geste canonique évalué → ajout au transcript.
- **Specs** : idem que `/v2/idee` (lecture du kernel). L'ajout d'une spec envoie une phrase dans le chat (ideé) ; le lab la traite et met à jour le kernel.
- **Opération** : idem que `/v2/operations` (kernel des opérations).
- **Policy** : nouvelle lentille native V3 — kernels des politiques (autorisation ALLOW/DENY).
- **Kernels** : lentille native V3 — arborescence du kernel entier (entités, opérations, politiques, invariants).
- **Parcours** (`/v3/parcours`) : graphe des composes (les scénarios) en React Flow. Aucun état local — la donnée vient du kernel, le calcul de positions est pur (twin `lib/v3/flow.ts`).
- **Grille** : matriciel des contrôles × actions × états (visualisation comportementale).
- **Anatomie** : paires-miroir (BDD ↔ fixtures, properties ↔ fixtures, etc.) — la surface vivante des miroirs.
- **Liens** : graphe des six familles de liens (ADR 0017, `kindToCanon`).
- **Historique** : rejeu visualisé (chaque pas, chaque événement).
- **Environnements** : déploiement ciblé par environnement (dev/test/staging/prod).
- **Paramétrage** : catalogue déclaré en lecture (9 intentions, 7 autorités, 5 budgets, 8 facettes, A0–A8, T0–T4, etc.) — via le twin pur `lib/v3/params.ts`, 17 sections, 20 propriétés vertes au miroir.

### Coverage totale prouvée

Une **propriété Vitest** (`lib/v3/coverage.test.ts`, ADR 0060 addendum 2) prouve que **∀ écran V1 + ∀ concept V2 + ∀ lentille V3 → « ouvre l'écran <slug> » résout dans le chat**. Un écran V1 nouveau non couvert fait rougir le test. Les collisions (auth/app-auth, lab/ai-lab) sont départagées par un bonus de slug exact. Le pendant visible : l'annuaire « Tous les écrans » dans Paramètres, où tout `state.screens` en liens réels, groupés V3/V2/V1.

### Codépendance et évolution

V3 n'est pas un fork : elle se construit sur les fondations V2, qui se construisent sur V1. Aucune suppression, aucune duplication. Un défaut dans le réducteur du builder (un cas oublié, une opération mal traitée) — trouvé en V2 ou V3 — se corrige à la source (`lib/v2/builder.ts`), et tous les deux bénéficient du fix.

Cela signifie aussi que l'évolution ne supprime jamais d'étapes : V3 peut rétrécir (montrer moins de jargon) mais elle ne peut pas perdre de capacité. Elle change l'étage, pas l'étage.

---

*Trois générations, un moteur. V1 pour l'expert qui veut tout voir. V2 pour qui veut comprendre le cycle de vie. V3 pour qui veut développer sans vocabulaire imposé. Aucune n'est supprimée ; chacune reste juste, accessible, et construite sur les épaules de la précédente.*

---

---

## Design System et Internationalisation

### Système de design : thème ccup « design-to-fullstack »

Le Workbench adopte un **système de design unifié et cohérent** reposant sur la palette ccup (zinc + blue-600 accent), compatible avec **Tailwind v4** et les composants **shadcn/ui**, et réutilisable dans toute l'écosystème AIDOS. Ce système centralise tous les styles dans `/data/dev/aidos/front/web/app/globals.css`.

#### Palette et tokens CSS

| Contexte | Clair (`:root`) | Sombre (`.dark`) | Rôle |
|----------|---|---|---|
| **Fond principal** | zinc-50 | zinc-950 | arrière-plan de page |
| **Texte principal** | zinc-900 | zinc-50 | lisibilité par défaut |
| **Cartes & surfaces** | blanc (#ffffff) | zinc-900 | conteneurs détachés |
| **Accent primaire** | blue-600 | blue-500 | boutons, appels à l'action |
| **Bordures & dividers** | zinc-200 | zinc-800 | séparations discrètes |
| **Texte muet** | zinc-500 | zinc-400 | labels secondaires, hints |
| **Destructif** | red-600 | red-500 | actions dangereuses |
| **Rayon border** | 0.5rem | 0.5rem | uniformité visuelle |

Les tokens **ne doivent jamais être hardcodés** — chaque route consomme les variables CSS définies au `:root`, jamais de classes brutes comme `zinc-900` ou d'hex `#ffffff`. Les composants utilisent `bg-background`, `text-foreground`, `bg-primary`, `border-border`, `text-muted-foreground`, `bg-card`, `ring-ring`, `rounded-lg`, etc.

#### Polices Geist

Le Workbench utilise les **polices Google Geist** (sans-serif + monospace), déclarées dans `layout.tsx` avec les variables CSS `--font-geist-sans` et `--font-geist-mono`, puis aliasées en `@theme inline` dans `globals.css` comme `--font-sans` et `--font-mono`. La hiérarchie typographique repose sur des poids standards Tailwind (font-semibold, font-medium) appliqués sur Geist.

#### Consommation dans les routes

Chaque page du Workbench suit le même pattern :

1. **En-tête** (`WorkbenchHeader`, montée en **Server Component**) : navigation latérale sur 5 groupes (START, BRAIN, KERNEL, MIRROR, OPS), un **bascule de langue** (le `LanguageSwitcher` posant le cookie `NEXT_LOCALE`), et un projet-switcher.
2. **Conteneurs** : structure avec `flex min-h-screen flex-col bg-background text-foreground`, padding standardisé `px-4 py-12 sm:px-8 sm:py-16`.
3. **Cartes & sections** : bordures `border-border`, fonds `bg-card` ou `bg-muted/40` pour les zones de contexte.
4. **Badges & labels** : `bg-muted text-muted-foreground` pour du texte neutre, `bg-primary/10 text-primary` pour les éléments actifs ou focalisés.

Exemple (voir `/data/dev/aidos/front/web/app/contract/page.tsx`) : la page `/contract` affiche une version badge (`bg-card px-3 py-1 font-mono text-xs font-semibold text-card-foreground`), une table avec en-têtes `bg-muted/50`, bordures internes `divide-border`.

### Internationalisation : bilingue FR + EN, cookie-based

Le Workbench est **toujours bilingue par défaut**, français d'abord, anglais en seconde langue (ADR 0011).

#### Architecture next-intl sans routage

La locale n'apparaît **jamais dans l'URL** — elle provient d'un **cookie HTTP** `NEXT_LOCALE` (défaut `fr`), lu côté serveur par `getRequestConfig()` dans `/data/dev/aidos/front/web/i18n/request.ts`.

```ts
// i18n/request.ts : lecture du cookie NEXT_LOCALE
const locale = (locales as readonly string[]).includes(cookieLocale ?? "")
  ? (cookieLocale as Locale)
  : defaultLocale; // "fr"
```

- **Aucun préfixe de route** : `/contract` reste `/contract` quelle que soit la langue.
- **Compatibilité S00/S01** : les contrats de route existants sont **immuables**.
- **Contexte de réutilisabilité** : les apps émises héritent du même pattern next-intl + cookie.

#### Fichiers de traduction

Tous les libellés statiques vivent dans **`messages/{fr,en}.json`** (8805 lignes chacun, parité requise) :

```json
{
  "common": { "appName": "AIDOS Workbench", "language": "Langue", … },
  "nav": { "home": "Accueil", "contract": "Contrat d'exécution", … },
  "home": { "title": "Cockpit de gouvernance", … },
  "contract": { "title": "Contrat d'exécution", "phasesHeading": "Phases", … }
}
```

Chaque page **server** utilise `getTranslations("namespace")` :

```tsx
export default async function ContractPage() {
  const t = await getTranslations("contract");
  return <h1>{t("title")}</h1>; // → "Contrat d'exécution" ou "Execution contract"
}
```

Les **client components** (ex. `LanguageSwitcher`) consomment `useTranslations()` et `useLocale()` de `next-intl`.

#### Bascule de langue (LanguageSwitcher)

Le composant `/data/dev/aidos/front/web/components/LanguageSwitcher.tsx` offre deux boutons FR/EN :
- Clique → pose le cookie `NEXT_LOCALE=<locale>` avec `max-age=31536000` (1 an).
- Appelle `router.refresh()` pour relire côté serveur.
- Le bouton actif affiche un fond `bg-primary px-2 py-1 font-semibold text-primary-foreground`, l'autre `text-muted-foreground`.

#### Traductions dynamiques (future table i18n)

Pour les textes générés (entities utilisateur, contenus créés) : une table Postgres `i18n(key, locale, value)` avec clé primaire `(key, locale)` et **français obligatoire** comme fallback. Une telle table sera ajoutée via migration lors de la scalabilisation.

### Héritages en émission

Quand AIDOS émet une application via `/project` ou `/stack-emit`, l'app générée **hérite du système de design** :

1. **`globals.css` de départ** : les tokens ccup (zinc + blue-600) sont copiés dans la cible.
2. **next-intl pré-configuré** : `messages/{fr,en}.json` de base, pattern cookie-based prêt.
3. **Composants shadcn/ui** : la cible reçoit des composants Button, Card, Dialog, etc., tous stylisés par les tokens, permutables de jour comme de nuit (dark mode inclus).

Résultat : une app émise est **thématiquement cohérente avec le Workbench**, et la gouvernance du design (un changement de palette = un changement de `globals.css`) s'applique uniformément.

### Coexistence des trois générations (V1, V2, V3)

Le design system s'applique à **V1** (routes classiques, `/contract`, `/store`, etc.) et **V3** (« user-friendly » nav, `/v3/`). V2 (`/v2/`, LEGACY) est conservée en entier (§9 anti-overwrite) mais démonétisée ; elle reste stylisée par les mêmes tokens pour cohérence visuelle.

---

---

## Le câblage live (ADR 0092) — comment le Workbench lit la vérité

Le Workbench V3 ne lit jamais la vérité directement. Chaque panneau de lecture emprunte une passerelle MCP-over-HTTP centralisant le contrôle d'accès, l'acheminement des outils et la projection vive du moteur Go sur le front.

### Archéologie de la lecture : la triple strate

| Génération | Route | Lire | Écrire | État |
|---|---|---|---|---|
| **V1** | `app/<route>/` | Direct Postgres (`store`/`records`) ou fixture TS statique | Mutations Next côté écran | Productif, figé |
| **V2** | `app/v2/*` | Calcul TS pur byte-identique au Go (`lib/v2/*`) | idem V1 | Legacy + dépréciation |
| **V3** | `app/v3/*` (5 groupes, 25 lentilles) | Passerelle MCP → moteur Go vivant ; TS twin = repli démo déterministe | Toujours proposal → ChangeSet | Vivant, PHASE-5 en cours |

La migration V2→V3 **ne supprime jamais V2** (ADR 0009 anti-overwrite, §1). Les trois générations coexistent en prod ; le bandeau de dépréciation guide vers V3.

### readVia : la porte unique de lecture vive

Chaque panneau V3 qui lit la vérité du moteur passe par `readVia(scope, tool, args, decoder, demo)` — la **seule** interface normalisée du front vers le moteur (lib/gateway-sdk.ts, S59, ADR 0092).

```typescript
export async function readVia<T>(
  scope: Scope,               // (identity, activeProject) — propagé à chaque lecture
  tool: string,               // nom de l'outil MCP exposé (ex: "grid_build", "links_graph")
  args: Record<string, any>,  // arguments du tool (lecture-seule, below-the-line)
  decoder: Decoder<T>,        // validateur pur : JSON → T | null (JAMAIS LLM)
  demo: T,                    // repli démo déterministe (source:"demo")
) : Promise<{ data: T; source: Source }>
```

Le contrat de `readVia` est **binaire et pur** :
- **Succès** → `{ data: <JSON décodé par le validateur>, source: "live" }`
- **Tout échec** (endpoint absent, transport, payload mal formée, refusée par le mur) → `{ data: demo, source: "demo" }` (jamais une levée d'exception, jamais une valeur partielle)

La source est **honnête** : "live" signifie *le moteur Go a répondu et validé* ; "demo" signifie *la passerelle n'a pas dispatché ou le validateur a rejeté* (ADR 0074 — aucun silence trompeur, jamais une donnée cassée affichée).

### La passerelle (gateway) : le routeur unifié

La passerelle est une **porte HTTP JSON-RPC unique** (back/mcp/gateway, S58) qui :

1. **Reçoit le scope** via headers `x-aidos-identity` / `x-aidos-project`
2. **Route toujours dans cet ordre** (la wall s'applique server-side)
   - D'abord : **refusal-scope** (cross-project ou identité forgée? → `AGENT_CROSS_PROJECT_WRITE`)
   - Puis : **truth-write?** → `GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET` (le kernel n'accepte que des ChangeSet)
   - Sinon : **dispatch** vers l'outil MCP back (l'un des 48 serveurs inscrits GATEWAY_SERVERS)
3. **Retourne** `{ outcome, result?, block_reason? }` — soit le résultat du serveur, soit un refus homéostatique avec BlockReason

Le registre exposé (lib/gateway.ts, fonction `defaultTools()`) est **fermé** : jamais un passthrough, jamais un outil lambda. Le mapping est **byte-identical au Go** (back/runtime/gateway/registry.go). Une nouveauté s'ajoute au registre côté Go ; la TS twin se met à jour automatiquement (la cohérence par content-address).

### Le décodeur : validateur pur, source unique du type

Chaque panneau stocke UNE SEULE FOIS la forme de sa réponse vivante, comme `Decoder<T>` — un validateur pur sans LLM :

```typescript
// Exemple : app/billing/live.ts
export const plansDecoder: Decoder<PlanRow[]> = (raw) => {
  if (!isObject(raw)) return null;                    // refus si pas un objet
  return arr<PlanRow>((r) => {
    if (!isObject(r)) return null;                    // refus si un élément cassé
    const plan = decodePlan(r.plan);                  // validation du champ plan
    if (plan === null) return null;                   // propagation du refus
    const q = r.quota;                                // validation imbriquée
    if (!isObject(q)) return null;
    // … reste des champs …
    return { plan, quota: {…}, next };                // construction typée
  })(raw.plans);
};
```

Le type TS `PlanRow[]` est **inféré du décodeur** via `Decoded<typeof plansDecoder>` (§1, NEVER_DOUBLE_TYPED). Aucune redéclaration d'interface en parallèle, aucun drift possible. Un payload malformé rend `null` → chute automatique sur la fixture démo. Le décodeur est **pur, total** (CLAUDE.md §6/§8) : même JSON → même verdict, zéro LLM, zéro hallucination.

### Source : le badge honnête (live | demo)

Chaque panneau V3 qui lit affiche le badge source :
- **live** : le moteur Go a répondu, le décodeur a validé ; la donnée *vient de la vérité vivante*
- **demo** : soit la passerelle n'a pas dispatché (endpoint absent, transport/mur), soit le décodeur a rejeté (malformée, censurée)

Exemple visuel (app/v3/anatomie/AnatomyClient.tsx) :
```typescript
<Badge
  title={source === "live" ? t.sourceLiveTitle : t.sourceDemoTitle}
  {...styling...}
>
  {source === "live" ? t.sourceLive : t.sourceDemo}
</Badge>
```

### twin-as-live-fitness : le cliquet anti-retour T5

La loi architecturale **NO_TWIN_AS_LIVE_PATH** (ADR 0092, lib/twin-as-live-fitness.ts) refuse qu'un panneau V3 lisible ne lise un calcul TS pur comme source vivante — jamais un retour silencieux à un twin après un flip vers le moteur.

**La règle (pure, totale, testée)** : un panneau value-importe un twin-logique (`lib/<x>.ts` ayant sa démo-sibling `lib/<x>-data.ts`) **seulement ssi** :
- C'est un import type-only (`import type { … }`) — zéro logique runtime — OU
- Le **même fichier** importe la **frontière démo** (readVia / callGateway / decodeVia depuis @/lib/gateway-sdk) — ce qui force le calcul du twin derrière `source:"demo"`

**Sans frontière** = le twin **est** la source vivante (pas de readVia, pas de fallback démo) → **RED** (une Finding par import fautif, incluant ligne + chemin du twin).

Exemple vert (app/v3/liens/actions.ts) :
```typescript
import { readVia, type Source } from "@/lib/gateway-sdk";  // ← frontière présente
import { demoLinksView, … } from "@/lib/v2/links-data";     // ← twin-démo importé = safe
// ...
const { data, source } = await readVia(
  scope, "links_graph", …, linksGraphDecoder, demo
);
```

Exemple rouge (un panneau hypothétique) :
```typescript
import { buildGrid } from "@/lib/v2/grid";  // ← value import du twin
// Pas de readVia ⇒ RED : le twin IS la source vivante
const grid = buildGrid(…);
```

Le cliquet **est une passe AST TypeScript pure** (Compiler API vitest + fast-check) : même panneau → même verdict, toujours. À chaque changement de panneau (une flip qui ajoute readVia), le cliquet se réévalue ; aucune manœuvre manuelle.

### Les lentilles conceptuelles V3 : déjà flippées (PHASE-5)

Les quatre lentilles natives V3 dont les calculs **étaient en TS pur** sont maintenant vivantes via le moteur Go :

| Lentille | Outil live | Twin (démo) | Route panel |
|---|---|---|---|
| **grille (FK03)** | `grid_build` | `lib/v2/grid.ts` | app/v3/grille/actions.ts |
| **liens (KRD §41)** | `links_graph` | `lib/v2/links.ts` | app/v3/liens/actions.ts |
| **anatomie (FKE)** | `anatomy_build` | `lib/v2/anatomy.ts` | app/v3/anatomie/actions.ts |
| **arbres (KRD §108)** | `tree_aggregate` | `lib/v2/kernel-tree.ts` | app/v3/arbres/actions.ts |

Chaque lentille n'affiche **jamais une moitié** : soit vivante (moteur Go), soit démo (twin TS), jamais partielle. Le badge source est **obligatoire** sur chaque lentille — le rendu honnête du chemin pris.

### Panels flippés (ADR 0092, calendrier batch 1–5)

Le calendrier de flip (la kill-twins recipe, ADR 0092) progresse par lot. À PHASE-5 :

| Batch | Panels | Condition |
|---|---|---|
| **1–2** | changeset · dag · idea-intake · memory · context · evolve · backtester · telemetry · pact-verifier | S59 cutover |
| **3** | billing · dsl-editor · templates · besoin-intake · self-cert · app-auth · workspace | ADR 0092 |
| **4A** | entity-modeler · shape-editor · context-map · grilling-loop | Pur (zéro RawMessage) |
| **4B** | grid · links · anatomy · kernel-tree | Lentilles V3 conceptuelles |
| **5** | blob-attribute · deploy · ai-lab · hono-emitter · mirror-library · ops-observability · entity-relation · behavior-capture · behavior-expander · mirror-watch · front-emitter · relation-emitter · truth-level · facet-completeness · facet-wire | Emetteurs + kernel |

Chaque flip exige cinq conditions :
1. L'outil MCP inscrit dans `GATEWAY_SERVERS` (back/runtime/gateway/registry.go) — byte-faithful au Go
2. Un décodeur + une fixture démo (app/`<route>`/live.ts) — pure validation
3. Une `readVia` dans le Server Action (app/`<route>`/actions.ts) — le point d'entrée live
4. Un badge source rendu (live | demo) — l'honnêteté affichée
5. Le twin TS scellé derrière frontière démo (twin-as-live-fitness = vert) — jamais un retour silencieux

À l'inverse, un panneau LEGACY (**V1 + V2**) reste pure-démo : jamais readVia, jamais passerelle. Le bandeau de dépréciation invite à l'obsolescence ; il n'est pas supprimé (ADR 0009).

### Le scope propagé : identité + projet actif

Chaque `readVia` envoie le scope `{ identity, activeProject }` via la passerelle (headers + JSON-RPC params). La passerelle **applique le mur server-side** avant le dispatch (S55, S57, S61) :
- Lecture d'une entité du projet actif ✓
- Lecture cross-project ✗ → `AGENT_CROSS_PROJECT_WRITE`
- Écriture de vérité ✗ → `GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET`

Le scope vient de `panelScope()` (un Server Action qui lit le cookie de session S57). Jamais un paramètre de l'écran, jamais un token forgeable côté client.

### Déterminisme-first (CLAUDE.md §6/§8)

Le décodeur, la fixture démo et le twin TS sont **purs, totaux** — zéro LLM, zéro randomness. Une `readVia` est reproducible : même JSON → même verdict, toujours. La reproducibility mirror (vitest + fast-check) le prouve ; les twins pass leur test de byte-identity (même kernel cut → même sortie). L'AST pass du cliquet T5 est un pur parcours TypeScript Compiler — pas d'agent, pas de décision « ça ressemble à du twin ». L'interface `readVia` elle-même est pur : elle ne **fait** jamais une LLM call ; elle dispatche un outil MCP GO auprès du moteur, reçoit sa réponse, la valide, et retourne live|demo.

La wall s'applique **server-side** : les refusals (cross-project, truth-write) sortent du moteur Go, via la passerelle. Le front **voit seulement** le BlockReason homéostatique, jamais un secret. Un panneau qui demande une donnée censurée reçoit son demo-fallback avec `source:"demo"` — honnête, sans erreur.

Le badge source raconte au user: *voici d'où vient cette donnée*. Le cliquet T5 raconte au build: *ce panel ne régrèdera pas vers un twin muet*. Le décodeur raconte au code: *cette forme est validée une seule fois, jamais dupliquée*.

---

---

## INVENTAIRE DES ROUTES

Le Workbench offre trois générations coexistantes de routes (V1, V2, V3), chacune portant une stratégie d'interaction et une complétude différentes. Ce tableau énumère chaque route existante du répertoire `/data/dev/aidos/front/web/app/`, avec son chemin, sa génération, son rôle et sa source de données.

### Routes racine (V1)

| Route | Génération | Rôle | Source |
|-------|-----------|------|--------|
| `/` | V1 | Page d'accueil et cockpit graphique complet (nœuds, arêtes, légende). Affiche le WorkbenchGraph (projection pure de lib/workbench-graph.ts) : boutons → vues → actions → opérations → entités → miroirs → scopes → incidents, chacun deep-linkable vers son panneau. Lecture seule. | Live (EXAMPLE_HEAD, gateway) |
| `/first-app` | V1 | Funnel d'onboarding guidé-mais-réel (signup → projet → idée → grill → goal → miroir → build → deploy). État machine pur (lib/first-app-funnel). Chaque étape produit un artefact réel (starterId / ideaId / red set / deploy subdomain). Pas de simulation. | Live (template / blank-idea path) |
| `/ideas` | V1 | Tableau des idées / porte de promotion (S27). Affiche les cinq couloirs du cycle de vie (draft → grilled → spiking / harvested → rejected) ; chaque carte porte proposes / intent / provenance / absence-de-miroir. Action-capable : AVEC miroir → promotion versNoyau (via ChangeSet) ; SANS miroir → NO_MIRROR_NO_KERNEL. | Live (gateway, idea_list) |
| `/goal` | V1 | Moteur de goal (S29, KRD §56–§59). Affiche la source-idée, le ChangeSet DRAFT, le SET ROUGE (miroirs échouant, chacun red→green), et le voyant stop non-gameable avec ses quatre conditions (set rouge→vert ∧ vert antérieur intact ∧ mutation ≥ seuil ∧ pas de monstre). Verdicts calculés, jamais déclarés. | Live (gateway, goals) |
| `/mirrors` | V1 | Panneau du cliquet (S05). Rejoue chaque miroir matérialisé, compare chaque verdict au baseline enregistré, rejette la fusion au moment où un miroir baseline-green devient red (RED_REGRESSION). Action-capable : exécuter le cliquet via RatchetRunner. Écrit logs de run (runtime.mirror_runs), pas de vérité. | Live + Demo (MIRROR_INVENTORY) |
| `/demo-checkout` | V1 | Tranche de démonstration end-to-end (S46). Pipeline Idée → Goal → Noyau → Miroir → Src → Stable pour « client place une commande ». Affiche le panier + bouton checkout (projection émise du twin). Action-capable : cliquer checkout place la commande (createOrder), affiche la commande placée avec articles, scellée par un badge stable/all-green. | Live + Demo (lib/demo-checkout) |
| `/red-wave` | V1 | Panneau de la vague de rouge (S22, KRD §42/§98). Affiche le moteur d'impact après bump de noyau : sélectionner un bump canonique (Order / load-bearing button / cosmetic button), tirer la vague, lire les RedWorkItems ordonnés (mirror-first), groupés par couche (mirror / projection / operation_action / button), chacun rouge avec cause + statut. Action-capable : déclencher les trois scénarios de bump depuis l'écran. | Live + Demo (lib/red-wave) |
| `/truth-tree` | V1 | Panneau de l'agrégat de vérité compositionnelle (S18, KRD §114). Chaîne product → journey → view → control : chaque nœud affiche son propre_miroir + verdict AGRÉGÉ récursif, chaque arête porte composes (load-bearing \| cosmetic) + version_épinglée, seuil_activation du parent. Scenario-toggle : tout-vert → VERT, feuille-rouge-load-bearing → ROUGE avec drill-down. | Live (gateway, kernel) |
| `/learn` | V1 | Incident → nouveau miroir → nouvelle dent (S107, E12). RealityMirror (idée draft, provenance=incident) rentre idée→grill→goal ; sur approbation humaine un NOUVEAU miroir est attaché, son hash BUMPE mécaniquement, red wave ciblé (mirror-first) devient worklist. Action-capable : fermer la boucle, toggle re-reflect (cosmétique = aucun bump). Writable=false (reality_cannot_declare_truth). | Live (gateway, incidents) |
| `/emit-ideas` | V1 | Émetteur déterministe EL16 (EmitIdeas(graph) → []Idea). Humain EXÉCUTE depuis l'écran (ui-completeness) : façonner le graphe (toggle status de chaque rung), puis « Émettre les Ideas » rejette besoin_emit_ideas. Une Idea draft par rung RESOLVED MAPPING (proposes=LevelToProposes, intent=utterance verbatim, provenance humaine) ; rungs NoEmit exclus. Aucune écriture kernel. | Live (besoin_emit_ideas MCP) |
| `/red-backlog` | V1 | Tri topologique EL17 (RedBacklog(graph) → BacklogItem[]). Affiche idées émises ordonnées par dépendance dans l'ordre EXACT d'ouverture /goal (§23 verticale). Chaque item porte anchors_above (rungs NoEmit inclus) + mirror-form attendue (annexée, non écrite). Cycle sur rungs émetteurs = refusé (BESOIN_CYCLE). | Live (besoin_emit_ideas) |
| `/compound-besoin` | V1 | Porte d'entrée de la prise de besoin (EL13). Interview niveau-par-niveau du besoin au-dessus du mur : l'humain énonce, le code jugement (CanDescend.enough), répond off-altitude rejeté (SCHEMA), réponse floue routée → /spike (idea_capture → idea_grill → idea_spike). Écriture = schema besoin via EL15 MCP, jamais kernel. | Live (besoin-intake MCP) |
| `/compound-besoin/doc` | V1 | Documentation canonique du composé besoin (niveaux, grammaire, métadata). Référence statique. | Demo |
| `/besoin-intake` | V1 | Porte EL15 : lit état BesoinGraph + niveau enterable, lit schéma du niveau (champs requis du formulaire), capture réponse par rung (product / journey / view / control / action / operation / entity / invariant), valide pré-vol, classe métadata. MAPPING rung → Idea via idea_capture (EL05) ; NoEmit rung → pas d'Idea (pas de cast silencieux). Écriture = besoin schema + ideas, jamais kernel. | Live (besoin-intake MCP) |
| `/besoin-invariant` | V1 | Bande transverse EL14 : interroge invariants ∀ qui traversent chaque niveau (« vrai sur tous les chemins ») et politiques où l'authorization joue. Humain ÉNONCE l'invariant ; code ENREGISTRE et classe (ban circularité §8). Une ∃ = refusée (INVARIANT_IS_EXAMPLE_NOT_FORALL). Invariant rung → contraint ce rung ET chaque SOURCE rung au-dessus. Policy band → AT MOST ONE Idea{Proposes:policy} via idea_capture (EL05) ; invariant path-independent → pas d'Idea (NoEmit). | Live (besoin-invariant MCP) |
| `/app-builder` | V1 | HUB app-builder centralisé (ADR 0010 + ADR 0011 bilingue). Index organisé par journey : gestes EL (compound-besoin, besoin-intake, emit-ideas, red-backlog…), moteurs noyau (ideas / goal / mirrors), émetteurs (front / db / api / tool…), track provisioning/deploy (DP, ADR 0043 IaC), SaaS multi-tenant. Items LIVE → deep-link ; items PLANNED → ref roadmap (DP/Sxx). | Live |
| `/projects` | V1 | Liste des projets actifs/contexte utilisateur. Sélectionner un projet définit l'activeProject (contexte de session). | Live (gateway, projects) |
| `/adoption` | V1 | Calculateur AdoptionStage (T0→T4, la plus petite dent qui clique suivant). Affiche le ratchet de progression et l'inventaire Release v0 (CLI surface, Workbench routes, demo cell, docs index, test inventory, changelog, limite connues). Projection pure (lib/adoption). | Demo + Live |
| `/keyword` | V1 (sauf exception) | Panneau mono-concept. Chaque route nominale V1 (150+ routes) est un panneau dédicacé : `/architecture`, `/authority-binding`, `/behaviors`, `/blocks`, `/bootstrap`, `/build-console`, `/changeset`, `/completeness`, `/conscience`, `/control`, `/cost-meter`, `/data-migrate`, `/decision-reuse`, `/db-projection`, `/deploy`, `/dsl-editor`, `/endpoints-fitness`, `/entity-map`, `/entity-modeler`, `/entity-relation`, `/environments`, `/evolution-sandbox`, `/exploration`, `/expr`, `/facets`, `/federation`, `/federation-cockpit`, `/gateway`, `/governance`, `/grid`, `/grilling-loop`, `/harness-economics`, `/incidents-to-ideas`, `/ingestion`, `/kernel-debt`, `/kernel-garden`, `/lexicon`, `/link-graph`, `/memory-backends`, `/memory-firewall`, `/meta`, `/mirror-health`, `/mirror-library`, `/mirror-watch`, `/mutation-score`, `/operation`, `/ops-observability`, `/phase-stable`, `/policy`, `/preview`, `/project-dag`, `/project-evolve`, `/project-members`, `/project-scope`, `/project-wall`, `/proof-levels`, `/proof-type`, `/provision`, `/reality-evolution`, `/reality-ingest`, `/records`, `/red-propagation`, `/sagas`, `/scopes`, `/secret-store`, `/self-cert`, `/semantic-diff`, `/semantic-merge`, `/sensors`, `/shape-editor`, `/stack-emit`, `/stack-manifest`, `/stack-spike`, `/store`, `/strangler`, `/substrate`, `/substrate-spike`, `/tech-spec`, `/templates`, `/temporal-invariants`, `/tool-projection`, `/truth-approval`, `/truth-level`, `/truth-typing`, `/wall`, `/web-preview`, `/why-blocked`, `/why-tree`, `/version-dag`. Chaque route renvoie un panneau en lecture seule portant un concept KRD ou une capacité du Workbench (moteurs, émetteurs, diagnostics, gestion). Source : live (gateway), demo, ou spike (repli-démo pour routes de planification). | Mixte : Live pour route active / Demo pour repli |

### Routes V2 (WB2 — legacy escalade fractale, avec dépréciation)

| Route | Génération | Rôle | Source |
|-------|-----------|------|--------|
| `/v2` | V2 | Page d'accueil WB2 : le schéma KRD complet interactif (étape WB2-02). Render React Flow diagram (read-only) : idée (entry gate) → MUR (/goal) → verticale + kernel → facette + mirror pairs → liens §17 → arbres → cellules. Chaque bloc cliquable → écran /v2/<slug>. Sous le diagram, même map conceptuelle en liste (accessible fallback). Libellés/définitions du glossaire lib/v2/glossary.ts. Déterministe (schemaHash affiché). Une note mur mentionnée (ADR 0010 + 0011 bilingue). LEGACY (with deprecation banner). | Demo (lib/v2/schema.ts, GLOSSARY) |
| `/v2/<slug>` | V2 | Écran d'un concept canonique KRD (catch-all pour slugs du glossaire, WB2-00). Affiche DÉFINITION canonique du concept (du glossaire lib/v2/glossary.ts) — une vraie page, jamais mort-lien. Slug hors-glossaire → 404. Certains slugs reçoivent route dédiée frère (liens, cellules) → catch-all exclut & access via [slug] → 404 (ambuïté routage = éviée). Gestes CONCEPT liés (ex. mur → /v2/goal). | Demo (lib/v2/glossary.ts) |
| `/v2/liens` | V2 | Écran dédié des 7 LIENS de composition (WB2-05). Affiche canonic definition de chaque lien (compose, instance-of, proves, exposes, binds, refines, authorizes) : son iconographie, ses nœuds source/dest, ses edges pondérées. Themed + bilingue. Lecture seule. | Demo (lib/v2/links) |
| `/v2/cellules` | V2 | Écran dédié des CELLULES évolution (WB2-08). Affiche chaque cellule (cibles évolution, type=spike vs green, vif-côté-devant, fenêtre fenêtre d'approbation fitness, EvolutionSandbox QD). Pas de création depuis l'écran (le réservoir est external, le harness l'administre). Lecture seule. | Live (gateway, cells) |
| `/v2/anatomie/[kernel]` | V2 | Anatomie 1-pour-1 d'un kernel (WB2-06). Affiche SIX mirror pairs autour du MUR (Spec↔Doc, Comportement↔Résultats, Scénarios↔Tests, Modèle↔Projection, Contrat↔Code, Evidence-attendue↔Evidence-observée). AU-DESSUS mur = DÉCLARÉ (humain) ; EN DESSOUS = PROUVÉ (machine, read-only). Voyant 🟢/🔴/🟡 par paire, COMPUTÉ par twin pur (lib/v2/anatomy), jamais déclaré. Action-capable : cliquer une paire → l'ouvre (descend dans détail). Cibles depuis /v2/kernels, /v2/grille (ids résolvent). | Live (gateway, kernel) |
| `/v2/grille` | V2 | GRILLE niveau × facette (WB2-04). Matrice 7×8 compte kernels par cellule (axe vertical = 7 niveaux §23, axe horizontal = 8 facettes F·I·S·B·R·V·M·X). Sommes Σ par ligne / colonne / total COHÉRENTES. Sélectionner cellule (niveau, facette) → descend vers SES kernels/specs. Déterministe. Themed + bilingue. Lecture seule. | Demo (lib/v2/grid-data, counts pure) |
| `/v2/arbres` | V2 | Arbres de composition (WB2-03). Chaîne product → journey → view → control (feuille cosmetic helptext). Chaque nœud cliquable → détail. Arête pondérée (load-bearing / cosmetic), épingles en @version. Verdict récursif agrégé (all-green ⇒ GREEN, red leaf → RED avec drill-down). Thémed. Lecture seule (l'écran projette, n'écrit pas). | Demo (lib/v2/kernel-tree) |
| `/v2/kernels` | V2 | Index des kernels (WB2-01). Liste tous les kernels par niveau + facette. Chaque entrée cliquable → /v2/anatomie/[kernel]. Themed. Lecture seule. | Live (gateway, kernels) |
| `/v2/operations` | V2 | Index des fixtures Operation DSL (S10) rejouables (WB2-12). Liste fixtures connues (registre clos) ; chaque entrée → écran /v2/operations/[op]. Themed + bilingue. Lecture seule. | Demo (lib/v2/operations FIXTURES) |
| `/v2/operations/[op]` | V2 | Rejeu d'une fixture Operation (WB2-12). Affiche le DSL Gherkin, le traçage exécution (entrées → predicates → outcomes), le verdict (passed / failed / pending), historique des runs. Action-capable : rejouer la fixture. | Demo (lib/v2/operations) |
| `/v2/policy` | V2 | Index des politiques (WB2-07). Liste politiques déclarées au niveau kernel. Chaque politique cliquable → détail. Themed + bilingue. Lecture seule. | Demo (lib/v2/policies) |
| `/v2/policy/[policy]` | V2 | Détail une politique (WB2-07). Affiche source, payload, énoncé, schéma d'application (rung, scope). Themed. Lecture seule. | Demo (lib/v2/policies) |
| `/v2/ai-lab` | V2 | Chat / agent-builder WB2 (étape WB2-02..). LEGACY (supplanté par /v3/lab). | Demo + Live (chat) |
| `/v2/builder` | V2 | Constructor-builder WB2 (étape WB2-02..). LEGACY. | Demo |
| `/v2/code` | V2 | Éditeur code WB2 (étape WB2-02..). LEGACY. | Live (vscode.sagedesk.fr) |
| `/v2/conscience` | V2 | Conscience / observabilité WB2 (étape WB2-02..). LEGACY. | Live (métrique) |
| `/v2/dag` | V2 | DAG dépendance noyau WB2 (étape WB2-02..). LEGACY. | Live (gateway, kernel-dag) |
| `/v2/deploy` | V2 | Déploiement/gestion versions WB2 (étape WB2-02..). LEGACY. | Live (gateway, deployments) |
| `/v2/emetteurs` | V2 | Index des émetteurs WB2 (étape WB2-02..). LEGACY. | Demo (emitters) |
| `/v2/goal` | V2 | Moteur goal WB2 (étape WB2-02..). LEGACY (version duplicata de V1). | Live (gateway, goals) |
| `/v2/graphe` | V2 | Cockpit graphique WB2 (étape WB2-02..). LEGACY. | Live (gateway, graph) |
| `/v2/grill` | V2 | Grill idée WB2 (étape WB2-02..). LEGACY. | Demo + Live (ideas) |
| `/v2/idee` | V2 | Index idées WB2 (étape WB2-02..). LEGACY (version duplicata de V1). | Live (gateway, ideas) |
| `/v2/lab` | V2 | AI Lab / chat WB2 (étape WB2-02..). LEGACY (supplanté par /v3/lab). | Live (chat) |
| `/v2/liens` (à confirmer) | V2 | Liens (voir route dédiée ci-dessus). | Demo |
| `/v2/verticale` | V2 | Verticale couplante KRD WB2 (étape WB2-02..). LEGACY. | Demo (lib/v2/verticale) |
| `/v2/why` | V2 | Tree « pourquoi » WB2 (étape WB2-02..). LEGACY. | Demo (lib/v2/why) |
| `/v2/workflows` | V2 | Index workflows WB2 (étape WB2-02..). LEGACY. | Live (gateway, workflows) |
| `/v2/workflows/[wf]` | V2 | Détail workflow WB2 (étape WB2-02..). LEGACY. | Live (gateway, workflows) |

### Routes V3 (user-friendly refonte, 28 lentilles, 5 groupes nav, chat 37 gestes)

| Route | Génération | Rôle | Source |
|-------|-----------|------|--------|
| `/v3` | V3 | Porte d'entrée V3 : redirect vers `/v3/lab` (le chat, entry point unique). | N/A |
| `/v3/lab` | V3 | AI LAB : le chat (façon GPT) de la session partagée V3 (ADR 0060). Route unique d'entrée V3. Tout vient du contexte V3SessionProvider (useV3Session) — l'écran est une lentille pure. 37 gestes disponibles via barre de commande intégrée. Themed (ADR 0010), bilingue (ADR 0011, FR par défaut). | Live (chat MCP) |
| `/v3/arbres` | V3 | Lentille ARBRES (groupe « Comprendre »). Affiche l'arbre fractal de composition des kernels (product → parcours → … → entité) ; chaque nœud = kernel à son niveau, dépliable/repliable (virtualisé React Arborist), cliquable (→ coordonnées + anatomie), coloré par voyant agrégé (§109). DRILL-DOWN §110 (chaîne jusqu'à enfant rouge), légende deux poids arête (§112). S59 CUTOVER (ADR 0092) : verdict §109 + drill-down §110 LIVE via serveur MCP Go `kernel-tree` (tree_aggregate) par passerelle (readVia) + twin demo fallback lib/v2/kernel-tree. Déterministe (même entrée → même arbre). Lecture seule. | Live (kernel-tree MCP) ou Demo (lib/v2/kernel-tree) |
| `/v3/grille` | V3 | Lentille GRILLE niveau × facette (groupe « Comprendre »). Matrice kernels par niveau (7) × facette (8). Sommes Σ cohérentes. Sélectionner cellule → descend vers SES kernels/specs. S59 CUTOVER : donnée LIVE via serveur MCP Go `grid` (grid_build), twin demo (lib/v2/grid-data). Déterministe (byte-identique au calcul Go). Lecture seule. | Live (grid MCP) ou Demo (lib/v2/grid) |
| `/v3/anatomie` | V3 | Lentille ANATOMIE (groupe « Comprendre »). Affiche l'anatomie d'un kernel : SIX mirror pairs autour du MUR (Spec↔Doc, Comportement↔Résultats, Scénarios↔Tests, Modèle↔Projection, Contrat↔Code, Evidence↔Evidence-observée). Voyants 🟢/🔴/🟡 par paire. Cliquable → ouvre pair detail. Deducted depuis session kernel-sélectionné. | Live (gateway, kernel) |
| `/v3/liens` | V3 | Lentille LIENS (groupe « Comprendre »). Affiche les 7 liens de composition (composes, instance-of, proves, exposes, binds, refines, authorizes). Définitions canoniques, iconographie, nœuds source/dest, edges pondérés. Themed. Lecture seule. | Demo (lib/v2/links) |
| `/v3/specs` | V3 | Lentille SPECS (groupe « Comprendre »). Affiche les specs (kernels) du projet en cours. Listé par niveau + facette. Chaque spec cliquable → détail (anatomie, liens, opérations). Themed. Lecture seule. | Live (gateway, kernels) |
| `/v3/code` | V3 | Lentille CODE (groupe « Bâtir »). Éditeur code direct sur le PROJET en cours, par ENVIRONNEMENT (dev / staging / prod / AIDOS repo). SERVER Component : lit `process.env.AIDOS_VSCODE_URL` (openvscode-server), extrait base + jeton, passe au client qui RÉÉCRIT param `folder` par onglet. Jeton dans `.env.local` — jamais suivi ; n'atteint client que par rendu. SÉCURITÉ : jeton gates l'IDE (quiconque a l'URL a l'éditeur). Multi-utilisateur auth (compte, pas secret partagé) = OpenQuestion ADR 0052-bis. Themed. | Live (vscode.sagedesk.fr) |
| `/v3/emetteurs` | V3 | Lentille ÉMETTEURS (groupe « Bâtir »). Index des émetteurs : front (Next.js) / db (Postgres DDL) / api (hono REST) / tool (CLI). Chaque émetteur = une projection déterministe (lib/front-emitter, etc.). Dispatch des serveurs MCP émetteurs : front-emitter, db-emitter, hono-emitter, tool-emitter. Chaque onglet affiche live-output (electron voir-live). Affiche tous les 3 enfants de chaque serveur dispatché. Themed. | Live (front-emitter, db-emitter, hono-emitter, tool-emitter MCPs) |
| `/v3/design` | V3 | Lentille DESIGN (groupe « Bâtir »). Tokens de design (ADR 0010 : palette zinc, blue-600, Geist font stack, espacements, ombres). Gallerie composants shadcn/ui. Themed en live. Lecture seule (les tokens viennent du kernel via projection, modifiables via idée + goal). | Live (gateway, design-tokens) |
| `/v3/bench` | V3 | Lentille BENCH / expérimentation (groupe « Bâtir »). Bac à sable d'évolution (EvolutionSandbox, S33) : cellules de test, variants QD niche, scoring mutation, approbation fitness. Affiche cellule actuellement en test, ses variantes, scores. Cliquable → écran detail (EvolutionSandbox). | Live (gateway, cells) |
| `/v3/evolve` | V3 | Lentille EVOLVE (groupe « Bâtir »). Moteur medium-loop (/evolve self-play + QD). Lancer variants d'une cellule (la génération explore branches, chaque variant peut écrire branches/reports/ideas, jamais le kernel — seul variant avec miroir vert + out-of-sample vert + approbation autorité → NICHé). Action-capable : générer variants, évaluer, promouvoir vers QD niche. | Live (evolution-sandbox MCP) |
| `/v3/environnements` | V3 | Lentille ENVIRONNEMENTS (groupe « Déployer »). Gestion des envs (dev / staging / prod). Affiche endpoint live, version déployée, health. Cliquable → /v3/code (IDE par env). Themed. Lecture seule (déploiements via DP piste autonome). | Live (gateway, environments) |
| `/v3/histoire` | V3 | Lentille HISTOIRE / timeline (groupe « Déployer »). Historique projet : changements noyau, déploiements, incidents, approbations. Chronologie reverse. Filtrable (type, scope). Clickable → détail commit/PR/incident. | Live (gateway, audit-log) |
| `/v3/instance` | V3 | Lentille INSTANCE / gestion projet (groupe « Déployer »). Contexte projet actuel : nom, scope, membres, quotas, settings, intégrations. Action-capable : changer de projet, éditer settings. | Live (gateway, projects) |
| `/v3/parametrage` | V3 | Lentille PARAMETRAGE / configuration (groupe « Déployer »). Settings : theme (light / dark), langue (FR / EN), notifications, webhooks, API keys, SSO. Themed. Lecture seule + action-capable (save settings). | Live (gateway, settings) + Client-side |
| `/v3/parcours` | V3 | Lentille PARCOURS / journeys (groupe « Comprendre »). Index des journeys du besoin (EL journey rung). Chaque journey : nom, description, kernels composés (product-scope), poids composé. Cliquable → détail (anatomie, spécifications, tests). | Live (gateway, journeys) |
| `/v3/cellules` | V3 | Lentille CELLULES (groupe « Comprendre »). Index des cellules évolution. Chaque cellule : type (spike / green), vitesse (vif-côté-devant), window approbation, score mutation, niche QD. Cliquable → detail (EvolutionSandbox, variants). Lecture seule. | Live (gateway, cells) |
| `/v3/conscience` | V3 | Lentille CONSCIENCE (groupe « Observabilité »). Métriques projet : build health, coverage, mutation score, deps, perf, red wave queue size, incident rate. Graphes live (Grafana / Prometheus dashboards intégrés). Themed. | Live (gateway, metrics) |
| `/v3/arch-fitness` | V3 | Lentille ARCH-FITNESS (groupe « Observabilité »). Évaluation économique (S51, KRD §66.3) : HarnessCostBudget par cellule, ValueCase, violation surfacée + propositions trim (réductions sans suppression). Action-capable : accepter proposition trim → OpenIdea → /goal → approbation. Lecture seule + action-capable. | Live (economics MCP) |
| `/v3/idée` | V3 | Lentille IDÉE (groupe « Construire »). Tableau des idées (cycle de vie, miroir, promotion). Même logic que V1 `/ideas`, porté en lentille V3. Action-capable : promouvoir idée (avec miroir) → /goal. | Live (gateway, ideas) |
| `/v3/kernels` | V3 | Lentille KERNELS (groupe « Comprendre »). Index kernels du projet. Chaque kernel : niveau, facette, voyant, vérification complémentude. Cliquable → /v3/anatomie. Filtered/searchable. Themed. Lecture seule. | Live (gateway, kernels) |
| `/v3/operation` | V3 | Lentille OPERATION (groupe « Bâtir »). Index opérations (créer, éditer, exécuter). Chaque op : signature (inputs / outputs), journée verte (test coverage), appels inbound (quels contrôles l'invoquent). Cliquable → detail (code, tests, changeset). Action-capable : rejeu fixture. | Live (gateway, operations) |
| `/v3/policy` | V3 | Lentille POLICY (groupe « Gouverner »). Index politiques (déclarées au kernel). Chaque policy : rung application, scope, énoncé, payload. Cliquable → detail. Themed. Lecture seule (modifiable via idée + /goal). | Live (gateway, policies) |
| `/v3/version-dag` | V3 | Lentille VERSION-DAG (groupe « Observabilité »). DAG versions : chaque sommet = version (frozen, content-addressed). Arêtes = promotions (idea → mirror → /goal → kernel bump). Cliquable → commit / PR / changelog. Affiche branche tracking (main, stabilité). Themed. Lecture seule. | Live (gateway, version-dag) |
| `/v3/why-tree` | V3 | Lentille WHY-TREE (groupe « Comprendre »). Arbre causal « pourquoi cette spec » : chaque kernel → raison (idée / incident / politique / composition). Remontée causale jusqu'au root (besoin initial). Cliquable → parent spec / incident / policy. Themed. Lecture seule. | Live (gateway, why-tree) |

### Synthèse quantitatives

- **V1 (routes nominales)** : ~180 routes (homepage + ~178 panneaux de concepts/capacités)
- **V2 (legacy escalade)** : ~25 routes (/v2 + 1 catch-all + dédiées + WB2-02..)
- **V3 (refonte user-friendly)** : 28 lentilles groupées en 5 sections nav

**Total : ~233 routes uniques**

### Notes d'archéologie

- **Déterminisme-First** : Toute logique décisive (verdict miroir, agrégat récursif, émetteur idées, red wave, anatomy voyant) est implémentée comme twin pur côté client (`lib/*.ts`) + côté serveur Go (`back/`), couverte par fast-check. L'écran rejette la loi twin, jamais LLM.
- **Le Mur (§2)** : Routes V1/V2/V3 ne craignent jamais la vérité — toute écriture kernel passe par idée → miroir → /goal → approbation → ChangeSet signé. L'écran PROJETTE, n'écrit pas. Exception: routes d'administration (settings, env management) qui écrivent state non-kernel.
- **ADR 0010/0011** : Tous les panneaux (V1/V2/V3) respectent design tokens (zinc, blue-600, Geist, spacing, shadows) + i18n (FR par défaut, EN). Pas de hex/zinc hard-coded.
- **S59 Cutover (ADR 0092)** : Le moteur Go est l'UNIQUE source vivante. Côté front, `readVia(scope, "concept", …)` → serveur MCP dispatché. Twin démo (lib/v2/*) reste fallback déterministe — jamais "pur twin" (source:"live"|"demo" affiché).
- **Action-capable vs Lecture-seule** : Routes action-capable (mirrors, ideas, goal, red-wave, learn, emit-ideas…) EXÉCUTENT une décision depuis l'écran via Server Action + déterministe twin. Lecture-seule routes projettent données, non modifiables depuis l'écran.

---

---

## Déploiement du Workbench

Le Workbench AIDOS fonctionne en production via un binaire Next.js standard (`next start`), servir sur le port **3000** (localhost), routé publiquement par **Traefik v3** vers le domaine **aidos.sagedesk.fr** avec certificat **Let's Encrypt** valide. Cette infrastructure héberge les trois générations de l'interface en une seule construction et un unique déploiement.

### Architecture système du déploiement

| Composant | Port/Protocole | Rôle | Notes |
|-----------|---|---|---|
| **Workbench Next.js** | `:3000` (HTTP) | Front-end Workbench + server actions, routes racine (`/`) + `/v2` + `/v3` + routes S00–S47 | `npm run build` puis `npm start` ; vars d'env clés (`AIDOS_GATEWAY_HTTP_URL`, `POSTGRES_CONNECTION_STRING`, `AIDOS_VSCODE_URL`) injectées à la construction |
| **Passerelle MCP (backend Go)** | `:8787` (HTTP) | Dispatcheur in-process vers les ~90 serveurs MCP (`back/mcp/*`) | S59 `gateway_call` (ADR 0074) ; latence < 50 ms régime ; tout dispatch de lecture/écriture passe par là (aucune exception) |
| **Truth-store Postgres** | `:5433` (TCP) | Kernel + mirrors + fitness + idées + changesets + mémoire + i18n | Proxy TCP (socat) ; requêtes passent par l'authentification du rôle `aidos` ; l'erase-by-crypto (ADR 0050) conserve l'append-only structure |
| **Reverse-proxy Traefik** | `:80/443` | Routage `Host(aidos.sagedesk.fr)` ; TLS termination ; labels réseau Docker | Relit la gateway sous le proxy ; affiche le certificat Let's Encrypt au client |
| **VS Code distant (openvscode-server)** | Traefik `/editor` | Éditeur live accessible depuis `/v3/code` ; jetons expirables | Hôte-only, servi via Traefik (token dans l'URL querystring, jamais commité) |

### Variables d'environnement clés

Fichier **`.env.local`** (à la racine du projet `front/web/`) :

```
POSTGRES_CONNECTION_STRING=postgresql://postgres:${PASS}@127.0.0.1:5433/aidos?sslmode=disable
AIDOS_GATEWAY_HTTP_URL=http://127.0.0.1:8787
AIDOS_VSCODE_URL=https://vscode.sagedesk.fr/?tkn=<TOKEN>&folder=/home/workspace/aidos
```

- **`POSTGRES_CONNECTION_STRING`** : DSN vers le truth-store ; utilisé en server actions (S66 `bootstrapAdminUser`, S01 `listProjectsAction`, lectures de session pour V3). Le fallback démo (ADR 0092 T4) retombe si la clé est absente.
- **`AIDOS_GATEWAY_HTTP_URL`** : adresse HTTP de la passerelle MCP ; la plupart des écrans la consomment via `gateway_call(..., source:"live")`. Absent en dev local = fallback démo activé (fixture gelée, bandeau « mode aperçu »).
- **`AIDOS_VSCODE_URL`** : URL publique de l'openvscode-server (v3/code, PAGE SERVER ; route `/v3/code`, lit ce token à la requête). Le token est personnel, JAMAIS commité.

### Le cycle build → deploy

**Avant-déploiement (développement local):**
```bash
cd front/web
npm run build      # Next.js produit .next/
npm run lint       # ESLint + type-check
npm test           # Vitest (rapide)
```

**Déploiement (en prod :**
```bash
npm start          # Lance next start (le binaire .next/ prébuilt)
#                  # Écoute sur :3000
#                  # Relit vars d'env (.env.local injecté en container)
```

Le **rebuild complet** (suppression `.next/` et reconstruction) est **requis** pour que les changements de **thème** (ADR 0010, tokens Tailwind v4 dans `globals.css`) ou d'**i18n** (`messages/fr.json`, `messages/en.json`, ADR 0011) deviennent vivants — une simple relance (`npm start` seul) n'applique pas les changements aux fichiers statiques.

### Les trois générations coexistantes

Un seul build Next.js sert les trois interfaces :

| Version | Route-racine | Lignée | État |
|---------|---|---|---|
| **V1** | `/` | S00/S01 (route contracts) ; 13 panneaux originaux (`/contract`, `/store`, `/records`, etc.) | **Live** — inchangée, préservée (ADR 0009 §9 anti-overwrite) ; le routing middleware Next les redirige / les isole |
| **V2 (WB2)** | `/v2` | Panneaux V2 navigués par concept (13 panneaux, ADR 0053 obsolète) ; bandeau de dépréciation ; layout propre (nav latérale V2 + shell V2) | **Live mais désuète** — ADR 0060 l'a remplacée par V3 ; conservée pour la transition ; le code de V2 lui-même (`app/v2/layout.tsx`, `V2Nav.tsx`, `V2LegacyBanner.tsx`) affiche un avertissement d'abandon |
| **V3 (nouvelle)** | `/v3` | UNE session unifiée, 5 groupes conceptuels, 28 lentilles ; réunifie le Workbench autour d'une session partagée (`V3SessionProvider`) ; ADR 0060 | **Live** — le cœur du Workbench moderne ; toutes les routes neuves (`/v3/lab`, `/v3/specs`, `/v3/parcours`, `/v3/environnements`, `/v3/code`, `/v3/instance`, `/v3/parametrage`, `/v3/design`, `/v3/emetteurs`, etc.) y vivent |

**Routing côté Next.js :** le layout racine (`app/layout.tsx`) peuple le body de `sm:pl-64` (barre V1 fixe en mobile) ; V2 et V3 récupèrent cette gouttière avec `sm:-ml-64` pour déployer leurs propres nav. Chaque groupe de routes a son layout (`app/v2/layout.tsx`, `app/v3/layout.tsx`).

### Thème, i18n et design-tokens (ADR 0010 + 0011)

**Tokens de thème :**
Le Workbench adopte une **palette zinc + blue-600** (Tailwind v4, shadcn) issue de ccup. Tous les écrans (V1, V2, V3, S00–S47) utilisent les tokens CSS ; jamais de couleur en dur :
- Variables racine (`:root`) et dark (`.dark`) dans `app/globals.css`
- Classes : `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-card`, `border-border`, `ring-ring`, `rounded-lg`, etc.
- Fonts : **Geist** (sans-serif) + Geist Mono ; import Google Fonts

Le thème est **swappable en une seule édition** de `globals.css` ; les apps émises en héritent comme thème par défaut (ensuite customisable par projet).

**Bilinguisme (FR par défaut) :**
- Framework : **next-intl** en mode **no-i18n-routing** (locale depuis cookie `NEXT_LOCALE`, pas de prefix URL)
- Strings UI statiques : `messages/fr.json` + `messages/en.json` (fallback FR)
- Strings dynamiques (contenu utilisateur, entités) : table Postgres `i18n(key, locale, value)`, PK `(key, locale)`, fallback FR sur lookup
- **Impact déploiement :** aucun — les messages sont baked dans le build `.next/`

### Passerelle & dispatch MCP (ADR 0074, ADR 0092 single-source)

Chaque écran qui lit/écrit vérité appelle **`gateway_call(scope, tool, args, decoder, demo)`** (action serveur côté `app/gateway/actions.ts`). Le dispatch in-process vers un serveur MCP :

1. Route l'appel au bon serveur (`back/mcp/store`, `back/mcp/idea-intake`, `back/mcp/changeset`, etc.)
2. Authentifie (scope user)
3. Autorise (permissions Postgres du rôle `aidos` via GRANTs)
4. Exécute l'opération déterministe (fonction pure Go)
5. Retourne le résultat typé (schéma Zod)
6. **Refuse les écritures au-dessus de la ligne** (`WriteKernel`, `WriteMirror`, `WriteFitness`) d'un écran — la passerelle renvoie `BlockReason("AGENT_WRITE_ABOVE_WATERLINE")`. Les écritures légales passent par idée → miroir → `/goal` → ChangeSet → Postgres.

**Fallback démo (ADR 0092 T4, source:"demo") :**
Si `AIDOS_GATEWAY_HTTP_URL` est absent ou la passerelle inaccessible :
- Les écrans affichent un **bandeau « Mode aperçu — moteur indisponible »** (honnête)
- Un dataset de démo gelé (`lib/*-data.ts`) remplace les lectures
- Les écritures **ne sont jamais tentées** (pas d'effet de bord incohérent)
- Tout résultat affiché de la démo est **re-vérifié par le moteur dès que la gateway revient** (consistance garantie)

### Documentation Mintlify (deux-doc model)

Le Workbench a DEUX documentations publiques sur **aidos.mintlify.app** (repo `steph-frtech/docs`, clone `.aidos-docs/`) :

| Doc | Audience | Contenu | Langue | Mise à jour |
|-----|----------|---------|--------|---------|
| **« Pour moi »** (`steps/concept/`, `steps/internals/`) | Équipe dev AIDOS | Journal de construction complet — concept+implémentation+méta+méta-méta pour chaque step S00–S47 | Français + anglais (français d'abord) | À chaque step (non-négociable ; la step n'est pas livrée avant que les pages soient live et `mint validate` + `mint broken-links` clean) |
| **« Pour les futurs utilisateurs »** (`guide/`, `concepts/`) | Utilisateurs/dev externes | Guide produit : comment développer une app avec AIDOS ; parcours utilisateur ; concepts ; gestures du Workbench | Français + anglais (français d'abord) | À chaque step qui livre une capacité user-facing (panneau Workbench, geste, concept public, émetteur) |

**Impact déploiement :** Aucun sur le binaire Workbench lui-même — les docs sont des fichiers statiques (Mintlify/Next.js, domaine separate `docs.aidos.mintlify.app`). La pipeline (`mint build` → `mint deploy`) est déclenchée par pushes vers `main` du repo `steph-frtech/docs`.

### Processus de live-update (rebuild + restart)

Pour faire entrer en production une modification au Workbench (p. ex. nouvelle route S48, fix dans un panneau V3, ajustement design) :

1. **Développer localement :** `npm run dev` sur la machine de dev (recompile à chaque save)
2. **Tester :** Playwright e2e (`npm test`, ou un E2E ciblé via `/playwright-e2e`)
3. **Commitmer & pousser :** Git vers la branche `main` du repo AIDOS front/web
4. **CD/déploiement :** le container prod relit le code, relance le build
   ```bash
   docker-compose down aidos-workbench
   git pull origin main
   npm run build        # Reconstruit .next/ (requis pour thème/i18n)
   npm start            # Lance next start :3000
   ```
5. **Traefik routing :** le proxy voit le port :3000 de nouveau actif, réachemine le trafic aidos.sagedesk.fr vers le nouveau binaire
6. **Vérification :** `curl https://aidos.sagedesk.fr/` → code 200 + contenu V3 live

**Aucune interruption de service :** le déploiement bleu-vert (ancien container tourne pendant le build du nouveau) garantit une bascule fluide.

### Limites honnêtes & contraintes opérationnelles

- **Latence passerelle :** chaque lecture live = un `gateway_call` (~20–50 ms in-process). Atténué par caching par-requête (Server Actions memoïzent) et feedback-à-la-frappe optimiste côté client (jamais la source, toujours re-vérifié). Gate d'acceptation : p95 < 100 ms.
- **Offline :** le fallback démo gère l'indisponibilité de la gateway ; aucune décision utilisateur n'est persistée hors-ligne.
- **Sécurité de la gateway :** l'authentification Postgres (`authgate.go`) + les GRANTs du rôle `aidos` sont les seuls barriers. Une escalade de privilèges ou une injection Postgres côté gateway contournerait le mur. Mitigé par : audit SQL (logs Postgres), monitoring passerelle, reverifie de chaque écriture.
- **Scalabilité :** le dispatch in-process (même processus Workbench + flotte Go) ne scale pas au-delà d'un seul hôte. Une future architecture découplerait la gateway en service séparé + Workbench client-seulement (rupture non prévue S00–S47 ; OpenQuestion).

### Checklist de déploiement prod

- [ ] `.env.local` contient `POSTGRES_CONNECTION_STRING`, `AIDOS_GATEWAY_HTTP_URL`, `AIDOS_VSCODE_URL` (vars d'env, jamais commitées)
- [ ] `npm run build` complète sans erreur TypeScript
- [ ] `npm test` passe (tests unitaires Vitest)
- [ ] `/playwright-e2e` valide les routes critiques V1/V2/V3 (S00–S01 `GET /`, `GET /v3`)
- [ ] `next start` écoute sur `:3000`, répond sur `http://127.0.0.1:3000/`
- [ ] Traefik relit le label `aidos-workbench` et route `Host(aidos.sagedesk.fr)` → `:3000`
- [ ] TLS : certificat Let's Encrypt valide (valide 90 j., `certbot renew` avant expiration)
- [ ] Postgres accessible via `POSTGRES_CONNECTION_STRING` (test : `psql` avec la DSN)
- [ ] Passerelle Go sur `:8787` répond à `GET http://127.0.0.1:8787/health`
- [ ] V1 routes (`/contract`, `/store`, `/records`) affichent UI themed + bilingue (cookie `NEXT_LOCALE=en` → anglais)
- [ ] V2 routes sous `/v2/*` affichent bandeau « déprécié »
- [ ] V3 routes sous `/v3/*` chargent session unifiée (`V3SessionProvider`)
- [ ] Docs Mintlify : `aidos.mintlify.app` affiche « Pour moi » + « Pour les futurs utilisateurs » (` mint validate` clean)
