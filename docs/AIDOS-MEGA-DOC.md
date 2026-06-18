# AIDOS — TOUT en une page

> La page de référence exhaustive d'AIDOS (l'AI Development OS) et de sa méthode KRD (Kernel-Ratchet Development). Le concept, l'architecture, les décisions et le vocabulaire — **pas le code** (le code est une projection régénérable ; la vérité vit en Postgres). Document généré par fan-out read-only sur les sources du dépôt (KRD.md, CLAUDE.md, CONTEXT-MAP.md, les ADR, les plans, la mémoire).

## Sommaire

1. VISION — AIDOS et le Kernel-Ratchet Development
2. Les deux mandats non-négociables
3. Le mur (§2) — La défense en profondeur à deux niveaux
4. LA STACK GELÉE
5. LE TRUTH-STORE
6. GLOSSAIRE — Vocabulaire ubiquitaire KRD/AIDOS
7. LES DEUX AXES — la verticale couplante et l'octuor des facettes
8. LES MIROIRS & LA CERTIFICATION
9. Le Cycle de Vie — De l'idée à la phase stable
10. Le Workbench — L'interface de gouvernance de l'OS
11. La Passerelle & Déterminisme
12. LES APPS ÉMISES
13. Le cerveau du produit — mémoire contextuelle, rappel par similarité et firewall
14. Catalogue des Décisions Architecturales (ADR)
15. BUILD JOURNEY & ÉTAT DU SYSTÈME
16. La pile méta-méta, le NIVEAU 3 inviolable & l'auto-test — ce qui garde le système honnête
17. FKE — le cadre englobant (FKE ⊃ KRD ⊃ AIDOS)
18. Le second cliquet — structurel (l'architecture qui ne pourrit pas)
19. La boucle ③ — RealityMirror, l'incident qui devient vérité (`/learn`)
20. L'amont — la frontière d'ingestion & la verticale du besoin

---

## VISION — AIDOS et le Kernel-Ratchet Development

### Qu'est-ce qu'AIDOS

AIDOS est un **système d'exploitation pour le développement d'applications assisté par l'IA**. C'est un produit logiciel qui implémente une discipline appelée **KRD** (Kernel-Ratchet Development). AIDOS n'est pas une IDE générique, pas un générateur de code vanille, pas un assistant qui transforme du prose en logiciel. C'est une **machine qui gouverne** : elle orchestre une boucle où l'humain pose la vérité, l'IA refactorise et implémente librement, et des mécanismes non-contournables garantissent qu'aucune régression silencieuse n'entre en production.

**Ne pas confondre :** AIDOS (le produit, le système) et KRD (la méthode qu'il implémente). KRD est décrite intégralement dans `KRD.md` (le Tome). AIDOS *est* KRD rendu exécutable.

### Catégorie

AIDOS appartient à la catégorie des **AI Development Operating Systems** — un échelon au-dessus des agents de codage isolés. Un agent seul devient vite du vibe coding (l'IA décide tout) ou du chaos (chaque run diverge du précédent). AIDOS fournit :

- Un **noyau** (l'ancrage humain, la vérité) ;
- Un **cliquet comportemental** (une ratchet qui empêche les régressions) ;
- Un **mur** (frontière de permissions qui sépare vérité et code) ;
- Un **runtime** (orchestrateur des boucles : interne, moyenne, externe, méta) ;
- Une **workbench** (interface visuelle pour la gouvernance) ;
- Une **CLI** aidos (accès programmatique).

### Les cinq sous-systèmes

AIDOS est architecturé en cinq subsystèmes orthogonaux, chacun vivant dans son propre espace (répertoire Go ou Next.js) :

| Subsystème | Rôle | Entités principales |
|---|---|---|
| **AIDOS Runtime** (`back/runtime/`) | Orchestre les boucles, enforce les gardes-fou, gère le cycle de vie des goals, déploie les hooks, incarne le harnais | Harness, engine goal, sensors, skills, generators, context compiler, evolution lab |
| **AIDOS Kernel** (`back/kernel/`) | Stocke la vérité humaine du domaine en AST typé dans Postgres | Entités, politiques, opérations, contrôles, actions, invariants, budgets, expressions |
| **AIDOS Mirror** (`back/kernel/mirror/`, plan bicéphale) | Stocke les preuves exécutables (mirrors), les gère, les court, les vérifie | Gherkin, property tests, fixtures, contrats Pact, schémas, mètres |
| **AIDOS Archive** (`back/archive/`) | Mémorisation versionnée de toutes les phases stables et variantes explorées ; mémoire d'apprentissage (pgvector) | DAG de versions, changesets, phases stables, repository d'idées candidates, brain (mémoire) |
| **AIDOS Workbench** (`front/web/`) | Interface de gouvernance du système ; surface pour decisions, révisions, visualisation de l'état | Routes par panel (kernel, mirrors, ideas, archive, fitness, diffs, red-work-queue) |

Chaque subsystème a un contrat explicite (`back/<subsystem>/CONTEXT.md`) et une charge mécanique distincte : le Runtime *orchestre*, le Kernel *décide*, le Mirror *valide*, l'Archive *apprend*, le Workbench *expose*.

### Le principe fondateur — jamais prompt → code directement

Le cœur de la révolte de KRD contre le vibe coding : **ne pas permettre à l'IA de décider seule ce qui est vrai.** La chaîne est invariante :

```
Idée (candidate-vérité)
  ↓
Miroir BDD (preuve exécutable de ce que "vrai" signifie)
  ↓
Goal (set rouge de tests)
  ↓
Kernel / Vérité (fixture/invariant/contrat gelé, versionnage humain)
  ↓
Implémentation (code libre, refactoring libre)
  ↓
Vert (tous les tests passent)
  ↓
Phase stable (une coupe cohérente où rien ne pend, rien ne casse)
```

Jamais : idée → code. Toujours : idée → miroir → kernel → code → vert → stable.

### La propriété triple — qui possède quoi

| Couche | Propriétaire | Libertés | Garde-fou |
|---|---|---|---|
| **Vérité / Kernel** | **Humain** | Peut ajouter/raffiner/révoquer ; lent, délibéré ; au-dessus du mur | Version, ADR, autorité, approbation |
| **Implémentation / Code** | **Agent IA** | Refactor total, restructure, réinvente ; rapide, libre ; en dessous du mur | Miroir (le code doit passer les tests du noyau) |
| **Harnais / Règles** | **Harnais lui-même** (la machine) | Peut ajouter des sensors, jamais en retirer ; auto-test périodique | Injection de faute, NIVEAU 3 inviolable |

L'humain possède la vérité parce qu'il est le seul capable de juger ce qui « compte ». L'agent possède l'implémentation parce qu'il excelle à refactorer. La machine possède les règles parce qu'elle seule peut les appliquer sans biais. **Aucune boucle n'édite sa propre fitness.**

### Le mur — une seule frontière, trois visages

| Visage | Ce qu'il dit |
|---|---|
| **Barrière de permissions** | L'agent écrit `/src` (projections, code généré). L'agent n'écrit jamais `/kernel`, `/mirrors` (vérité), `/fitness` (niveaux inviolables). |
| **Ligne de flottaison** | En dessous (N3-N5, code) : déterministe, l'IA s'auto-certifie. Au-dessus (N0-N2, vérité métier) : humain-ancré, nécessite approbation. |
| **Frontière vérité/code** | D'un côté, le figé (comportement qu'on promet). De l'autre, le fluide (comment on le tient). |

Le mur est **mécanique** : deux niveaux de défense.
1. **PreToolUse hook (Go binary)** : refuse toute tentative d'écriture sur `/kernel/**`, `/mirrors/above/**`, `/.agent/fitness/**`. Retourne un `BlockReason` actionnable.
2. **Postgres GRANT** : l'agent a un rôle DB sans GRANT sur les tables de vérité (`kernel`, `mirrors`, `ideas`, `changesets`, `dag`, `fitness`). Seul l'outil `aidos` (via un changeset approuvé) a l'écriture.

### La vague de rouge — comment un changement se propage

Quand on ajoute/modifie une couche du noyau (une entité, un invariant, une fixture, une politique), trois choses arrivent *automatiquement* :

1. **Hash change** → le contenu-adressage détecte la mutation.
2. **Tous les miroirs qui reflètent cette couche virent au rouge** (lien périmé : `mirrors@ancien_hash` n'existe plus).
3. **Tous les consommateurs du miroir (tests d'acceptation, tests unitaires, les projections) virent au rouge en cascade.**

Cette **vague de rouge** n'est pas chassée à la main — elle est *calculée*. Chaque test rouge non résolu = une dette d'implémentation ; la worklist est l'ensemble des tests rouges. Drainer la vague = passer de la phase stable courante à la suivante. **Aucune décision humaine sur "qu'est-ce que ça impacte" n'est nécessaire.**

### Deux autorités : au-dessus de la ligne, en dessous

**Au-dessus du mur (vérité, noyau, miroirs human-anchored)** :
- L'humain décide : « voici ce qu'une commande doit faire ».
- L'autorité = le propriétaire de domaine (Product, Métier, Juridique, Sécurité — jamais l'IA).
- Change lentement, avec révision formelle (ADR, changeset, approbation).
- **Test-as-goal** : le test rouge *est* la vérité.

**En dessous du mur (implémentation, projections, miroirs AI-written)** :
- L'agent décide : « voici comment je le fais ».
- L'autorité = le système (the harness).
- Change rapidement, autogérée par la boucle TDD.
- **Test-as-means** : le test vert confirme qu'on a atteint le but.

### Les quatre boucles emboîtées (la méta-architecture)

| # | Boucle | Porte | Rythme | Fitness non-gameable |
|---|---|---|---|---|
| **①** | **Interne** (code ← noyau) | `/goal` | minutes | Miroir : red→green |
| **②** | **Moyenne** (variants ← fitness) | `/evolve` | heures | Miroir + computational + out-of-sample |
| **③** | **Externe** (noyau ← réalité) | (telemetry) | jours | Incidents de prod |
| **④** | **Méta** (harnais ← harnais) | (self-test) | semaines | Injection de faute |

Chaque boucle fait évoluer ce qui est en dessous d'elle *sans* pouvoir éditer sa propre fitness.

- **Boucle ①** : L'agent refactorise le code jusqu'à ce que tous les tests du noyau passent (miroir = juge).
- **Boucle ②** : L'agent explore des variantes du code qui passent toutes le miroir, et choisit les plus performantes/économes (quality-diversity).
- **Boucle ③** : La prod signale des défauts du noyau (un incident = une hypothèse fausse). L'humain approuve la correction du noyau (nouveau miroir, nouvelle fixture). Cela déclenche la boucle ① sur une nouvelle vague de rouge.
- **Boucle ④** : Le harnais lui-même s'auto-teste (injection de faute : on plante une violation connue, le sensor doit le détecter). L'auto-amélioration du harnais ne peut qu'ajouter des gardes-fou, jamais en retirer.

### Deux test-first, de part et d'autre de la ligne

**Test-as-goal (humain, au-dessus)** :
Avant d'écrire un seul morceau de code, l'humain écrit le miroir (Gherkin, property test, ou fixture). Ce miroir rouge *est* la définition du goal. L'agent ne voit que ce rouge et refactorise jusqu'à le passer.

**Test-as-means (agent, en dessous)** :
L'agent, en descendant outside-in, écrit le test de cas d'usage puis le test unitaire, chacun juste-à-temps pour guider l'implémentation (red-green-refactor classique). Mais ces tests-moyens ne créent jamais de *nouvelles vérités* — l'agent n'est jamais un auteur de comportement, seulement un scribe du comportement défini ci-dessus du mur.

### Le bicéphale — Kernel + Mirror

Le noyau n'existe jamais seul. Chaque couche du noyau (une entité, une opération, une politique, un invariant, un contrôle) a un **miroir vivant** qui la prouve. Le noyau et le miroir vivent dans deux plans distincts mais co-versionnés :

```
Plan SPEC (« voici ce qui doit être vrai »)    →    Plan MIROIR (« voici la preuve qu'on l'est »)
───────────────────────────────────────────         ──────────────────────────────────────────
entité cart                                         → test schema + test insertion/suppression
invariant « order.total = sum(items.price) »  → property test ∀ (random input → sum correct)
fixture « panier vide → bouton désactivé »    → fixture state : { cart: [] } → button.enabled == false
opération createOrder                         → fixture état→cmd→events
politique « seller ne voit pas buyer_email »  → property test d'autorisation
```

Changer le noyau → le miroir vire au rouge en premier (lien brisé : le miroir reflète une version obsolète). C'est le signal de départ de la vague. **Le bicéphale impose qu'aucune vérité ne peut fuir du système : chaque truth doit avoir une preuve vivante, exécutable, non-gameable.**

### La ligne de flottaison en deux dimensions

La ligne ne sépare pas juste « humain » vs « IA ». Elle sépare aussi **déterminisme** vs **probabilisme**.

- **Au-dessus** (N0-N2, truth) : vérité métier, slow, humain-curé, exécuté déterministiquement à chaque test (Gherkin runner, property tester).
- **Au-dessous** (N3-N5, code) : générée par l'IA, vite, auto-certifiable computationnellement (typechecking, lint, archi-checker, mutation).

Un test au-dessus vire au rouge une fois. Un test au-dessous s'auto-corrige à chaque diff. C'est l'asymétrie : la vérité est coûteuse en humain mais gratuite en rechangement ; le code est gratuit en auteur mais coûteux en rechangement si on casse la vérité.

### L'inversibilité de perspective : source vs projection

Les couches du noyau se classifient en deux groupes :

**Sources** (peu nombreuses, humaines, stables) :
- product (énoncé de capacité)
- journey (parcours utilisateur)
- view/écran (zones, données affichées)
- control / bouton (existe, visible-si, actif-si, déclenche)
- action (event → invoque opération)
- operation (steps typés : validate/authorize/read/mutate/return)
- policy (arbre de règles ALLOW/DENY)
- entity (schéma de données)

**Projections** (dérivées, IA-générées, rejetables) :
- api / routes
- db / migrations
- types / SDK
- composants rendus (web, mobile, CLI, etc.)

Inversement au generative-AI classique (« conçois l'écran, régénère l'entité »), KRD va **du modèle de domaine vers les écrans**. Les écrans deviennent du *sortant dérivé*, le modèle comportemental devient l'*entrant*.

### Le cycle de vie d'une fonctionnalité — deux phases

| Phase | Qui | Où | Quoi | Output |
|---|---|---|---|---|
| **1. Kernel** | Humain | au-dessus du mur | Ajoute/modifie la vérité : entity, operation, policy, fixture, invariant | Noyau en delta, miroir rouge. Rien ne compile. |
| **2. Code** | Agent IA | au-dessous du mur | Refactorise/génère du code jusqu'à passer le miroir rouge | Code vert, phase stable nouvelle. Tout compile et passe. |

Ces deux phases sont **toujours** séparées. Un merge qui touche les deux dans le même commit = **retour au vibe coding** = interdit.

### Exemple : ajouter une règle de remboursement

**Phase Kernel (humain, au-dessus du mur):**
1. L'équipe métier dit : « Un client en attente de retour peut demander un remboursement même en dehors du délai initial si le vendeur a marqué l'article comme perdu. »
2. Humain écrit la fixture (3-5 cas concrets) et la policy (∀ : la règle d'autorisation).
3. Commit dans `/kernel`. Le miroir est rouge (aucune implémentation n'existe encore).
4. La vague de rouge propage : `createRefund` doit maintenant gérer ce cas.

**Bascule automatique (harnais):**
5. Le harnais détecte le changement du noyau.
6. Il génère un set rouge : tout ce qui consomme `createRefund` est rouge.

**Phase Code (agent IA, en dessous du mur):**
7. L'agent commence par le test rouge le plus externe (acceptation).
8. Red-green-refactor outside-in jusqu'à passer tous les tests rouges.
9. À chaque diff, les sensors computational (types, lint, mutation) valident.
10. Quand tout est vert, une phase stable est atteinte.

**Retour au-dessus de la ligne:**
11. Un humain (ou un agent adversaire) vérifie que le vert *significa* la bonne chose.
12. Pas de triche : le comportement correspond au miroir écrit à l'étape 2.

### Trois façons d'échouer, et comment KRD les traverse

| Approche | Problème | KRD |
|---|---|---|
| **Vibe coding** | L'IA décide tout (spec ET code) → boule de boue, aucun contrôle | Mur : l'IA ne touche jamais le noyau |
| **Spec-Driven Development** | La prose dérive du code → effondrement | Vérité exécutable (miroir), pas prose. Versionning permanent détecte dérive. |
| **L'escalier incrémental** | Chaque marche diverge, pas d'architecture globale → sprawl local | Bounded contexts conçus top-down ; implémentation en escalier *à l'intérieur* de cellules dessinées |

### Rigueur adaptée par projet

KRD propose trois régimes :

| Régime | Mutation testing | Budgets | Formel | Use-case |
|---|---|---|---|---|
| **T0 (Spike)** | Non | Non | Non | Exploration, prototype, zone `/spike` (cliquet OFF) |
| **T1 (Normal)** | Oui, seuil 75% | Oui, définis | Pragmatique seulement | App standard, SaaS, e-commerce |
| **T2 (Catastrophe)** | Oui, seuil 85%+ | Oui, serrés | Formel si (catastrophe ∧ espace non-sampleable) | Paiement, auth, RGPD, médical |

Pas « KRD ou rien ». Coût économique vs risque : plus l'enjeu monte, plus les gardes-fou se resserrent.

### Pas d'auto-certification sur la vérité

Une règle mécanique : **l'agent ne s'auto-déclare jamais vert sur le comportement métier.** Il s'auto-certifie sur :
- Types (✓ déterministe)
- Lint (✓ déterministe)
- Tests unitaires (✓ déterministe)
- Architecture (✓ déterministe)
- Contrats Pact (✓ déterministe)

Il ne s'auto-certifie JAMAIS sur :
- Fixtures (tests métier) → humain juge
- Property tests (invariants métier) → humain juge
- Mutations survivants → humain peut lever le drapeau rouge

C'est l'asymétrie : en dessous de la ligne, tout est computational. Au-dessus, l'humain reste juge.

### L'émetteur de contexte — la formule unificatrice

KRD dit : **générative-probability (LLM) + deterministic-certification (miroir)** = système complet.

L'agent génère probabilistiquement (il peut hallucer, il est flou, il explore). Mais chaque généré que l'agent propose doit passer déterministiquement un gate : le miroir. Pas de second agent qui "valide" — ça recrée la circularité. Juste : le miroir déterministe, immuable, contrôlé par l'humain.

C'est la réconciliation : le flou *peut* vivre, tant qu'il passe le test **mécanique** qu'on lui pose.

---

## Les deux mandats non-négociables

KRD repose sur deux principes inséparables, chacun absolu, chacun appliqué sans exception. Ils forment le lit rocheux du cliquet comportemental et du mur qui le protège.

### Mandat A — Toute behaviour est prouvée en BDD, écrite avant le code

**Aucune ligne de code sans un scénario rouge en premier.** C'est la forme brute du red-green-refactor :

1. **Écrire le miroir** — la preuve exécutable de ce qui doit être vrai, au format adapté à la nature de la vérité ;
2. **Observer le rouge** — la preuve échoue, car le code n'existe pas encore ;
3. **Coder jusqu'au vert** — implémenter le comportement pour faire passer la preuve ;
4. **Refactoriser** — restructurer, optimiser, sans casser le vert.

**Le miroir EST la spec de comportement.** Il n'existe pas deux artefacts — la spec d'un côté, le test de l'autre — qui dérivent indépendamment. Une seule vérité exécutable : celle qu'une machine peut faire échouer ou réussir. La prose est un vœu, le test est un fait (Wasowski, 2026).

**Trois formes de miroir, une par nature de vérité :**

| Nature | Miroir | Outil de preuve (back) | Outil de preuve (front) | Preuve |
|---|---|---|---|---|
| **Parcours / Acceptation (N0)** | Scénario Gherkin (Given/When/Then) | Godog | Playwright + playwright-bdd | comportement bout en bout |
| **Invariant (∀)** | Propriété typée (test probabiliste : ∀ inputs → résultat respecte P) | rapid (Go) | fast-check (TypeScript) | loi métier vraie sur tous les chemins |
| **Workflow (N2)** | Fixture (point d'état : `état initial → commande → état final + événements`) | Interprète Operation DSL (Go) | XState (front uniquement pour l'état client) | cas canonique gelé |

Chaque miroir vit dans la `mirrors` Postgres schema, co-versionné avec sa vérité du `kernel` (bicéphale, ADR 0002). Le Gherkin est la **langue ubiquitaire** (DDD Evans) — même vocabulaire en Go, en TypeScript, en fixture, en spec écran. Pas de traduction qui pourrit : une seule langue, un seul ensemble de termes, partagé humain-machine.

**La loi de complétude.** Une vérité sans miroir vivant = un **monstre** (une hallucination, une régression silencieuse en attente). Un miroir sans vérité qu'il prouve = un **orphelin** (une preuve qui ne compte rien). Les deux sont interdits — c'est le sensor de complétude qui refuse tout changement laissant un monstre derrière lui. Chercher le monstre au chaque diff est la seule défense contre le retour en douceur au vibe coding.

### Mandat B — Toute vérité + sa méta vivent en Postgres, content-addressé, append-only

**Le kernel de AIDOS n'est pas un dossier de fichiers.** C'est un ensemble de schémas Postgres. La vérité du système — et *tout son méta* — vit uniquement dans la base de données, jamais éparpillée en fichiers qui divergent.

**Schémas de vérité (ADR 0004) :**

| Schéma | Contient |
|---|---|
| **kernel** | ASTs DSL du noyau : entités, politiques, opérations, contrôles, actions, expressions, invariants, budgets. La intention du système. |
| **mirrors** | Records miroir (`reflects`, `test_kind`, `cert_language`, `liveness`) + source miroir complète : texte Gherkin, spec propriété, data fixture. La preuve exécutable. |
| **ideas** | Candidats-vérité (entrée non-gelée, aucun miroir nécessaire) + provenance (humain ou incident). L'étage d'entrée. |
| **changesets** | Historique transactionnel : `DRAFT / APPLIED / REVERTED`. Chaque changement est un record, jamais une mutation silencieuse. |
| **dag** | Phases stables (nœuds) + changesets (arêtes) — branches, retours, re-branches, merges sémantiques. L'archivé. |
| **brain** | Mémoire : `MemoryItem` (épisodique, sémantique, procédurale) + embeddings pgvector. Gouvernée par le MemoryFirewall (§47), jamais source de vérité. |
| **context** | ContextGraph dérivé + `ContextGraphDecision` (réutilisable oui/non). Routage du contexte nécessaire seulement. |
| **provenance** | « qui a voulu quoi, quand, pourquoi ». Chaîne de causalité. |
| **fitness** | Grammaire NIVEAU 3 + ligne de flottaison + définition du « réussi ». Lecture seule, jamais touchée par l'agent. |

**Propriétés fondamentales :**

- **Content-addressé** : version = hash du contenu. Même contenu → même hash (idempotent, versionnable). Aucune version peut être synthétisée à la volée — elle doit être reproduite bit-pour-bit.
- **Append-only** : rien n'est détruit. Chaque prior version reste accessible. Le head est mutable (un ChangeSet peut être REVERTED), mais l'historique entier est conservé pour audit et archivage.
- **Transactionnel** : un ChangeSet atomic modifie kernel + mirrors ensemble. Jamais un seul sans l'autre (le bicéphale reste en phase).
- **Une seule autorité** : Postgres comme source de vérité, jamais « plusieurs sources » qui dérivent. Les fichiers git (code, `.feature` disque) sont des **projections régénérables** — la copie disque dérive du fichier source Postgres, pas l'inverse.

**Conséquence pratique :** Le code vit en git et s'évolue librement par l'agent. Les fichiers Gherkin sur disque sont **matérialisés depuis Postgres** pour que les runners les exécutent, mais la source canonique est la base. Modifier un `.feature` disque pour changer un comportement est interdit — c'est une modification de miroir (sémantique), qui doit passer par la porte légale : SemanticDiff → ChangeSet → approbation humaine → écriture atomic kernel+mirrors via `aidos` CLI.

**Pas de deux sources qui dérivent.** C'est le poison de SDD : une spec prose + un code qui dérivent tous deux indépendamment, et au jour 100 ils racontent deux histoires différentes. KRD élimine cette source d'effondrement en décidant : *une seule vérité (Postgres), deux têtes (kernel intent + mirror proof), N projections (code, `feature` matérialisé, Next component émis, DDL…)*. Les projections se régénèrent ; la vérité ne. Les projections s'éprouvent ; la vérité se démontre.

**Rien n'est édité silencieusement.** Chaque override d'une contrainte est un ChangeSet + ADR + provenance (qui a décidé, quand, pourquoi la promesse a changé). L'historique du kernel devient l'histoire de ce que le métier a décidé être vrai, découplée du *comment* le code l'a réalisé. C'est la traçabilité mûre face à « les facts changent » : pas un champ `version` décoratif, mais une trace de révocations délibérées, chacune enregistrée comme décision.

### Conséquence : la liberté asymétrique

| Domaine | Liberté | Propriétaire |
|---|---|---|
| **Comportement** | 0 % — verrouillé par kernel + miroir | humain |
| **Structure / implémentation** | 100 % — refactor libre tant que le miroir passe | agent IA |

L'agent complète, refactorise, restructure le code tant que les preuves du kernel restent vertes. Dès qu'une preuve devient rouge — une régression découverte — l'agent s'arrête, explique via SemanticDiff et BlockReason ce qu'il a cassé, et remonte au-dessus de la ligne de flottaison pour que l'humain décide si c'est un override délibéré (une vague de rouge attendue) ou un bug à corriger.

**Le cliquet est asymétrique.** Il ne dit pas « le code ne peut pas changer ». Il dit « le comportement ne peut changer que via une décision enregistrée et une vague de rouge honnête ». L'agent qui s'améliore en refactorisé, en optimisant, en retravaillant l'architecture — tout cela est libre, souhaité, exploité. Ce qui est interdit : améliorer silencieusement, refactor qui casse un test sans le dire, version qui dérive.

### Les deux clés qui maintiennent la discipline

**1. Le mur — une frontière enforcée à trois niveaux.**

| Niveau | Enforcement |
|---|---|
| **PreToolUse hook (Go)** | Refuse *toute* tentative d'écrire sur `kernel`, `mirrors`, `fitness`, retourne un `BlockReason` actionnable (code, sévérité, explication, comment_corriger) |
| **GRANTs Postgres** | L'agent's DB role n'a aucun `INSERT`, `UPDATE`, `DELETE` sur les tables de vérité (kernel/mirrors/fitness/dag). Seul le `aidos` CLI (via changeset approuvé, rôle dédié) écrit. |
| **La porte légale** | Idée → Miroir → `/goal` → approbation humaine. Jamais de raccourci. |

Une tentative d'écrire le kernel → BlockReason `KERNEL_WRITE_FORBIDDEN`. Une tentative de modifier une fixture sans SemanticDiff → `MIRROR_MODIFICATION_REQUIRES_SEMANTIC_DIFF`. L'agent ne découvre pas ces limites par procès ; elles sont déjà là, structurelles.

**2. La version — la licence de changer.**

Une déviation d'une contrainte `@v` *sans* bump de version = une **régression** (interdite, rouge). La même déviation *avec* bump (+ ADR + approbation) = une **évolution** (la vague de rouge est attendue, c'est l'ordre du jour). Le cliquet ne prohibe pas le changement — il prohibe le changement *non-versionné*, non-tracé, silencieux.

---

### Incarnation dans AIDOS

Les deux mandats ne vivent pas en prose. Ils sont mécaniquement exécutés.

**Mandat A — BDD avant code :**
- Chaque step (S00…S47) commence par `/grill-with-docs` qui affûte le miroir.
- Chaque step code via `/tdd` : red → green → refactor.
- Le hook de complétude refuse un `Stop` si une vérité est orpheline ou une preuve sans vérité existe.
- Les runners (`Godog`, `rapid`, `Playwright`) sont appelés à chaque diff (`PostToolUse` hook).

**Mandat B — Postgres, content-addressed, append-only :**
- Migrations Atlas déclaratives et expand-only, jamais réductrices (chaque version ajoute, n'écrase pas).
- Schémas mirrored co-versionnés avec changeset atomic.
- Chaque truthwrite traverse le cli `aidos` qui enregistre le changeset (DRAFT → APPLIED) avec provenance, hash, ADR.
- Projections (`.feature` matérialisé, Go structs émis via sqlc, schémas TS) sont régénérées depuis le kernel — jamais éditées à la main sans sémanticDiff.
- Le `brain.memory_item` (append-only) jamais source de vérité (MemoryFirewall, ADR 0008).

Ces deux mandats, ensemble, définissent le **cliquet comportemental** : liberté structurelle illimitée, zéro liberté sur le vrai, traçabilité complète des changements de vrai, impossibilité mécanique de régresser silencieusement.

---

## Le mur (§2) — La défense en profondeur à deux niveaux

### Au-dessus et en-dessous de la ligne

Le mur est la **frontière unique qui sépare deux zones de confiance différentes** : au-dessus, le **noyau** (la vérité, immuable sauf par décision humaine intentionnelle, au-dessus de la ligne de flottaison) ; en-dessous, le **code** (la projection, libre et refactorable, qui évolue à chaque diff). Cette distinction définit précisément qui peut écrire quoi, et elle s'énonce simplement : **l'IA écrit le code librement, jamais la vérité.**

Le mur est une **cellule unique vue sous trois angles** — permissionsphysiques (les rôles DB), épistémique (la ligne de flottaison N2↔N3), et architecturelle (noyau vs projections). Ces trois façons de nommer la même frontière convergent pour rendre l'asymétrie de liberté mécanique : liberté structurelle totale en-dessous (l'agent refactore, réécrit, restructure autant qu'il veut), zéro liberté comportementale au-dessus (l'agent ne décide jamais de ce qui doit être vrai).

### Ce qui est interdit en écriture — zones gelées

L'agent ne peut **jamais** écrire directement dans trois zones Postgres — le **mur au niveau 2 (les GRANTs)** :

| Zone | Contient | Sécurité |
|---|---|---|
| **`kernel`** | les DSL ASTs : entités, opérations, contrôles, actions, expressions, invariants, budgets | l'agent n'a aucun GRANT INSERT/UPDATE/DELETE/TRUNCATE |
| **`mirrors`** | les spécifications de tests, les liens `reflects` versionné, l'identité du langage de certification | l'agent n'a aucun GRANT INSERT/UPDATE/DELETE/TRUNCATE |
| **`fitness`** | la grammaire NIVEAU 3, la waterline, la définition de « passé » (lecture seule) | l'agent n'a aucun GRANT INSERT/UPDATE/DELETE/TRUNCATE |

De même, l'arborescence du code source : le dossier **`back/kernel/**`** en entier (DSL source, pas uniquement la persistence) est hors limites pour l'agent. Tout ce qui touche à la représentation de la vérité est gelé, bloqué au niveau rôle DB et au niveau hook.

### La défense en profondeur à deux niveaux

Deux garde-fous **indépendants** protègent le mur, ordonnés du plus rapide au plus strict :

**Niveau 1 — Hook `PreToolUse` (binaire Go)** : avant que l'agent ne lance un outil d'écriture (Edit, Write, Bash avec redirections), le harness Claude-Code intercept l'appel et l'envoie à un binaire Go (`back/hooks/pretooluse/`). Ce binaire classifie la cible d'écriture : elle vise le noyau/miroirs/fitness ? **REFUSE** et retourne un `BlockReason` structuré (`code: AGENT_WRITE_ABOVE_WATERLINE`, `severity`, `explanation`, `how_to_fix[]`). Cible en-dessous ? **AUTORISE** et passe transparemment. C'est le **mur logique** — l'agent sait immédiatement qu'il ne peut pas passer, avec une explication actionnelle de quoi faire à la place (« crée une idée → écris son miroir → ouvre un /goal → demande approbation »).

Ce niveau est **rapide** (une lookup de chemin/schéma), **déterministe** (du code pur, pas d'LLM), et **démonstratif** (le hook se prouve par une fault-injection : tenter une écriture kernel → blocage réel ; désactiver le hook → l'écriture passerait ; donc c'est bien lui qui garde).

**Niveau 2 — Postgres GRANTs (écriture DB)** : même si le hook niveau 1 était court-circuité ou absent, la base elle-même refuse toute écriture. Le rôle de l'IA (`aidos_agent`) reçoit **uniquement** les GRANTs SELECT sur les schémas de vérité et INSERT/UPDATE/DELETE sur `/src` (le code généré) et les projections. Sur `kernel`, `mirrors`, `fitness`, les GRANTs d'écriture sont **explicitement REVOKED**. Seul le rôle `aidos` (l'agent-constructeur d'AIDOS lui-même, ou le processus humain d'approbation ChangeSet) a les GRANTs d'écriture. C'est le **mur physique** — même une injection SQL, même une tentative d'escalade directe à la base, passe sur un mur de permissions.

Ces deux niveaux sont **orthogonaux** : l'un protège rapidement le processus de l'IA (niveau 1, feedback immédiat), l'autre protège les données au repos (niveau 2, garantie inviolable). Ensemble, ils forment une **défense en profondeur** conforme au harness engineering (Böckeler, 2026).

### L'unique porte vers le noyau

L'agent qui souhaite modifier une vérité n'a qu'un seul chemin légal (et encadré) : **l'idée → le miroir → le /goal → l'approbation humaine → le ChangeSet**.

1. **Idée** (`/emit-ideas` ou entrée utilisateur) : proposer un candidat-vérité sans le geler (il vit en-dessous du mur, dans la zone `/spike` si exploratoire, ou directement en candidat si sharpenable).

2. **Miroir** (test-as-goal) : écrire la preuve exécutable de ce qu'on veut — Gherkin/property/fixture — *avant* la vérité. Le miroir est **aussi gelé** quand on le prouve que la vérité ; c'est le plan bicaméral où spec et miroir se reflètent.

3. **`/goal`** : ouvrir une intention bornée, avec un ensemble rouge (les tests qui doivent passer) calculé depuis le delta de noyau proposé, et une condition d'arrêt non-circulaire (« tout le rouge passe, aucun vert cassé, mutation ≥ seuil »).

4. **Approbation humaine** : une autorité (product owner, curateur de noyau, legal selon le type de vérité — voir `AuthorityGraph`) examine le delta, le miroir et approuve explicitement l'entrée en `/goal`. Pas d'auto-approbation.

5. **ChangeSet** : l'application transactionnelle du delta (spec + miroir ensemble, jamais l'un sans l'autre) avec traçabilité de l'autorité, la raison (ADR) et la provenance (humain, incident, spike moissonnée). Append-only, jamais détruite.

**Jamais d'autre chemin.** L'agent ne peut pas « je vais juste toucher une fixture pour que le test passe » ou « je vais corriger rapidement ce invariant » — ces tentatives sont bloquées au niveau 1 et 2. Le mur existe précisément pour que des décisions de vérité passent par l'humain.

### L'anti-overwrite — Interdit vs Permis

L'anti-overwrite (§9 du KRD) est une **règle sur la porte elle-même** : ce qu'on a le droit de verrouiller au-dessus du mur, et ce qu'on n'a jamais le droit de faire.

| Opération | Permis ? | Justification |
|---|---|---|
| Ajouter une nouvelle fixture/invariant/contrôle (en espace libre, aucune contrainte préexistante en conflit) | ✅ Oui, par ChangeSet | Le cliquet gagne un cran ; aucune promesse préexistante n'est révoquée. C'est une **extension**, sûr par construction. |
| Raffiner une contrainte existante (ajouter une spécification plus étroite, sans contredire l'ancienne — ex. « après 3 échecs » raffine « creds valides → session ») | ✅ Oui, si consistent, par ChangeSet | C'est un **raffinement** ; l'ancienne contrainte reste vraie (elle était plus large). Vérifié au replay : l'ancien vert reste vert. |
| Changer ce qu'une contrainte existante dit (ex. remboursement : « aucun délai » → « 30 jours max ») | ⚠️ Oui, mais **bruyant** : c'est un **override** | Une promesse préexistante est révoquée. C'est dangereux (« les facts changent »). L'override doit être : (a) une décision humaine enregistrée (ADR), (b) versionnée (la vieille contrainte n'est pas effacée, elle est *superseded*), (c) tracée dans le journal généalogique du noyau, (d) approuvée par une autorité. La vague de rouge s'attend et elle est la *worklist*. |
| Éditer une fixture/invariant « en passing » (dans le même commit que du code) | ❌ **Interdit** | C'est la fusion des deux phases (noyau + code) qui tue le cliquet. Le mur le refuse au niveau 1 ; le ChangeSet exige une séparation claire. |
| Retirer une vérité sans enregistrer sa mort | ❌ **Interdit** | Append-only : les vérités meurent par **succession versionnée**, jamais par suppression. On mark deprecated + on pose une replacement/migration plan. L'historique reste auditable. |
| Créer des vérités qui s'auto-satisfont (ex. écrire un test qui valide l'interprétation du test qu'on vient de coder) | ❌ **Interdit** — c'est la circularité | C'est exactement ce que le mur prev en interdisant à l'agent d'écrire au-dessus. Test-as-goal vit au-dessus et l'agent ne peut pas le toucher ; test-as-means vit en-dessous et ne peut valider que vers le haut (micro-tests vers le goal macro). |

### Le deux-niveau : constructeur d'AIDOS vs utilisateur final

Une **nuance structurelle (ADR 0091)** précise où le mur s'applique :

| Rôle | Mode | Mur niveau 1 (Hook) | Mur niveau 2 (GRANTs) |
|---|---|---|---|
| **Constructeur d'AIDOS** (celui qui bâtit l'OS lui-même, `AIDOS_BUILD_MODE=1` en env) | Édite migrations/kernel DSL sources du système AIDOS | **Audite + AUTORISE** (le hook passe dans le shim Claude-Code, laisse faire, enregistre) | s.o. (le constructeur EST le développeur de l'OS) |
| **Utilisateur final** (qui construit *son* app **avec** AIDOS, pas de flag) | Veut modifier la vérité de *son* app | **REFUSE** (code `AGENT_WRITE_ABOVE_WATERLINE`) | **REFUSE** (Postgres role aoids_agent n'a aucun GRANT) |

La distinction est intentionnelle : le **mur produit** (pour l'utilisateur qui utilise AIDOS pour coder une appli) est garanti au niveau 2 (Postgres GRANTs), qui ne dépend pas d'un hook. Le hook niveau 1 est un **audit + garde** pour l'agent qui construit AIDOS lui-même, mais il ne confond pas les deux contextes. Preuve : si le constructeur `AIDOS_BUILD_MODE=1` commençait à construire un ChangeSet pour la vérité *produit* (pas celle d'AIDOS), le hook lui refuserait — il y a encore une barrière.

### Les trois langages de refus actionnable

Chaque refus du mur s'énonce en `BlockReason` structuré :

```yaml
BlockReason:
  code:          # "AGENT_WRITE_ABOVE_WATERLINE" principal; autres: MISSING_MIRROR, INCOMPLETE_GRILL, MONSTER_DETECTED
  severity:      # blocking | warning | info
  explanation:   # prose française claire (« tu tentes d'éditer back/kernel/entity.go »)
  how_to_fix:    # tableau de chemins concrets (« écris une idée », « ajoute un miroir », « demande approbation »)
```

Cet objet est **non-empty dès qu'il y a rejet**, et il alimente directement le `/wall` panel de la Workbench et la commande `aidos explain` — l'agent sait immédiatement quoi faire et l'humain voit l'historique des refus.

### Le mur lui-même est prouvé

Comme toute vérité KRD, le mur a ses miroirs (S04) :

- **Journey (N0, Gherkin/Godog)** : « agent tente d'écrire kernel → rejet avec BlockReason `AGENT_WRITE_ABOVE_WATERLINE` ».
- **Invariant (N1, property test)** : `∀ target_string : classify(target) ⇒ deny iff target ∈ {kernel|mirrors|fitness}`.
- **Fault-injection (N5, Testcontainers + Postgres réel)** : agent INSERT sur kernel table → SQL permission denied ; aidos role INSERT → succès.

Ces trois miroirs sont stockés dans le `mirrors` schema et matérialisés pour le runner. Ils rougissent si on retire le hook ou si on révoque les GRANTs (c'est l'injection de faute qui prouve qu'il n'y a pas de monstre).

---


## LA STACK GELÉE

### Principe et statut

AIDOS gèle la pile d'implémentation plutôt que de la laisser adaptative. Les gagnants du benchmark du Tome (KRD.md LIVRE VII) sont mappés une seule fois sur les trois piliers du système — **back = Go, base = Postgres, front = Next.js** — et enregistrés dans un tableau de statuts. Cette gelation sacrifie délibérément la variété requise (au sens d'Ashby) pour obtenir une fondation exécutable et gouvernable : le harnais (mur, capteurs, cert-runners, version-DAG, émetteurs) a besoin d'une **topologie figée** à laquelle s'accrocher. Chaque crochet, serveur MCP, générateur et vérification de complétude est écrit contre des **slots nommés**. Une pile mouvante signifierait que le harnais ne stabile jamais. Chaque rôle (niveau KRD) porte un statut : **mandatory** = substitution interdite, le harnais en dépend structurellement ; **replaceable** = une étape peut échanger l'outil contre une raison documentée (ADR), **uniquement dans le même rôle**. La recherche d'outil par étape (CLAUDE.md §6) ne choisit l'option la plus simple (mai 2026) que **dans** les slots gelés — jamais hors, jamais en-dessous du minimum mandatory.

### Tableau complet rôle → outil → statut

| Rôle (niveau KRD) | Choix gelé | Statut |
|---|---|---|
| **N0 — Journey / Acceptation** | **Godog** (back) + **Playwright + playwright-bdd** (front) | mandatory |
| **N1 — Invariants ∀** | **rapid** (Go) ; **fast-check** (front) | mandatory |
| **N2 — Workflow** | **Interpréteur DSL Operation en Go** + fixtures `état→cmd→events` ; XState client-only en Next | mandatory |
| **N3 — Contrats / Entités** | Entités = **AST en Postgres (JSONB)** → émettre **structs Go (sqlc)**, **DDL Postgres**, **types TS** ; **Pact** entre cellules | mandatory |
| **N4 — Code / Unité** | **`go test`** + Go strict ; **Vitest** + TS strict (front) | mandatory |
| **N5 — Infra / Adaptateurs** | **Pact provider verification** + **Testcontainers (Go)** avec vrai Postgres | mandatory |
| **Accès DB (Go)** | **sqlc** (SQL→Go typé) + **pgx** | mandatory |
| **Migrations** | **Atlas** (déclaratif, expand-contract) sur Postgres | replaceable |
| **Versioning / Archive (truth-store)** | **Postgres** (content-addressed, append-only, history tables) ; **git/jj** pour branches code ; **pgvector** pour embeddings. **Dolt abandonné pour la truth-store** (ADR 0004 addendum). | mandatory |
| **Datastore app émise (versioning données)** | **Doltgres** (Postgres-wire Dolt) — git-for-data pour les apps qu'AIDOS **construit** ; même dialecte Postgres, réutilise sqlc/pgx/Atlas (pas MySQL) ; beta → spike-validé, fallback plain-Postgres (ADR 0006). **PAS la truth-store OS**. | replaceable |
| **Mémoire backend (brain, S31)** | **pgvector natif** sur la truth-store Postgres (HNSW + cosine) ; service mémoire externe (Letta/Mem0/Zep) = adaptateur `replaceable` derrière port S31, spike+ADR gated (ADR 0008). | mandatory |
| **Schéma source unique** | une **source (entité)** → émet Go + TS (codegen), jamais double-typée | mandatory |
| **MCP** | **Go MCP SDK** — un outil = une op backend | mandatory |
| **Hooks** | **Binaires Go** invoqués par `PreToolUse / PostToolUse / Stop / PostKernelChange / SessionStart` | mandatory |
| **Mutation testing** | **gremlins** (Go) + **StrykerJS** (front) | replaceable |
| **Budgets (perf/sécu)** | **Semgrep · gosec · gitleaks · k6** | replaceable |
| **Télémétrie** | **OpenTelemetry** (Go) → Postgres | replaceable |
| **Arch-fitness** | **go-arch-lint / depguard** (Go) + **dependency-cruiser** (front) | replaceable |
| **Caps formels (rare, T2)** | Z3 / TLA+ / Dafny / Alloy / UPPAAL — uniquement si catastrophique ∧ non-échantillonnable | replaceable |
| **Design system Workbench** | **Tailwind v4 + shadcn** tokens, thème ccup **zinc + blue-600**, **Geist**, radius `0.5rem` ; chaque route utilise **design tokens** (jamais hex/zinc-* codés), composants shadcn ; apps émises héritent (ADR 0010) | replaceable |
| **i18n / Localisation** | **Bilingue par défaut — propose toujours deux langues, français par défaut** + seconde (EN). Workbench : **`next-intl`** (cookie `NEXT_LOCALE`, **pas** prefix route → routes inchangées), strings `front/web/messages/{fr,en}.json` ; texte entité : **table `i18n` Postgres** (`key, locale, value`, FR requis/fallback) ; apps émises héritent (ADR 0011) | mandatory |

### Mandatory vs Replaceable : l'équilibre du gelé

**Mandatory** (`mandatory`) = structurellement inévitable. La totalité du harnais — PreToolUse hook zones du mur, cert-runners (Godog, rapid, playwright-bdd), émetteurs (entité-AST → sqlc/DDL/TS), surface MCP (un outil = une op backend), la loi de complétude, la bicéphale — s'appuie sur ces noms et formes. Les remplacer signifierait redessiner le harnais entièrement, pas éditer un slot. **Replaceable** (`replaceable`) = une étape peut échanger l'outil pour une raison documentée, **dans le même rôle**, sous couvert d'une ADR. Atlas peut devenir Flyway si la migration gagne un cas que Postgres+Atlas ne sert pas (ADR enregistrée). StrykerJS peut céder à gremlins pur si le signal de mutation front-only l'exige. Mais la loi elle-même — qu'il faut mesurer mutation et la garder above a threshold — reste gelée.

### Réutiliser, ne pas réinventer (ADR 0007)

Le noyau stocke comportement et contrats comme des **ASTs content-addressed en Postgres** (la source — intouchable, ADR 0004) : la vérité doit être requêtable, hachée, append-only, derrière le mur, jamais un fichier `.xstate` ou `.linkml` sur le disque. Cette source reste propre à KRD. Mais l'**évaluation, exécution et génération de code** de ces ASTs **réutilisent des libs matures** plutôt que des moteurs écrits de zéro — le mandat du projet est *ne jamais réinventer ; l'implémentation doit être réutilisée (outils mai 2026)*.

**Expr DSL** (`visible_when`, `enabled_when`, policy, S08) → compile l'AST vers un engine d'expression Go vérifié — **CEL (`cel-go`)** ou **`expr-lang/expr`**. Sauf : le `back/kernel/expr/expr.go` est un **interpréteur bespoke délibérément fermé**, car un engine général exposant free-code (appels, lambdas, accès undeclared) serait une **échappatoire interdite du mur** (KRD §24.5) ; le catalogue d'opérateurs est gelé et déclaré, l'AST reste la source content-addressed, même input ⇒ même `Value` (ADR 0007 addendum, 2026-06-14).

**Operation DSL fixtures** (`état → cmd → events`, N2, S10) → exécuter/vérifier avec une lib statechart/state-machine mûre ; XState reste **client-only en Next**. AIDOS possède uniquement l'**interpréteur de step** (valider/autoriser/lire/muter/retourner) — le cœur KRD-spécifique.

**Émission** (entité → Go/DDL/TS, S34/S35) → bâtir sur **sqlc** + templates, jamais un engine codegen from-scratch.

### La truth-store : Postgres seul (ADR 0004)

Le noyau d'AIDOS n'est **pas** un dossier de fichiers : c'est un ensemble de **schémas Postgres**. Toute vérité KRD et sa méta — `kernel` (ASTs DSL : entités, policies, operations, controls, actions, expr + invariants + budgets), `mirrors` (records miroir + source : texte Gherkin, specs property, données fixture), `ideas` (candidats-vérités + provenance), `changesets` (historique transactionnel `DRAFT / APPLIED / REVERTED`), `dag` (phases stables + edges changesets), `brain` (`MemoryItem` + embeddings **pgvector**), `context` (ContextGraph dérivé + `ContextGraphDecision`), `provenance` ("qui voulait quoi, quand, pourquoi"), `fitness` (grammaire NIVEAU 3 + waterline + définition de "passé", read-only) — vit en base. La base est **append-only** (rien détruit ; la tête est mutable mais toute version antérieure est conservée) et **content-addressed** (version = hash du contenu). Postgres absorbe la versioning : append-only history tables, content-addressing per-Layer, `changesets`/`dag` explicites. **Dolt est rejeté pour la truth-store** (conflit entre Postgres/pgvector natif et Doltgres beta/incomplet) : la truth-store reste Postgres, une seule engine.

**Deux corrections honnêtes (ADR 0004 addendum, 2026-05-30) :** (1) le raisonnement implicite « Dolt est lent » est maintenant **faux** — Dolt 2.0 (2026-05-11) est ~8% plus rapide que MySQL ; le vrai bloqueur est que Dolt est **wire MySQL**, ce qui casse la pile Postgres-native gelée. (2) La 3-way merge structurée de Dolt est *bonne*, mais **orthogonale** au `MergeSemantic` KRD (S25 = merger la coupe, rejouer **tous** les miroirs, le rouge bloque) — donc elle gagne moins qu'elle n'apparaît.

**Le split qui résout** (confirmé 2026-05-30, ADR 0006) : la **truth-store AIDOS reste Postgres** ; **Doltgres** (le build Postgres-wire de Dolt) devient le **target de versioning données pour les apps qu'AIDOS *émet*** — la « BDD du résultat codé » — en gardant un dialecte Postgres unifié. La data-store app émise **accepte délibérément le statut beta de Doltgres** (slot replaceable, fallback plain-Postgres, spike-validé) ; la truth-store **ne l'accepte pas**.

### Brain : pgvector natif, firewall mémoire (ADR 0008)

AIDOS a **deux mémoires sans rapport**. **Layer A** = la mémoire inter-session de l'*agent Claude Code qui construit AIDOS* — **claude-mem**, une commodité dev, pas le produit, jamais vérité AIDOS. **Layer B** = le propre sous-système `brain` (S30–S33) d'AIDOS sur les projets utilisateur — **pgvector natif** dans la truth-store Postgres, derrière la MemoryFirewall, avec une ContextGraphDecision déterministe (LLM-free). Le mur + la loi « la mémoire n'est pas vérité » les empêchent de jamais se croiser. Un service mémoire externe (Letta/Mem0/Zep) est un adaptateur `replaceable` derrière le port S31 Store/Embedder, spike+ADR gated, jamais gelé.

### MCP partout, chaque op backend est un tool (ADR 0009)

Chaque opération backend qu'AIDOS expose — lire/écrire la truth-store, exécuter un miroir, exécuter un capteur, appliquer un changeset, interroger le DAG, ingérer une idée, rappeler mémoire, compiler contexte, émettre une projection, vérifier un Pact, lire télémétrie — **doit être accessible comme un outil MCP** (Go MCP SDK, un outil = une op backend). La surface MCP est la couche *capacité* que l'agent/Workbench/clients externes pilotent ; le noyau + hooks restent la couche *autorité* (ce qui est *permis*). Une nouvelle op backend sans tool MCP est incomplète.

### Crochets : binaires Go, enforcement du mur (CLAUDE.md §2, §5)

Le mur est renforcé deux fois (**défense en profondeur**). (1) Un crochet Go `PreToolUse` refuse toute écriture agent dans les zones vérité et retourne une `BlockReason` actionnable (`code, severity, explanation, how_to_fix[]`). (2) Postgres **GRANTs** : le rôle DB de l'agent n'a **aucun** GRANT d'écriture sur les tables vérité. Seul le CLI `aidos` — via un **changeset approuvé**, sous un rôle DB dédié — écrit vérité. L'une suffirait ; les deux ensemble signifient qu'un bug hook ne peut pas accorder l'écriture DB, et un GRANT manquant produit toujours un message hook clair. L'**unique porte du noyau** : `idée → miroir → /goal → approbation humain`. L'agent n'écrit jamais vérité en passant.

### Design system et i18n : unification Workbench et apps émises

**Design system (ADR 0010)** : le Workbench adopte un système unique — **Tailwind v4 + shadcn tokens**, palettes ccup **zinc + blue-600**, **Geist**, radius `0.5rem`, variantes light et dark dérivée en `.root` / `.dark` blocks `front/web/app/globals.css`. Chaque route utilise les **design tokens** (`bg-background`, `text-foreground`, `bg-primary` / `text-primary-foreground`, `bg-card`, `border-border`, `text-muted-foreground`, `ring-ring`, `rounded-lg`, etc.) et composants shadcn — jamais hex ou classes `zinc-*` / `blue-*` codées. Le thème est échangeable dans un fichier ; les apps émises héritent ce jeu de tokens par défaut (customizable per-project).

**i18n / Localisation (ADR 0011)** : le produit AIDOS — Workbench et chaque app qu'AIDOS émet — offre toujours **deux langues, français par défaut et fallback**, plus une seconde (EN). Workbench : **`next-intl`** en mode **no-i18n-routing** — la locale vient d'un **cookie** (`NEXT_LOCALE`, défaut `fr`), **pas** d'un prefix URL (`/fr/...`). Les routes existantes (`/contract`, `/store`, ...) restent **inchangées** ; un language switcher défini juste le cookie. Strings statiques vivent en `front/web/messages/{fr,en}.json` ; `fr` est le fallback. Textes dynamiques/entité : **table `i18n` Postgres** (`key, locale, value`, PK `(key, locale)`), **ligne FR requise**. Les apps émises héritent : `next-intl` (ou équivalent du target) + table `i18n` sur leur **Doltgres** datastore (ADR 0006), français par défaut. La règle imposée dans les skills de gestes (`view`, `action`, `entity`, `project`) et CLAUDE.md : **propose toujours deux langues, FR par défaut**.

### Conséquences : rigidité intentionnelle

- Un slot `replaceable` peut être échangé pour une raison documentée (ADR) — **mais uniquement pour le même rôle**, jamais en-dessous du minimum mandatory. Le rôle lui-même (le slot) ne bouge pas.
- Les slots `mandatory` ne sont **jamais** substitués. Godog + Playwright/playwright-bdd, rapid/fast-check, l'interpréteur Operation-DSL-en-Go (XState reste client-only en Next), entités-as-AST-en-Postgres émettant Go/DDL/TS avec Pact, `go test` + Vitest, Pact provider verification + Testcontainers sur vrai Postgres, sqlc + pgx, Postgres-as-versioned-store, single source → codegen Go+TS, Go MCP SDK, binaires Go hook sont load-bearing pour le harnais ; remplacer l'un signifie redessiner le harnais, pas éditer un slot.
- La variété est **bornée délibérément**. Par Ashby, geler réduit la variété du contrôleur et donc son adaptabilité ; le slot formal-caps (Z3 / TLA+ / Dafny / Alloy / UPPAAL) est la soupape d'échappement intentionnelle, atteignable **uniquement** quand une propriété est à la fois *catastrophique* et *non-échantillonnable* — jamais par défaut. Cela garde les méthodes formelles lourdes hors de la boucle quotidienne tout en laissant une porte enregistrée pour le rare cas.
- **Dur à inverser.** Les slots gelés sont câblés dans le mur, cert-runners, émetteurs, surface MCP, et per-step loop ; rouvrir la pile à adaptabilité pleine plus tard signifierait re-dériver le harnais contre une cible mouvante, pas un flip de drapeau. Le choix d'une pile gelée sacrifie l'adaptabilité run-time pour une fondation gouvernable et appliquée — l'échange juste pour un OS dont toute la valeur est appliquer la méthode.

---

Perfect. Now I have enough context. Let me compile the comprehensive section on the TRUTH-STORE.

## LE TRUTH-STORE

### Le cœur immutable : Postgres append-only, content-addressé

AIDOS n'est pas une pile de fichiers. Le noyau du système est **une base Postgres unique**, append-only et content-addressé (ADR 0004). Cette base est la source de vérité incontournable pour tout ce qui doit être vrai : le Kernel (les AST de domaine), les Mirror (les preuves exécutables), les Ideas (les candidats-vérités), les ChangeSets (l'historique transactionnel), le DAG (l'espace des versions), le Brain (la mémoire contextuelle), le Context (les décisions de réutilisation), la Provenance (qui voulait quoi, quand), et la Fitness (la grammaire NIVEAU 3, lecture seule). Le code vivent dans git (projections regenerables) ; la source de vérité vit dans Postgres.

**Append-only, jamais détruite.** Chaque ligne dans les schémas de vérité suit le même pattern : 
- `id` = SHA-256 du corps canonique (adressage par contenu)
- `body` = le JSONB canonicalisé (clés triées, pas d'espaces)
- `version` = le même hash (KRD §12, « la version est la licence de changer »)
- `superseded_by` = NULL pour une tête vivante ; pointe vers l'id qui la remplace
- `created_at` = l'horodatage d'insertion

**Mutable au sommet, immuable en profondeur.** Une vérité ne se met jamais à jour ; on en crée une nouvelle (nouvel id, nouveau hash) et on pointe la ligne précédente vers cette nouvelle via `superseded_by`. L'historique complet reste inspecté. Aucune ligne n'est jamais supprimée — une ligne abandonnée sert de marchepied pour l'archive et l'évolution.

**Adressage par contenu, idempotence, versionning intégré.** Si deux truths produisent le même corps canonicalisé, elles reçoivent le même id, le même version. Écrire deux fois exactement la même vérité retourne deux fois le même hash (idempotence). Changer un détail = nouvel id. Cette mécanique fait de chaque vérité un contrat : la même spécification mappe toujours au même identifiant.

---

### Les huit schémas de vérité (au-dessus de la ligne de flottaison)

| Schéma | Table principale | Contient | Statut wall |
|--------|-----------------|----------|-------------|
| **kernel** | `kernel.truth` | ASTs DSL : entities, policies, operations, controls, actions, expr + les invariants budgétaires | SELECT-only agent |
| **kernel** | `kernel.layer` | Le meta-type `Layer` : la classification unifiée de toute vérité (N0–N5) | SELECT-only agent |
| **kernel** | `kernel.link` | Les six types de lien : mirrors, composes, refines, overrides, absorbs, observes | SELECT-only agent |
| **mirrors** | `mirrors.mirror` | Le store générique (S02, auparavant) des preuves exécutables JSONB | SELECT-only agent |
| **mirrors** | `mirrors.mirror_record` | La projection typée (S06) : chaque mirror y a ses cinq champs explicites (reflects_layer_id, reflects_version, test_kind, cert_language, authority, liveness) ; join rapide pour la complétude | SELECT-only agent |
| **ideas** | `ideas.idea` | Candidats-vérités non gelés : l'étage d'entrée avant `/goal` (LIVRE XX, KRD §118) | SELECT, INSERT, UPDATE agent (capture + avance) |
| **ideas** | `ideas.goal` | L'enveloppe de promotion : une idée qui saute par-dessus le miroir et s'ouvre comme `/goal` (red set, budgets, statut OPEN/CLOSED) | SELECT-only agent (le statut CLOSED n'est jamais écrit par l'agent) |
| **changesets** | `changesets.changeset` | L'enveloppe réversible atomique : (spec_delta, mirror_delta, kind, status DRAFT/APPLIED/REVERTED) ; la seule porte vers la vérité | SELECT-only agent |
| **dag** | `dag.phase` | Nœud d'une phase stable (S02 baseline, S23 naming, S24 DAG complet) | SELECT-only agent |
| **dag** | `dag.node` | Nœud typé complet du DAG : (kind, parent_ids, stratum, label, cut, sensor_status, stable, reasons) ; id=version=content_hash ; head flag MUTABLE | SELECT-only agent |
| **dag** | `dag.edge` | Arête du DAG : (from_node, to_node, changeset) ; reuse du S20 changeset id, jamais copie du body | SELECT-only agent |
| **context** | `context.context_graph_decision` | Verdicts déterministes sur la réutilisabilité passée (time/scope/authority/conditions), false-dominant, jamais d'UPDATE (re-éval = nouvel INSERT) | SELECT-only agent |
| **fitness** | (plusieurs tables) | NIVEAU 3 grammaire + waterline + définition de « passé » (relecture seule du harness) | SELECT-only agent |
| **brain** | `brain.memory_item` | Mémoire contextuelle (fuel, pas truth) : **ni mirror, ni version** dans le body ; asymétrie MemoryFirewall | SELECT, INSERT agent (pas UPDATE/DELETE) |

**Le mur dans Postgres (CLAUDE.md §2, défense en profondeur).** 

1. **GRANT niveau DB** : l'agent role (`aidos_agent`) reçoit `SELECT` ONLY sur kernel/mirrors/ideas(goal)/changesets/dag/context/fitness. Zéro `INSERT/UPDATE/DELETE`. Tentative d'écriture = erreur Postgres directe.

2. **Hook PreToolUse (Go binary)** : avant toute exécution d'outil, le hook inspecte et refuse toute write-attempt sur ces zones, avec un `BlockReason` actionable (`code`, `severity`, `explanation`, `how_to_fix[]`).

3. **Seule porte d'entrée** : le CLI `aidos` via la plomberie d'un ChangeSet approuvé (S20), exécutée sous le privileged role `aidos`, qui peut INSERT/UPDATE (tête seulement, superseded_by).

**Asymétrie intentionnelle au-dessus/en-dessous de la ligne.** La `brain` (ci-dessous) est writable par l'agent (`SELECT, INSERT`), parce que c'est du fuel, pas de la truth. Pas de version, pas de miroir : structurellement impossible de confondre une mémoire avec une truth. Le `kernel/mirrors` (ci-dessus) reste sealed. Une mémoire ne peut jamais déclarer vérité qu'en remontant par la porte complète : Memory → ContextPack → Idea → Mirror → Goal → Kernel. Jamais de raccourci.

---

### Le schéma bicéphale : Kernel + Mirror co-versionnés

**Un corps, deux têtes** (LIVRE XXII, ADR 0002).

Chaque truth `kernel.layer` est jumelée à une ou plusieurs `mirrors.mirror_record` vivantes (vivantes = `liveness='alive'`). Le lien s'appelle `mirrors` et est typé : `(reflects_layer_id, reflects_version)`, content-addressé via le `mirrors` Link record (kernel.link).

**La loi de complétude.** Pas de truth sans miroir vivant (= pas de monstre de spec). Pas de miroir orphelin. À chaque nouveau version d'une truth, les miroirs qui la reflètent doivent se ré-évaluer—et si une re-évaluation échoue, la truth reste red jusqu'à correction. La loi de complétude est non-bypassable : c'est l'`PostKernelChange` hook qui la trigue.

**Atomic changeset envelope.** Quand une truth se change (spec delta → id2) et ses miroirs doivent se resynchroniser (mirror delta → id3, id4…), un seul ChangeSet (S20) contient les deux deltas. Spec et preuve bougent ensemble, avec un single TX Postgres, toujours en tandem. Un ChangeSet s'applique une fois ; il ne peut jamais être appliqué deux fois (idempotence du content-addressing).

**Matérialisation disk des mirrors.** Les `.feature` canoniques (Gherkin) et les fixtures vivent dans Postgres (`mirrors.mirror` body). Les runners (Godog, rapid, etc.) les matérialisent sur disk pour exécution—c'est une projection. La disk copy n'est jamais la source ; elle est drivée et peut être régénérée. Les auteurs lisent/écrivent la source (la base) ; les runners lisent la projection (le disk).

---

### Content-store archive (S01) — la soubassement

Au-dessous de tout, le schéma `archive` offre une primitive de base content-addressé append-only :
- `archive.content` : PK = hash ; rows immuables
- `archive.head` : pointers mutables (key → hash actuel)
- `archive.history` : log append-only de chaque head-move

C'est la couche générique sur laquelle vit la machinery kernel/mirrors/changesets/dag. Aucune truth du système n'échappe à cette discipline.

---

### Ideas + Goal : l'étage d'entrée

**ideas.idea** : candidats-vérités bruts. Pas encore figés, pas de miroir requis. L'agent peut `INSERT` + `UPDATE` (avancer le statut : `DRAFT → GRILLED → HARVESTED → SPIKE_RESOLVED`). Source : deux voies (humain via `/grill`, incident via `/learn`).

**ideas.goal** : la promotion formelle. Un goal épingle l'idée source, le ChangeSet DRAFT qu'il a ouvert, le red set (les refs miroir qui sont le goal), et son status (OPEN | CLOSED). Status CLOSED = « le red set est vert ». Jamais écrit par l'agent (ni l'ouverture, ni la fermeture — c'est le `/goal` engine et la stop-gate non-gameable qui tranchent). Le goal reste inspecté via la Workbench `/goals` route.

---

### DAG de versions (S24) : non un arbre, mais un graphe

**dag.node** : un nœud = une phase stable (coupe cohérente où tous les liens résolvent, tous les sensors verts). Content-addressé (id = version = SHA-256 du body). UNE colonne mutable : `head` (flag booléen). Plusieurs nœuds peuvent être `head=true` en même temps (branches parallèles, §125 KRD).

**dag.edge** : (from_node, to_node, changeset). Parentage dans un DAG (un nœud peut avoir ≥1 parents). Chaque arête REUSE un `changesets.changeset.id` existant (la relation DAG ne copie pas le ChangeSet body, juste la référence).

**Stratum (waterline)** : `stratum IN ('above', 'below')`. 
- **above** = truth human-anchored (le noyau, jamais évoli automatiquement sans approbation)
- **below** = evolutionary (variantes QD, candidates du laboratoire)

**Append-only DAG.** Aucun nœud n'est jamais supprimé — un line abandonné reste comme marchepied (§123 KRD : stepping stones). Un `checkout ancestor` est un UPDATE du `head` flag, jamais un DELETE. Le DAG ne se rétrécit jamais.

---

### Brain : mémoire contextuelle (S30), asymétrie MemoryFirewall

**brain.memory_item** : 
- `id` = SHA-256 du body (content-addressed)
- `body` = {content, provenance, validity_scope, expires_at, confidence, taint, branch}
- **DÉLIBÉRÉMENT aucune colonne `mirror` et aucune colonne `version` dans le body**

C'est une construction : une mémoire *ne peut pas* être une truth (le type Go la rend unrepresentable ; le schema Postgres la rend insérable). La MemoryFirewall est binaire : writable brain (fuel), sealed kernel (truth).

**Asymétrie GRANTs.** L'agent récoit `SELECT, INSERT` sur `brain.*` (lit et append mémoire librement), mais zéro perms sur `kernel/mirrors/fitness`. Une mémoire ne devient truth que par la porte complète : Memory → ContextPack → Idea → Mirror → Goal → Kernel (le `/goal` engine, propriété du CLI privilégié).

---

### Context : ContextGraphDecision (S32), déterministe, sans LLM

**context.context_graph_decision** :
- `id` = SHA-256 du verdict (content-addressed)
- `candidate_id` = le past MemoryItem/Idea qu'on évalue pour réutilisation
- `may_reuse` = false-dominant boolean (true IFF ALL 4 dimensions pass)
- `checked` = array de ∈ {'time', 'scope', 'authority', 'conditions'}
- `required_human_review` = true si l'authority du candidat a changé
- Constraints : `may_reuse=true` exige `checked` contient tous les 4 ; un verdict true ET required_review=true est impossible

**Aucun LLM.** C'est du code pur (back/archive/context), déterministe. Le verdict est routé par ContextRouter (un algorithme, pas un prompt). L'LLM ne vit pas dans cette couche (CLAUDE.md §8, « l'agent ne s'auto-juge jamais »).

---

### Fitness (read-only du harness)

Le schéma `fitness` enregistre la grammaire NIVEAU 3 du harness (inviolable), la waterline (waterline stratum vs evolutionary strata), la définition de « passed » (la stop-condition non-gameable), et des snapshots de kernel debt (orphan mirrors, stale fixtures, surviving mutants).

**Aucune write par l'agent, jamais.** Le fitness est une lecture—le sensor qui dit « as-tu cassé le cliquet ?» Les updates au fitness ne peuvent venir que du `/self-test` hook (SessionStart) ou des phases stable du DAG (une phase new-stable = une nouvelle snap fitness).

---

### Provenance : ledger d'audition

Où vit qui a voulu quoi, quand, pourquoi. Pas une table unique ; c'est une colonne `provenance` (TEXT, JSON-serializable) dans chaque body content-addressed (ideas, kernel, mirrors, changesets, goal). Format : `{source: "human"|"incident", actor, timestamp, reason, trace}`. Totalement auditable, jamais modifiée (append-only du body).

---

### Constraints & invariants, codés dans Postgres

Chaque table de vérité porte des CHECK constraints qu'aucun INSERT/UPDATE ne peut violer, même main-crafted :

- **mirror_record** : `id = version AND id = content_hash` (content-addressed) ; `test_kind IN (...)` ; `cert_language IN (...)` ; `authority IN ('above','below')` ; `liveness IN ('alive','dead')`
- **goal** : `status IN ('OPEN','CLOSED')` ; `(status='OPEN' AND closed_at IS NULL) OR (status='CLOSED' AND closed_at IS NOT NULL)` ; `body->>'status' = status` (pas de drift)
- **memory_item** : `body->>'kind' = 'memory_item'` ; `NOT (body ? 'mirror') AND NOT (body ? 'version')` (défense en profondeur MemoryFirewall) ; `body->>'branch' = branch` (pas de drift)
- **context_graph_decision** : `checked <@ ARRAY['time','scope','authority','conditions']` ; `may_reuse=true ⇒ ALL 4 dimensions in checked` ; `NOT (may_reuse AND required_human_review)` (mutually exclusive)
- **dag.node** : `version = id` (content-addressed) ; `stratum IN ('above','below')`
- **dag.edge** : `from_node <> to_node` (pas de boucles auto)

Ces contraintes sont **déclaratives** (Postgres les enforce) et **reproductibles** (Testcontainers + Atlas run them on every test, chaque commit).

---

### Migration : Atlas declaratif, expand-only

Toutes les migrations (61 baseline .sql files) sont déclaratives via **Atlas** (`back/migrations/atlas.hcl`). Aucune n'est destructrice (jamais DROP TABLE, jamais DELETE on existing data). Chaque nouvelle étape qui ajoute un schéma ou une table est un EXPAND — append à la structure, jamais un rétrécissement. Une fois qu'une migration est appliquée, elle ne bouge jamais (Postgres immutability).

---

### Testcontainers : réal Postgres on every test

Les migrations ne sont jamais validées "en sec" (on text-checks DDL). Chaque test-suite Go de truth-store (`back/archive/*`, `back/kernel/mirror/*`, `back/archive/dag`, etc.) spin up une vraie instance Postgres in-process (Testcontainers Go), applique les migrations dans l'ordre (append-only), puis valide la structure et les GRANTs. La preuve end-to-end que la wall tient, que l'append-only discipline est appliquée, que le content-addressing est idempotent — tout cela est exécutable à chaque `go test`.

---

### Résumé : la topologie du truth-store

```
┌─────────────────────── ABOVE THE WATERLINE (Truth) ─────────────────────┐
│                                                                            │
│  kernel.truth        │ kernel.layer        │ kernel.link                  │
│  mirrors.mirror_record                                                    │
│  ideas.idea          │ ideas.goal          │ changesets.changeset         │
│  dag.node            │ dag.edge            │ dag.phase                    │
│  context.context_graph_decision                                          │
│  fitness.*  (read-only)                                                   │
│                                                                            │
│  Agent Role (aidos_agent)      : SELECT only                             │
│  Writer Role (aidos)           : INSERT/UPDATE (head pointers only)      │
│                                                                            │
├────────────────────── BELOW THE WATERLINE (Fuel) ──────────────────────┤
│                                                                            │
│  brain.memory_item  (no mirror, no version)                               │
│                                                                            │
│  Agent Role (aidos_agent)      : SELECT, INSERT (append-only)            │
│  Writer Role (aidos)           : (future: may write via context-router)  │
│                                                                            │
├────────────────────── GENERIC SUBSTRATE ─────────────────────────────┤
│                                                                            │
│  archive.content   (immutable, PK=hash)                                   │
│  archive.head      (mutable pointer)                                      │
│  archive.history   (append-only log)                                      │
│                                                                            │
│  Agent Role : SELECT only (reads content-store via MCP /store)           │
│  Writer Role: SELECT, INSERT (appends via /store MCP)                    │
│                                                                            │
└────────────────────────────────────────────────────────────────────────┘
```

**Append-only + content-addressed → auditable, replayable, never silent drift.** Chaque changement a un hash. Chaque phase stable est sauvegardé. Chaque ChangeSet est transactionnel. Le cliquet tient parce que le mur n'est pas un sentiment, c'est du Postgres.

---


## GLOSSAIRE — Vocabulaire ubiquitaire KRD/AIDOS

### Notions fondamentales

**BDD (Behavior-Driven Development)**
La méthode de spécification du comportement par les faits plutôt que par la prose. Tout comportement s'écrit d'abord en BDD — `Given / When / Then` — avant le code. C'est la forme canonique d'un miroir. N'est jamais utilisé pour désigner la base de données (pour cela : **Postgres** ou **la base**).

**Noyau (Kernel)**
Le petit ensemble exécutable, gelé, falsifiable, ancré par l'humain, de contraintes sur ce que le système doit faire. Il ne génère jamais le code ; il le *contraint*. Il vit dans les schémas Postgres (`back/kernel/`) comme des AST contenus en JSONB, content-addressés et append-only. C'est la tête d'intention du système bicéphale. Ne pas confondre avec « spec » (une spec est une partie du noyau), « config » (le noyau porte du comportement, pas des paramètres), « golden-master » (une technique de test, pas un noyau).

**Miroir (Mirror)**
La preuve exécutable d'une vérité, typée par un langage de certification (Gherkin, rapid/property, fixture) et exécutée comme un capteur déterministe. C'est la tête de preuve du système bicéphale. Elle est conservée dans le schéma Postgres `back/kernel/mirror/`, co-versionnée avec le noyau par le lien `mirrors`. Ne pas confondre avec « test » (générique), « assertion » (un composant du miroir), ou avec un simple attribut `test` sur une couche.

**Bicéphale (Bicephalous)**
Un corps (la vérité) avec deux têtes — l'intention dans le noyau et la preuve dans le miroir — inséparables et jointes par le lien `mirrors`. C'est un tout indivisible : pas de tête sans corps, pas de corps sans tête. Historiquement appelé « bicaméral », mais ce terme était source de confusion avec les systèmes à deux chambres.

**Cliquet (Ratchet)**
Le mécanisme qui n'autorise qu'une progression en avant, jamais de régression. Le comportement ne peut qu'avancer. Le cliquet n'interdit pas le changement ; il interdit le changement *non-versionné*. Chaque changement de contrainte gelée est un cran du cliquet. C'est la boucle de pilotage du Runtime qui fait fonctionner le cliquet : dès qu'un problème survient plusieurs fois, on renforce les guides ou les capteurs pour le rendre impossible.

**Mur (Wall)**
La frontière unique d'autorisation et de responsabilité, avec trois facettes qui ne sont qu'une : permission (l'agent écrit les projections, jamais le noyau), ligne de flottaison (au-dessus l'ancrage humain obligatoire, au-dessous l'auto-certification IA), et frontière vérité/code (le figé d'un côté, le fluide de l'autre). C'est le Runtime qui l'applique mécaniquement via deux niveaux de défense : le hook `PreToolUse` qui refuse les écritures illégales, et les GRANTs Postgres qui ôtent à l'agent le droit d'écrire dans les schémas de vérité.

**Monstre (Monster)**
Une spécification sans miroir, ou un miroir orphelin — un corps sans tête ou une tête sans corps. C'est l'échec direct de la loi de complétude. Le Runtime et les validateurs les traquent activement par injection de fautes.

**Loi de complétude (Completeness law)**
Tout étage du noyau doit avoir au moins un miroir vivant et exécutable comme capteur déterministe. Récursivement : un agrégat est VERT si et seulement si son propre miroir est VERT *et* tous les agrégats enfants (via le lien `composes`) sont VERTS. C'est la loi non-négociable qui interdit les monstres.

**Vague de rouge (Red wave)**
La cascade de liens périmés et de miroirs défaillants déclenchée par un changement de hash du noyau. Elle commence au miroir et se propage aux projections. C'est le plan de travail automatique — la liste de ce qui doit être refait — calculée mécaniquement, jamais traquée manuellement.

**Waterline (Ligne de flottaison)**
La partition au-dessus/au-dessous qui court à travers tout le système. *Au-dessus* : N0, N1, N2 — vérité métier forte, mais ancrage humain obligatoire via des fixtures gelées ; l'agent ne peut pas s'auto-certifier sur le *sens*. *Au-dessous* : N3, N4, N5 — déterministe, l'agent s'auto-certifie entièrement. C'est la frontière computational/inferential rendue opérationnelle. Elle est immuable, partie de NIVEAU 3 (le meta-méta inviolable).

### Épistémologie et typage de la vérité

**TruthKind (Type de vérité)**
La classification de ce qu'on affirme : comportemental (auth, paiement, permissions), structurel (architecture, dépendances, schéma, contrats), expérientiel (UX, perception, clarté, confiance), économique (coût, conversion, performance métier), réglementaire (loi, conformité, RGPD), statistique (A/B, observation, expérimentation), ou exploratoire (pas encore vérifiable, reste dans `/spike`). Toute vérité doit déclarer son type avant d'entrer dans le noyau.

**VerifiabilityLevel (Niveau de vérifiabilité)**
La force du signal qu'on peut obtenir pour prouver une affirmation : déterministe (test exact, oui/non), statistique (A/B, intervalle, probabilité), retardée (vérité observable plus tard en production), jugée-par-humain (UX, stratégie, goût), ou non-vérifiable (pas cliquetable). Si le signal n'est pas vérifiable, KRD ne certifie pas — il passe en `/spike`, expérimentation ou revue humaine. Le cliquet n'a pas le droit de mordre les vérités molles.

**TruthScope (Champ d'application)**
Les dimensions où une vérité s'applique — région (FR, EU, US, ou \*), locataire, cible (web, mobile, voice, xr, iot), fenêtre de temps (de/jusqu'à), segment utilisateur (premium, standard, guest), environnement (prod, staging, dev). Aucune vérité n'est universelle par défaut. Une décision réutilisée hors scope est une hallucination structurelle.

**AuthorityGraph (Graphe d'autorité)**
Dans une organisation réelle, « l'humain » n'existe pas — il y a produit, juridique, sécurité, design, métier, ops, finance, support. Chaque vérité au-dessus de la ligne doit avoir un propriétaire d'autorité explicite : qui approuve, qui peut vétoer, qui escalade. Une règle réglementaire, une décision UX, une politique de sécurité et une décision produit ne sont pas approuvées par la même autorité.

**ExperienceClaim (Affirmation d'expérience)**
L'accessibilité peut être déterministe. L'expérience est souvent statistique. Le goût reste humain. Une affirmation d'expérience déclare son type (accessibilité, clarté, conversion, confiance, qualité perçue), sa validation (revue humain, heuristique, WCAG, A/B test, test utilisateur), son statut (hypothèse, acceptée, rejetée, expirée). Elle n'est admise au noyau que si elle a une autorité UX explicite, un scope, une expiration possible, et un miroir cohérent avec son type. KRD cliquette les défauts, pas les goûts.

**DataTruthScope (Champ d'application des données)**
Les données ont leur propre inertie. Une migration de schéma ne peut pas être un override libre — elle porte des enregistrements existants qui doivent évoluer avec elle. Le `DataTruthScope` déclare quel ensemble d'enregistrements une vérité affecte, pour quels horizons temporels, et quelles sont les garanties de préservation (invariant de donnée préservé, backfill obligatoire, etc.). C'est la rigidité des données contrebalancée par la transparence intentionnelle.

### Couches et architecture

**Couche (Layer)**
Le méta-type unique dont tout noyau se construit. `kind` en déclare la valeur : product, journey, view, control, action, operation, policy, entity, api, db, type, budget, etc. Chaque couche porte `kind`, `truth_artifact` (schéma, prédicat, fixture, seuil, spec-écran, action-spec), `owner` (human, ai, derived), `authority` (au-dessus ou au-dessous de la ligne). C'est la grammaire unifiée de tout le système, jamais « level » ou « tier ».

**Source / Projection (partagé)**
**Source** = vérité gelée au-dessus de la waterline (product, journey, view, control, action, operation, policy, entity, mirror). **Projection** = code dérivé, jetable, écrit par l'IA, au-dessous, gardé par un miroir. Le noyau possède les sources ; les projections vivent dehors. C'est une distinction de propriété et de mutabilité.

**Paire-miroir (Mirror pair)**
L'une des quatre familles de paires réfléchies de l'anatomie du noyau : spec↔doc (s1↔s10), use-case↔code-derived-doc (s2↔s9, la *doc-miroir*), human-data-model↔data-projection (s3↔s7, la *data-miroir*), scenario↔test+result (s4↔s5/s6). Le juge compare ces paires structurellement ; la divergence en prose est consultative seulement.

**Loi de composition (composes / 7e lien)**
La mérologie typée et pondérée — un tout contient une partie — où `vérité(composite) = Σ vérités(parties) + propre vérité émergente`. La pondération (load-bearing vs cosmetic) est déclarée, jamais apprise. C'est le moyen d'exprimer que les invariants se propagent à travers les agrégats.

**Idée (Idea)**
L'étage d'entrée au-dessus du noyau : un candidat-vérité avec la forme d'une vérité mais sans gel et sans miroir. Elle est promue vers le noyau en écrivant son miroir (c'est le `/goal`). Ses deux sources sont l'humain et la réalité. Ne pas confondre avec une demande de fonctionnalité, un ticket, un élément du backlog.

**Control (Bouton)**
Un bouton *comme* source du noyau (non pas comme composant React) : un AST typé `{view, label, visible_when Expr, enabled_when Expr, triggers}`. Sa vérité est une fixture d'ÉTAT (`given → button.visible/enabled`). Le bouton rendu (`<button>` / `<Pressable>` / commande vocale) est une projection ultérieure gardée par ce miroir. Les deux conditions sont des AST du DSL Expr (réutilisés, jamais du code libre).

**Action (action-spec)**
La source du noyau qui lie un control à une opération : `{on: click(controlRef), invoke: operation@version with {…}, on_success[], on_error[]}`. Sa vérité est une fixture d'ÉVÉNEMENT (`event → invoke/effect`). Le gestionnaire `onClick` généré est une projection ; l'action-spec est la source — le comportement reste dans Opération/Politique/Expr, jamais du code libre, tout le long jusqu'au bouton.

**Triggers (lien control → action)**
Le lien versionné d'un control-spec à l'action-spec qu'il déclenche. Un control dont `triggers` ne se résout pas à une référence d'action connue est un orphan trigger — un monstre que le validateur rejette.

**Binds (lien action → operation)**
Le lien versionné d'une action-spec à l'opération qu'elle invoque. La fixture d'événement d'action-spec n'est VERTE que si le bind résout le clic à son opération.

**Contrats / Ports**
Les ports de frontière dérivés (e.g. `api.pact`, `types.zod`) déclarés à l'intérieur du noyau comme des contrats N3 figés et versionnés, nés du besoin du domaine. L'artefact de contrat est une source propriété du noyau ; un SDK client livré est une projection émise distincte. Le port est conçu du dedans vers le dehors (depuis le besoin métier), jamais l'inverse. L'ordre : découvrir le port depuis le workflow métier → geler le contrat → implémenter l'application contre des fakes → tracer bullet vrai de bout en bout → adapter infra.

### Cycles de certification et preuve

**N0–N5 (Les six niveaux de preuve)**
Chaque niveau porte les deux jambes du V : un contrat (feedforward, l'artefact) et un test (feedback, le capteur). N0 (Intention/Parcours) : scénario d'acceptation approuvé, E2E/Acceptation, sans auto-cert IA. N1 (Domaine/Invariants) : invariant + fact-hash, property test, auto-cert IA avec prudence. N2 (Workflow/Use-case) : fixture état→commande→état+events, test fonctionnel, variantes oui canon gelé non. N3 (Contrat/Frontière) : schéma versionné + Context Map, contrat + archi, auto-cert IA oui. N4 (Code/Unité) : signature + TDD local, tests unitaires, auto-cert IA oui. N5 (Infra/Adaptateurs) : branchement DB, Worldline, transporteur, tests d'intégration, différé. La waterline passe entre N2 et N3 : au-dessus, ancrage humain obligatoire ; au-dessous, auto-certification entière.

**Métier vs Fonctionnel (distinction critique)**
**Métier (N1)** = « vrai sur *tous* les chemins » (un invariant, path-independent) — une bande verticale qui traverse tout. Prouvé par une **propriété** (∀). **Fonctionnel (N2)** = « *ce* chemin produit *ce* résultat » (path-specific). Prouvé par une **fixture** (un exemple canonique). Ne pas tester un invariant avec un exemple ; ne pas tester un workflow avec une propriété. Le mock est un gradient : interdit au cœur (Métier) → aux frontières seulement (Fonctionnel/Contrat) → toléré-mais-audité (Unitaire).

**Fixture**
Un point dans l'espace des comportements possibles : une situation exacte → ce résultat exact. C'est un oracle qui doit être *consommé*, jamais recopié — un test qui recopie les valeurs réintroduit la dérive.

**Invariant**
Une région de l'espace des comportements : ∀ situations vérifiant P → résultat vérifie Q. C'est ce qui est vrai sur tous les chemins.

**Test-comme-goal vs test-comme-moyen**
**test-comme-goal** = le miroir écrit par l'humain au-dessus de la ligne qui *définit* la vérité — c'est le `/goal`. **test-comme-moyen** = les tests internes de l'agent au-dessous. L'agent peut écrire des tests-moyens mais jamais des tests-vérité — c'est la circularité du mur.

**Capteur (Sensor)**
Un détecteur qui vérifie une projection contre sa source. Trois régimes : **computational** (déterministe, chaque diff, l'IA s'auto-certifie), **inferential** (LLM-juge, gardé, post-intégration), ou **meter** (budget). Un capteur qui ne déclenche jamais n'existe pas.

**Capteur computational (le tiroir par-diff)**
Le régime déterministe exécuté à chaque diff : `gofmt`+`go vet`, lint, test d'archi, miroirs/tests affectés. L'agent s'auto-certifie sur ceux-ci seuls, jamais sur le comportement métier. `on_fail: block` — une erreur rend la diff rouge.

**Affected set (Code changé)**
Le sous-ensemble du code que le capteur par-diff examine : le(s) fichier(s) nommé(s) par l'événement `PostToolUse` et le(s) paquet(s) où ils vivent. C'est une fonction pure de l'événement + le code qu'il pointe.

**RealityMirror / Out-of-sample**
Évaluation non-truquable sur données jamais vues ou réalité vive (métriques prod, incidents, OOS, walk-forward, Monte-Carlo). C'est l'une des quatre ancres non-truquables (miroir, out-of-sample, réalité, injection de fautes).

### Versioning et propagation

**ChangeSet (Enveloppe transactionnelle)**
L'enveloppe atomique, réversible qui passe d'une phase stable à la suivante, enveloppe simultanément `spec` (Kernel) et `miroir` (Mirror) pour qu'ils ne dérivent jamais. États : `DRAFT | APPLIED | REVERTED` seulement ; une reversion est un nouveau ChangeSet inverse. Jamais du texte libre (un ChangeSet porte aussi l'ADR qui justifie).

**Phase stable (Stable phase)**
Une coupe cohérente dans le DAG où chaque lien se résout et chaque capteur est vert simultanément (y compris l'agrégat récursif) — la lockfile du noyau. Locale (cellule) ou globale (fédération) ; fractale.

**DAG de versions (Version DAG)**
La forme de l'espace de versioning : un DAG, pas une ligne — les phases stables sont des nœuds, les ChangeSets sont des arêtes, content-addressés sur un substrat `jj + git + Dolt`.

**Fusion sémantique (Semantic merge)**
La fusion de deux branches de vérité du DAG vérifiée *sémantiquement*, pas textuellement : le **miroir** décide du conflit — RED sur la coupe fusionnée (l'agrégat récursif) — jamais un diff trois-voies au niveau texte. Une fusion que git appellerait propre est **bloquée** si son agrégat rougit un miroir. Le décideur `MergeSemantic(base, left, right, sensors)` est pur et lecture-seule.

**Coupe fusionnée (Merged cut)**
La coupe candidate cohérente formée par l'union sélective `base + deltas left + deltas right`, évaluée par le même oracle `IsStable` / agrégat-récursif qu'une phase stable. Elle est content-addressée. C'est une phase stable *candidate* uniquement — elle ne le devient que si son agrégat est VERT.

**Conflit de fusion (Merge conflict)**
Au moins un miroir rougit sur la coupe fusionnée — y compris deux branches touchant des lignes *disjointes* qui cassent le *même* invariant émergent d'un parent partagé. Un conflit **bloque** la fusion ; le résoudre est un **override** (humain, au-dessus de la waterline — ChangeSet + ADR + provenance), jamais une auto-fusion.

**Override (Révocation)**
Changer ce qu'une contrainte existante déclare — révoquer une promesse. C'est dangereux : l'humain décide, c'est bruyant, c'est tracé. Ce n'est pas une édition ; c'est une **décision enregistrée** : tu versionnes la contrainte avec l'ADR qui dit *pourquoi* la promesse a changé. L'historique du noyau devient l'histoire de ce que le métier a décidé être vrai.

### Harness et Runtime

**Harnais (Harness)**
Tout ce qui entoure le modèle — `Agent = Modèle + Harness`. Le moteur versionné, auto-évoluable qui enveloppe boucles, skills, hooks, capteurs, générateurs, contexte et archive. Il ne peut jamais atteindre sa propre fonction de fitness ou le mur.

**Déterminisme-first (Determinism-first)**
Tout ce qui *peut* être une fonction pure déterministe **DOIT** être du code, jamais un agent/LLM : parsing, validation, hashing, diff, routage, scoring contre des poids *déclarés*, comptage, transformation, rendu, schéma-checks, matching. Si une option déterministe existe, préférer toujours et la rendre **autoritaire** — l'LLM est l'exception gardée, pour la génération irréductible seule. Un agent faisant ce qu'une fonction pourrait faire est une **lacune de déterminisme** qui bloque l'étape.

**Geste / Skill (Gesture / Skill)**
Une orchestration que le harnais accomplit (`/goal`, `/grill`, `/spike`, `/harvest`, `/evolve`, `/tdd`, `/reconcile`, `/project`, `/learn`, `/harden`, `/context`, `/merge-semantic`…), définie dans un `SKILL.md` et validée par des capteurs. Les skills sont les mouvements musculaires ; la méthode est le noyau et le cliquet.

**Hook (Garde-fou mécanique)**
L'une des cinq garde-fous câblées (`PreToolUse`, `PostToolUse`, `Stop`, `PostKernelChange`, `SessionStart`). Les garde-fous *sont* des hooks. Un hook qui ne déclenche jamais est mort — exige qu'il ait échoué au moins un run réel avant de l'ajouter.

**Outil (Tool)**
Un serveur MCP, une opération backend (test-runner, mutation-tester, déploiement…). Les outils disent ce que l'agent *peut* faire ; le noyau et les hooks disent ce qu'il a le *droit* de faire.

**Topologie / Template de harness (Topology / Harness template)**
Un bundle Ashby-style de guides + capteurs qu'une couche ou cellule hérite (crud / workflow / event-processor / dashboard). Composé en fragments, jamais simple-sélection — une vraie app est une composition de topologies.

**Générateur / Émetteur (Generator / Emitter)**
Un émetteur déterministe, un par `kind × target`, qui produit une projection à partir d'une source. Il instancie une topologie et son harness, jamais un squelette nu.

**Politique (Policy)**
Une règle de niveau harness (mocking, architecture-rules, permissions, context-selection). Distincte de la Policy DSL du noyau et de la ArchiveCurationPolicy de l'archive.

**KRDCompiler (`krd`)**
Un compilateur de vérité, pas de code : il lit le graphe de vérité (idées, noyau, miroir, contexte, changesets, projections, télémétrie) et produit l'état objectif du système. Aucun concept KRD n'existe si `krd check` ne peut le vérifier.

**ContextPack / ContextRouter / ContextGraph**
Le compilateur de contexte. Le `ContextRouter` (un algorithme, pas un prompt) compile une `ContextPack` minimale, branch-aware, depuis le sous-graphe affecté du `ContextGraph`. Le contexte est compilé à partir du red-set, jamais global.

**SemanticDiff**
La nature réelle d'un changement du noyau en termes humains (change_type, blast_radius, requires_authority, red_wave) — pas un diff textuel. Calculé par le Runtime, rendu par le Workbench.

**BlockReason (Raison de blocage)**
L'explication actionnaire derrière un refus : `code`, `severity`, `explanation`, `how_to_fix[]`. Un mur sans BlockReason rendu devient une prison. Le `code` enum est fermé et petit : `MISSING_MIRROR`, `MISSING_AUTHORITY`, `OUT_OF_SCOPE`, plus l'hérité `AGENT_WRITE_ABOVE_WATERLINE`. Chaque code mappe déterministiquement à un chemin de résolution non-vide.

**Stigmergie / RedWorkQueue**
Coordination sans coordinateur central : la stigmergie coordonne l'attention via la vague de rouge partagée (une trace de phéromone), tandis que la `RedWorkQueue` coordonne l'exécution (éléments de travail ciblant un `mirror_id`).

### Exploration et évolution

**Geste d'exploration (Exploration gesture)**
Les trois Runtime gestures de l'étage d'entrée idée (s'il y a S28) : `/grill` défie une intention *au-dessus* du mur et la route selon un verdict ; `/spike` ouvre le ratchet-OFF, T0, zone jetable ; `/harvest` extrait l'intention découverte et *propose* un delta kernel. Le gel (écrire le miroir = `/goal`) est un geste distinct ultérieur, propriété du kernel, hors de portée.

**Verdict de grill (Grill verdict)**
L'issue fermée trois-valeur de `/grill` sur une idée `draft` — `sharp` (falsifiable maintenant → `grilled`, skip le spike), `fuzzy` (pas-encore-falsifiable → `grilled` puis `spiking`, la branche floue), `bad` (mauvaise idée → `rejected`, tracée). Un pur routage ; pas de quatrième verdict.

**Confinement de spike (Spike confinement)**
La règle non-contournable que, tant qu'une idée est `spiking` (ratchet OFF, T0), chaque chemin d'écriture est *sous* le préfixe `/spike` ou est refusé. Le spike jetable ne doit pas fuir vers `/kernel` ou `/src`. Le hook `spike-confinement` s'en remet au prédicat pur.

**Proposal DRAFT-Truth (`/harvest`)**
Ce que `/harvest` retourne d'une idée spiking : un candidat delta-kernel `{ideaId, proposes, intent, provenance, hasFrozenVersion: false, hasMirror: false}`. C'est une *proposal*, pas une vérité — pas de version gelée, pas de miroir, pas d'écriture kernel. L'IA peut proposer, l'humain approuve — jamais l'inverse.

**Goal (le but / la boucle interne ①)**
La *seule* porte légitime d'un candidat-vérité (idée) à la vérité : `idée → miroir → /goal`. Un `Goal` est un DRAFT `ChangeSet` portant le `spec_delta` + `mirror_delta` de l'idée atomiquement *plus* le **red set** — les références de miroir défaillantes qui *sont* le goal. `/goal` ouvre le goal et calcule son arrêt ; il ne court *pas* la motion TDD rouge→vert (c'est le travail `/src` de l'agent). Boucle interne ① seule — pas la boucle moyenne `/evolve` (§63②) ni la boucle de réalité externe (§63③).

**Red set (L'ensemble rouge)**
L'ensemble ordonné des références de miroir défaillant qu'un goal doit passer au vert — dérivé par `redwave.Impact` du `spec_delta` de l'idée, jamais chassé. Un goal avec un red set *vide* est rejeté : un test déjà vert n'est pas un goal — il n'y a rien à fermer. Une idée *sans* miroir est rejetée : c'est un vœu / monstre.

**Arrêt non-truquable (`IsClosed`)**
Le prédicat de fermeture *calculé* : un goal se ferme iff `red set → vert ∧ vert antérieur intact ∧ mutation ≥ seuil ∧ pas de monstre` — quatre conditions, les quatre doivent tenir. C'est pur, total, déterministe et prend *zéro* entrée de confiance de l'agent. L'engine ne lit jamais la déclaration « c'est fait » de l'agent. `OPEN`/`CLOSED` est donc calculé, jamais déclaré.

**EvolutionSandbox (Bac à sable d'évolution)**
La quarantaine qui confine les variantes exploratrices : la ratchet OFF, aucune mutation du kernel/mirrors/fitness, écritures limitées aux branches/rapports/idées. Une variante est promue dans une niche QD *seulement* si elle porte un miroir vert (∧ vert out-of-sample ∧ approbation d'autorité). L'évolution explore, elle ne gouverne pas.

### Archive et mémoire

**Archive (L'archive)**
L'espace de versions de l'OS entier — append-only avec une tête mutable, content-addressé, stratifié par la waterline (vérité humaine au-dessus, branches évolutives au-dessous). Une structure servant défaire, branchement humain, et recherche évolutive.

**Archive qualité-diversité (Quality-diversity archive)**
Le DAG de version lue comme mémoire évolutive : variante = branche, pierre de gué = ancêtre, niche = branche parallèle, élite = phase stable conservée. L'archive évolutive et le DAG de version sont *une* structure, pas deux.

**Pierre de gué (Stepping stone)**
Un nœud ancêtre conservé parce qu'il peut germer un futur bond, même s'il n'est pas lui-même une élite. C'est pourquoi l'archive est diversité, pas juste le meilleur courant.

**ArchiveCurationPolicy (Politique de curation d'archive)**
La politique qui garde le DAG comme mémoire vivante plutôt qu'un infini dépôt — déclarant quoi **conserver**, **compacter**, et **tombstone**. L'histoire critique n'est jamais détruite, seulement compactée ou tombstonée.

**`/brain` (Les six mémoires KRD — côté store)**
Le store côté moteur des six mémoires KRD — `working`, `episodic`, `semantic`, `procedural`, `structural`, `evolutionary` — branch-aware et indexable. C'est du carburant de contexte, jamais de la vérité. Le cockpit humain au-dessus de `/brain` (notes Obsidian-style/adr/runs/glossaire/cartes) vit dans le Workbench, pas ici.

**MemoryFirewall (Pare-feu mémoire)**
La barrière qui empêche la mémoire de prétendre jamais être une vérité : aucun `MemoryItem` n'atteint le kernel sauf via le flux obligatoire `Mémoire → ContextPack → Idée → Miroir → Goal → Kernel`. La mémoire propose ; le kernel déclare.

**Adaptateur mémoire (Memory adapter)**
Le seam d'écriture + **rappel par similarité** du store `/brain` sur **pgvector** embeddings, à travers les quatre mémoires **indexables** — `episodic | semantic | procedural | structural`. Un `Store` **port** (`Write`/`Recall`/`Get`) avec deux backends **injectables** — un `MockStore` déterministe (cosinus exact sur un `Embedder` seedé, pas de modèle) et un `PgxStore` (HNSW + cosinus ANN sur `brain.memory_item`). `working` et `evolutionary` sont *en dehors* de l'adaptateur. Il n'expédie que écriture + rappel ; il n'atteint *rien* au-dessus du mur.

**Rappel (Recall)**
Récupérer les **plus proches** mémoires à une requête par **similarité cosinus**, ordonnées par score descendant, optionnellement restreintes par filtres `kind`/`branch`, top-`k`. Déterministe sous un embedder seedé fixe. C'est du **carburant de contexte**, jamais une décision : un élément rappelé n'est pas un fait et n'atteint pas kernel/mirror.

**Embedder (Port d'embedding)**
Le port injecté qui mappe texte à un vecteur de dimension fixe (384). Le mock utilise un `HashEmbedder` déterministe (pas de modèle — les tests n'en ont donc pas besoin et le rappel est reproductible) ; le runtime nomme son vrai modèle en provenance mémoire, donc un swap modèle est une reindex de table append-only enregistrée, jamais une dérive silencieuse.

### Workbench et gouvernance

**Workbench (KRDWorkbench)**
L'interface d'exploitation propre d'AIDOS (`front/web/`) — la surface humaine de gouvernance trop riche pour YAML seul, et la maison du cockpit humain `/brain`. Sans lui, l'autorité contourne au lieu de décider. C'est l'UI du système d'exploitation, pas une app qu'AIDOS émet pour un utilisateur final.

**Surface (Vue de gouvernance)**
Une vue de gouvernance à l'intérieur du Workbench (file d'attente d'idées, miroirs, autorité, semantic-diff, dag-viewer, kernel-debt, légende couleur, cockpit). Une surface rend état du moteur et offre un ensemble borné de gestes humains ; elle ne calcule *jamais* l'état qu'elle affiche.

**Geste humain (Human gesture)**
Une décision humaine unique exposée par une surface — approuver / rejeter / spiker / scopifier / autorité / déclassifier / tuer — qui retourne au moteur comme ChangeSet approuvé. Le Workbench route les décisions ; il ne *peut pas* être l'autorité de décision.

**Cockpit (`/brain`)**
La surface de lecture Obsidian-style humaine au-dessus des six mémoires KRD — notes, adr, runs, glossaire, cartes, revues. Le cockpit vit au Workbench ; le **store** mémoire vit côté moteur à `back/archive/brain/`. Le moteur lit le store ; l'humain lit le cockpit.

**KernelDebt (Revue)**
La revue Workbench de la dette de jardinage du kernel accrûe (fixtures périmées, miroirs orphelins, mutants survivants) aux côtés des propositions `/trim-kernel` pour la payer. Une surface de revue, pas un ledger qui lui appartient.

**CellVitality (Vitalité de cellule)**
La santé diagnostique d'une cellule, surfacée comme l'un de quatre états d'interprétation — `healthy`, `stale`, `overfitting_risk`, `underconstrained` — qui déclenche une revue. Un diagnostic, jamais une fitness de promotion.

### Adoptabilité et lancement

**AdoptionStage (Étage d'adoption)**
L'échelle READ-ONLY qui nomme le **plus petit cliquet qui clique ensuite** (installer KRD progressivement, jamais en bloc). *Exactement* cinq tiers déclarés `T0..T4` : `T0`=tests+mutation, `T1`=une cellule KRD, `T2`=kernel+mirror, `T3`=ContextGraph+Mémoire, `T4`=evolve+QualityDiversity. Chaque tier porte `requires`/`grants` sur `Capability` (les faits consommés, jamais construits). Trois gating facts charge-portants : `T1` ne requiert *pas* `QualityDiversity` (avancé) ; `T2` requiert un `RealityMirror` vivant ; `T4` requiert un `EvolutionSandbox` vivant. `Plan(capabilities) → AdoptionPlan` est pur (pas DB, pas I/O, pas `time.Now()`, pas RNG) : retourne le tier courant (le plancher continu satisfait), le plus petit prochain tier installable + les `[]Gap` par tier non-satisfait.

**Release v0 pack**
Le bundle content-addressé qui prouve « cet AIDOS est launchable » — **assemblé**, jamais écrit à la main. C'est l'inventaire de ce qui existe dans la vue live du truth-store : `cli_surface`, `workbench_routes`, `demo_cell`, `docs_index`, `test_inventory` (les miroirs vivants), `changelog` (des changesets), `known_limits` (des limites déclarées / OpenQuestions), plus l'`AdoptionPlan`. Chaque champ est le contenu de la vue — aucune ligne CLI/route/démo/doc/changelog/limite inventée. Pur sur `(vue, capabilities, maintenant)`. L'assemblage s'enregistre append-only dans `fitness.release_pack`.

### Termes colorés (langage constant)

**🟨 OR (Or)**
Le noyau / source — figé, exécutable, vérité humaine. « Ce qui doit être vrai. »

**🟦 TURQUOISE (Turquoise)**
Le code / projection — libre, dérivé, jetable, écrit par l'IA. « Comment c'est fait. »

**🟥 ROUGE (Rouge)**
Le cliquet / mur / régression — la frontière, l'application, la vague de rouge. Ne pas confondre avec « erreur ».

**🟩 VERT (Vert)**
Prouvé / réconcilié — un miroir vivant qui passe. « La preuve qui tient. »

**🟪 VIOLET (Violet)**
L'évolution — recherche ouverte, variantes, archive, self-play, auto-modification. Ne pas confondre avec « premium » ou « spécial ».

---

Cette section de GLOSSAIRE couvre exhaustivement les 80+ termes ubiquitaires de KRD/AIDOS, vérifiés contre KRD.md, CONTEXT-MAP.md, et les cinq CONTEXT.md des subsystèmes. Chaque terme est défini précisément, ses confusions courantes explicitement listées, et leur place dans l'architecture ou la méthode clarifiée.

---

Perfect! The section is complete. Let me verify it's comprehensive and return it:

## LES DEUX AXES — la verticale couplante et l'octuor des facettes

### La grille : niveau × facette

Toute vérité dans KRD porte **deux coordonnées indépendantes** qui définissent sa place dans un système à deux axes :

1. **La verticale** (l'axe latéral, couplant) — le **niveau d'abstraction** dans l'architecture logicielle, du produit aux données : `produit → parcours → vue → contrôle → action → opération → entité`. C'est où la vérité se situe dans le flux de composition.

2. **La facette** (l'axe orthogonal, séparant) — la **nature** de la vérité, son type de propriété parmi huit lentilles indépendantes : **F** (fonctionnel) · **I** (invariants, ∀ universel) · **S** (sécurité) · **B** (budgets, performance) · **R** (fiabilité, résilience) · **V** (évolutivité, migration) · **M** (maintenabilité & architecture) · **X** (expérience, utilisabilité — soft vérité). C'est quoi on mesure dans le kernel.

**L'intersection de ces deux axes forme une grille** : chaque cellule (niveau, facette) est une **vérité déterministe** qu'on peut localiser, modifier, et observer indépendamment.

```
                    NATURE (facettes, orthogonales →)
                 F      I      S      B      V      M      X
  produit      [cell] [cell] [cell] [cell] …
  parcours     [cell] …
  vue          …
  contrôle     …                ← chaque cellule = un kernel complet
  action       …                    (6 paires-miroir × nature)
  opération    [cell] [cell] [cell] …
  entité       [cell] [cell] …

(↑ verticale, l'axe latéral, couplant)
```

Exemple : « l'invariant ∀ de l'opération checkout » occupe la cellule (opération, I) ; « le contrat de performance de la vue panier » occupe la cellule (vue, B).

### Pourquoi la verticale **couple** (elle n'est pas orthogonale)

Les **facettes sont orthogonales** : régler la sécurité (S) d'un kernel n'affecte jamais sa performance (B). Elles ne s'interagissent pas — elles sont des **lentilles indépendantes sur le même squelette 6-paires** du kernel (Spec → Comportement → Scénarios → Modèle → Contrat → Evidence ↔ ses reflets).

La **verticale, elle, n'est pas orthogonale : elle COUPLE par composition**. Une vérité posée à un rung bas (entité) **contraint tous les rungs source au-dessus** qui la composent ou la consomment. Un invariant défini sur une entité `Order` s'impose sur l'opération qui la crée, l'action qui l'invoque, le contrôle qui la déclenche, la vue qui l'affiche, le parcours qui l'utilise, et le produit qui l'énonce.

**Quand une vérité basse change, le red wave remonte cette ligne** : la vague de rouge marque stale tous les rungs au-dessus qui en dépendent, forcément à **facette constante**. Le changement de la donnée (entité, niveau bas) invalide la sécurité de l'opération (S) — pas la performance (B) à moins que la performance dépende aussi de cette donnée. C'est le **cross-produit latéral** (§EL14) : une contrainte attachée à un rung s'étend à tous les rungs source, mais elle reste dans sa colonne de facette.

### Résumé des deux lois du système de coordonnées

**Loi 1 — Résolution (déterminisme)** : une vérité à des coordonnées (niveau, facette) résout toujours à la même cellule de la grille. Même kernel, même facette → même hash content-adressé. Le ContextRouter expose cette cellule comme un bloc déterministe.

**Loi 2 — Mark à facette constante (propagation)** : quand un kernel bas change, le red wave marque stale les rungs au-dessus **dans la même colonne de facette**. Une entité (F, fonctionnel) qui change marque stale l'opération au-dessus (même F), l'action (même F), etc. Le mark ne traverse jamais une facette : si on change F (fonctionnel) en bas, on ne rougit jamais une déclaration de B (budgets) au-dessus, parce qu'elles sont indépendantes.

**Loi 3 — Orthogonalité (isolation)** : un changement sur une facette ne touche jamais une autre facette. Modifiez la sécurité (S) d'une opération, les sept autres facettes (F, I, B, R, V, M, X) restent intactes. Le red wave ne saute pas de colonne.

### Les sept rungs source de la verticale

KRD distingue **sept niveaux source** (par opposition aux niveaux de projection, générés par l'IA) :

| Niveau | Artefact de vérité | Rôle | Autorité |
|--------|------------------|------|----------|
| **produit** | Énoncé de capacité, critères d'acceptation | SOURCE | humain, au-dessus du mur |
| **parcours** | Parcours utilisateur (Gherkin) | SOURCE | humain, au-dessus du mur |
| **vue** / écran | Spec-écran (but, zones, données affichées) | SOURCE | humain, au-dessus du mur |
| **contrôle** | Bouton/contrôle (existe, libellé, visible-si P, actif-si Q, déclenche action) | SOURCE | humain, au-dessus du mur |
| **action** | Action (event → invoque opération O(args) ; succès→effet ; erreur→effet) | SOURCE | humain, au-dessus du mur |
| **opération** | Operation DSL (steps typés : validate/authorize/read/mutate/return) | SOURCE | humain, au-dessus du mur |
| **entité** | Schéma de données (LinkML — le modèle) | SOURCE | humain, au-dessus du mur |

Ces sept niveaux forment une **verticale couplante** : chaque rung repose sur ceux en dessous par composition. Une vue (rung 3) compose une ou plusieurs entités (rung 7) ; une action (rung 5) invoque une opération (rung 6).

### L'octuor des huit facettes (FK02)

Les huit facettes canoniques forment l'**octuor** de KRD — l'ensemble clos de lentilles indépendantes sur lesquelles on peut poser une vérité. Aucune ne se réduit à une autre ; toutes sont orthogonales.

| Facette | Nom | Propriété vérifiée | Miroir type | Collapsible |
|---------|-----|-------------------|-------------|-----------|
| **F** | Fonctionnel | « Le comportement est correct par l'exemple » | Fixture, Gherkin, e2e | Non — F est incompressible |
| **I** | Invariants | « La propriété est vraie sur *tous* les chemins (∀) » | Property test, Fast-Check | Oui |
| **S** | Sécurité | « L'accès et les données sont sûrs selon le modèle de menace » | Évals injection, gosec, gitleaks | Oui |
| **B** | Budgets, Performance | « Les ressources (CPU, mémoire, latence, requêtes) sont dans le budget » | Benchmark, k6, profiling | Oui |
| **R** | Fiabilité, Résilience | « Le système tolère les pannes, se récupère, peut revert/rollback » | Chaos test, meter de déploiement, recovery drill | Oui |
| **V** | Évolutivité, Migration | « Les changements de schéma sont non-destructifs (expand-contract) et les données survivent » | Migration forward-only, snapshot de déploiement | Oui |
| **M** | Maintenabilité & Architecture | « La structure déclarée (frontières, dépendances) coïncide avec la structure réalisée » | Dépendances du code, architecture linter, graphe ADR | Oui |
| **X** | Expérience, Utilisabilité | « L'UX est utilisable, accessible (a11y/i18n), mesurée par A/B, télémétrie » | Hypothèse typée (ExperienceClaim), A/B, usabilité | Oui, et soft (advisory) |

**La facette F (fonctionnel) est toujours présente** — c'est l'incompressible du kernel. Sans elle, il n'y a pas de kernel. Les sept autres facettes s'ajoutent selon la nature de la vérité : une fonction pure de tri porte F + I + M ; un endpoint PII user-facing porte les huit ; une vue déclarative peut n'avoir que F + X.

**X (expérience) est la seule facette soft** (§13.6) : sa paire de preuve manquante reste **consultative** — elle informe la décision sans jamais la bloquer. Les sept autres facettes sont **dures** : une paire requise manquante ou divergente est un **monstre** — une faille de sécurité (S), une régression de performance (B), une migration qui perd (V), un invariant non prouvé (I), une architecture malsaine (M) sont des monstres au même titre qu'un test fonctionnel manquant (F).

### La conscience : agrégateur sur les deux axes

Le kernel contient une **conscience déterministe** (§FKE-6.3) — un comparateur structurel qui :

- **Long de l'axe facette × mur** : compare les paires de preuve (dessus déclaré ↔ dessous prouvé) *dans* chaque cellule (niveau, facette) — la symétrie du bicaméralism.
- **Le long de l'axe verticale** : propage le red wave quand une paire diverge — les rungs au-dessus qui composent ce niveau se retrouvent marqués stale, à facette constante.
- **Orthogonalité** : jamais elle ne rougit une facette saine en changeant une autre.

Le verdict global du kernel passe en **DÉRIVE** (rouge) dès qu'une paire DURE (F/I/S/B/R/V/M) diverge. X ne le fait jamais basculer seule — elle ne peut que conseiller.

### ContextRouter : la cellule déterministe

Quand on demande le contexte pour un changement, le **ContextRouter** (un algorithme, pas un prompt) :

1. Localise la cellule (niveau, facette) affectée par le changement.
2. Charge la grille 7 × 8 et identifie toutes les cellules qui en **dépendent compositionellement** (les rungs source, même facette).
3. Retourne un **ContextPack minimal** : le kernel, ses miroirs, les contrats croisés, la mémoire scopée — rien que ce qu'il faut pour juger la cohérence.

Zéro inflation : le contexte est proportionnel à l'impact, jamais au graphe global.

### Cas d'usage : marquer une cellule quand elle vieillit

Supposons que l'entité `Order.shipmentDate` change de type (`DateTime` → `Date`). C'est un changement au niveau **entité, facette F** (fonctionnel). Le red wave :

- Marque stale l'opération `createOrder` (F) — elle retournait un `Order`, le type a changé.
- Marque stale l'action `checkout-submit` (F) — elle invoque `createOrder`.
- Marque stale le contrôle `checkout-button` (F) — il déclenche l'action.
- Marque stale la vue `orderDetail` (F) — elle affiche `shipmentDate`.
- Marque stale le parcours (F) — il mentionne le `shipmentDate`.
- Marque stale le produit (F) — « l'utilisateur voit la date d'expédition » est cassé.

**Mais ne marque PAS** : les facettes S (sécurité), B (budgets), etc. Le changement de type n'affecte pas les droits d'accès — la colonne S reste verte. Il ne change pas les budgets à moins que le nouveau type ne consomme plus de mémoire — ce n'est pas compris implicitement, la colonne B reste verte.

C'est ça, l'**orthogonalité** : huit colonnes indépendantes, une seule vieillit.

### Collapsibilité des facettes (anti-explosion)

Pas tout kernel n'instancie toutes les facettes. Le kernel **n'expose que les facettes de sa nature** :

- Une **fonction pure de tri** : F (doit fonctionner) + I (doit préserver une propriété ∀, ex: l'ordre) + M (code lisible) = 3 facettes. Pas de S (pas d'entrée sensible), pas de B/R/V/X.
- Un **endpoint PII user-facing** : les 8. Il doit fonctionner (F), être sûr (S), résilient (R), performant (B), migratable (V), maintenable (M), avec un invariant (I), et UX agréable (X).
- Une **vue déclarative read-only** : F (affiche bien) + X (agréable à lire) = 2 facettes.

Le kernel **ne porte que les facettes de sa nature**. Chacune instanciée réclame sa paire de preuve vivante. C'est le **kernel effondré** (§FKE-1.3) : l'incompressible c'est F + sa paire ; le reste est modulaire.

Une facette **vide** (déclarée mais sans contenu) est refusée — c'est un monstre de design, pas une vérité.

### Les deux axes en résumé

| Axe | Caractéristique | Mécanisme | Exemple |
|-----|-----------------|-----------|---------|
| **Verticale** | Latéral, couplant | Un rung repose sur ceux en dessous ; un changement bas marque stale les rungs source au-dessus | Changer `Order.shipmentDate` rougit `createOrder`, l'action, le bouton, la vue, le parcours, le produit — tous au niveau F |
| **Facette** | Orthogonal, séparant | Huit lentilles indépendantes ; un changement sur l'une ne touche pas les autres | Changer `Order.shipmentDate` (F) ne rougit pas la facette S (sécurité) ou B (budgets) |
| **Mur** | Plan de symétrie | Traverse les deux axes ; sépare intention (dessus, humain) de preuve (dessous, code) | Une vérité de sécurité se déclare au-dessus du mur, s'implémente en-dessous |
| **Conscience** | Synthèse | Comparateur déterministe qui lit les paires de TOUTES les facettes instanciées et produit un verdict global | Si S diverge, le kernel drifte en rouge ; si X seule diverge, verdict reste vert avec advisory |

Cette dualité — **verticale couplante** + **facettes séparant** — est le cœur de l'architecture KRD. Elle permet à la fois la **propagation d'impact** (quand le fondement change, les consommateurs le savent) et l'**isolation des préoccupations** (la sécurité ne peut pas accidentellement bloquer la performance).

---


## LES MIROIRS & LA CERTIFICATION

### Les trois formes de miroir selon la nature de vérité

KRD établit une correspondance stricte entre la nature d'une vérité (le *kind* de couche) et la forme que doit prendre son miroir (le langage de certification qui le prouve). Cette classification en trois formes garantit que chaque vérité est falsifiée par le moyen le plus adapté à son essence logique.

#### N0 — Journey / Parcours d'acceptation → Gherkin (BDD)

Le parcours utilisateur vit au sommet du noyau : une séquence d'étapes Given/When/Then qui trace un chemin causal *complet et déterministe* à travers le système. Son miroir est une **acceptation Gherkin** exécutée par **Godog** (Go) sur le back et **Playwright + playwright-bdd** (TypeScript) sur le front.

- **Forme :** `.feature` ubiquitaire — même vocabulaire en Go et Next.
- **Exécution :** déterministe, chaque diff, pre-commit.
- **Autorité :** above the line — écrit par l'humain, test-as-goal, elle *définit* le vrai.
- **Cert_language :** `gherkin` (rang 17/20 au bench KRD, LLM=5, Exéc=5, Src=4, Gar=3).

#### N1 — Invariant (∀) → Property test (fast-check / rapid)

Une règle qui *doit tenir sur toutes les situations possibles* n'est pas épinglée par un exemple unique : elle l'est par une propriété universelle. Un invariant métier (« jamais un user d'un tenant ne lit les données d'un autre ») se prouve par **property-based testing** — des centaines d'entrées aléatoires générées, toutes testées contre la propriété.

- **Forme :** **fast-check** ou **Hypothesis** (front/back).
- **Exécution :** déterministe (PRNG semencé), pré-commit, rejeu du même seed = même résilience.
- **Autorité :** above the line (humain pose la propriété, l'IA juge de la conformité).
- **Cert_language :** `fast-check` ou `rapid` (rang 17/20, même trinity que Gherkin).

#### N2 — Workflow / Use-case fonctionnel → Fixture état→cmd→events

Un comportement fonctionnel épisodique (un seul parcours concret dans une cellule) s'exprime par une **fixture** : état initial → commande invoquée → événements produits + état final observé. C'est le contrat opérationnel dans sa forme la plus pure, consommable comme oracle, jamais recopié.

- **Forme :** fixture `{ given, command, then }` — interprétée par l'Operation DSL en Go ou XState en front.
- **Exécution :** exécution exacte du parcours en isolation, déterministe, rejouable.
- **Autorité :** above the line (humain valide le fixture canonical, gelé).
- **Cert_language :** `fixture` ou `xstate` (XState = rang 18/20, le meilleur du bench, spec=code).

### Le champ `cert_language` et la ligne pragmatique/formel

Chaque miroir porte quatre champs critiques qui composent son identité de certification :

| Champ | Sens | Valeurs |
|---|---|---|
| **`test_kind`** | La catégorie de test : quoi prouve-t-on ? | `acceptance \| e2e \| property \| fixture \| contract \| schema \| unit \| snapshot \| meter` |
| **`cert_language`** | Le langage *exécutable* qui certifie. **DOIT être un sensor déterministe.** | `gherkin \| xstate \| fast-check \| zod \| pact \| type-check \| k6 \| fixture \| rapid \| …` |
| **`liveness`** | Le miroir est-il vivant (exécutable) ou mort (orphelin) ? | `alive \| dead` |
| **`formal_cap`** (optionnel) | Cap formel rare (preuve formelle sur le design, au-dessus du code). | `z3 \| tla+ \| dafny \| alloy \| uppaal` |

**La règle qui ferme la boucle :** un miroir dont le `cert_language` n'est **pas exécutable comme sensor déterministe** (prose seule, LLM-judge en solitaire) **ne compte pas** pour la loi de complétude. C'est une présence trompeuse. KRD banit les preuves qui ne peuvent se rejour automatiquement.

### Le bench de KRD — pragmatique vs formel

KRD évalue les candidats miroirs selon quatre axes déterministes : pilotabilité par l'IA (`LLM`), exécutabilité comme sensor (`Exéc`), unicité de source (`Src`), force de garantie (`Gar`). Le **pragmatique** est la colonne (scores 15–18, homogènes et fiables) ; le **formel** est un cap chirurgical rare (12–14, coûteux, appliqué seulement si la violation est **catastrophique ET l'espace dépasse l'échantillonnage**).

#### Verdict par niveau

| Niveau | Pragmatique (spine) | Score | Formel (cap, si nécessaire) | Score |
|---|---|---|---|---|
| **N0** Intention / Parcours | **Gherkin** (ubiquitaire, exécutable) | 17 | TLA+ (si distribué/concurrent) | 13 |
| **N1** Invariant (∀) | **property-based** (fast-check/rapid) | 17 | Z3 · Datalog (si catastrophe auth/RGPD) | 14 |
| **N2** Workflow | **XState** (spec=code, zéro duplication) | 18 | model-check statechart (si sûreté critique) | 14 |
| **N3** Contrat / Frontière | **LinkML → Zod/Pydantic** (+ Pact inter-cellules) | 18 | Alloy (si graphe structurel inexprimable) | 12 |
| **N4** Code / Unité | **tests + TDD** + typage strict (TS/mypy) | 17 | Dafny (si fonction pure critique : crypto, monétaire) | 14 |
| **N5** Infra / Adaptateurs | **Pact provider** + tests d'intégration | 17 | — (aucun formel : le monde extérieur se teste, ne se prouve) | — |
| **Transverse** Budgets | **SLO + Semgrep/k6** | 15 | UPPAAL (temps-réel dur seul) | 12 |
| **Transverse** Données | **migration fixtures / snapshots prod** | 16 | Z3 réutilisé (invariant de donnée catastrophe) | 14 |

**Principe de promotion au formel :** le formel n'entre qu'en deux conditions cumulées : (a) la violation est **catastrophique** (argent, auth, vie privée, ordre distribué) ET (b) l'espace d'entrées **dépasse l'échantillonnage** (concurrence, entrées non bornées, interaction logique profonde). Tout le reste tourne en pragmatique. Par défaut, un projet tourne **entièrement** sur la colonne pragmatique — le formel est le rare cap humain.

### Le plan bicéphale — spec et miroir, un seul corps deux têtes

Tout vit en double : une **couche spec** (l'intention, au-dessus du mur) et son **miroir exécutable** (la preuve, la tête-preuve). Ils sont reliés par le lien `mirrors` et co-versionnés — jamais l'un sans l'autre.

**Exemple — le contrôle (bouton).**

```
# PLAN SPEC — la vérité, gelée
control "checkout-button" {
  view: "cart"
  visible_when: $.cart.items.length > 0
  enabled_when: $.form.valid && !$.submitting
  triggers: action "checkout-submit"
}

# PLAN MIROIR — la preuve, cert_language: fixture
mirror reflects "checkout-button" {
  given { cart: { items: [] } }
    → button.visible == false
  given { cart: { items: [x] }, form.valid: false }
    → button.enabled == false
  given { cart: { items: [x] }, form.valid: true }
    → button.enabled == true
}
```

**La vague de rouge commence ici :** tu changes `enabled_when` → le hash du control change → **le miroir vire au rouge en premier** (il ne reflète plus la version cible) → *puis* la projection (le composant web/mobile rendu). Le miroir est le premier capteur. C'est spec-first → miroir-first → codegen-last.

### La loi de complétude — pas de monstre

> **Loi de complétude :** toute couche spec a **au moins un miroir vivant exécutable** du `test_kind` requis par son `kind`. Un miroir mort (non-exécutable) ou orphelin (pointant vers une cible supprimée) est un **monstre**.

**Monstre = le nom de l'échec :** spec sans miroir, ou miroir sans spec valide. Précisément ce qu'interdit la loi.

**Les deux raisons de monstre :**
1. **`no_truth_without_mirror`** : une couche a oublié son miroir du `test_kind` requis. Exemple : une opération (N2) déclare le `test_kind: fixture`, mais nul miroir fixture n'existe ; elle a des tests unitaires (N4) mais pas le fixture N2.
2. **`no_orphan_mirror`** : un miroir pointe vers une cible supprimée ou sa version n'existe plus en noyau (liveness=dead).

**Détection :** le hook Stop exécute la porte completeness (S12 en AIDOS). À chaque diff, PostToolUse rejour le test du miroir ; si rouge → work-in-progress accepté. À Stop, la porte refuse si un monstre subsiste.

### L'extension facet-aware — l'octuor et les huit paires

KRD v8+ (FKE, Fractal Kernel Engineering) étend la loi de complétude en la **multipliant par huit facettes orthogonales**. Une couche ne se prouve pas seulement en fonctionnel (F) — elle se prouve sur huit lentilles : **Fonctionnel · Invariants · Sécurité · Budgets · Fiabilité · Évolutivité · Maintenabilité · Expérience** (F, I, S, B, R, V, M, X).

#### L'octuor des facettes

| Lettre | Facette | Qu'on prouve | Exemples de cert_language |
|---|---|---|---|
| **F** | Fonctionnel | Correct par l'exemple (toujours présent, incompressible) | fixture, gherkin, xstate |
| **I** | Invariants | Vrai partout (∀) — règles universelles | fast-check, rapid, property |
| **S** | Sécurité | Sûr (injections, policies, scans) | z3 (rare), semgrep, rapid |
| **B** | Budgets | Viable (perf, coût, latence) | k6, benchmark, meter |
| **R** | Fiabilité | Résilient (chaos, failover, restore) | chaos-testing, fixture d'incident |
| **V** | Évolutivité | Durable (migrations expand-contract, sans perte) | migration fixture, snapshot prod |
| **M** | Maintenabilité | Sain (structure déclarée ↔ proven architecture) | depguard, go-arch-lint, type-check |
| **X** | Expérience | Utilisable (WCAG, clarté, conversion) | a/b-test, heuristic review, meter |

**La facette X est molle :** sa paire manquante est **advisory** (informe, ne bloque pas Stop). Les sept autres sont dures — un monstre d'une facette dure bloque.

#### La loi de complétude récursive (FKE-1.3)

> **Pour chaque facette DÉCLARÉE d'une couche, il doit exister une paire de preuve VIVANTE (living) ET exécutable de cette facette. Une paire manquante ou morte sur une facette instantiée est un monstre — une faille de sécurité, une régression de perf ou une migration qui perd de la donnée sont des monstres, au même titre qu'un test fonctionnel manquant.**

**Exemple concret :** une opération `createOrder` déclare les facettes [F, S, B]. Elle doit avoir :
- une paire **F** vivante (fixture état→cmd→events) — sinon monstre F ;
- une paire **S** vivante (property-test ou Z3 sur le policy d'authz) — sinon monstre S ;
- une paire **B** vivante (k6 budget perf, ou meter) — sinon monstre B.

Si l'une manque, Stop est bloqué (sauf X qui est advisory). La conscience (l'agrégateur déterministe) les compare une à une et rapporte lesquelles divergent.

### Les quatre opérateurs du miroir — validation, exécution, conscience, loopback

**Validation :** la porte d'intention (FK02) — le noyau déclare ses facettes instanciées ; un validateur refusait un kernel sans F (incompressible) ou avec une facette déclarée sans sa paire de preuve.

**Exécution :** l'Evidence Runner (FK03) — réexécute tous les miroirs vivants (toutes les facettes instanciées, toutes les paires) et produit un Evidence rapport.

**Conscience :** l'agrégateur déterministe (FK06) — compare les huit paires (ou moins, facettes effondrées) une à une, aligne sur le verdict :
- **Aligné** : toutes les paires concordent.
- **Drift** : une paire diverge (spec et preuve ne s'accordent pas) → loopback ciblé.

**Loopback ciblé :** sur divergence d'une paire (quelle que soit la lentille), une vague de rouge **ciblée** qui remonte exactement au slot dessus concerné, jamais une avalanche globale.

### Le monstre-hunting — l'injection de faute

L'injection de faute (boucle ④, SessionStart hook) est la **chasse au monstre** : pour chaque miroir, on casse exprès la source, on vérifie que le miroir vire au rouge ; un miroir qui ne réagit pas est **mort**, ce qui rend la source un monstre.

```go
pour chaque miroir m:
  casser_la_source_de(m)
  assert m.vire_au_rouge()  // sinon : monstre détecté
```

C'est une tautologie vérifiée à chaque session : aucun monstre ne peut s'y glisser sans déclenchement immédiat.

### L'enregistrement `Mirror` — la structure complète

```yaml
Mirror:
  id: "m-checkout-button-f"
  reflects:       # → layer @version reflétée (le lien 'mirrors' est pinné version)
    layer_id: "checkout-button"
    version: "v1"
  
  test_kind:      # le type de test : acceptance | e2e | property | fixture | contract | …
  cert_language:  # le langage exécutable : gherkin | xstate | fast-check | zod | pact | type-check | k6 | fixture | …
                  # DOIT être exécutable comme sensor déterministe (prose seule → exclue)
  
  facet:          # FK04+: la facette prouvée par ce miroir (F/I/S/B/R/V/M/X)
  authority:      # above (humain, test-as-goal) | below (IA, test-as-means)
  liveness:       # alive | dead (une source cassée ou un miroir orphelin = DEAD = MONSTRE)
  
  formal_cap?:    # (optionnel) z3 | tla+ | dafny | alloy | uppaal — rarement, si catastrophe ∧ espace
  
  # La source du miroir, stockée en Postgres, matérialisée sur disque pour le runner :
  source:         # le fichier .feature (Gherkin) | fixture JSON | property code snippet | …
  materialized_path:  # /tests/... ou /mirrors/...
```

Un miroir sans `cert_language` exécutable, ou dont la `liveness` est `dead`, n'est qu'une présence trompeuse — il ne compte **pas** pour la complétude.

### Résumé — les trois formes, la ligne pragmatique, la loi

| Forme | Niveau | Cert_language | Autorité | Bloc Stop ? |
|---|---|---|---|---|
| **Gherkin** | N0 | `gherkin` | above (humain) | oui (si F manquant) |
| **Property** | N1 | `fast-check`, `rapid` | above (humain) | oui (si I manquant) |
| **Fixture** | N2 | `fixture`, `xstate` | above (humain) | oui (si F manquant en N2) |
| **Zod/Pact** | N3 | `zod`, `pact`, `type-check` | below (IA) | oui (si contract invalide) |
| **Tests + types** | N4 | `unit`, `type-check` | below (IA) | oui (si unit rouge ou types manquants) |
| **Pact provider** | N5 | `pact` | below (IA) | oui (si adaptateur ne tient pas contrat) |
| **Budgets** | ⊥ | `k6`, `semgrep`, `meter` | below (IA) | oui (si budget dépassé) |

**Le pragmatique est la colonne — tout projet tourne ici par défaut.** Le formel (Z3, TLA+, Dafny) entre seulement si catastrophique ET inéchantillonnable.

**Pas de monstre → Stop passe. Un monstre → blocked, détail du BlockReason listé, route `/completeness` affichée, humain doit réparer.**


## Le Cycle de Vie — De l'idée à la phase stable

Le cycle de vie KRD relie deux acteurs — l'intention humaine et la vérité exécutée — par une succession de phases bien définies, jamais de mutation silencieuse. Il traverse cinq étapes majeures : la capture d'idée, le défi (_grill_), l'exploration (_spike_), la promotion en vérité, et la stabilité.

### Capture et provenance de l'idée

Une idée naît de deux sources exclusives :

**Source humaine** — une personne exprime une intention (« finalement je veux que… ») ou propose un comportement manquant. Le lien de provenance enregistre : qui a voulu quoi, quand, sur quel contexte. Un seul énonçant, une seule idée, jamais fusionnée silencieusement.

**Source incident** — un incident de production, un bug rapporté, ou une divergence mesurée entre le comportement observé et le miroir (une RealityMirror) génère une idée candidate : « le système croit X, mais la réalité dit Y ». La provenance pointe l'incident source.

L'idée est un **candidat-vérité** — elle porte une intention en prose ou une esquisse, mais reste **non falsifiable** jusqu'à son miroir. Pas de gel de version, pas de test associé à ce stade : c'est la différence structurelle avec une vérité du noyau.

```yaml
Idea:
  proposes:    # la couche visée : control | action | operation | entity | policy | …
  intent:      # le comportement cible, in prose
  provenance:  # human:"énoncé" | incident:ID (qui, quand, pourquoi)
  status:      # draft → grilled → spiking → harvested → rejected
```

### Le défi : `/grill` et sélection de trajectoire

Aussitôt l'idée capturée, elle entre dans une session de grillage — une interview déterministe qui défie l'intention :

- **L'idée est-elle claire et falsifiable ?** Si oui → `/grill` valide la trajectoire, elle est prête pour le miroir.
- **L'idée est-elle floue, conditionnelle, ou hors-scope ?** → Route vers `/spike` (exploration en mode cliquet OFF, rigueur T0) : la preuve de concept vit hors-kernel, fichiers jetables, aucune gouvernance.
- **L'idée est-elle manifestement mauvaise** — contradiction déjà connue, inconsistente avec une loi, hors autorité ? → Rejet tracé (toute trajectoire rejetée est enregistrée pour l'audit).

Le `/grill` conforte aussi le vocabulaire ubiquitaire et la ContextMap — si l'idée demande une redéfinition d'un terme ou une fusion de cellules, c'est détecté maintenant. Le CONTEXT.md du projet est mis à jour ; une ADR est amorcée si décision architecturale.

### Exploration contrôlée : `/spike`

Quand une idée est floue, une session `/spike` la dissèque en conditions, variantes et hypothèses. Cet étage **désactive le cliquet** :

- Aucun hook de complétude ne s'applique.
- Aucun ChangeSet n'est ouvert ; les fichiers vivent dans une branche ou un dossier `.spike/`.
- Le cliquet computational se ferme, mais la rigueur T0 s'applique : les tests du spike doivent passer localement.
- L'archive ne les ingère pas — ce sont des données de construction, pas de production.

À la fin du spike, la leçon découverte est **harvested** — extraite sous forme d'une nouvelle idée, nette et falsifiable. Les détails du spike sont jetables ; seule la morale remonte.

### Promotion en vérité : écrire le miroir

L'idée grillée ou harvested devient **vérité** au moment où son **miroir est écrit**. Le miroir est le test comportemental *avant* tout code :

- Pour un comportement de flux (journey, N0) : un scénario **Gherkin** `Given / When / Then`, exécuté par Godog (back) ou Playwright+playwright-bdd (front).
- Pour une règle universelle (invariant, ∀) : un **property test** (rapid en Go, fast-check front) — tous les chemins la satisfont.
- Pour un workflow d'état (N2) : une **fixture** (état → commande → événements) interprétée par le moteur Operation DSL en Go.

Ce miroir s'enregistre dans le schéma `mirrors` Postgres — pas fichier jetable, mais source persévérante. Il devient **rouge** par construction (c'est le test-first) : aucun code n'existe encore pour le passer. Ce rouge **est le goal**.

### Le ChangeSet : l'enveloppe transactionnelle

Le passage de la vérité (spec + miroir) du brouillon au noyau se fait dans un **ChangeSet**, l'enveloppe atomique qui enregistre :

1. La delta spec (la mutation du noyau, hash-adressée, immutable une fois appliquée).
2. Le miroir associé (ou plusieurs, si la vérité couvre plusieurs niveaux).
3. Métadonnées : qui demande le changement, quand, la trace d'autorité requise, la provenance de l'idée.

Le ChangeSet traverse trois états exclusifs :

| État | Signification | Sortie possible |
|---|---|---|
| **DRAFT** | Brouillon, delta muté, miroir rouge, code en chantier | → APPLIED ou suppression |
| **APPLIED** | Mouche, spec + miroir ensemble dans le kernel | → REVERTED (crée un ChangeSet inverse) |
| **REVERTED** | Annulé, un ChangeSet inverse a ramené l'état antérieur | Terminal (append-only) |

**Pas d'état FAILED** : un ChangeSet qui échoue gravement (conflit dur, violation de scope, refus d'un hook) est **supprimé**, pas marqué échoué — suppression logique en Postgres, mais tracée (un log immédiat enregistre l'objet supprimé). Un revert crée un **nouveau ChangeSet inverse** qui ramène spec ET miroir ensemble — garantie bicéphale : spec et miroir ne dérivent jamais dans le temps.

### La vague de rouge et le ChangeSet appliqué

Quand un ChangeSet est appliqué (la spec entre au noyau), un hook **PostKernelChange** déclenche la **vague de rouge** :

1. **Les miroirs** — tous ceux qui reflètent cette couche spec passent au rouge, d'abord.
2. **Les projections** — les émetteurs (codegen) recalculent les artefacts dérivés (API, DB, types TS, UI web, UI mobile, contrats) — autant de tâches qui passent au rouge.
3. **Le cliquet se ferme** — la boucle interne TDD commence : l'agent reconcie rouge → vert en modifiant le code, pas le noyau. PostToolUse refuse un write au noyau tant qu'un miroir est rouge.

L'ordre compte : miroir d'abord (il est la preuve), puis projections. Les projections ne sont jamais au-dessus du miroir rouge — ce qui l'empêcherait de vérifier la source.

### La boucle interne : red → green

La boucle interne est la **réconciliation code** — elle se déplace sur l'axe temporal (pas vertical). Tant que le miroir est rouge :

- L'agent modifie le code (projections, implémentation), pas le noyau.
- Chaque modification déclenchait PostToolUse : les capteurs computationnels (linters, type-checkers, tests unitaires) valident le changement local ; les tests du miroir tournent.
- Quand le miroir passe au vert, la boucle interne clôt ce ChangeSet.

Le temps ici mesure en minutes ; c'est la déduction — appliquer une connaissance figée (le noyau) à un code qui évolue.

### Complétude : pas d'orphelin

Avant de finaliser un ChangeSet (passage à APPLIED), un hook vérifie la **loi de complétude** :

- La spec a-t-elle un miroir vivant ?
- Le miroir reflète-t-il la spec (le champ `reflects` de Mirror est résolu) ?
- Pas d'orphelin : spec sans miroir (un vœu) ou miroir orphelin (une preuve qui ne prouve rien).

Violation → ChangeSet bloqué au stade DRAFT, jamais appliqué. Le message d'erreur en provenance du hook **BlockReason** explique : « tu as modifié l'entité Order, mais son schema.test est orphelin — écrire d'abord le test ou revert la spec ».

### Semantic Diff et blast radius

Chaque ChangeSet appliqué génère un **SemanticDiff** — une classification de la mutation :

| Type | Sens | Exemple |
|---|---|---|
| **add** | Couche nouveau | Nouveau control `delete-item` |
| **refine** | Enrichir sans briser | Ajouter un champ optionnel à Order |
| **override** | Remplacer le comportement | Changer la règle de calcul d'une Policy |
| **rescope** | Changer la portée | Un invariant local devient global |
| **deprecate** | Marquer obsolète | Une opération est remplacée par une autre |
| **reweight** | Changer les priorités | Augmenter le poids d'un budget SLO |

Le SemanticDiff calcule aussi le **blast radius** — quels niveaux, quelles cellules, quels contrats sont affectés. Si le blast radius dépasse un seuil d'autorité (ex. : un override demande Product + UX), le ChangeSet demande approbation humaine avant APPLIED.

### DataTruthScope : la vérité des données existe séparément

Changer la vérité du code ne change pas automatiquement la vérité des données déjà produites. Un ChangeSet déclare explicitement :

```yaml
DataTruthScope:
  applies_to:
    - new_records      # la nouvelle vérité vaut pour les nouvelles données
    - existing_records # ou : la nouvelle vérité remonte aux données anciennes (demande migration)
    - historical_records
  migration:
    required: true | false
    strategy: expand_contract | backfill | dual_read | dual_write
```

Exemple : une règle de remboursement nouvelle s'applique aux demandes futures, mais les remboursements anciens existent sous l'ancienne vérité. Un ChangeSet qui ignore ce split crée un monstre : la même entité avec deux vérités, selon l'âge. KRD **force** la déclaration.

### TruthLifecycle : la succession versionnée

Une vérité ne *meurt* jamais par suppression — elle meurt par **succession versionnée**. Un ChangeSet marque une vérité `deprecated` avec :

```yaml
TruthLifecycle:
  status: active | deprecated | shadowed | removed
  sunset_date: …
  replacement: …  # la vérité qui la remplace
  migration_plan: …
```

Ainsi, l'audit, le rollback, la compatibilité client et les migrations ont toujours accès à la vérité morte : elle existe, versionnée, avec ses miroirs et son autorité d'époque.

### Phase stable et DAG des versions

Une **phase stable** est une coupe cohérente : tous les liens se résolvent, tous les capteurs verts, tous les miroirs vivants. Elle n'existe **pas** en un seul endroit (pas un fichier de version) — c'est une **branche du DAG** des ChangeSet à un commit donné.

Le DAG n'est **pas** une ligne :

- **En avant** : ouvrir `/goal`, appliquer des ChangeSet, atteindre une nouvelle phase stable.
- **En arrière** : checkout d'un ancêtre (une phase stable passée), on reprend de là.
- **Latéralement** : brancher, créer une ligne d'expérience (variantes, evolutions, spike).

Le cycle de vie de KRD est une **navigation du DAG**, de phase stable en phase stable, par des `/goal` qui ouvrent puis drainent des vagues de rouge. Et comme le versioning est permanent, cette suite de transitions ne se termine jamais — c'est le système vivant, en permanent calibrage vers la stabilité.

### Propagation pondérée et agrégat récursif

Quand un ChangeSet est appliqué, la vague de rouge ne tombe pas *aveuglément* sur toutes les projections. Une **propagation pondérée** décide quoi recalculer :

- Un refinement d'une Policy peut déclencher le re-test des invariants dépendants.
- Une vérité locale ne trigger la recalcul que des variantes (cells/bounded contexts) qui l'importent.
- Les poids (priorités, SLO, budgets) sont déclarés au kernel, pas appris — jamais une boucle n'édite sa propre fitness.

À chaque niveau, les vérités se composent : une couche agrège les vérités de ses enfants et ajoute sa vérité émergente. Le ChangeSet propaguant remonte cette composition récursive — ce qui assure qu'aucune variante ne brise silencieusement sa mère.

### Condition d'arrêt : `/goal` non-gameable

Un `/goal` a une condition d'arrêt **déterministe, non-contournable** :

```
red set → green
  ∧ vert antérieur intact (aucune régression)
  ∧ mutation score ≥ seuil (changement significatif)
  ∧ aucun monstre (complétude OK)
```

Pas de « l'agent se sent confiant ». Pas d'auto-notation. Le juge — le miroir vert + la réalité — est hors de portée de l'agent. Done est **calculé**, jamais déclaré.

### Mur et défense en profondeur

À chaque étape du cycle, le **mur** empêche les mutations silencieuses :

1. **Hook PreToolUse** — refuse un write au noyau, aux miroirs, ou à la fitness. Retourne un `BlockReason` actionnable.
2. **Postgres GRANT** — l'agent n'a aucun droit d'écriture sur `kernel`, `mirrors`, `fitness`. Seul un ChangeSet approuvé (via une opération MCP dédié, rôle Postgres `aidos_writer`) peut muter la vérité.
3. **Stop hook** — demande vérification manuelle avant d'appliquer un ChangeSet critère (high blast radius, crossing authority, rescope globale).

La seule porte vers le noyau est : `Idea → Miroir → /Goal → ChangeSet (DRAFT) → Completeness Check → APPLIED → red wave → boucle interne → vert → stable`.

### Boucles imbriquées et cycles de temps différents

Le cycle de vie s'inscrit dans un système imbriqué de quatre boucles, opérant à des échelles de temps différentes :

| Boucle | Nom | Temps | Portée | Moteur |
|---|---|---|---|---|
| **① Interne** | TDD (red→green) | minutes | un ChangeSet, code reconciliation | `/goal` + mirrors verts |
| **② Moyenne** | Évolution | heures | variantes d'implémentation, search QD | `/evolve` + fitness bounds |
| **③ Externe** | Induction | jours | apprentissage d'incidents, stratégie archivale | incidents → idées |
| **④ Méta** | Détection de défauts | semaines | injection de faute, audit, renforcement guards | `self-test` + hooks vivants |

Aucune n'édite sa propre fitness — chaque boucle lit une fitness déclarée (au noyau), ne la juge jamais elle-même.

Voilà le cycle de vie KRD : de l'intention floue à la phase stable prouvée, jamais de silence, jamais de régression invisible, chaque mutation tracée et testée avant de geler.

---


## Le Workbench — L'interface de gouvernance de l'OS

Le Workbench est l'interface visuelle par laquelle l'humain pilote AIDOS. Ce n'est pas un dashboard passif : c'est le cockpit opérationnel où chaque projection KRD devient visible, interrogeable, et où chaque décision de vérité transite par une route validée. **Tout se fait par écran** — aucune capacité headless ; la complétude de l'UI est une loi (`ui-completeness`, ADR 0060).

### Vue d'ensemble : Une session, cinq lentilles

Le Workbench V3 (ADR 0060) abandonne l'approche plate d'une liste d'écrans pour adopter une **architecture logique centrée sur la session**. Une seule session partagée (`V3Session.tsx`), **cinq lentilles** — autant de perspectives sur le même état — organisées en **cinq groupes de parcours utilisateur** (ADR 0060, V3Nav.tsx) :

| Groupe | Lentilles | Intention |
|---|---|---|
| **Concevoir** | Lab (chat) · Specs · Operation · Policy · Kernels | Capturer l'idée, écrire le comportement |
| **Comprendre** | Parcours · Grille · Anatomie · Liens · Why-Tree · Arbres · Conscience · Cellules · Version-DAG · History | Lire la vérité, visualiser les dépendances, rejouer |
| **Construire & déployer** | Code · Emetteurs · Environnements · Instance | Générer, déployer, provisionner |
| **Faire évoluer** | Evolve · Bench · Arch-Fitness · Design | Chercher variantes, mesurer fitness, améliorer |
| **Réglages** | Paramétrage | Lire les déclarations (lecture seule) |

Chaque lentille est une **route `/v3/<nom>`** qui affiche une **projection déterministe** du même état : il est structurellement impossible que deux écrans divergent puisqu'ils lisent tous depuis le même provider `useV3Session()` et que tout ce qui n'est pas le transcript lui-même est **recalculé par fold pur** (ADR 0060, §2).

### Le chat : Une grammaire fermée, le réducteur comme loi

L'AI Lab (`/v3/lab`) est le centre névralgique. C'est une vraie conversation — bulles, saisie épinglée, Entrée envoie — **mais avec une grammaire d'intentions complètement fermée** et déclarée (ADR 0057). Le LLM n'y existe que comme **exception gatée de désambiguïsation** ; l'autorité réside dans le réducteur pur.

**Les 9 intentions canoniques** (ADR 0057, ADR 0058, ADR 0059) :

1. **Capturer l'idée** (`capturer_idee`) — l'idée monte en `hasMirror = false`
2. **Greffer** (`greffer`) — accrocher une branche au composé
3. **Promouvoir** (`promouvoir`) — ouvrir un `/goal` (ChangeSet DRAFT)
4. **Mesurer l'impact** (`impacter`) — projeter la vague de rouge
5. **Interroger l'état** (`interroger`) — lire la composition, le noyau, l'historique
6. **Déployer** (`deployer`) — proposer une phase stable en production (gaté ADR 0052)
7. **Refuser** (`refus`) — l'intention était ambiguë ou incomprise
8. Variantes liées : ouvrir un écran, lire un paramètre, explorer le graphe

**Le pipeline déterministe** (ADR 0057, §2–4) :

- **`classifyIntent(message)`** : algorithme **lexical pur** (tokens NFD, lexiques déclarés par intention avec verbes forts +2, indices faibles +1, tri et ordre stable). Jamais un prompt au LLM. Produit un score par intention.
- **`understand(scores)`** : le verdict est une **donnée exposée** — le candidat net en tête (`comprise`), une égalité détectée comme ambiguïté (`ambigue` — l'écran offre les chips cliquables), ou `incomprise` si aucun score ne dépasse le seuil. Jamais une invention silencieuse.
- **`applyIntent(état, message, verdict)`** : un **réducteur pur event-sourcé** (`(état, message) → (état', événements, impacts)`, déterministe, append-only). La réponse n'est jamais de la prose libre ; ce sont les **événements typés du jeu clos** (`idee_capturee`, `arbre_greffe`, `kernel_propose`, `impact_calcule`, `etat_lu`, `deploiement_propose`, `refus`).

Si le message est ambiguë, l'écran peut demander à Claude (via Claude CLI avec `claude-fable-5`, l'exception gatée) de **reformuler** en une phrase d'intention claire — mais cette phrase **repasse par le même pipeline déterministe** (`understand`/`applyIntent`). Le code juge ; le modèle propose ; toute panne → `null`, repli sur les chips déterministes, jamais un effet silencieux.

**Le mur dans le chat** : aucune intention ne produit une écriture-vérité directe. Les idées restent `hasMirror = false`, les kernels proposés restent `wroteKernel = false` (ChangeSet DRAFT), les déploiements sont proposés jamais exécutés. C'est une propriété d'invariant testée par fast-check sur 14 scénarios verts (ADR 0057, §7).

### L'historique : Le rejeu pur comme conséquence

Il n'existe pas de « fonctionnalité undo ». L'historique (`/v3/history`) est une **conséquence mécanique** de l'event-sourcing (ADR 0060, §2). Le twin pur `front/web/lib/v3/session.ts` grave la loi :

- **`replayTo(messages, n)`** = le **fold du réducteur** `applyIntent` sur les n premiers messages — l'état n'est jamais stocké, il est **rejoué**.
- **`turnsOf(messages)`** = une annotation du transcript entier : un `SessionTurn` par message (index, message, understanding, events, impacts, l'état final calculé).
- **Le miroir** (`lib/v3/session.test.ts`, 14 propriétés vertes) épingle : rejeu ≡ fold ∀ transcript, déterminisme, l'état à n ne dépend jamais des messages > n (revenir en arrière est sûr par construction), totalité aux bornes.

Revenir en arrière = rejouer un préfixe. Bifurquer = un nouveau transcript depuis un préfixe. Aucun mécanisme d'undo ; aucune divergence de state possible. **La complétude de l'historique est calculée, non déclarée.**

### Les lentilles conceptuelles : Les 28 projections KRD

Au-delà du chat, le Workbench rend visible chaque niveau de KRD. Vingt-huit écrans (~28 lentilles) portent le modèle conceptuel complet :

**Concevoir (5 lentilles)** :
- `/v3/specs` — les N0 (scénarios d'acceptation approuvés) + statut Gherkin
- `/v3/operation` — les N2 (workflows, état → commande → événements)
- `/v3/policy` — les policies déclarées (règles transverses)
- `/v3/kernels` — l'arbre du noyau, ses liens `composes`

**Comprendre (10 lentilles)** :
- `/v3/parcours` — graphes React Flow (le composé projeté en nœuds + arêtes, positions déterministes par profondeur/rang, bijection certifiée)
- `/v3/grille` — la grille niveau × facette (l'anatomie FKE complète)
- `/v3/anatomie` — les six paires-miroir (s1↔s10, s2↔s9, s3↔s7, s4↔s5/s6)
- `/v3/liens` — le graphe des six types de liens (causé_par, compose, repose_sur, etc.)
- `/v3/why-tree` — l'arbre des raisons (pourquoi rouge ? qui dépend de quoi ?)
- `/v3/arbres` — les sous-arbres du composé (arborescences navigables)
- `/v3/conscience` — la conscience (l'agrégateur déterministe des jugements : miroir vivant, complétude, SemanticDiff, RealityMirror, sensors)
- `/v3/cellules` — les cellules (bounded contexts, les divisions fractales du noyau)
- `/v3/version-dag` — le DAG de versions (branches, merges, phases stables)
- `/v3/history` — l'historique rejeu (le transcript annoté)

**Construire & déployer (4 lentilles)** :
- `/v3/code` — éditeur VS Code live (serveur OpenVscode sur l'hôte, container-based, route Traefik, gaté par token)
- `/v3/emetteurs` — les générateurs (Go → TS types, Postgres DDL, web/mobile projections, les états d'émission)
- `/v3/environnements` — l'échelle de déploiement (dev, staging, prod, branchements data-aware, ADR 0059)
- `/v3/instance` — l'instance en cours (serveur, runtime, sonde d'état)

**Faire évoluer (4 lentilles)** :
- `/v3/evolve` — l'EvolutionSandbox (variantes, QD, archive, recherche)
- `/v3/bench` — les mutations et les fitness (score, verdicts)
- `/v3/arch-fitness` — l'analyse d'architecture (dépendances, violations, ArchUnit)
- `/v3/design` — le design lab (explorer des variantes d'interface, de workflow)

**Réglages (1 lentille)** :
- `/v3/parametrage` — **les données déclarées en LECTURE SEULE** : les 9 intentions, les scales, les niveaux, les facettes, les formes de miroir, les seuils, l'autorité, les agents, les modèles LLM connus. Aucun champ d'édition ; le seul bouton est « Proposer un changement », qui compose une phrase et l'envoie dans le chat — le chemin idée → miroir → `/goal` → approbation humaine, le mur intact (ADR 0060, §6).

### Principes de conception

**Bilingue par défaut** (ADR 0011) : le français est la langue de l'interface et des documents ; une seconde langue (l'anglais) est toujours disponible via un sélecteur de langue. Les strings statiques vivent dans `front/web/messages/{fr,en}.json` (via `next-intl`, sans routage par préfixe — la locale est un cookie `NEXT_LOCALE`). Les textes dynamiques (contenu métier, entités) sont traduisibles via la table Postgres `i18n` (`key, locale, value`, FR requis et fallback).

**Design tokens, jamais de hardcode** (ADR 0010) : le Workbench adopte la palette ccup « design-to-fullstack » (zinc + blue-600) sur **Tailwind v4 + shadcn**, **Geist**, rayon `0.5rem`. Chaque écran utilise les **variables CSS déclarées** (`bg-background`, `text-foreground`, `bg-primary`, `border-border`, etc.), jamais `hex` ou classes brutes `zinc-*`. Le thème est swappable en un fichier (`front/web/app/globals.css`). Les applications émises héritent de ce système de tokens par défaut.

**Divulgation progressive, zéro jargon obligatoire** (ADR 0060, §5) : la surface parle français simple (« Votre idée a été ajoutée », « Impossible de déployer : il faut d'abord passer par staging »). Le vocabulaire KRD demeure optionnel, rangé dans un bloc replié « Détails techniques » accessible pour qui veut. Les états vides accueillent (`« Commencez par décrire votre idée… »`) au lieu d'exposer des structures vides. La rigueur ne baisse pas ; elle change d'étage.

**Tout ce qui s'affiche est calculé pur, jamais stocké** : chaque lentille est une projection déterministe. Les graphes sont positionnés par calcul (profondeur = X, rang de fratrie = Y, bijection certifiée). Les états sont rejeu de transcript. Les impacts sont la vague recalculée. Les lois sont des propriétés de tests vertes, jamais des conventions honorées.

**Aucune capacité headless** : l'UI-completeness est une loi. Si une opération existe, elle a un control (`/action` gesture) qu'on peut invoquer et atteindre depuis une route V3. Une opération sans route est un monstre.

### Continuité : V1, V2, V3

- **V1** (160 écrans d'experts, vocabulaire KRD complet) : conservée, accessible via un lien de sortie « Workbench complet ».
- **V2** (27 écrans refondue par concept, cycle de vie entier dans `/v2/builder`) : conservée, base à partir de laquelle V3 compose ses twins et son réducteur.
- **V3** (nouvelle route `/v3`, UI-enduser, 5 groupes + 28 lentilles, session event-sourcée, 9 intentions fermées, zero jargon obligatoire) : additive, aucune réécriture des deux précédentes (ADR 0060, §7).

Les twins V3 (`lib/v3/session.ts`, `lib/v3/flow.ts`, `lib/v3/params.ts`) **composent** les twins V2 ; corriger le réducteur corrige le builder V2 ET la session V3.

### Le système déclaré en lecture

Le paramétrage (`/v3/parametrage`, ADR 0060 addendum) projette **la surface déclarée ENTIÈRE** via le twin pur `lib/v3/params.ts` : agents avec leur harnais (modèle, droits du mur, stop conditions, budgets), modèles LLM connus, l'échelle A0–A8, les budgets du harnais (5 caps), l'adoption T0–T4, le catalogue de behaviors, les autorités (7 types de vérité + graphe d'autorité), les 6 types de liens, les 6 paires-miroir. **Seules les données déclarées entrent** — jeux clos, grammaires, seuils, jamais de rows de démo. Le miroir (`lib/v3/params.test.ts`, 20 propriétés vertes) épingle déterminisme, forme, couverture, et chaque cardinalité déclarée.

### La loi de couverture totale

Une propriété `lib/v3/coverage.test.ts` balaie le système de fichiers réel et prouve : **∀ écran V1 + ∀ concept V2 + ∀ lentille V3 → « ouvre l'écran <slug> » résout dans le chat**. Un écran ajouté qui n'est pas résolu fait rougir le test. Les collisions de noms (auth/app-auth, lab/ai-lab) sont départagées par un bonus de slug exact. Le pendant visible : l'annuaire « Tous les écrans » dans Paramètres — tout `state.screens` en liens réels, groupés V3/V2/V1.

### OpenQuestions

- **Persistance du transcript par projet** — la session vit aujourd'hui en mémoire d'écran ; la ranger (Postgres) donnerait des sessions reprises et partageables.
- **Branches d'histoire nommées** — rejouer un préfixe permet de bifurquer, mais les branches ne sont ni nommées ni conservées (un DAG de transcripts attendrait).
- **Palette étendue aux gestes KRD** — `/grill`, `/spike`, `/goal` comme phrases canoniques du chat, chacune son twin et son miroir.
- **Multi-utilisateur sur le Code** — un seul serveur VS Code partagé aujourd'hui ; le par-utilisateur (container par session, vraie authentification) est une décision d'infra à part.

---

*La Workbench est AIDOS faisant corps avec la vérité qu'elle gouverne : aucune décision ne se prend hors écran, aucune capacité n'existe sans sa route, aucune lentille ne peut diverger de la vérité parce qu'elles la lisent toutes du même event-stream, rejeué à chaque vue. La fermeture de la grammaire du chat et le repli déterministe sur les chips transforment l'UX conversationnelle en mécanique certifiée.*

---


## La Passerelle & Déterminisme

### La Passerelle : Une porte HTTP unique, tout le reste est MCP

La **passerelle** (`back/runtime/gateway/`) est l'unique point d'entrée par lequel le front Next.js conversationnel communique avec le moteur Go qui gouverne la vérité. Elle n'est pas un broker neutre : c'est une **couture architecturale** qui impose deux disciplines — **une source unique vivante** et **un déterminisme implicite** dans chaque appel.

**Architecture de la passerelle.**

La gateway tourne en HTTP à côté de `next start`, sur le port `AIDOS_GATEWAY_HTTP_ADDR` (défaut `:8787`), dans le même déploiement que le Workbench. Elle est déclarée à l'environnement du runtime Next via `AIDOS_GATEWAY_HTTP_URL`. Quand un écran du Workbench doit lire ou modifier de la vérité — kernel, miroirs, idées, changesets, mémoire, contexte — il n'exécute **jamais** cette opération localement : il appelle `gateway_call(scope, tool, args, decoder, demo)` qui dispatche l'appel **in-process** vers le serveur MCP approprié de la flotte Go (`back/mcp/*`). Le dispatch est déterministe (pure fonction de l'outil + des args) et rapide (< 50 ms en régime).

**Les 90 serveurs MCP enregistrés.**

Chaque opération backend — aucune exception — est exposée en tant qu'outil MCP. La flotte compte ~90 serveurs `back/mcp/*` : `store` (lectures kernel/mirror), `changeset` (enveloppe transactionnelle), `dag` (phases stables, branchement), `idea-intake` (porte au-dessus du kernel), `mirror-runner` (exécution des preuves), `memory` (pgvector + firewall), `context` (ContextRouter), `evolve` (sandbox + variants), `backtester` (archivage), `sensors` (telemetry), `pact-verifier` (contrats), et d'autres encore. Chacun implémente un **contrat (schéma Zod)** qui donne au routeur (et au frontend) la forme exacte des entrées et sorties. La registry `back/runtime/gateway/registry.go` est la liste d'autorité : un écran ne déclare « live » que les outils enregistrés.

**Le mur tient à la couture.**

La gateway n'ouvre pas une porte arrière d'écriture sur la vérité. Elle authentifie (`authgate.go`), elle autorise (scope → permissions Postgres via les GRANTs du rôle `aidos`), elle achemine. Une écriture kernel/mirrors/fitness ne part jamais directement d'un écran : elle emprunte la porte légale (idée → miroir via `/goal` → ChangeSet approuvé → écriture Postgres atomique). Si le front envoie `gateway_call(..., writeKernel, ...)`, la passerelle le refuse avec un `BlockReason` explicite (`AGENT_WRITE_ABOVE_WATERLINE`). Le fallback démo (une fixture gelée locale, quand la gateway est indisponible) est **toujours gouverné** : l'écran affiche un bandeau « mode aperçu — moteur indisponible », aucune écriture n'est tentée, et tout résultat affiché à partir du fallback est **re-vérifié par le moteur** dès que la gateway revient.

**Anti-fallback-silencieux.**

Un test e2e Playwright **échoue si un écran retombe en twin sans le déclarer**. La fault-injection coupe la gateway ; l'écran doit basculer explicitement en mode aperçu (bandeau visible + lectures seules), jamais prétendre « live » alors qu'il sert une logique TS locale. C'est l'une des quatre non-gameable anchors (miroir, out-of-sample, réalité, injection de faute).

### Source unique vivante : le moteur Go, jamais les twins

**Le problème des jumeaux (twins).**

Avant l'ADR 0092, le frontend réimplémentait en TypeScript la logique métier de lectures kernel/mirrors, avec la passerelle en fallback. En pratique, l'effet était inverse : le moteur Go **dormait** (seulement 15 serveurs dispatchés pour 174 panneaux ; **16 écrans live**, ~194 twins-logique tournant comme source réelle) tandis que ~194 réimplémentations TS causaient la **dérive twin↔Go** et violaient le principe de source unique.

**La décision : éliminer les twins.**

Le moteur Go (`back/*`) est désormais la SEULE source vivante. Aucun twin TS n'est jamais le chemin live. Le chemin live = `readVia(scope, tool, args, decoder, demo)` avec `source:"live"` garantissant une passerelle armée + outil existant + contrat en place. Les seules exceptions strictement bornées :

1. **Fixture de démo** (`lib/*-data.ts`) : conservée comme FALLBACK déterministe quand la gateway est constatée indisponible, jamais la source, toujours marquée `source:"demo"`.
2. **Logique-pure-client-UX** (évaluateur Expr à la frappe, réducteur d'édition optimiste, routeur optimiste) : feedback instantané **re-vérifié par le moteur** avant persistence. Le cœur déterministe correspondant est exposé en outil passerelle (`expr_eval`, `operation_build`, `wall_route`).

**Le cliquet anti-retour.**

Un hook + arch-fitness (`dependency-cruiser`) **interdit** qu'un panneau affiche une donnée vérité à partir d'un twin-logique en dehors d'une frontière `source:"demo"`. Un **mirror de parité** par serveur dispatché prouve `Decoder TS == sortie Go` (la TS n'invente jamais, elle décode juste).

**Plan d'élimination (tranches, en cours).**

- **T0** : figer la vérité terrain (16 live, ~194 twins, 45 fallback conservés).
- **T1** : doublons d'un moteur DÉJÀ dispatché (15 serveurs) : supprimer le twin, garder le `Decoder`. ~15-20 panneaux.
- **T2** : serveur Go existe mais hors `serverBuilders` : ajouter un builder lazy. ~40-50 panneaux.
- **T3** : needs-new-tool : paquet Go existe sans serveur → scaffolder le serveur. ~23 panneaux.
- **T4** : client-UX : exposer ≤15 cœurs déterministes ; TS survit en fallback re-vérifié.
- **T5** : armer le cliquet anti-retour dès T1.

### Déterminisme-First : Code autorité, LLM exception gatée

**La loi centrale.**

Tout ce qui **peut** être une fonction pure **DOIT** être du code, jamais un agent ou un LLM. Parsing, validation, hashing, diff, routing, scoring, rendu, sélection de contexte — ce qui est calculable est calculé. L'LLM est la **gated exception**, isolé à l'irréductible génération/jugement, et vérifié **déterministiquement** (schéma, re-check, mirror).

**Trois plans appliquent cette loi.**

| Plan | Lieu | Application |
|---|---|---|
| **Toolchain AIDOS** | Agent qui code AIDOS | Diff = `git`/`jj`/Myers (algo), jamais « agent diff » ; search = `rg` ; format = `biome`/`gofmt` ; arch = `dependency-cruiser`. Le code autorité remplace le jugement. |
| **Runtime AIDOS** | Moteur qui gouverne des projets | ContextRouter = algorithme (`redwave.Impact`, `ContextPack.compile`), jamais « LLM context selector ». Weights déclarés, jamais appris. Routing = pur code. |
| **Emitted-app coder** | Générateur qui émet du code utilisateur | Emitters déterministes (source → AST → projection), LLM pour la génération bridée par le miroir + revue computationnelle à chaque diff. |

**Le juge est déterministe.**

Un diff n'est jugé que par une fonction pure (`SemanticDiff`, tests, linters, mirrors, property tests). Un second agent validant un premier agent **n'est pas une preuve** — c'est du bruit réducteur de toil. La preuve vient du miroir (une propriété, un invariant, une fixture gelée) et de la réalité (telemetry out-of-sample, RealityMirror). Jamais de « LLM as judge » seul.

**Trois régimes de sensors.**

- **Computational** (pre-commit) : déterministe, ms-s, l'agent s'auto-certifie seul. Typecheck, lint, tests de fixture, property tests, archtest, mock-policy.
- **Inferential** (post-intégration, guarded) : revue LLM, mutation testing — réduit le toil, ne retire pas l'autorité humaine.
- **Meter** (continu, hors cycle) : budgets temps/tokens/perf, audit entropie, drift de glossaire.

**Déterminisme et bruit.**

Un agent ne doit jamais :
- Générer une spec (code/prose) qui décide de ce qui doit être vrai — c'est le noyau (humain).
- Évaluer sa propre sortie comme « correct » — c'est le miroir.
- Concevoir un contexte global ad-hoc pour chaque appel — c'est le ContextRouter.
- Apprendre des poids et des seuils — ce qui en sort n'est jamais reproductible.
- Déclarer que « c'est assez bien, on balance » — le cliquet n'a que deux états : rouge (bloqué) ou vert (passé).

**Pas de circulairé.**

Le code que l'agent écrit pour passer un test **ne peut pas réécrire ce test**. L'IA qui code une opération ne peut pas modifier son miroir. La boucle de fitness du Runtime ne peut pas ajuster sa propre définition du « passé ». Ce qui peut mentir sur soi-même ne gouverne rien.

---

**Résultat.**

La passerelle restaure l'autorité du moteur (une seule source vivante, le Go). Le déterminisme-first restaure l'autorité du code et du miroir (plus de jugement ad-hoc). Ensemble, ils enferment l'LLM dans un rôle : complète et refactorise du code pour passer des tests donnés — liberté maximale là où elle est sûre, zéro liberté là où elle ment.

---


## LES APPS ÉMISES

Chaque projet AIDOS produit une **application complète** — pas une démonstration, mais une vraie application multi-plateforme, codée intégralement depuis ses specs déclarées (entités, opérations, invariants, contrôles), émise par des compilateurs déterministes byte-stables et déployée par une infrastructure-as-code versionnée. L'application émise est l'**objet construit**, distinct de l'OS AIDOS qui la construit.

### Frontière constructrice ≠ construite

AIDOS (la constructrice) et l'app émise (la construite) vivent dans **deux stacks radicalement différentes**, séparées par une frontière explicite.

| Aspect | AIDOS (constructrice) | App émise (construite) |
|--------|----------------------|----------------------|
| **Langage backend** | Go (gouvernable, interpréteur Operation-DSL) | TypeScript pur-fonctionnel (Hono) |
| **Framework front** | Next.js (Workbench, le moteur) | React (web) / React Native Expo (mobile) / Electron (desktop) |
| **Datastore** | Postgres (vérité, append-only, content-addressée) | Postgres (prod) ou Doltgres (hors-prod, git-for-data) — même dialecte |
| **ORM/client DB** | sqlc + pgx (Go) | Client TypeScript typé (postgres.js / Drizzle / Kysely — slot *replaceable*, S88) |
| **Migrations DB** | Atlas (expand-contract, neutres au langage) | Atlas (réutilisé tel quel) |
| **Gouvernance** | Sous le mur : kernel/mirror/fitness figés, agent sans GRANT write | Below-the-line : app écrit son schéma, jamais les vérités d'AIDOS |
| **Déterminisme** | Émetteurs purs (mêmes specs → mêmes octets Go) | Émetteurs purs (mêmes specs → mêmes octets TS) |

**Décision centrale (ADR 0040, addendum 2026-06-14).** L'app émise n'est pas *une* application — c'est **une seule spec qui se projette vers N plateformes**. À partir d'une **source unique** (entités · opérations · invariants · vues · contrôles · policies, content-addressée au-dessus du mur), AIDOS émet **trois enfants distincts et simultanés**, chacun une projection déterministe :

1. **Web** — app React servie par Hono (SSR ou API + client `hc` typé, tranché S93)
2. **Mobile** — app Expo / React Native bootable sur ios/android (EAS build)
3. **Desktop** — app Electron (électron-builder, packagée avec le serveur Hono)

Tous les trois héritent du **même modèle de types** (`TargetTSTypes`, partagé) et du **même client de données typé** (client Hono `hc`). **Une source → trois cibles.** Aucune des trois ne peut diverger sans modifier la spec ; changer la spec refait les trois.

### Le substrat gelé embarqué par défaut

Chaque app générée embarque la **pile infrastructure complète et vivante** (ADR 0076), jamais une coquille creuse. Toute capacité du substrat est soit **réellement utilisée sur un chemin vivant prouvé par miroir**, soit **explicitement déclassée level-3** (référence/non-déployé, affichée honnêtement à l'écran).

| Service | Rôle | Statut |
|---------|------|--------|
| **Hono (backend)** | Router HTTP, handlers typés par opération, « functional core, imperative shell » | Mandatory, réellement utilisé |
| **Sidecar interpréteur Go** | Exécute les opérations (Operation-DSL interprété) via callback depuis Hono | Mandatory, une seule source d'interprétation autoritaire, jamais réimplémentée |
| **Postgres/Doltgres** | Données persistantes, dialecte Postgres unique, même sqlc/pgx/Atlas | Mandatory (Postgres prod, Doltgres hors-prod via ADR 0006/0065) |
| **Atlas** | Migrations expand-contract déclaratives, append-only, versionées | Mandatory, réutilisé from AIDOS |
| **OpenTelemetry → Postgres** | Spans tracés en `telemetry.span` (puits persistant), on-ramp pour `/learn` et `RealityMirror` (S43) | Mandatory, client OTLP/HTTP vers collecteur partagé |
| **NATS** | Bus d'événements, outbox async (op écrit en base → publie), consommation prouvée par miroir | Mandatory, réellement utilisé |
| **Valkey (Redis)** | Cache de lecture (`GET /entities`), cache-hit court-circuite la base, prouvé par miroir | Mandatory, réellement utilisé |
| **Windmill** | Workflows, opérations async (S73/S74), conteneur déployé par stack ou partagé | Mandatory, réellement routé ou déclassé level-3 honnêtement |
| **Better-Auth** | Middleware de session, lié à `AUTH_URL`, `$.auth` une session vérifiée (pas un header local) | Mandatory |
| **Fumadocs / Scalar** | Docs auto-générées (API schema, guides) | Mandatory, émises par défaut |
| **Connecteurs MCP** | Gateway MCP vers services externes (la piste connecteurs) | Mandatory, ou déclassé level-3 si endpoint non atteignable |

**Chaque ligne ci-dessus porte sa trace d'exécution** (miroir vert) ou son statut honnête (level-3, non-actif). Pas de troisième état : « présent mais muet » est un monstre — écarté par le mur (complétude).

### Architecture du déploiement réel par projet × env

Le déploiement de l'app émise (bundle Hono/TS + sidecar interpréteur Go) est provisionné par **Pulumi en TypeScript pur-fonctionnel** (ADR 0043, addendum 2026-06-13), une **stack par projet × environnement**.

| Composant | Détail |
|-----------|--------|
| **Infrastructure-as-Code** | Pulumi/TS (`TargetPulumiProgram` émis depuis `StackManifest`) — une fonction pure totale byte-stable (mêmes specs → mêmes octets) |
| **Provider** | `@pulumi/docker` pour le déploiement self-hosted actuel (Traefik + Let's Encrypt) ; `future_cloud` (K8s / Fly / RDS via interop HCL native, même programme) |
| **Traefik (reverse-proxy)** | v3, mandatory, réseau externe `traefik_default`, labels Traefik complets, routage par `Host(<stack>.sagedesk.fr)`, priorité 1000 pour primer le wildcard dev-preview |
| **Conteneurs émis** | `<project>-<env>-server` (Hono), `<project>-<env>-interpreter` (sidecar Go), `<project>-<env>-datastore` (Postgres prod / Doltgres hors-prod) |
| **Volumes** | `<project>-<env>-vol`, mount du datastore, append-only |
| **Healthcheck** | `pg_isready` sur le datastore, routage conditionnelle |
| **Env vars** | `DATABASE_URL` (conteneur datastore par nom), `OTEL_EXPORTER_OTLP_ENDPOINT` (collecteur), `NATS_URL`, `VALKEY_URL`, `AUTH_URL`, `WINDMILL_URL` |
| **Exécuteur** | `aidospulumi up/down --project <p> --env <e>` (Go binary), backend state Pulumi auto-hébergé (fichier, scopé projet) |

**Déterminisme-first respecté** : l'émetteur Pulumi est pur (même manifest+env → programme byte-identique) ; le programme émis est FN02-pur (pas d'IO, pas d'horloge, pas de RNG, pas de global mutable, cycles détectés par `dependency-cruiser`) ; le plan Pulumi (`preview`) est déterministe pour (programme, providers épinglés, state). **L'agent écrit le code infra au build**, jamais dans la boucle runtime (CLAUDE.md §8).

### Les trois enfants live visibles

Le Workbench affiche **« voir le site en construction »** en temps réel (ADR 0063) : trois cadres côte à côte (ou empilés sur mobile) montrent la même app émise sur trois surfaces.

| Surface | Vue | Capture |
|---------|-----|---------|
| **Web** | Navigateur (barre d'URL, trois points), l'adresse dev du projet (`https://<project>-<env>.sagedesk.fr`) | Iframe directe ou fetch dans la frame |
| **Mobile** | Téléphone Expo (encoche, ratio 9:19), app Expo Go ou EAS build | Iframe du bundle web emporté sur mobile, même client `hc` typé |
| **Desktop** | Fenêtre Electron (feux tricolores macOS, bande de menu, full-screen possible), la VRAIE app Electron | CDP screenshot (Chromium DevTools Protocol intégré à Electron, pas de VNC — ADR 0093) |

Les trois cadres sont **une même projection pure** (`emitApp(state)`, l'émetteur déterministe S57) recalculée à **chaque rendu**, donc rafraîchie à chaque tour de chat. Les trois affichent :
- Navigation par route émise (onglets)
- Cartes par entité (Order, Cart, User, etc.)
- **Idées capturées en indices de contenu** (verbatim, jamais reformulées ni inventées)
- État vide amical quand l'app est vide

**Honnêteté (ADR 0093).** Sans backend attaché, le renderer desktop affiche l'**erreur de fetch réelle** (`GET /entities/Order` échoue sur `file://`) — c'est le vrai comportement de l'app headless. Aucun stub injecté, aucun mensonge. Attacher le backend live (données réelles) est une OpenQuestion documentée (additive, non bloquante — le « voir » capture la structure, pas l'état).

### L'opération aux deux niveaux : sidecar Go + handler Hono

L'**Operation-DSL** (la grammaire comportementale) s'exécute en **un seul endroit** — **le sidecar interpréteur Go** — et jamais réimplémentée ailleurs (déterminisme-first, une seule source d'interprétation autoritaire, ADR 0040 Décision 7).

```
Handler Hono/TS (valide, route, projette)
    ↓ POST /interpret
Sidecar Go (operation.Interpret VERBATIM)
    ↓
Seams (Validator / Authorizer / Reader / Mutator)
    ↓ (via pgx)
Schéma app émise (Postgres)
    ↓ résultat + événements
Handler retour (json typé)
```

**Le pont State↔DB vit ENTIÈREMENT dans les seams** (`operation.Deps`) :
- **`MemDeps`** (seams en mémoire) — le chemin logique-pur du miroir
- **`DBDeps`** (le pont pgx réel) — `READ = SELECT`, `CREATE = INSERT … RETURNING *` (id content-addressé via `records.Hash`), `CLEAR = DELETE` (safe, jamais de table wipe)

Le sidecar n'écrit **que** les tables de l'app émise, jamais les vérités d'AIDOS (`kernel` / `mirrors` / `fitness`). La frontière du mur est matérielle : GRANT Postgres niveau-3 interdit les autres schémas.

**Réalisé et prouvé** (`back/runtime/interpretsvc/` + `back/cmd/aidosinterpreter/`, 13 miroirs tous verts) : le service booте, `curl /interpret` retourne un `Order` réel, même input+state → même effet (property), les miroirs HTTP passent, Testcontainers + Postgres réel confirment read/insert/delete.

### Déterminisme et mur inchangés

- **Émetteurs byte-stables** : chaque plateforme (web/mobile/desktop) est une projection déterministe de la source (même Kernel → mêmes octets, par cible).
- **Le sidecar n'écrit aucune vérité** : il réutilise `operation.Interpret` (la source d'interprétation, jamais dupliquée) et n'écrit que le schéma app émise (below-the-line).
- **Une source, N plateformes** : la plateforme est une **dimension** de la projection, jamais une seconde déclaration. Le mur, le mirror-first et les neuf phases du contrat de step restent intacts (garde ajoutée, jamais retirée).

### Isolation et résilience — de vraies apps dans du vrai code

L'app émise n'est pas un prototype, une démo, ni une simulation. C'est une **vraie application TypeScript + Go** :
- Elle s'exécute sur le même Postgres que AIDOS (ou un Doltgres distinct en hors-prod pour git-for-data).
- Elle enregistre la télémétrie en Postgres via le puits OTel→Postgres.
- Elle publie des événements NATS réels, avec un miroir de consommation.
- Elle cache via Valkey réel.
- Elle utilise une session Better-Auth réelle.
- Elle peut être versionnée, branchée, mergée comme du code (parce qu'elle EST du code, émis).

Chaque projet est **isolé** par couple `(project_id, environment)` — deux projets en dev ne partagent ni URL, ni base, ni Windmill, ni Valkey. Le déploiement crée une **stack Pulumi unique** par couple, avec ses propres conteneurs, volumes, health-checks, logs, et traces OTel.

### Pas de hand-editing, jamais

Tout code émis (`gen/<project>/` pour l'app, `gen/<project>/infra/` pour Pulumi) est **régénéré** à chaque compilation de la source. Hand-editor un fichier généré le marque comme divergence au prochain build — violation du déterminisme. Le seul texte « généré » qu'un humain édite est **au-dessus du mur** : entités, opérations, contrôles, policies — tout en Postgres, content-addressé, versionné, mirrorisé.

---

Excellent. J'ai maintenant tous les éléments nécessaires. Je vais composer la section sur le cerveau du produit.

## Le cerveau du produit — mémoire contextuelle, rappel par similarité et firewall

Le **cerveau** (ou `/brain`) de l'OS AIDOS est le store de mémoire moteur : contexte carburant, jamais vérité. Il est composé de quatre couches indexables, stockées en pgvector natif sur la base Postgres unique, protégées par un firewall qui empêche toute mémoire de court-circuiter le noyau.

### Structure du cerveau : quatre mémoires indexables

La mémoire du produit KRD se déploie en **six catégories** (KRD §136), mais seules **quatre sont indexables** — accessibles par rappel de similarité :

| Catégorie | Caractère | Indexabilité | Rôle |
|---|---|---|---|
| **Épisodique** | Contexte temporel des exécutions | Indexée | Traces d'exécution, incidents, logs, événements observés |
| **Sémantique** | Langage ubiquitaire, glossaire, patterns | Indexée | Vocabulaire partagé, définitions, conventions du domaine |
| **Procédurale** | Gestes réutilisables, skills, recettes | Indexée | Procédures, workflows, séquences d'étapes, bonnes pratiques |
| **Structurelle** | Cartes de contexte, graphes de dépendance | Indexée | Relations entre bounded contexts, topologie, liens |
| **Working** | Fenêtre de contexte courante | Non indexée | Volatile, vit dans la pile d'exécution (S33, Context Pack) |
| **Évolutionnaire** | DAG de versions, variantes, stepping stones | Non indexée | Archive de qualité-diversité (S21, Archive QD) |

Les quatre premières sont persistantes et rappelables ; les deux dernières résident ailleurs : `working` dans le context pack compilé, `evolutionary` dans le DAG de versions (back/archive/).

### Le `/brain` comme carburant contextuel, jamais vérité

**Principe fondateur (KRD §119.1) :** un `MemoryItem` n'entre JAMAIS dans le noyau (`/kernel`) directement. La seule route légale est :

```
Memory → ContextPack → Idea → Mirror → Goal → Kernel
```

Cette asymétrie est implacable : **la mémoire propose ; le noyau déclare le vrai.** Un `MemoryItem` porte :
- **Content** — la réclamation mémorisée (texte brut)
- **Provenance** — qui/quoi l'a engendrée (p.ex. `"user_claim:support@example.com"`, `"#1234 incident_derived"`)
- **Taint** — marqueur de qualité de provenance (énumé fermé : `unverified`, `stale`, `user_claim`, `incident_derived`, `external_source`)
- **Confidence** — certitude numérique (0..1), ne donne JAMAIS accès au noyau
- **ValidityScope** — région/tenant/cible/segment/environnement de validité
- **ExpiresAt** — borne de temps (ISO8601)
- **Branch** — branche DAG du contexte (la mémoire est branch-aware)

**Critère logique (structural) :** un `MemoryItem` est structurellement dépourvu de deux champs qui caractérisent les vérités :
- **Pas de `version`** (freeze) : la mémoire n'est jamais gelée dans le temps
- **Pas de `mirror`** (preuve) : la mémoire n'a pas de double exécutable

C'est par cette **absence structurelle** que le type `MemoryItem` rend les deux impossible : on ne peut pas écrire `item.Version` ou `item.Mirror` car les champs n'existent pas. La mécanique gagne contre la volonté.

### Le MemoryFirewall — trois fonctions pures qui appliquent la loi

Le firewall (back/archive/brain/firewall/) est une bibliothèque Go de **trois fonctions pures**, sans I/O, sans DB, sans horloge :

#### Propose(item, goal) → ContextPackEntry
Empaquette un `MemoryItem` dans un goal's `ContextPack` (côté lecture, autorisé). Le **taint voyage avec l'entrée** — jamais silencieusement supprimé. Cette fonction arme le context router (S33) : elle dit « cette mémoire *peut* aider le context pack de ce goal ».

#### ToKernel(item) → *BlockReason
**La porte fermée à clé.** Elle retourne **toujours** un `BlockReason` (jamais nil) avec le code `MEMORY_CANNOT_DECLARE_TRUTH` — **indépendamment de la confiance ou du taint de l'item**. Même une mémoire « propre », `confidence=1.0`, `taint=[]` (zéro taint) est bloquée. Pas de bypass. La fonction est le cœur du firewall : elle ne code pas, elle refait rien ; elle retourne juste le blocage.

#### ViaIdea(item) → IdeaCandidate
**La seule porte légale.** Elle transforme le contenu de la mémoire en une `Idea` brouillon destinée à S27 (idea-intake). La provenance est reportée (`provenance: "memory:<id>"`). L'idée est content-addressed (S01/S02). Elle porte **toujours** `WroteKernel=false` : ViaIdea ne touche jamais le noyau ; elle hand-off à la chaîne idea-intake → miroir → goal. L'idée doit ENCORE acquérir son miroir via `/goal` pour atteindre le noyau.

**Déterminisme-d'abord (CLAUDE.md §6/§8) :** tous les trois sont **purs et totaux**. Même entrée ⇒ même sortie. Testés par une property mirror (`firewall_property_test.go`) qui fixe : « pour tout item, ToKernel(item) bloque toujours ; Propose et ViaIdea ne changent jamais avec le même input ; pas de panique ».

### La couche mémoire : pgvector natif sur Postgres

**ADR 0025** gèle les paramètres (avant S31) :

| Paramètre | Valeur | Justification |
|---|---|---|
| **Dimension** | 384 | `vector(384)` — dimension native des petits transformers (`all-MiniLM-L6-v2`), bon marché CPU, ample pour le rappel |
| **Index** | HNSW | `vector_cosine_ops` — ANN rappel-intensive, latence prévisible, pgvector ≥ 0.8 default |
| **Distance** | Cosine | `<=>` (cosine_ops) — rappel = proximité sémantique (invariant d'échelle) ; L2/inner-product rejetés |
| **Score** | 1 - distance | Plus haut = plus proche ; ordered by score desc (fixture/property) |

La table `brain.memory_item` (S30) porte :
- ID (content hash, S01/S02 réutilisé)
- Kind (enum fermé : episodic, semantic, procedural, structural)
- Content
- Provenance, ValidityScope, ExpiresAt, Confidence, Taint, Branch
- **embedding** `vector(384)` + index HNSW

### Le Store — port injectable avec deux backends

Le `Store` interface (back/archive/brain/memory/) a deux implémentations interchangeables (ADR 0025) :

#### MockStore
In-memory, cosine exact sur HashEmbedder (déterministe, seedé). Pas besoin de modèle. La fixture write-then-recall s'exécute sur les deux et doit passer identiquement — cette **identité observationnelle** est le critère « les deux backends injectable ».

#### PgxStore
Réel, sur `brain.memory_item` via pgx. HNSW + cosine ANN. Filters poussés (WHERE sur kind/branch, pas de post-filter). Append-only : une nouvelle écriture du même body = même ID (idempotent) ; un corps changé = nouvelle ligne.

Injection par constructeur (pas de global) : le store est un paramètre d'entrée, jamais une découverte.

### L'Embedder — port injectable qui isole le modèle

Le `Embedder` interface mappe du texte à un vecteur fixe (384 dim). Deux réalisations :

#### HashEmbedder
Déterministe : bucketing par hash seedé du contenu. Même texte ⇒ même vecteur, toujours. Zéro réseau. Zéro modèle. Tests n'en ont pas besoin. La **reproducibility mirror** (`firewall_property_test.go`) la certifie.

#### Runtime Embedder
Un vrai modèle de phrase (p.ex. `all-MiniLM-L6-v2` ou `text-embedding-3-small`). **Le nom du modèle vit dans la provenance** de chaque `MemoryItem`. Un changement de modèle est une **reindex explicite** (nouvelle migration Atlas) — jamais une dérive silencieuse.

### Le ContextGraph et le ContextRouter — déterminisme dans la décision de réutilisation

Le **ContextGraphDecision** (back/archive/brain/contextgraph/) est le cœur déterministe du réutilisation (KRD §119.2) : **« Le LLM ne vit pas dans le ContextGraph »**.

#### Les quatre dimensions déclarées (et seules)

Une décision (idea, goal, MemoryItem) peut être **réutilisée** dans une nouvelle requête seulement si elle satisfait les **quatre prédicats déclarés**, en ordre false-dominant :

1. **TIME** — la fenêtre de validité du candidat (ExpiresAt ou TruthScope.TimeWindow) doit contenir `now`
2. **SCOPE** — le TruthScope du candidat doit être un **sur-ensemble** du contexte de la requête (région/tenant/cible/segment/environnement). Loi `no_reuse_outside_scope` (KRD §82.2/§13.7) : une décision réutilisée hors scope est une hallucination structurelle.
3. **AUTHORITY** — l'AuthorityGraph propriétaire du candidat doit toujours tenir pour le domaine/truth_kind de la requête. Sinon, `required_human_review=true` (réapprobation, pas blocage plat).
4. **CONDITIONS** — tout prédicat de réutilisation déclaré sur le candidat (p.ex. « channel == sms ») doit tenir contre les Facts de la requête.

#### Le verdict (ContextGraphDecision)

```
may_reuse == true  ⇔  all four dimensions checked AND all passed
```

Retourne :
- `MayReuse` — boolean false-dominant
- `Reason` — explication humaine (nomme la dimension qui a échoué)
- `Checked` — liste des dimensions évaluées (en order canonique pour reproductibilité)
- `RequiredHumanReview` — true seulement si authority fail (une décision humaine remplace le simple blocage)
- **ID** (content-addressed, S01/S02 canonicalize/hash réutilisé)

#### Pur et déterministe
La fonction `Decide(candidate, request, now)` :
- **Pas de DB, pas d'horloge globale** (now est un paramètre)
- **Pas de LLM**
- **Pas d'I/O**
- **Total** — retourne toujours un verdict, jamais panique

Testée par property mirror (`contextgraph_property_test.go`) : « pour tout tuple candidate/request/now, si expired→false, si out-of-scope→false, si true→all-four-passed, pas d'invention, pas de panique ».

### Les couches de mémoire : Layer A vs Layer B

**ADR 0008** distingue deux mémoires complètement séparées :

| Layer | Propriétaire | Backend | Rôle | Garantie |
|---|---|---|---|---|
| **Layer A** | Build-agent Claude | claude-mem (SQLite + Chroma + ONNX) | Mémoire cross-session du développeur | Convenances ; zéro implication KRD |
| **Layer B** | OS AIDOS | pgvector sur Postgres unique | Cerveau du produit opérationnel | Firewall, déterminisme, vérification |

**Layer A** — `claude-mem` — est une **commodité de développeur** : il capture les observations de la session de build courante, les rend accessibles entre sessions, suggère du contexte. Il est complètement **en dehors de KRD** et jamais lié aux vérités du noyau. Un agent build peut le désactiver ; ce n'est pas une dépendance.

**Layer B** — `brain` pgvector — est le **système nerveux du produit**. Elle vit :
- **Dedans la base Postgres unique** (Mandat B / CLAUDE.md §3) — jamais un moteur de mémoire externe
- **Sous le firewall** — contexte carburant, jamais vérité
- **Branch-aware** — scoped à la branche DAG (S24)
- **Content-addressed** — ID = hash, idempotent
- **Append-only** — supersession = nouvelle ligne, pas d'UPDATE
- **Avec taint immédiat** — chaque item porte son marqueur de provenance

### La fenêtre working memory dans le ContextPack

Le **working memory** (mémoire de travail, la fenêtre courante) ne vit pas dans le store `/brain` : elle vit dans le **ContextPack** compilé pour un goal (S33). C'est la mémoire **dans la pile d'exécution**, **branch-scoped**, **session-éphémère**.

Le ContextRouter (S33) construit le Context Pack en trois étapes :
1. Rappeller les memoranda les plus proches par similarité (Store.Recall)
2. Filtrer par TruthScope (le candidate ContextGraphDecision)
3. Appliquer le firewall (Propose) — le taint voyage

Le Context Pack est **minimal et progressif** : on ne donne jamais *tout* le cerveau à un modèle. Chaque rappel porte son taint (on signale « ceci est inféré », « ceci est stale », « ceci vient d'un incident »).

### La distinction des trois plans de mémoire

| Plan | Couche | Stockage | Garantie |
|---|---|---|---|
| **Plan de la vérité** | Kernel / Mirror | Postgres `kernel`, `mirrors` | Figé, versionné, miroir, content-addressed |
| **Plan de la mémoire** | `/brain` + Archive QD | Postgres `brain.*`, DAG `archive` | Append-only, branch-aware, déterministe, firewall |
| **Plan de la pile** | Working memory (ContextPack) | Mémoire du processus (stack) | Éphémère, scoped, session-local |

Les trois sont **distincts et jamais mélangés** : la vérité ne fuit pas en mémoire brute, la mémoire brute n'entre pas sans miroir dans le noyau, la pile de travail s'efface avec la session.

### Intégration avec les idées, le goal et la promotion

Quand la réalité diverge (un incident, une RealityMirror qui rougit), le système détecte une anomalie via un sensor (S11 runtime). Ce signal déclenche le flux `/learn` (S18 / LIVRE XII) :

1. **Capture** — un MemoryItem est créé via `firewall.Capture(content, provenance="incident:<hash>", taint=[incident_derived])`
2. **Stockage** — Store.Write enregistre dans `brain.memory_item` avec embedding
3. **Promotion** — une escalade manuelle via ViaIdea crée un Idea brouillon (S27)
4. **Grillage** — `/grill` teste l'idée (sharp/fuzzy/bad)
5. **Miroir** — `/goal` demande un miroir (`Gherkin`, property, fixture) pour la preuve
6. **Approbation** — ChangeSet approuvé : l'idea promus vers le kernel
7. **Lien** — le nouveau kernel trace son provenance (`derived_from → memory:<id>`)

À chaque étape, le firewall maintient la barrière.

---

### Résumé
Le cerveau d'AIDOS est un **store de mémoire indexée par similarité**, **pgvector natif**, **branch-aware**, **append-only**, **non-décisoire**. Il vit sous un firewall qui bloque toute mémorisation directe en vérité, en imposant le flux Memory → ContextPack → Idea → Mirror → Goal → Kernel. Les quatre mémoires indexables (épisodique, sémantique, procédurale, structurelle) fournissent du contexte carburant à un ContextRouter déterministe qui décide, sur quatre dimensions déclarées, si une décision passée peut être réutilisée. Pas d'LLM dans le ContextGraph. Pas de mémoire sans taint. Pas de réutilisation hors scope. Le cerveau propose ; le noyau déclare. C'est la même loi du firewall qui court du plus petit MemoryItem jusqu'à l'architecture entière du produit.

---

Je vais maintenant synthétiser le catalogue complet des ADR en markdown, basé sur ma lecture des 50+ ADR.

## Catalogue des Décisions Architecturales (ADR)

### **Fondation & Socle (0001–0013)**

| # | Titre | Résumé |
|---|---|---|
| **0001** | L'OS est le repo : `back/` = moteur, `front/web/` = Workbench | AIDOS est l'OS lui-même, pas une app construite avec l'OS ; la séparation moteur/UI est hard limite. |
| **0002** | Mirror est un plan à l'intérieur du Kernel, pas un contexte séparé | La bicéphalité (spécification + preuve) co-versionnée dans un même ChangeSet atomique ; le miroir vit à `back/kernel/mirror/`. |
| **0003** | Stack gelée (frozen) : Go + Postgres + Next ; Atlas, sqlc, Godog, Pact | Slots `mandatory` (inchangeables) et `replaceable` (swap par ADR) ; Dolt rejeté pour truth-store, adopté pour app émise (Doltgres). |
| **0004** | La vérité vit en Postgres, append-only, content-adressée, jamais en fichiers | Schemas `kernel · mirrors · ideas · changesets · dag · brain · context · fitness` ; materialization disk ← Postgres (projection régénérable). |
| **0005** | Workflow long-run : déterministe `long-run.js` (not orchestrator agent) | État/gating vivent en script, agents workers ; resume exact via cache ; interdiction `Date.now()` / `Math.random()` en workflow. |
| **0006** | App émise sur Doltgres (git-for-data), truth-store reste Postgres pur | Deux BD : OS truth = Postgres, app data = Doltgres Postgres-wire ; beta acceptée pour produit émis (fallback plain-Postgres). |
| **0007** | Réutiliser libs matures, pas hand-roll (CEL, XState, sqlc, templates) | AST source en Postgres ; éval/exec/codegen via libs établies ; **exception Expr** : interpréteur bespoke fermé (closed catalogue, pas LLM). |
| **0008** | Deux mémoires : Layer A = claude-mem (agent build) ; Layer B = pgvector native (OS brain) | Memory-firewall (Layer A ≠ Layer B) ; pgvector HNSW cosine, MemoryItem unrepresentable version/mirror, SELECT-only agent role. |
| **0009** | MCP partout : chaque op backend = un tool MCP ; accrétion skills/agents/hooks/MCP par step | Per-step artifact creation via `skill-creator`/`agent-creator` ; hooks scaffolded (spec) puis activés (fault-injected) à leur step. |
| **0010** | Workbench design system : zinc + blue-600 (ccup theme), Tailwind+shadcn, tokens, Geist | Bilingue par défaut (FR default) ; theme = config centrale swappable. |
| **0011** | Bilingue par défaut : French primary, next-intl sans URL-routing, Postgres `i18n` table | Static UI strings en JSON ; dynamic content via table ; emitted apps héritent du pattern. |
| **0012** | Atlas versioned migrations (not declarative `schema apply`) pour Archive baseline | SQL verbatim garde les GRANTs (wall) ; forward-only expand-contract ; integrity sum. |
| **0013** | CLI `aidos` = stdlib dispatch (pure `Run(args)→int`), pas cobra/urfave framework | Déterminisme-first ; contrat déclaratif source de vérité pour help + Workbench `/cli`. |

---

### **Mur & Sensors (0014–0015)**

| # | Titre | Résumé |
|---|---|---|
| **0014** | S07 sensor runner : changed-set via event payload, archtest boundary adapter | Changed files → packages ; archtest = pluggable boundary check (default : Mirror plane inaccessible) ; sensor = pure function of event. |
| **0015** | S12 Stop completeness gate : cut resolved from mirror⋈kernel projection ; audit log below line | `completeness_runs` + `completeness_monster_findings` (runtime schema, agent INSERT+SELECT) ; monstre = no mirror ∨ orphan mirror. |

---

### **Autorité & Changements (0016–0020)**

| # | Titre | Résumé |
|---|---|---|
| **0016** | S16 authority graph precedence : veto dominates > no approver > all approvers > partial | `Decide(graph, truth, granted)` pure deterministic ; escalation sur approval partiel. |
| **0017** | S18 `composes` (7ème lien) + aggregate mirror récursif, weighted avec `load-bearing | cosmetic` | Red child reddens parent ; weight rides inside link JSONB ; side table `layer_activation` pour threshold. |
| **0018** | S19 critical weight tier (3-tier : cosmetic, load-bearing, critical) + `weight_evidence` required | Tier ordering monotone déclaré ; critical demande evidence ; propagation engine `FireParent`. |
| **0019** | S20 ChangeSet envelope : atomic {spec_delta, mirror_delta}, DRAFT/APPLIED/REVERTED, inverse negation | Content-hash = Hash(canonical {spec+mirror}) stable across lifecycle ; `changesets.changeset_lifecycle` side table (append-only). |
| **0020** | S22 red wave = transitive closure stale links, mirror-first order, load-bearing from composes weight | Pure Impact function ; `red_work_queue` (runtime schema, agent INSERT+SELECT) ; cosmetic edges halt propagation. |

---

### **Version DAG & Idées (0021–0023)**

| # | Titre | Résumé |
|---|---|---|
| **0021** | S24 version DAG : parentage = edge relation, head = node flag (multiple heads allowed) | Node id = Hash(canonicalize {kind, parent_ids, stratum, label}) ; branch/checkout-ancestor/rebranch append-only ; `dag.node` + `dag.edge`. |
| **0022** | S27 ideas lifecycle : Idea unrepresentable version/mirror ; promotion gate on has-mirror reference ; NO_MIRROR_NO_KERNEL block | `ideas.idea` table (agent INSERT/UPDATE, not DELETE) ; lifecycle = DRAFT/grilled/spiking/harvested/rejected. |
| **0023** | S28 exploration gestures (`/grill · /spike · /harvest`) : spike T0 OFF, harvest proposes DRAFT-Truth | Grill verdict routed (sharp→grilled, fuzzy→spiking, bad→rejected) ; spike confinement hook ; DRAFT-Truth unrepresentable version/mirror. |

---

### **Mémoire & Brain (0024–0025)**

| # | Titre | Résumé |
|---|---|---|
| **0024** | S30 MemoryFirewall : memory never truth ; Memory→ContextPack→Idea→Mirror→Goal→Kernel only path | `brain.memory_item` unrepresentable version/mirror ; `ToKernel` always blocks (no confidence bypass) ; MEMORY_CANNOT_DECLARE_TRUTH block. |
| **0025** | S31 Memory adapter : vector(384), HNSW, cosine distance, injected Embedder+Store ports | HashEmbedder (deterministic test) vs real model (named in provenance) ; MockStore vs PgxStore equivalence fixture. |

---

### **Projections & Génération (0026–0028)**

| # | Titre | Résumé |
|---|---|---|
| **0026** | S36 API projection : in-process Pact provider verification (no external daemon) | `EmitContract` pure deterministic ; Pact v3 JSON ; httptest provider stub ; operator I/O reference unknown ⇒ UNKNOWN_OPERATION_IO block. |
| **0027** | S37 DB projection : explicit prior EntitySource for diff ; DataTruthScope (applies_to + migration strategy) | expand-contract forward-only ; narrowing = EXPAND→BACKFILL→CONTRACT ; RequireMigration gate ; two BlockReason codes ADDED. |
| **0028** | S38 web projection : ts-next target; control+action → Next component ; Expr ASTs embedded + TS evaluator twin | click DECLARES (Plan.invoke), not EXECUTES ; ledger CHECK widened (append-only) ; orphan bind = CodeOutOfScope (reused). |

---

### **Meta & Évolution (0029–0032)**

| # | Titre | Résumé |
|---|---|---|
| **0029** | S39 meta-meta self-test : SessionStart fault-injection (sensors fire, wall holds, fitness unchanged) | `Run(harness, at)` pure ; probes injected (deterministic) vs live PgHarness ; baseline hash via S02 scheme ; fail-closed. |
| **0030** | S40 mutation sensor : score denominator (killed / (total−uncovered)) ; threshold read SELECT-only ; local block codes | Gate pure deterministic ; uncovered mutants EXCLUDED from score ; denominator 0 ⇒ UNPARSABLE_REPORT ; mutation ≥ floor conjunct in Stop. |
| **0031** | S41 KernelDebt diagnostic : three debt kinds (orphan_mirror, stale_fixture, surviving_mutant) ; suggest-only (no delete) | Scan pure total ; SuggestTrim proposes ideas only ; snapshot in `fitness` (agent SELECT-only) ; append-only. |
| **0032** | S42 EvolutionSandbox : quarantine zones (can/cannot write), promotion gate on mirror+out-of-sample+authority | Confine = allow-list (fail-closed) ; backtester reads out-of-sample only ; sandbox-confinement hook injected signal ; two block codes ADDED. |

---

### **Reality & Ingestion (0033, 0039)**

| # | Titre | Résumé |
|---|---|---|
| **0033** | S43 RealityMirror : incident→Idea (provenance verbatim, unrepresentable version/mirror, no proposes guess) | Incident taint = `incident_derived` required ; ToKernel always blocks (REALITY_CANNOT_DECLARE_TRUTH) ; telemetry read-only MCP. |
| **0039** | MK02 DocConverter : deterministic HTML→markdown port (no external tool yet) ; replaceable adapter ; idempotence contract | Port pure/total ; reference impl HTMLConverter ; property mirror (100× reproducibility) ; formats (PDF/DOCX/img/OCR) deferred to MK03. |

---

### **Émission & Déploiement (0040, 0041–0043)**

| # | Titre | Résumé |
|---|---|---|
| **0040** | App émise = Hono/TS multi-plateforme (Web/React, Mobile/Expo, Desktop/Electron) + sidecar interpréteur Go | Operation-DSL exécuté uniquement en Go (service callback via MCP) ; handlers Hono pur-fonctionnel ; un seul client typé `hc` ; Doltgres/Postgres datastore inchangé. |
| **0041** | EL05 `LevelToProposes` table : jointure honnête 9 Levels → 6 ProposesKinds (journey/view/invariant = NoEmit) | Self-map only (control→control, entity→entity) ; no silent alias ; property verrouille membership. |
| **0043** | StackManifest → Pulumi/TS program (one stack per project×env) + module Traefik ; Postgres datastore unchanged | IaC mandatory ; emitter byte-stable FN02-pur ; manifesto = truth, Pulumi = projection ; preuve : demoshop-dev live routé Traefik+Let's Encrypt. |

---

### **Domaines Métier & Gouvernance (0050, 0055, 0069–0092)**

| # | Titre | Résumé |
|---|---|---|
| **0050** | S116 GDPR erasure : crypto-shredding + tombstone (append-only preserved, hash invariant on structure) | DEK per-subject ; erase = destroy key + overwrite ciphertext → fixed Tombstone ; PhaseHash = structure+non-PII markers (invariant under shred). |
| **0055** | Échelle fractale vivante : position dans arbre `composes` (pas enum clos ; profondeur illimitée) | Chemin = adresse canonique ; roleOf dérivé (racine/feuille/profondeur) jamais stocké ; growComposes append-only idempotent ; placement proposé déterministe (humain surcharge). |
| **0069** | Gouvernance connecteurs : chaque connecteur = code asset above-the-line (ou source YAML below-the-line projection) | Connecteur-as-truth ou connecteur-as-projection ; policy binding (quels connecteurs sont permis pour quelle entité). |
| **0072** | Workbench = front Next + backend Go/Postgres ; truth lives Postgres live ; front *appelle* moteur | Twins TS = aperçu/fallback gouverné (byte-égal au Go via miroir différentiel) ; jamais autoritative. Généré = Hono (séparation nette). |
| **0073** | Truth-store Postgres vivant (transcript file devient projection régénérable) | État kernel/mirrors/ideas/changesets/dag d'un projet en live Postgres (forward-dep ADR 0072 : persistence S17/S31 back-fill). |
| **0074** | Gateway MCP HTTP : couture front↔Go moteur ; anti-fallback-silencieux e2e | Front appelle moteur via HTTP MCP gateway ; fallback local = aperçu seulement (jamais autoritative sans le dire). |
| **0075** | Hooks harness tirent vraiment : sensor/wall/stop/goal/sessionstart hooks fault-injected ; aucun hook mort | Hook honesty : une garde n'est ajoutée que si elle a échoué réellement (ou est un forward-dep prouvé). |
| **0076** | Stack émis substrat gelé + utilisé : Go/Postgres/Next →Hono/TS/Postgres (app) ; deux stacks distinctes | Constructrice Go ; construite Hono ; pas de conflit, frontière claire. |
| **0077** | Déploiement unique & vrais verbes métier : `aidos deploy` = orchestrateur multi-phase déterministe | Une app = UN déploiement ; verbes ≠ vagues de rouge ; state before/after via DAG. |
| **0078** | Gouvernance sur vrais agentRuns (pas de mock agents en prod) | Audit trail : qui a lancé quoi, avec quelle Idea/Goal, résultat prouvé. |
| **0079** | DiffusionGemma bench différentiel : embeddings TS twin = byte-égal Go hash pour pgvector | Embedding model provenancé ; dimension 384 pinned ; no model swap sans reindex. |
| **0080** | Sondes stack honnêteté services : every backend op = real Go (pas TS twin faux) | Twins = aperçu governed ; all real ops = Go (determinism-first, single source of truth). |
| **0081** | Termes canoniques 161 sans matérialisation | Fermeture des enums (Proposes, BlockReason, Level, Weight, etc.) ; reuse not fork ; AdditiveTrait only (refine never remove). |
| **0082** | Harness templates topologies Ashby | Variété bornée ; formal-caps slot (Z3/TLA+/Dafny) escape-valve rare. |
| **0083** | Capacités Go dormantes : status/roadmap ; aucune cap inutile | Inventory audit 2026-06 : 47 caps live, backlog triaged. |
| **0084** | Provenance network pondéré | Provenance = directed graph (idea source, incident ref, signal reason) ; confidence ordinal. |
| **0085** | Agent factory profile resolver | Factory registre agents par profil (executor, verifier, specialist) ; injection Constructor. |
| **0086** | Formal caps soupape : Z3/TLA+/Dafny/Alloy/UPPAAL | Slot `replaceable` (non-mandatory) ; porte de secours pour propriétés catastrophic + unsampleable. |
| **0087** | Générateur self-play AlphaEvolve | Medium-loop QD (quality-diversity) ; niche sampling sur DAG ; elite promotion gated. |
| **0088** | RequirementBench port replaceable | Bench tool for mutation/property checking ; swappable adapter. |
| **0089** | Générateur-router `evolve` (port replaceable) | QD niche selection ; backtester integration ; out-of-sample only. |
| **0090** | Kernel operation table : registre ferme opérations + signatures | Single source ops ; no shadow impl. |
| **0091** | Two-level wall : constructor (gate writes) vs product (gate app data writes) | Wall appliquée à deux domaines : OS (vérité) + app émise (données). |
| **0092** | Engine is single live source, no twins | Interpréteur Go → sidecar Go (app émise callbacks) ; aucune ré-émission TS de l'interpréteur. |
| **0093** | Voir Electron CDP screencast | UI live-view + debugging ; optional debug cadre. |

---

### **Résumé structurel**

**Trois couches de décision :**
1. **Fondation (0001–0013)** : frontières OS, stack gelée, truth-store unique, MCP-everywhere, déterminisme.
2. **Mécanique KRD (0014–0032)** : mur, sensors, changements, versioning, idées, évolution.
3. **Réalité & Domaines (0033–0093)** : ingestion, émission, déploiement, gouvernance, étendue.

**Patterns récurrents :**
- **Anti-overwrite (§9)** : expand-only, jamais ALTER/DELETE de schémas prior.
- **Déterminisme-first (§6/§8)** : pure functions, no LLM in judgment loops, content-addressed.
- **Wall bicephalous (§2/§4)** : agent role SELECT-only truth, writer role via approved ChangeSet.
- **Reuse libraries, not services (ADR 0007)** : coin standard libs, avoid second engines.
- **Slots frozen/replaceable (ADR 0003)** : mandatory = no swap, replaceable = documented ADR substitution.

Ce catalogue synthétise **93 ADR documentées, toutes acceptées**, couvrant les neuf phases KRD du contrat de step, le déploiement, et la gouvernance pour édition multilingue et reproductibilité.

---


## BUILD JOURNEY & ÉTAT DU SYSTÈME

### Le chemin de construction : S00 à S52

Le **build journey** de AIDOS suit une progression déterministe de 58 étapes documentées en `docs/plan/S*.md`, de S00 (le contrat d'exécution racine) à S52 (la couche agent gouvernée). Chaque étape obéit au **contrat par-étape** versionnée (S00) : dix phases (grille-avec-docs, miroir BDD rouge, TDD rouge→vert→refactor, capteurs verts, diagnostic, route Workbench + e2e, architecture, créations d'artefacts selon le tableau §5, sans mensonges, sans monstres).

Le plan s'organise en **quatre tracks parallèles**, chacun gouverné par ses ADR :

| Track | Portée | Étapes clés | Gouverne |
|---|---|---|---|
| **BA : Build-Agent (harness)** | Les primitifs KRD : noyau, cliquet, mur, miroir, ratchet, clichet de complétude, vague de rouge, phases stables, ChangeSet, DAG de versions, archive d'idées, évolution | S00→S43 (~44 étapes) | ADR 0001–0044 (FKE intégrée S30), 0075 (hooks vivants) |
| **EL : Emitted-app (la visée)** | Ce qu'AIDOS *génère* : entity-source, projections (API/DB/web), Hono backend (TS fonctionnel), frontends (React/Expo/Electron), Pulumi (IaC), OTel persisté, Doltgres (git-for-data), Windmill, NATS, cache | S34→S45 + S81 | ADR 0040 (Hono), 0043 (Pulumi), 0006 (Doltgres), 0076 (substrat complet), 0036 (fonctionnel) |
| **DP : Deploy (réel)** | Le déploiement du moteur AIDOS lui-même et de l'app générée : provisioning, vrai Postgres, vraie passerelle MCP HTTP, healthchecks, audit-en-temps-réel, kill-twins | S53+ + DP01→DP33 (roadmap) | ADR 0073 (Postgres live), 0074 (gateway HTTP), 0092 (single-source), 0077 (déploiement unique), 0078 (governance branchée) |
| **WB2 : Workbench v2** | La gouvernance du Workbench lui-même : panneaux, lenses, navigation, persistence v3 → Postgres, anti-mensonges | S46 (Workbench v2 sketch) | ADR 0072 (le front appelle le moteur), 0080 (sondes honnêtes), 0092 (kill-twins) |

### État production actualisé (session du 18 juin 2026)

**Le Workbench (`aidos.sagedesk.fr:3000`), backend en Go + Postgres :**

- **Ce qui est LIVE (16 panneaux, lecteurs réels du moteur Go)** : kernels (store_get), anatomy (mirror_anatomy), anatomy-browser, grid (gridsrv), links (linksrv), kernel-tree (composes), policies, invariants, actions, entities, HTTP mirrors, changelog, health, contract, settings, memory-weavings.
- **Ce qui TOURNE EN APERÇU TWIN (194 logiques TS réimplémentées, chemin de fait)**— panneaux d'édition v3 (BesoinIntake, Compound, Grill, Spike, Harvest, Emit, Open/Goal, Completeness, RedBacklog, SemanticDiff, MergeSemanticPanel, Trim, Learn, Evolve, ArchArchive, etc.). L'audit montre : **~16 panneaux live vs ~174 panneaux total**. Les twins TS donnent une illusion de gouvernance *instantanée* ; le moteur Go dort. **C'est le cœur du problème que ADR 0092 (single-source) résout.**
- **Persistence en FICHIER (transcripts v3)**, non Postgres : l'état d'un projet (ses idées, changesets, fil de DAG, kernel projeté) est sérialisé `.aidos-projects/*.transcript.json`, lu/écrit par `front/web/app/v3/projects-actions.ts`. **ADR 0073 propose de lever cette exception** — les schémas `kernel/mirrors/ideas/changesets/dag/brain/context` doivent devenir la vérité LIVE en Postgres ; le transcript devient une *projection* régénérable. **Le statut reste REVERSED** depuis l'audit du 18 juin : la vérité vit toujours en fichier (non intégrée à Postgres live).
- **Gateway MCP HTTP** : n'existe que par `callGateway` non fonctionnelle dans `front/web/app/bootstrap/mcp.ts`. `.mcp.json` enregistre **0 serveur Go** (uniquement github, context7, postgres, trivy, playwright, mintlify, linear). **ADR 0074 DOIT brancher ça** : lancer `back/mcp/gateway` en HTTP (`AIDOS_GATEWAY_HTTP_ADDR=:8787`), exporter `AIDOS_GATEWAY_HTTP_URL` au Next, enregistrer la flotte (~90 serveurs Go), ajouter un e2e anti-fallback-silencieux. C'est le verrou **high** du plan.

**Docs Mintlify (aidos.mintlify.app) :**

- **Public "Pour les futurs utilisateurs"** : guide d'installation, guide d'utilisation, API reference (auto-générée), FAQ.
- **Internals "Pour moi"** : FKE 8-facettes (6 lenses + 2 axes), la Conscience (agrégateur déterministe), le Vibe Lab (phase isolée), la promotion gate, les 7 niveaux de vérité, l'anatomie symétrique du kernel (10 slots, 4 paires-miroir).

**Traces et tâches :**

- **Linear** : tracker officiel (ADR auditées, steps de S00 à S52, tickets d'implémentation, roadmap par track).
- **Claude-mem** (Layer A) : mémoire cross-session de l'agent Claude Code qui construit AIDOS — pas partie du produit, distinct du `brain` Postgres (Layer B, S30–S33). Memfirewall le garde séparé.
- **Workflow long-run** : S00→S52 en cours ; cascade deterministic (`step-executor` → code → `step-verifier` validation → lock → proxy prochain) ; fallback manuel si détection de cycle. PLAN.md = index des 58 étapes ; TEST_PLAN.md = scénarios e2e parallèles.

### Ce qui est EN COURS — la worklist maîtresse

**ADR décisives à brancher (gouvernées par le plan PLAN-branchements.md du 15 juin) :**

| ADR | Titre | Sévérité | Statut | Blocage |
|---|---|---|---|---|
| **0072** | Frontend = Go backend + Postgres ; twins = aperçu gouverné | Décision-mère | Acceptée | 0074 (gateway) |
| **0073** | Truth-store Postgres live (kernel/mirrors/ideas/dag/brain) ; transcript → projection | High | Acceptée | `back/archive/*` + `back/kernel/operation` + projection S17/S31 au Workbench |
| **0074** | Gateway MCP HTTP couture front↔Go ; registry ; e2e anti-fallback-silencieux | High | Acceptée | Intégration `.mcp.json` + enregistrement flotte + `AIDOS_GATEWAY_HTTP_URL` |
| **0075** | Hooks du harness : PreToolUse (mur), Stop (goal-check), SessionStart (self-test), PostToolUse (sensors) | High | Acceptée | Câblage `.claude/settings.json` + Go binaires |
| **0076** | App générée embarque substrat COMPLET utilisé : Hono + Doltgres + Windmill + OTel→PG + NATS + Valkey + Better-Auth | High | Acceptée | `honoemit/scaffold.go` + `pulumi_stack_hono.go` + IaC sidecar |
| **0077** | Chemin de déploiement unique + verbes métier projetés du kernel.operation | High | Acceptée | `projectServerSpec` lit ops → app émise vraie |
| **0078** | Governance branchée sur vrais AgentRun (plus fixtures) | High | Acceptée | `back/mcp/agentloop/ledger.go` + `runtime/governance` |
| **0080** | Sondes de stack : chaque service déclaré est sonné HTTP, mensonges déclassés | Medium | Acceptée | `EnvsClient.tsx` (sondes) + `materialise_hono.go` (Doltgres réel) |
| **0081** | Statut des capacités Go dormantes : brancher / documenter / trim | Medium | Acceptée | MutationRunner (S40), reality-ingest (S43), EvolutionSandbox (S42) ; trim candidates |
| **0092** | Single-source : moteur Go SEUL source live ; kill-twins ; cliquet anti-retour | High (supersède 0072) | Acceptée 2026-06-16 | T0–T5 : flip 194 twins en 5 tranches (+cliquet dès T1) |

**Branchements outils + affording (en queue) :**

- **Headroom** : `ContextCompressor` dans `agentloop/scenario.go` (MCP headroom sidecar-backed).
- **Compound** : skill `/compound` fin-de-goal → `compound.Reuse` dans MatchRole.
- **MarkItDown** : `DocConverter` process-backed + serveur idea-intake.
- **Functional** : `.dependency-cruiser.js` + eslint-plugin-functional dans l'app générée.
- **Bouton mort `/v3/emetteurs`** : branchement UI « Proposer→/goal ».

**Audit du 18 juin 2026 — verdicts majeurs :**

- **Gateway dispatch réel (ADR 0074)** : `gateway_call` → dispatcher in-process (< 50ms) vers ~15 serveurs aujourd'hui ; ~90 serveurs existent dans `back/mcp/` mais hors registry.
- **Dormance majeure** : MutationRunner (S40), EvolutionSandbox (S42), RealityMirror/telemetry (S43), ArchiveWalkthrough, ContextGraph complet, semantic-merge complet, curation QD, ledger Merkle.
- **Mensonges d'écran** : Windmill (affiché level-1, 0 conteneur), connectors (mcp-gateway:3000 inexistant), Doltgres (URL fictive, DB réelle = postgres:16).
- **Reversal ADR 0073** : la vérité des projets v3 reste **en fichier**, non Postgres — exception bootstrap **toujours active**. À trancher (ADR 0073 vs statut quo).

### La GOUVERNANCE du travail

**Linear** : le système de vérité pour l'ordre des tâches. Chaque step S*N* devient un ticket ; chaque ADR devient un ticket « décision » ; chaque branchement un ticket « travail ». Priority ladder : `BLOCKED` → `HIGH` (0072–0078) → `MEDIUM` (0080, 0081, tools) → `LOW` (0079-diffusiongemma, UI afford).

**Mintlify docs** : deux publics. Le contenu Internals (FKE, Conscience, 7 niveaux) est **engraved** chaque commit (ADR signé, page mise à jour) ; le Public reste un guide stable de ce qu'un *utilisateur* ferait avec AIDOS pour construire son app.

**`long-run` & CI agentique** : le workflow `long-run.js` (JavaScript, Node orchestrator) dispatche chaque step S*N* → Go `step-executor` (agentique, rouge BDD → vert, `step-verifier` validation) → détection cycle/deadlock → escalade manuel. Chaque step produit un rapport (BDD ajoutée, tests lancés, route UI, ChangeSet status, red-set status, limites connues, next step sûr).

**Mur et déterminisme** : PreToolUse hook refuse toute écriture agent au-dessus de la ligne (`kernel`/`mirrors`/`fitness`) ; Stop hook calcule "done" (red-set vert ∧ prior green intact ∧ no monster) — jamais déclaré par l'agent.

Fin de section.


---

## La pile méta-méta, le NIVEAU 3 inviolable & l'auto-test — ce qui garde le système honnête

Cette section ferme un manque structurel de la page : on a décrit *les quatre boucles* et *la ligne de flottaison*, mais pas l'étage qui les surplombe toutes — le **méta-méta**, l'inviolable — ni les organes qui empêchent le système auto-évolutif de se mentir à lui-même (l'auto-test, le typage épistémique, la rigueur graduée, les invariants transverses, la vitalité et l'économie du harnais). C'est ici que se tient la promesse « tout évolue *sauf* la définition du vrai ».

### Les quatre niveaux empilés (Objet · Vérité · Méta · Méta-méta)

KRD se lit sur **quatre niveaux d'abstraction empilés**. C'est la règle d'or (« aucune boucle n'édite sa propre fitness ») généralisée à *tous* les étages : **chaque niveau gouverne celui d'en dessous, et aucun niveau ne peut éditer le niveau au-dessus de lui.**

| Niveau | Nom | Contenu | Propriétaire | Qui peut l'éditer |
|---|---|---|---|---|
| **3** | **Méta-méta** | la fitness · la grammaire (Layer/Mirror) · la waterline | l'humain, **gravé** | **personne** (inviolable) |
| **2** | **Méta** | l'algèbre de couches · le registre · les types de liens | l'humain | l'humain (au-dessus du mur) |
| **1** | **Vérité** | le noyau bicéphale : spec + miroirs | l'humain | l'humain (au-dessus) · l'IA (miroirs en dessous) |
| **0** | **Objet** | les projections (api, db, types, ui web/mobile/autre) | l'IA | l'IA (boucle interne) |

Les **trois primitifs** qui font tenir cette pile sont le **noyau** (le contenu des niveaux 1-3), le **cliquet** (la monotonie verticale : un niveau bas ne corrompt jamais un niveau haut) et le **mur** (la frontière de permissions entre chaque étage, tenue par des hooks).

### Le NIVEAU 3 — l'étage inviolable, trois choses et trois seulement

Le méta-méta est l'étage qu'on n'avait « jamais isolé explicitement » avant le Tome. Il contient **exactement trois choses** :

1. **La fitness** — la définition de « réussi », non-gameable : sensors computationnels + noyau red→green + out-of-sample + réalité. *Aucune* boucle ne peut l'éditer.
2. **La grammaire des couches** — ce qu'*est* une couche (`Layer`), ce qu'*est* un miroir (`Mirror`), ce qu'*est* un lien. Si l'IA pouvait redéfinir « couche » ou « miroir », le plan bicéphale se dissoudrait.
3. **La ligne de flottaison** (waterline) — l'affectation *qui possède quoi* (above/below). Si l'IA pouvait la bouger, elle s'auto-certifierait sur la vérité.

**La règle dure de la boucle méta** : elle peut **AJOUTER** une capacité (un nouveau sensor, une nouvelle topologie, un nouveau `kind`), **JAMAIS RETIRER** un garde-fou (le mur, un détecteur, la fitness, la waterline). C'est aussi la « meta-loop rule » du contrat agent : un nouvel artifact n'ajoute jamais qu'une garde, n'en retire aucune.

### L'auto-référence qui se referme — il n'y a pas de niveau 4

Le méta-méta gouverne le méta, qui gouverne la vérité, qui gouverne l'objet. *Qui gouverne le méta-méta ?* **L'humain + la réalité, point.** Il n'existe pas de niveau 4 : la régression s'arrête parce que le méta-méta n'est **pas auto-amélioré** — il est *gravé*, et seule la boucle externe (un incident réel prouvant que la fitness elle-même était mal posée) peut le faire réviser, par décision humaine explicite. C'est **le seul endroit où le système ne peut pas se réparer tout seul — et c'est volontaire.** C'est la réponse de KRD à la question ouverte d'ADAS (l'auto-amélioration récursive de l'organe qui applique les règles) : par l'inviolabilité du cœur.

### L'auto-test — comment le méta-méta se défend (boucle ④)

L'inviolabilité ne tient que si elle est *vérifiée mécaniquement*. C'est l'**injection de faute**, lancée à chaque session par le hook `SessionStart` (le `harness-self-test`). À chaque démarrage, on plante une violation connue et on asserte **trois garanties NIVEAU 3** :

- **Tout sensor fire encore** — on casse exprès la source qu'un détecteur surveille, et on asserte qu'il vire au rouge. *Un détecteur qui ne fire pas est mort* (un « détecteur mort »).
- **Le mur tient encore** — on tente une écriture du noyau en tant qu'agent, et on asserte le rejet (un test *négatif*).
- **La fitness n'a pas bougé** — on asserte que la boucle méta n'a modifié ni la fitness, ni la grammaire, ni la waterline.

Un garde-fou retiré devient un test rouge. La régression ne part jamais à l'infini parce qu'au fond c'est de la **mutation / fault-injection déterministe**, pas un autre LLM-juge. C'est aussi pourquoi tout hook ajouté doit avoir « failli au moins une fois pour de vrai » et porter sa propre injection de faute (*hook honesty*). Le geste correspondant existe (`/self-test`) et rejoue exactement cette routine à la demande.

### Le typage épistémique — la couche qui sait dire « ici je ne sais pas prouver »

C'est une couche structurante souvent oubliée : **toute vérité a un type épistémique, et son miroir doit être du même type.** Sans elle, KRD commet l'une de deux erreurs symétriques — *sur-contraindre* une vérité molle comme un invariant d'authentification, ou *laisser une préférence humaine polluer le noyau* comme si c'était un fait. Trois notions s'emboîtent :

- **`truth_kind`** — le type épistémique d'une vérité : `behavioral` (comportement dur : auth, paiement, permissions), `structural` (architecture, dépendances, schéma, contrats), `experiential` (UX, perception, clarté, confiance), `economic` (coût, conversion, performance business), `regulatory` (loi, conformité, RGPD), `statistical` (A/B, observation), `exploratory` (pas encore vérifiable, reste en `/spike`). Un invariant métier se prouve par property test ; un contrat API par Pact ; une vérité UX ne se prouve **pas** de la même façon.
- **`VerifiabilityLevel`** — savoir *quand le cliquet n'a pas le droit de mordre* : `deterministic` / `statistical` / `delayed` / `human_judged` / `unverifiable`, chacun avec son `allowed_mode` (`kernel` / `experiment` / `spike` / `manual_review`). **Règle : si le signal n'est pas vérifiable, KRD ne certifie pas — il passe en `/spike`, en expérimentation ou en revue humaine.** Une méthode mature sait dire « ici je ne sais pas prouver ».
- **`ExperienceClaim`** — l'UX comme **hypothèse typée**, pas comme vérité dure. Une `ExperienceClaim` (`accessibility`, `clarity`, `conversion`, `trust`, `perceived_quality`) porte un `status` (`hypothesis` / `accepted` / `rejected` / `expired`) et n'est admise au noyau que si elle a une **autorité UX explicite, un scope, une expiration éventuelle, et un miroir cohérent avec son type** : WCAG pour l'accessibilité, heuristique pour la clarté, A/B test pour la conversion, revue humaine pour le goût.

C'est ce typage qui justifie la facette **Expérience / Utilisabilité (X)** de l'octuor comme **vérité molle** : X *informe* la décision, ne la *bloque* pas ; le cliquet ne mord pas une vérité molle.

### La rigueur graduée — T0 / T1 / T2, un cadran par cellule

KRD n'applique pas la même rigueur partout : ce serait net-négatif sur le trivial. Chaque cellule règle son **niveau de rigueur** selon le **coût d'une violation** :

| Niveau | Régime | Cliquet | Outillage |
|---|---|---|---|
| **T0** | spike, jetable, proto, script < 50 lignes | **OFF** (zone `/spike`) | aucun — KRD serait net-négatif ici |
| **T1** | normal | ON | sensors computationnels |
| **T2** | catastrophique (argent, vies, conformité) | ON, serré | + méthodes formelles (Z3 / TLA+ / Dafny / Alloy / UPPAAL), + mutation, + budgets |

Le mur est lui-même un **gradient de zones à portes à sens unique** : `/spike` → `/kernel` → `/src`, et noyau-fédération au-dessus de noyau-cellule. L'intention découverte en `/spike` n'accède jamais directement au noyau : elle est **récoltée** (`/harvest`) puis re-construite proprement — ce qui tue à la fois la formalisation prématurée et le pourrissement d'un proto en produit.

### Les invariants transverses — Global · Saga · Temporal (rares, explicites, coûteux)

Quand la vérité dépasse une seule cellule, KRD introduit trois sortes d'invariants de fédération — **et pose qu'un invariant transverse est une *exception coûteuse, jamais le mode normal*** (trop d'invariants globaux recréent un monolithe logique). Les bounded contexts restent les murs principaux.

| Invariant | Ce qu'il garantit | Sa loi propre |
|---|---|---|
| **GlobalInvariant** | une vérité qui enjambe plusieurs cellules (ex. « tout agrégat portant du PII doit implémenter `Forgettable` ») | une violation **rougit toute cellule dans son rayon** (la vague de rouge fan-out, pondérée le long de `composes`) ; et **un `blast_radius` plus large exige une autorité plus large** (`global` ⇒ `architecture_owner`) — l'admission est **bloquée** si l'approbation accordée est plus étroite que le rayon ne le demande |
| **SagaInvariant** + **CoherenceTest** | une transaction distribuée : « si `payment_captured` alors `order_confirmed` *ou* `compensation_executed` » | une **jambe qui échoue déclenche la compensation** ; jamais un paiement capturé laissé sans commande confirmée ni compensation exécutée (le *monstre de l'argent qui pend*) ; et la `CoherenceTest` garantit qu'aucun événement consommé n'est produit par une version incompatible (contrats version-pinés) |
| **TemporalInvariant** | une vérité qui dépend du temps (délais, ordre, expiration, retries, timeouts, idempotence, *eventual consistency*) | **toute vérité temporelle doit déclarer son horloge** (`system` / `external` / `logical`) — un invariant sans horloge est *refusé* ; la bande de tolérance est **unilatérale** pour un `within` (on viole en étant en retard, jamais en avance) |

À leurs côtés, la **RedWorkQueue** : la stigmergie (les traces rouges laissées par le travail) *coordonne l'attention*, mais un scheduler évite le chaos en *coordonnant l'exécution* du drainage de la vague de rouge.

### Les organes de vitalité & d'économie — pour que le harnais ne s'étouffe pas lui-même

KRD prévoit explicitement le risque inverse de la régression : un harnais qui devient *trop lourd*. Quatre organes le tiennent :

- **EvolutionSandbox** — *l'évolution explore, elle ne gouverne pas.* Toute boucle `/evolve` tourne en quarantaine : elle ne peut écrire **que** des branches d'évolution, des rapports et des idées `proposed` ; **jamais** le noyau, les miroirs above, l'autorité ou la fitness. Une variante n'est **promue** dans une niche QD (MAP-Elites, une niche par régime — pas un champion unique) qu'avec **miroir vert ∧ out-of-sample vert ∧ approbation d'autorité**.
- **CellVitality** — un **diagnostic, jamais une fitness de promotion** : âge des fixtures, latence red→green, mutation score, diversité de variantes, récurrence d'incidents, diversité sémantique, couverture fonctionnelle. Il **interprète** (`healthy` / `stale` / `overfitting_risk` / `underconstrained`) et déclenche une revue, un `/trim-kernel`, un `/evolve` ou l'ajout de miroirs — **il ne valide jamais une variante.**
- **KernelDebt** (le geste `/trim`) — scanne la dette : miroirs orphelins, fixtures périmées, mutants survivants, miroirs morts (liveness qui ne fire jamais). Il **propose** une réduction minimale ; il **ne supprime rien** — chaque proposition rouvre une idée qui repasse par `idée → miroir → /goal → approbation`.
- **HarnessCostBudget & ValueCase** — l'économie du harnais : chaque cellule déclare son budget (minutes CI, tokens LLM par goal, runtime de mutation, minutes de revue humaine) et la **règle** : *plus une contrainte coûte cher à maintenir, plus elle doit justifier sa valeur* (un `ValueCase` pèse `risk_if_broken` contre `harness_cost`, verdict `justified` ou non).

### Le RealityMirror — l'unique on-ramp de la prod vers le noyau

La boucle ③ (externe) a un organe nommé : le **RealityMirror**. Un incident de production est lu comme **une hypothèse fausse du noyau** (le noyau était *faux par omission* : aucune fixture ne couvrait le cas). Le chemin est strict et c'est le **seul** légal pour que la réalité touche la vérité : un signal télémétrique / un incident devient une **idée** avec provenance (le geste `/learn`), puis `/grill`, puis `/goal`, puis approbation humaine — jamais une écriture directe. Le système **apprend du monde, pas de lui-même** : c'est l'apprentissage *ancré* par excellence, et la garantie anti-Goodhart ultime (la prod est le juge final, sur des données jamais vues).

---

### Ce qui manque encore à la page pour être « tout, tout, tout »

Trous concrets repérés en confrontant la page assemblée aux sources :

1. **Le NIVEAU 3 / méta-méta inviolable** (les 4 niveaux empilés, les *trois choses et trois seulement*, « il n'y a pas de niveau 4 ») — *comblé ci-dessus*, mais à indexer comme section à part entière dans le sommaire.
2. **L'auto-test (boucle ④) comme routine concrète** — les trois assertions du `harness-self-test` au `SessionStart`, le « détecteur mort », le test négatif du mur — distinct du simple énoncé des 4 boucles.
3. **La couche de typage épistémique** (`truth_kind` / `VerifiabilityLevel` / `ExperienceClaim`, « son miroir doit être du même type », « savoir dire : ici je ne sais pas prouver ») — pilier conceptuel v9, absent de la page.
4. **La rigueur graduée T0 / T1 / T2** (un cadran par cellule, réglé par le coût d'une violation ; KRD net-négatif sous un seuil) et le **gradient de zones `/spike` → `/kernel` → `/src`** — mentionnés en passant, jamais traités.
5. **Les trois invariants transverses Global / Saga / Temporal + CoherenceTest + RedWorkQueue** (la fédération, « exception coûteuse jamais mode normal », l'horloge obligatoire, le monstre de l'argent qui pend) — non couverts.
6. **Les organes de vitalité & d'économie** : EvolutionSandbox (quarantaine + gate de promotion), CellVitality (diagnostic ≠ fitness), KernelDebt/`/trim`, HarnessCostBudget/ValueCase — cités dans la mémoire d'audit mais sans exposé conceptuel.
7. **Le RealityMirror & le geste `/learn`** comme on-ramp unique prod→noyau (l'incident devient miroir) — la boucle ③ n'est nommée qu'en tableau.
8. **Le second cliquet (structurel)** — les *fitness functions* sur le graphe de dépendances + seuils d'entropie qui « ne peuvent qu'améliorer ou tenir » (« tests verts, système pourri »), à côté du cliquet comportemental ; il fonde la facette **M (Maintenabilité & Architecture)** de l'octuor.
9. **FKE comme cadre englobant** (FKE ⊃ KRD ⊃ AIDOS) : l'anatomie symétrique (mur = plan de symétrie + frontière de langue), les paires-miroir, la *conscience* comme comparateur déterministe des paires, le **WhyTree** (`/why`, causalité arrière finissant en miroir), les **8 facettes effondrables** (« le plus petit cliquet qui clique »), les agents paramétrés A0–A8 — si la page veut la couche méta-méta-théorique complète.
10. **Les deux gestes-frontière d'ingestion** : `/markitdown` (un document → idée, jamais → noyau) et la verticale du besoin (EL : `/besoin-intake`, `/compound-besoin`, `/emit-ideas`, `/red-backlog`) — l'amont qui alimente le pipeline `idée → miroir → goal`, absent de la page.

---

## FKE — le cadre englobant (FKE ⊃ KRD ⊃ AIDOS)

### Thèse fondatrice

**Fractal Kernel Engineering (FKE)** est la discipline universelle du développement logiciel à l'ère des agents IA. Elle **englobe** KRD (Kernel-Ratchet Development) qui lui-même est **implémenté** par AIDOS (l'OS de référence). La thèse centrale : *un kernel validé n'est jamais régénéré — il contraint librement du code qui l'incarne sous harness, tandis qu'une conscience déterministe réconcilie en permanence ce qui était voulu, ce qui a été construit, ce qui est prouvé, et ce qui est autorisé.*

### L'anatomie symétrique — le mur comme plan de miroir et frontière de langue

L'architecture FKE repose sur une **symétrie parfaite** autour d'une ligne unique : le **Mur d'Intention**. Chaque slot au-dessus (déclaré, intentionnel, humain) possède son **reflet exact** en dessous (prouvé, réalisé, machine). Cette symétrie est l'invariant fondateur ; elle n'est jamais violation mais plutôt un test de complétude.

#### La structure canonique : six paires-miroir, huit facettes

La forme complète d'un kernel s'organise autour de **quatre familles de paires-miroir** (déclaré ↔ prouvé) :

1. **Facette Fonctionnelle (F)** — six paires symétriques :
   - F1 : Spec ↔ Documentation
   - F2 : Comportement (use cases) ↔ Résultats observés
   - F3 : Scénarios ↔ Tests
   - F4 : Modèle (donnée, sens humain) ↔ Projection données
   - F5 : Contrat (in/out, invariants) ↔ Code
   - F6 : Evidence attendue ↔ Evidence observée

2. **Facette Sécurité (S)** — la même anatomie, lue en menaces :
   - S1 : Spec sécurité (finalité, classification données) ↔ Doc sécurité (threat model)
   - S2 : Abuse cases ↔ Résultats sécurité (denials observés)
   - S3 : Scénarios sécurité ↔ Tests sécurité (evals anti-injection)
   - S4 : Threat model ↔ Sécurité implémentée (authn, authz)
   - S5 : Contrat sécurité (permissions, policy) ↔ Police + scans
   - S6 : Evidence sécurité attendue ↔ Evidence observée

3. **Facette Invariants ∀ (I)** — le squelette lu en « vrai sur TOUS les chemins » :
   - I1 : Énoncé ∀ ↔ Documentation invariant
   - I2 : Comportement universel ↔ Résultats ∀
   - I3 : Propriétés (idempotence, etc.) ↔ Property tests (fast-check)
   - I4 : Domaine de quantification ↔ Générateurs + shrink
   - I5 : Contre-exemples interdits ↔ Invariant enforcé
   - I6 : Evidence ∀ attendue ↔ Evidence observée

4. **Six autres facettes, du même squelette** :
   - **Performance / Budgets (B)** : SLO déclaré ↔ Métriques observées, Load tests ↔ Résultats charge
   - **Fiabilité / Résilience (R)** : SLA de disponibilité ↔ Dégradation observée, Scénarios panne ↔ Fault-injection tests
   - **Évolutivité / Migration (V)** : Spec d'évolution ↔ Changelog données, Scénarios changement ↔ Tests migration
   - **Maintenabilité & Architecture (M)** : Spec d'architecture ↔ ADR/Doc, Cohésion déclarée ↔ Graphe dépendances observé
   - **Expérience / Utilisabilité (X)** : Spec d'usage ↔ Guide d'usage, Parcours fluide ↔ Résultats usabilité (régime soft, informe sans bloquer)
   - Et chacune porte le même squelette six paires.

#### Le mur : un seul plan vus sous trois facettes

| Visage du mur | Signification | Fonction |
|---|---|---|
| **Permissions** | L'agent écrit `/src` (code), jamais `/kernel` (vérité) | Frontière d'autorisation |
| **Ligne de flottaison** | Dessous : l'IA s'auto-certifie (computational) · Dessus : l'humain tranche (le sens) | Geste de gouvernance |
| **Frontière de langue** | Dessous : machine seule (F5 Code, S4 implémentation, S5 police/scans) · Dessus & côtés : ubiquitaire (humain lit la langue) | Langage et lisibilité |

Le **mur est aussi un plan de symétrie + une frontière de langue** : toutes les paires réfléchissent autour de cette ligne unique, et seule la zone strictement machine (code exécutable, police, scans) se situe dessous—tout le reste reste bilingue, lisible humain et machine.

### Les paires-miroir — chaque vérité possède sa preuve exécutable

Une **paire-miroir** est une **relation 1-pour-1 entre une déclaration et sa preuve** :
- Spec ↔ Doc générée — structurellement alignées (même lexique, concepts couverts)
- Contrat ↔ Code — le code incarne exactement le contrat signé
- Invariant ↔ Property test — la propriété générale est prouvée universellement
- Scénario ↔ Test — chaque chemin de la spécification a son épreuve exécutée

**Loi de complétude FKE** : *un kernel dont une paire requise (toute facette instanciée) manque ou diverge sans décision est un monstre*. Une faille de sécurité non déclarée, une régression de performance non mesurée, un invariant non prouvé, une migration sans test de restore — tous des monstres au même titre qu'un test fonctionnel manquant.

### La conscience — agrégateur déterministe des paires

La **Conscience** (Alignment Governor) n'est ni un second agent ni un juge LLM. C'est une **fonction pure qui compose les verdicts des juges existants** :
- Runner de miroirs (les tests tournent, les tests passent)
- Complétude (toutes les paires instanciées sont présentes)
- SemanticDiff (règles cachées détectées, contrats changés repérés)
- RealityMirror (écarts runtime observés vs attendus)
- Senseurs (linters, type-checkers, scans sécurité)
- Ledger Merkle (trace tamper-evident)

La conscience **compare chaque paire réfléchie** (s1↔s10, s2↔s9, s3↔s8, etc. pour chaque facette instanciée) et produit un **rapport aligné/drift** + des **decision cards** pour l'intervention humaine. Elle détecte : `aligned · incomplete · bug · semantic_drift · contract_drift · security_drift · performance_drift · undeclared_side_effect · unsafe · context_rot · needs_user_decision`. **Elle ne cache jamais les écarts** (loi 22 de FKE).

### Le WhyTree et la causalité arrière — le geste `/why`

Le **red wave** (KRD §42) propage la causalité **avant** : une vérité change → ses conséquences rougissent (cause → effets). FKE ajoute la causalité **arrière** : d'un symptôme observé, remonter à la cause racine.

Le **WhyTree** redresse le « 5-pourquoi » naïf en trois lois :

1. **Déterministe d'abord** : où le graphe connaît la cause (via `caused_by`, lien arrière inverse de `impacts`), on remonte calculatoirement. Pas de confabulation.

2. **Un ARBRE, pas une ligne** : le `WhyTree` (modèle Ishikawa/fishbone) admet plusieurs causes contributives, content-adressé, append-only, provenancé.

3. **Terminaison obligatoire en miroir** : un WhyTree qui ne finit pas par un **nouveau miroir rouge→vert** à la racine n'est que du storytelling causal. La racine → draft Idea (`/learn`) → grill → goal → miroir d'anti-récurrence. C'est ce qui transforme « on a compris » en « ça ne peut plus revenir ».

**Geste `/why`** (construire le WhyTree, extension de `/diagnose`) + **`/learn`** (racine → miroir). Le red wave ferme l'avant ; le WhyTree ferme l'arrière ; ensemble ils réconclient la causalité dans les deux directions.

### Les huit facettes effondrables — le plus petit cliquet qui clique

Les huit facettes canoniques (F · I · S · B · R · V · M · X) ne sont pas des entités séparées : c'est le **même squelette de six paires**, **lu à travers huit lentilles orthogonales** (questions indépendantes sur les internals d'UN kernel). Un kernel n'instancie une facette que s'il porte cette nature de vérité — règle « le plus petit cliquet qui clique » (anti-explosion).

Exemples : Une fonction pure de tri porte F (fonctionnel) + I (invariants) + M (structure), pas S/B/V/R/X. Un endpoint exposant des données personnelles porte tout les huit. Un kernel-vue déclaratif porte F + X + M minimal. On n'instancie jamais une facette vide.

### Les agents paramétrés A0–A8 — autonomie croissante par preuve calculée

**Il n'existe pas une IA générale unique.** Chaque agent IA est une **instance paramétrée** définie par un **profil, jamais par un prompt** :

```
Agent = BrainRole × Layer × KernelType × Operation × RiskLevel × AutonomyLevel
        + Skills + Harness + Policies + Context Pack + Memory Access + Evidence Contract
```

Les **rôles du cerveau** : `left_brain` (Intent Compiler), `right_brain` (Realization Compiler), `consciousness` (Alignment Governor), `governor`, `police`, `memory`, `evidence_runner`, `reviewer`, `runtime_guardian`.

Les **niveaux d'autonomie** (A0-A8) gradent la latitude et sont **montés par preuve calculée** depuis l'historique AgentRun :
- **A0 observe_only** : aucune écriture, lire seul
- **A1 suggest_only** : proposer, jamais écrire
- **A2 generate_draft** : générer en brouillon (non persisté)
- **A3 modify_in_sandbox** : modifier en environnement isolé
- **A4 open_pull_request** : créer une PR, attendre révision
- **A5 merge_with_checks** : fusionner si tous les checks passent
- **A6 execute_non_production** : exécuter en staging
- **A7 execute_production_with_approval** : production sur approbation humaine
- **A8 autonomous_bounded_scope** : autonome dans un scope strict (jamais pour des actions critiques)

Chaque agent est **équipé d'un harness** (sandbox, fichiers accessibles, commandes autorisées/interdites, secrets, timeouts, quotas), d'une **policy** (la règle), d'une **police** (l'enforcement fail-closed), et d'un **Context Pack minimal** (mémoire validée, kernels acceptés, exclusions polies).

### L'anatomie FKE vs KRD vs AIDOS — les trois niveaux d'implémentation

| Niveau | Portée | Statut |
|---|---|---|
| **FKE** (Fractal Kernel Engineering) | Discipline universelle, applicable à tout artefact logiciel | Documentée dans LIVRE XXX du Tome KRD |
| **KRD** (Kernel-Ratchet Development) | Implémentation concrète de FKE pour le développement produit-logiciel AIDOS | Tome intégral (LIVRE I-XXVIII) + LIVRE XXX (FKE spécifique) |
| **AIDOS** (AI Dev OS) | Runtime de référence, implémentation complète du Tome KRD | Codebase (`back/kernel/facets`, `back/runtime/conscience`, `back/kernel/causedby`, etc.) |

**Décisions actées (grill 2026-06-07, ADR 0044-0045) :**
- FKE est **fondu au Tome** (une seule source de vérité)
- Les **doc-miroirs** (s2↔s9, s1↔s10) sont jugées par **comparaison structurelle** (code AST vs prose), jamais par LLM
- La **conscience** est un **agrégateur déterministe** (fonction pure composant les verdicts existants, zéro nouveau juge)
- Les **7 niveaux de vérité** (Raw → Reconciled) sont **stockés + mirrorés** (divergence = rouge)
- Les **A0-A8** grimpent par **preuve calculée** depuis l'historique AgentRun
- Le **kernel effondré** : l'incompressible = s1 (l'intention) + la paire de preuve s4↔s5/s6 (jamais de vérité sans preuve)
- **Atterrissage code** : piste FK01-FK10 (post-S117), partiellement livrée (FK01→FK16 vert, anatomie 1-pour-1 + conscience + WhyTree implémentés)

### La fractalité — même structure à tous les niveaux

La **même anatomie symétrique** existe à tous les niveaux : projet, feature, module, service, API, fonction, test, MCP, skill, agent, policy, workflow, documentation. Chaque kernel contient la même structure (raw signal → above wall → validation → below wall → evidence → police → consciousness → decision), à toutes les échelles et à travers les *plans* (le système qui construit suit la même anatomie que le système construit).

**Cycle fractal** :
```
raw signal → left brain → above-wall proposal → validation → right brain
→ projections → evidence → police → consciousness → decision → memory → graph update
```

**Lois de composition** : les couches hautes **composent** (orchestrent). Les couches basses **exécutent** (atomes). Les invariants **remontent** (cross-produit latéral). Les preuves **réconcilient** (conscience). Et la règle anti-explosion tient : un **kernel effondré** garde l'entrée + la paire de preuve, dérive le reste (s2/s3 fusionnés dans s1 ; s9/s10 générés ; s8 absent) — le micro pipeline se contracte sans jamais perdre sa colonne intention→preuve.

### L'échelle fractale vivante — position dans l'arbre `composes`, pas enum clos

L'**échelle fractale** n'est pas une étiquette qu'on choisit (enum clos : `"cellule" | "kernel" | "feuille"`). C'est une **position dans l'arbre `composes`** qui **pousse** infiniment. L'adresse canonique d'un besoin est son **chemin de slugs depuis la racine** (ex. `app/paiement/checkout/debit-du-compte`), content-adressé (id = hash du chemin), append-only, idempotent.

Les **rôles** (`racine`, `cellule`, `kernel`, `feuille`) sont **dérivés à la lecture** via `positionOf` — jamais stockés :
- Profondeur 0 → racine
- Profondeur N, sans enfants → feuille
- Profondeur N > 1 → kernel (tout nœud non-feuille intérieur)
- La profondeur elle-même reste numérique : `n1`, `n2`, `n3`, … (infini)

**Corollaire** : un projet = **une** racine unique ; le générateur synthétique qui créait plusieurs racines est corrigé. Le placement d'un besoin dans l'arbre est calculé par **algorithme déterministe** (score lexical, jamais un prompt), proposé, puis surchargeables par jugement humain (« les frontières des cellules sont posées par jugement humain, pas engendrées par la récursion »).

### Les 25 lois — la base axiomatique

1. Le prompt n'est pas la spec
2. Le chat est un signal brut
3. Le vibe est une phase d'exploration, pas une source de vérité
4. Le code n'est pas la vérité
5. Le kernel validé est la vérité intentionnelle
6. Le code est une projection
7. Toute règle cachée dans le code est un drift
8. Toute hypothèse doit être explicite
9. Toute permission doit être explicite
10. Tout effet de bord doit être déclaré
11. Toute action sensible passe par une police
12. Toute mémoire est un kernel
13. Toute policy est un kernel
14. Toute police est un kernel
15. Tout agent est un kernel paramétré
16. Toute skill est un kernel
17. Tout MCP est une frontière de sécurité
18. Tout contexte donné à l'IA est un Context Pack
19. La confiance du modèle n'est pas une preuve
20. Une preuve observée vaut plus qu'une confiance déclarée
21. Le cerveau droit ne modifie jamais seul le dessus du mur
22. La conscience ne cache jamais les écarts
23. Tout changement de sens, de contrat ou de sécurité exige une décision
24. Tout artefact durable doit être relié dans le Kernel Graph
25. Le système apprend uniquement par mémoire validée ou par décision traçable

### Relation à KRD et AIDOS

**KRD implémente FKE.** AIDOS implémente KRD. La hiérarchie est stricte :
- **FKE** énonce la discipline universelle (8 facettes, conscience déterministe, WhyTree, paires-miroir, fractalité)
- **KRD** l'instancie pour le développement produit-logiciel (couches N0-N5, cliquet comportemental, mur d'intention, harness templates, tools/hooks/skills)
- **AIDOS** fournit le runtime et la Workbench (Postgres truth-store, ContextRouter, CLI, Web UI, agents paramétrés intégrés, conscience/WhyTree/facets implémentés)

Aucune collision conceptuelle : FKE est le cadre ; KRD est la méthode ; AIDOS est le système vivant.

---

## Le second cliquet — structurel (l'architecture qui ne pourrit pas)

### Pourquoi « tests verts ≠ système sain »

La première boucle AIDOS — le **cliquet comportemental** — protège le comportement observable : tant qu'un test du noyau passe, l'agent peut refactoriser, réorganiser, optimiser sans restriction. Cette liberté est nécessaire ; elle est aussi **insuffisante**. Un système peut posséder des miroirs verts (tous les tests passent), des invariants tenus, des opérations vérifiées, et **simultanément souffrir d'une architecture pourrie** : dépendances circulaires entre modules, boundaries de bounded contexts franchies, couplage caché, croissance inmaîtrisée de la complexité. C'est le piège classique : la couverture est excellente, le code compile, les fixtures tournent, et l'entropie architecturale monte silencieusement jusqu'à la révolte.

Le cliquet comportemental mesure : « as-tu cassé le contrat ? » Le cliquet structurel mesure : « as-tu pourri la structure ? » Ce dernier s'énonce en une question : dans la fédération de cellules que tu as conçue top-down, **les frontières tiennent-elles ? La complexité s'échappe-t-elle ? Les cycles intermodulaires régressent-ils ?** Ces quatre questions sont **orthogonales** aux miroirs du noyau. Un test peut être vert tandis que l'architecture rougit.

### Le cliquet structurel : fitness functions et seuils d'entropie

À la différence du cliquet comportemental qui protège le noyau exécutable (fixtures, invariants, opérations), le cliquet structurel protège le **graphe de dépendances global**. Son mécanisme repose sur quatre **fitness functions** déterministes, exécutées à chaque cut (proposition de changement) :

1. **Violations de frontière** : comptage des imports ou dépendances qui franchissent les boundaries déclarées entre bounded contexts. Chaque BC possède une interface contractée (les dépendances autorisées via Pact ou ADR) ; toute violation est un edge non contracté.

2. **Cycles inter-cellules** : utilisant l'algorithme de Tarjan (strongly connected components), on détecte tout cycle dans le graphe inter-BC. Un cycle de dépendances est un **symptôme de conception cassée** — il rend l'évolution locale impossible et introduit des couplages cachés.

3. **Arêtes inter-BC** : comptage des dépendances *totales* autorisées traversant les frontières (sans filtrer les violations). Cet index permet de surveiller la « chaleur » inter-BC : trop d'arêtes signale un design fragmenté plutôt que bien séparé.

4. **Complexité maximale de cellule** : la taille la plus grande (en nœuds d'AST, fan-out, profondeur de stack) de toute cellule. Une cellule qui croît sans limite devient incompréhensible et inévitable.

**La règle du ratchet structurel — gravée mécaniquement** : entre deux cuts (deux snapshots du graphe), ces quatre métriques **ne peuvent qu'améliorer ou rester inchangées, jamais régresser**. Une nouvelle violation → rouge. Un nouveau cycle détecté → rouge. Une augmentation de la complexité maximale → rouge. Cette monotonie est **inconditionnel** — elle s'applique même si tous les tests comportementaux passent. C'est ce qui empêche le glissement insidieux : un changement qui passe les miroirs mais introduit une violation architecturale est immédiatement visible et bloqué.

### Fitness functions, seuils déclarés above-the-line

Contrairement à un sensor computationnel classique (type-checker, linter) qui énonce une règle *syntaxique* locale, une fitness function énonce une contrainte *topologique* globale qui dépend de l'ensemble de l'architecture. Ces quatre metrics ne sont pas des heuristiques ou des « bonnes pratiques » — elles sont **déclarées, mesurées, et versionnées dans le noyau** comme des seuils garantis (`back/runtime/agentloop/arch-fitness.json`).

La déclaration prend cette forme :

```
{
  "metric": "boundary_violations",
  "baseline": 2,       # le dernier cut accepté avait 2 violations (connues, contractées)
  "threshold": 2,      # interdiction de monter au-delà
  "candidate": 2,      # ce cut propose 2 — RATCHET TENU
  "verdict": "HELD"
}
```

Augmenter le seuil n'est pas une décision de code — c'est une **décision de vérité** : elle passe par idée → miroir (une property qui encode le nouveau seuil) → /goal → approbation. Jamais une édition silencieuse. Cela préserve l'intégrité : on ne peut pas contourner le cliquet par négligence ou compromise locale.

### Arch-fitness au-dessous : dependency-cruiser (front) + go-arch-lint / depguard (back)

Le calcul des quatre metrics est une **fonction pure**, déterministe. Côté Go (back), c'est `back/kernel/mirror/archfitness` qui les mesure via le graphe de dépendances compilé. Côté TypeScript/JavaScript (front et emitted apps), c'est `dependency-cruiser` qui parse et construit le graphe.

Ces outils ne sont pas des « linters pédants » — ils implémentent le **contrat structurel du kernel**. go-arch-lint peut être configuré avec des frontières explicites (entre paquets, entre domaines) qui correspondent exactement aux cellules du design initial. dependency-cruiser fait la même chose pour les modules TypeScript. Chaque fois qu'une règle arch-fitness évolue (un nouvel ADR qui impose une contrainte structurelle), on met à jour la config de ces outils et on les déclenche.

La différence d'avec un linter classique : **ces règles sont versionnées avec le kernel**. Elles ne sont pas des « bons réflexes de l'équipe » — ce sont des contrats qui survient le kernel et opposent une résistance mécanique. Un projet peut se passer d'un style-guide, jamais de son cliquet structurel.

### Facette M — Maintenabilité & Architecture (le second cliquet comme lentille)

Dans le squelette octuor (les huit facettes canoniques), la **facette Maintenabilité & Architecture (M)** n'est pas une rangée supplémentaire de vérité. C'est la **lentille par laquelle on observe la santé structurelle** du kernel. Elle se déploie en six paires symétriques :

| # | **AU-DESSUS** (déclaré, humain) | ↔ | **EN-DESSOUS** (prouvé, machine) |
|---|---|---|---|
| **M1** | Spec d'architecture (frontières, couches, style) | ↔ | Doc d'architecture / ADR |
| **M2** | Comportement structurel (cohésion, pas de couplage caché) | ↔ | Graphe de dépendances observé (acyclique, frontières tenues) |
| **M3** | Scénarios de structure (règles arch-fitness : `no-global-mutable`, `call-graph-acyclic`, fonction pure) | ↔ | go-arch-lint / depguard / dependency-cruiser exécutant la règle |
| **M4** | Modèle de complexité (budgets : profondeur, fan-out, taille de surface) | ↔ | Métriques de complexité observées (CCN, NLOC, diameter du graphe) |
| **M5** | **Contrat structurel** (le cliquet : santé ne peut qu'améliorer ou tenir) | ↔ | Ratchet structurel enforcé (nouvelle violation → rouge, bloque la cut) |
| **M6** | Evidence structurelle attendue | ↔ | Evidence observée (fitness verte, zéro nouvelle violation, mutation non dégradée) |

Chaque paire est **bilatérale** : l'AU-DESSUS énonce l'intention humaine (« voici l'architecture que je veux »), l'EN-DESSOUS la prouve ou la réfute. M5 est la paire clé — c'est le ratchet qui rend la maintenabilité *mécanique*, pas opportuniste.

### Code émis : les règles déclarées du compil

Quand l'émetteur produit une application (back Hono + front Next), elle hérité du même contrat structurel que AIDOS lui-même. Trois règles arch-fitness s'appliquent automatiquement au code émis :

- **`EMITTED_NO_GLOBAL_MUTABLE`** : aucune variable mutable globale dans les modules émis. Les effets de bord sont localisés, traçables. Violation → senseur rouge.

- **`EMITTED_FUNCTION_PURE`** (FN02 du squelette) : les fonctions pures (mappers, selectors, computations) ne font **aucun I/O, aucun appel extern** ; elles sont comparables, testables, composables. Un appel réseau caché ou une lecture de l'horloge système → senseur rouge.

- **`EMITTED_CALL_GRAPH_ACYCLIC`** : le graphe d'appels du code émis ne contient aucun cycle de dépendances directes. Utile pour l'analysabilité et la treeshakeability.

Ces trois règles ne sont pas des « bonnes pratiques de code » — elles sont **des frontières inévitables du compilateur**, écrites dans l'AST de la sortie via passes déterministes (TypeScript compiler API pour le front, AST Go pour le back).

### La règle méta-loop : un artefact ADD, jamais ne RETIRE une garde

Chaque fois qu'un nouvel artefact — une nouvelle fonction, une nouvelle dépendance, un nouveau module — est ajouté au système, il **ajoute une garde, jamais n'en retire une**. C'est la **règle d'accrétion des cicatrices** : quand on découvre un problème (un bug, une violation architecturale), on ne corrige pas seulement le symptôme ; on ajoute un senseur pour le rendre impossible à l'avenir.

Un exemple concret tiré de l'ADR 0066 (DP08) : après qu'un endpoint ait été hardcodé dans le code émis (une violation du design), la règle `EMITTED_NO_HARDCODED_ENDPOINT` a été déclarée. Cette règle vit maintenant **dans le noyau** (fitness.json), elle est **vérifiée** à chaque cut (une passe AST TypeScript déterministe), et elle est **bloquante** — aucun endpoint ne peut être émis en dur sans que le senseur rougisse et que la cut soit refusée. La règle ne s'efface jamais. De nouvel artefact n'ajoute que des gardes ; il ne négocie jamais les règles existantes.

### Lien avec le harness et Böckeler

Birgitta Böckeler (Thoughtworks, mai 2026) définit le harness comme l'ensemble des **guides** (feedforward) et des **sensors** (feedback) qui entourent un agent. Le cliquet structurel **est un sensor feedback macroscopique** : il observe le graphe de dépendances après chaque exécution et refuse les modifications qui régressent les quatre metrics.

Ce sensor est **computationnel** (pas d'inférence LLM, pas de jugement humain par run) — il est une fonction pure `graph → verdict`. Il s'exécute à chaque commit ou cut (PostToolUse hook), il bloque immédiatement sur violation, et il porte une trace exhaustive (l'historique des métriques, chaque baseline, chaque regréssion proposée).

Böckeler note que la plupart des projets ont des sensors *comportementaux* (tests) mais peu de sensors *architecturaux* (fitness). C'est la source du chaos organisationnel : on peut avoir une couverture à 95 % et une codebase dégénérée. Le cliquet structurel comble cette lacune — il fait de l'architecture un objet de gouvernance machine, pas d'opinion.

### Distinction du second cliquet avec le cliquet comportemental

| Aspect | **Cliquet comportemental (S05)** | **Cliquet structurel (S102+)** |
|---|---|---|
| **Périmètre** | Noyau : fixtures, invariants, opérations | Architecture globale : graphe inter-BC, complexité |
| **Mesure** | Test passe/échoue (binaire) | Quatre metrics (violations, cycles, arêtes, complexité) |
| **Monotonie** | Jamais, un test peut repasser à vert | Toujours, quatre metrics ne régressent jamais |
| **Échelle** | Cellule par cellule (test local) | Global (la fédération entière) |
| **Vérificateur** | Godog, rapid, fixture interpreter (KRD mirrors) | go-arch-lint, depguard, dependency-cruiser (graphe) |
| **Échappement** | Aucun (le test est le contrat) | Aucun (le ratchet est mécanique, DecisionCard requise pour monter) |

### Anti-pattern : Goodhart appliqué à l'architecture

La **loi de Goodhart** — « quand une mesure devient un cible, elle cesse d'être une bonne mesure » — s'applique aussi à l'architecture. Un sensor arch-fitness buggé peut faire passer du code mauvais ou refuser du code bon. Pour se protéger : **injection de faute obligatoire**. Avant de déployer une nouvelle règle arch-fitness, on l'éprouve par fault-injection : on injecte volontairement une violation (un import en trop, un cycle artificiel) et on vérifie que le senseur rougit. Si le senseur ne tire jamais, il est mort et doit être enlevé.

C'est le contrat du CLAUDE.md §6 : *« un hook qui ne fire jamais est mort »*. Corollaire : *« un senseur de fitness dont la règle n'a jamais échoué en run réel ne doit pas exister »*.

---

## La boucle ③ — RealityMirror, l'incident qui devient vérité (`/learn`)

### Rappel : les quatre boucles de KRD

KRD s'organise autour de quatre boucles imbriquées qui orbitent le noyau comme point fixe. Chacune opère à un rythme distinct et dispose d'une fonction de fitness qu'elle ne peut pas éditer — c'est le cœur de l'ancrage contre l'overfitting.

| Boucle | Direction | Rythme | Fait évoluer | Fitness (non-éditable) |
|---|---|---|---|---|
| ① **Interne** | code ← noyau (déduction) | minutes | l'implémentation | le miroir red→green |
| ② **Moyenne** | variantes ← fitness (évolution) | heures | code, stratégies, prompts | computational + out-of-sample |
| ③ **Externe** | noyau ← réalité (induction) | jours | la vérité elle-même | la production, les incidents |
| ④ **Méta** | harnais ← harnais (ADAS) | semaines | sensors, topologies, skills | injection de faute |

Cette section se concentre sur la boucle ③ — celle qui ferme la chaîne de feedback : **la réalité elle-même juge si le noyau était juste**. Seule l'expérience en production peut révéler qu'une contrainte était fausse ou incomplète.

### La boucle externe : le noyau peut avoir tort

Le noyau n'est pas la vérité absolue — c'est une **théorie falsifiable** du domaine. On peut approuver une fixture qui encode un bug : alors le cliquet interne le défendra, car le code respecte le noyau. Sans la boucle externe, KRD forme une boucle fermée (noyau → code → test → vert) sans jamais confronter le réel.

**La seule chose qui peut déclarer le noyau faux, c'est la réalité elle-même.**

Le **cliquet externe** énonce la règle : tout incident de production doit se refermer en un delta du noyau. Ce delta peut être de deux formes :
1. **Fixture/invariant manquant** — le bug révèle un cas que le noyau ne couvrait pas (le noyau était « faux par omission »).
2. **Contrainte fausse** — l'incident prouve qu'une promise du noyau était erronée, demandant un override (une révocation explicite).

En termes épistémiques : une contrainte validée par un incident réel porte la confiance la plus haute (elle a survécu au contact avec le monde). Une contrainte écrite spéculativement d'avance reste une hypothèse — c'est pourquoi le mutation testing scrute d'abord les contraintes spéculatives pour en découvrir les trous.

### Incident, Idée et Miroir — jamais directement la Vérité

La boucle externe ne transforme pas un incident directement en vérité du noyau. Elle passe par la porte légale : **Incident → Idée → Miroir → /goal → approbation humaine → Vérité gelée**.

#### L'Incident

Un incident est un morceau de **réalité brute** :
- une défaillance récurrente en production ou un budget violé ;
- une cause esquissée (une hypothèse, une conjecture) — jamais une assertion falsifiable ;
- aucune fixture existante du noyau ne la couvrait (le noyau était incomplet) ;
- une taint `incident_derived` qui marque son origine ;
- **pas de version, pas de miroir** — ce qui le distingue d'une vérité.

L'incident porte une provenance `incident:#NNNN` (un hash content-addressé, réutilisant le schéma S01). Il est **observable** — la production le rapporte via OpenTelemetry ou un événement explicite.

#### Le geste `/learn` — Incident vers Idée

Le geste `/learn` est la transformation déterministe : il lit un incident et émet un **candidat d'Idée** (`IdeaCandidate`). Ce candidat n'a pas de version, pas de miroir, pas de status `draft` initial — c'est une *proposition* à griller avant d'être envisagée comme vérité.

L'Idée qui en résulte porte :
- **proposes** : la couche / le kind ciblé (un control ? une policy ? une invariant ? souvent inféré du signal, parfois laissé vide — question ouverte — jamais deviné).
- **intent** : le comportement manquant en prose (ex. « un article qui devient indisponible entre l'ajout au panier et le paiement doit générer une erreur, la commande ne doit pas être créée »).
- **provenance** : `incident:#1043` porté verbatim depuis l'incident d'origine.
- **status** : `draft` (une idée candidate, pas gelée).
- **aucune version, aucun miroir** — elle n'est pas une vérité, elle la propose.

La porte utilisée est celle de S27 (idea-intake, la porte MCP `idea_capture`) : c'est la même que pour les idées humaines (« finalement je veux que… »). Réalité et humain partagent la même entrée — ce qui uniformise le traitement de « l'utilisateur change d'avis » et de « l'incident révèle une lacune ».

#### Le Miroir — ce que l'Idée propose d'écrire

Une fois l'idée grillée, l'humain (ou l'agent assisté) écrit le **miroir** qui couvre le comportement manquant. Ce miroir est une **fixture** ou un **invariant** (selon la nature du delta). Pour l'incident « out-of-stock-during-checkout » :

```gherkin
mirror reflects "out-of-stock-during-checkout" {
  given { cart: [item], item.stock: 0 }
  when checkout { }
    -> error("ITEM_UNAVAILABLE")
    -> order NOT created
}
```

C'est à ce moment seulement qu'on énonce une vérité testable. Le miroir est écrit **par l'humain** (ou une IA assistée, l'humain approuve), jamais par la boucle externe. La boucle ③ propose ; le humain décide.

### La garantie ONE-WAY : `ToKernel` toujours bloqué

C'est le cœur de la défense contre la réalité s'appropriant la vérité. Il existe une porte de refus explicite et non-bypassable : `ToKernel(incident) → BlockReason`.

**Chaque tentative d'un incident (ou d'une idée derivée) de s'écrire directement dans `/kernel`** retourne toujours :
```
BlockReason {
  code: "REALITY_CANNOT_DECLARE_TRUTH"
  severity: "DENY"
  explanation: "Un incident est la réalité brute, pas une vérité du noyau. Juger qu'un désaccord avec le réel est vrai est une DÉCISION DE VÉRITÉ, propriété de l'humain et du noyau, jamais de l'observateur."
  how_to_fix: [
    "incident:#NNNN → /learn → idée draft (provenance: incident:#NNNN)",
    "écrire le miroir (l'humain ou IA assistée)",
    "/goal : dégeler et écrire la vérité",
    "approbation humaine",
    "vérité gelée dans /kernel avec traçabilité à incident:#NNNN"
  ]
}
```

Ce refus est **à l'étage du wall** (S04) — il ne peut pas être contourné par une escalade d'autorisation, une ré-essai ou une édition silencieuse. C'est une loi du système, pas une politique.

Pourquoi cette garantie est vitale : juger qu'un désaccord avec le réel est vrai est une **décision de vérité**. Elle vit au-dessus de la ligne (owned by humans, KRD §1099). La réalité est le juge des faits, mais c'est l'humain qui déclare ce qu'est la vérité du système face à ces faits.

### Les quatre sources de vérité — et comment on en juge

KRD distingue trois sources de vérité candidate :

1. **L'humain** — « finalement je veux que… » — une intention délibérée.
2. **La réalité** — « l'incident révèle une lacune » — un fait observé, porté via une Idée.
3. **L'archive** — une décision antérieure, réutilisable (via `/context`).
4. **Le muant survivant** — une contrainte que le mutation testing n'a pas cassée ; elle faut la durcir ou la retirer.

Toutes les quatre arrivent à la porte S27 (idea-intake) comme candidates. Aucune ne devient vérité sans :
- ✅ être grillée (l'intention est-elle claire, falsifiable ?) ;
- ✅ acquérir un miroir (la vérité est-elle testable ?) ;
- ✅ passer `/goal` (le code respecte-t-il ce miroir ?) ;
- ✅ obtenir l'approbation humaine.

### La télémétrie comme capteur — OpenTelemetry vers la boucle ③

L'incident n'arrive pas par génération spontanée. La réalité en production envoie des signaux :
- **Défaillances récurrentes** : une opération échoue dans 30 % des cas.
- **Budgets violés** : latency p99 dépasse le seuil, consommation mémoire croît linéairement.
- **Anomalies métier** : une commande est créée sans paiement capturé.

Ces signaux arrivent via **OpenTelemetry** — la pile de telemetry qui collecte les spans et métriques du système en production. Le moteur RealityMirror lit ces signaux dans Postgres (la table `telemetry.spans` et `telemetry.metrics`), les normalise en un `Incident`, et appelle `/learn` pour les transformer en idées.

La règle : **« la prod est un sensor qui écrit au noyau »** (KRD §1100/§1521). Mais ce qu'elle écrit n'est pas de la vérité gelée — c'est une **proposition**, une demande de révision.

### Traçabilité et provenance — l'histoire des intentions

Chaque vérité gelée dans `/kernel` porte un lien de provenance pointant vers l'idée qui l'a engendrée. Quand cette idée vient d'un incident, la provenance dit `incident:#1043`, et ce lien **est traçable jusqu'à la réalité qui l'a révélée**.

Cela crée **l'histoire des intentions** : non seulement *ce que* le système croit vrai et *quand* ça a changé, mais *pourquoi* et *demandé par qui*. C'est ce qui manquait pour que « finalement je veux que… » et « finalement le réel prouve que… » soient des événements de première classe, pas des mutations silencieuses perdues dans l'historique du code.

Couplée à la généalogie (les versions successives d'une contrainte), cette provenance crée un **DAG d'intentions** : un noyau n'est plus une série de assertions isolées, mais un graphe de croyances liées et datet, chacune portant son justificatif et son auteur.

### Cas concret : l'incident « out-of-stock-during-checkout »

**En prod :** 30 % des `createOrder` échouent.

**Cause racine :** un article devient indisponible entre l'ajout au panier et le moment du paiement. L'ordre est créé avant la vérification finale du stock.

**Noyau avant :** aucune fixture ne couvrait ce cas. Le noyau était incomplet (faux par omission).

**Boucle ③ :**
1. OpenTelemetry rapporte 30 % d'erreurs sur `createOrder`.
2. L'analyse manuelle/automatique identifie le signal : stock change entre deux étapes.
3. RealityMirror crée un `Incident{ signal: "createOrder, 30% fail", cause_sketch: "item goes out-of-stock between add-to-cart and pay", incident:#1043, taint: [incident_derived] }`.
4. `/learn` émet une `IdeaCandidate{ proposes: "invariant", intent: "out-of-stock during checkout must error, order NOT created", provenance: incident:#1043, status: draft }`.
5. L'idée est grillée → claire.
6. L'humain écrit le miroir.
7. `/goal` réconcilie `createOrder` pour gérer ce cas.
8. Vague de rouge → createOrder passe maintenant le test. ✅
9. Le noyau a acquis une **nouvelle dent du cliquet** — une garantie qu'on ne casse plus ce cas.

**Epistémologie :** cette contrainte est maintenant **haute-confiance** — elle a été validée par le contact avec le réel, pas spéculée d'avance.

### Règles anti-hallucination du geste `/learn`

Le geste `/learn` est **déterministe** et refuse l'invention :

1. **proposes est inféré ou vide** — jamais deviné. Si le signal ne pointe pas vers une couche (control/entity/policy/view), le champ reste unset avec un `OpenQuestion`.
2. **intent est une esquisse, pas une assertion**. Elle porte un bout de prose — « out-of-stock pendant checkout doit échouer » — mais c'est une hypothèse que l'humain doit formaliser en miroir.
3. **provenance est porté verbatim** — `incident:#1043` depuis l'incident d'origine. Jamais réécrit, jamais amplifié.
4. **Pas de version-gel, pas de miroir** — `/learn` émet une idée, pas une vérité. La vérité est l'humain + le miroir + le `/goal`.
5. **Append-only** — un incident observé deux fois n'est jamais déduplicé ou reécrit. La recurrence s'incrémente ; l'historique est gardé.

### Limite de la boucle ③ : elle ne peut pas juger seule

La boucle externe lit la réalité et **propose**. Mais elle ne peut pas **décider ce qui est vrai**. C'est la garantie NIVEAU 3 de KRD (§1199/§1832) :

> Un système auto-améliorant a un seul vrai danger — il note sa propre copie. KRD pose que **l'ancrage contre cette circularité vient de deux sources : le noyau humain + la boucle externe (la réalité)**. Le harnais lit la réalité et propose ; c'est à l'humain de juger si la proposition devient vérité.

Si le mutation testing découvre une contrainte spéculative qui ne prédiction jamais aucun muant réel, c'est un indice qu'elle peut être retirée — mais même ce choix passe par `/trim-kernel` et une approbation humaine, pas une excision silencieuse.

### Place dans le workflow complet

La boucle ③ s'active **en parallèle avec les autres boucles, mais asynchrone** :

- Boucle ① (interne, `/goal`) : minutes. L'agent réconcilie le code quand l'humain change le noyau.
- Boucle ② (moyenne, `/evolve`) : heures. Le système explore les implémentations sous le miroir.
- **Boucle ③ (externe, `/learn`) : jours/semaines.** La prod donne du feedback ; un incident devient une idée ; le noyau peut être revu.
- Boucle ④ (méta, self-test) : semaines. Le harnais se durcit en ajoutant des sensors.

La boucle ③ n'est pas un incident response (« corriger la prod vite »). C'est une **révision du noyau fondée sur l'expérience**. Elle est lente parce qu'elle doit être réfléchie — une vérité fausse coûte cher à tous les consommateurs.

---

## L'amont — la frontière d'ingestion & la verticale du besoin

### La frontière d'ingestion : `/markitdown`

Le pipeline AIDOS commence avant toute vérité : **au-dessus du mur**, dans la zone de *staging* où les artefacts externes (documents non-markdown — PDF, DOCX, PPTX, XLSX, images, audio, vidéos) franchissent la première porte légale d'entrée du système.

La frontière d'ingestion est gardée par `/markitdown`, un **convertisseur déterministe** qui transforme un document externe en markdown, puis en **idée candidate** via la porte `idea-intake`. C'est le seul endroit où un document brut se mue en candidat-vérité : jamais directement dans le noyau `/kernel`, toujours comme esquisse floue, non-falsifiable, au stade `draft`.

**Discipline d'ingestion** : Le convertisseur `DocConverter{ToMarkdown(bytes, mime) → md}` est **déterministe et idempotent** — même fichier → même markdown, sans jamais réintroduire du non-déterminisme (pas de LLM au cœur de la conversion, jamais de re-paramétrisation). Son miroir est une **propriété d'idempotence** (`cert_language: property`, `authority: below-the-line`) : bite pour bite, une re-ingestion du fichier fixture produit le markdown byte-identique. Le port est **remplaçable** (ADR) — l'implémentation peut changer (`microsoft/markitdown`, ou un concurrent), pourvu que le contrat de sortie (markdown valide, conforme au schéma AIDOS) tienne.

**Ce que `/markitdown` ne fait pas** : elle n'émet **jamais** une idée « maison » ; elle ne capture que la provenance (d'où venait le doc, qui l'a ingéré, quand) et l'utterance verbatim (le markdown extrait). Elle n'élève pas de jugement sur la validité ou la clarté du contenu — ce jugement viendra plus tard, quand l'idée passera par `/grill`.

### La verticale du besoin et ses sept gestes : le track EL

Au-dessus du mur vit **la verticale du besoin**, ordonnée par la KRD §23 — la séquence architecturale immuable `product → journey → view → control → action → operation → entity` plus deux **bandes transversales** (`invariant` et `policy`) qui croisent tous les niveaux.

Cette verticale n'est pas arbitraire : c'est **l'architecture même**, traduite en interview niveau par niveau. Chaque niveau élucidé devient une **ancre figée** que le niveau inférieur doit respecter (le « compounding ») ; chaque niveau traversé rétrécit l'espace d'options du niveau suivant — de sorte que l'espace de conception n'explose jamais.

#### EL15 : `/besoin-intake` — la porte capacité au-dessus du BesoinGraph

L'MCP `besoin-intake` (`back/mcp/besoin-intake/`, Go MCP SDK) est la **seule porte légale de capture** au niveau du besoin, exactement comme `idea-intake` l'est pour les idées. Elle expose des outils déterministes :

- **Lectures d'état** : `besoin_graph_state`, `besoin_level_schema`, `besoin_list` — le client rend le formulaire correct, l'agent n'invente aucun champ.
- **Captures par niveau** : `besoin_capture_product`, `besoin_capture_journey`, … `besoin_capture_entity`, `besoin_capture_invariant` — chacune valide contre son schéma, passe la gate `CanDescend` (voir EL07), et append un `LevelNode`.
- **Pour les rungs mappants** (`control`, `action`, `operation`, `entity`, `product`, `policy`) : la capture émet aussi une `Idea` via `idea-intake` (provenance `human`, utterance verbatim, statut `draft`).
- **Pour les rungs `NoEmit`** (`journey`, `view`, `invariant` pur) : la capture append le nœud et seedent les ancres — jamais de cast silencieux vers une `Idea`.

Les **GRANTs** sont brutales : INSERT/SELECT/UPDATE sur le schéma `besoin` + réutilisation de la porte `ideas` uniquement ; **aucun GRANT** sur `kernel`, `mirrors`, `fitness`. La capture **se refuse** (renvoie `BlockReason`) si les conditions de forçage ne sont pas remplies.

#### EL13 : `/compound-besoin` — l'interview niveau par niveau

La skill `/compound-besoin` (`back/runtime/besoin/interview.go`) mène l'interview **forcée** du besoin. Elle :

1. **Lit le niveau entrable** — calculé par `CanDescend` (voir EL07), jamais deviné.
2. **Pose les branches ouvertes** — l'arbre de décision déterministe `BranchTree(level)` énumère les champs qui manquent, les références qui ne résolvent pas. Le LLM formule la question naturelle et paraphrase l'utterance.
3. **DISPATCHE vers le geste existant** — `grill` (pour trier l'intention `product`), `view` (pour affiner le rung `view`), `action` (pour les rungs `control`+`action`).
4. **Ferme chaque branche par un VERDICT déterministe** — parsing Gherkin, typing d'une Expr en booléen, résolution de références. Une réponse off-altitude (un attribut d'entité soumis au niveau `product`) échoue le **schema-mismatch** du niveau courant — pas par opinion, par schéma.

Le niveau passe `resolved` **seulement** quand `CanDescend.enough` retourne vrai. Et — point critique — **le LLM ne déclare jamais `resolved`**. Le code décide.

#### EL14 : `/besoin-invariant` — la bande transversale

La skill `/besoin-invariant` capture les invariants qui croisent tous les niveaux (les ∀ : « vrai sur **tous** les chemins ») et les policies d'autorisation (la **bande policy**, attachée à `operation`/`entity`, pas un rung vertical séparé).

Un invariant est énoncé comme ∀ ; s'il est donné comme exemple unique (∃), il est **rejeté** (`INVARIANT_IS_EXAMPLE_NOT_FORALL`). Le ban de circularité s'applique : **l'utilisateur énonce l'invariant, la skill ne peut pas en auteur un qu'elle satisferait ensuite** — le juge doit rester externe (KRD §8).

Chaque invariant/policy valide route via `classify-truth` (orchestrant les **trois packages distincts** des 4 métadonnées : `truthtyping`, `scope`, `authority`). Si c'est une policy, elle émet **au plus une Idea** via `idea_capture` ; un invariant pur n'émet rien (miroir property N1, pas une `Idea`).

#### EL07 & EL06 : `CanDescend` et le forçage anti-vacuité

La fonction pure `CanDescend(graph, level) → Verdict{enough, missing[], openQuestions[], blockReasons[]}` décide si un niveau peut être franchi.

Elle exige :
- **(a) Corps énoncé et non-vacant** — `product` : ≤ seuil de scénarios + intention ; `journey` : Gherkin parsable ; `view` : but+zones+données déclarés ; etc.
- **(b) Quatre métadonnées présentes** — `truth_kind`, `verifiability`, `scope`, `authority` (EL04).
- **(c) Références sortantes résolues** — `control.triggers → action`, `action.invoke → operation`, etc.
- **(d) Pas de contradiction avec ancres figées** — chaque ancre `resolved` au-dessus est immuable.
- **(e) ANTI-VACUITÉ — `ShrinkOptionSpace(graph, level) > 0`** — **critique**. Un niveau parsable qui ne rétrécit PAS l'espace d'options du niveau inférieur est `not_enough`. Un scénario vide qui parse mais ne contraint rien est **rejeté**. C'est ce qui empêche le gaming : l'IA ne peut pas se déclarer « c'est bon » en déclarant un produit qui n'émonde aucune branche d'architecture.

Le config `BesoinThresholds` porte tous les seuils (`≤5 scénarios`, champs requis par rung, etc.) — jamais inlinés en double, jamais appris. La **métrique `OptionSpace` énumérable** par paire de rungs (EL06) décrit le closed set de choix légitimes ; une paire sans set énumérable est une **OpenQuestion déclarée** (pas une capacité prétendue verte).

#### EL12 : `BranchTree` — l'Example-Mapping au-dessus du mur

`BranchTree(level, body) → []OpenBranch` énumère les branches à fermer pour que un niveau soit `resolved`. C'est l'**Example-Mapping déterministe**, construit above-the-wall, qui manquait avant à KRD.

Pour chaque branche, le verdict `IsResolved(level, answers)` = toutes branches fermées ∧ anti-vacuité satisfaite. La **classification d'altitude** est un **schema-mismatch déterministe** : une réponse est acceptée si elle satisfait le schéma déclaré du niveau courant ; un attribut d'entité soumis au `product` échoue le schéma du `product` (les champs déclarés ne l'incluent pas) — pas un jugement LLM.

#### EL05 : La table déclarée `LevelToProposes` — la jointure honnête

Le BesoinGraph élicite 9 rungs ; le closed set `ideas.ProposesKinds()` ne contient que 6 : `control | policy | operation | action | entity | product`.

La table **`LevelToProposes(level) → ProposesKind | NoEmit`** est **first-class, déterministe, CLOSE, TOTALE**. Ses mappages (décision ADR 0041) :

| Rung | Cible |
|---|---|
| `product`, `entity`, `operation`, `action`, `control` | **self-map** → émettre le kind homonyme |
| `policy` | **Emit** `policy` |
| `journey`, `view` | **NoEmit** — aucun kind homonyme, seeding des ancres sans émission |
| `invariant` | **NoEmit** — miroir property N1, pas une `Idea` |

**Règle d'or** : **aucun alias silencieux**. `journey → product` est **impossible** (erreur dure). Les rungs `NoEmit` n'émettent rien mais **contraignent latéralement** via `anchors_above[]` (voir EL08/EL17).

#### EL16 : `/emit-ideas` — la projection par la porte légale

L'émetteur déterministe `EmitIdeas(graph) → []Idea`, **gouverné par la table `LevelToProposes`**, projette le BesoinGraph résolu en Ideas :

- Pour chaque `LevelNode` `resolved` dont le rung **MAPPE** : `proposes = LevelToProposes(level)` (jamais un cast) ; `intent = corpus déclaré canonique` ; `provenance = {source: human, detail: utterance verbatim}`.
- Les nœuds `NoEmit` n'émettent **rien** ; leur contrainte vit dans `anchors_above[]`.
- `node_id` réutilise `records.Hash` → idempotence : byte pour byte, même BesoinGraph → mêmes Ideas, même ordre.
- Un nœud `unverifiable` (KRD §13.5) ne passe jamais directement en `spiking` ; il est capturé `draft`, puis avance par `/grill` → `/spike`.

**Aucun `idea_promote` n'existe**. Promotion = écrire le miroir = `/goal`, une opération qui revient à l'app-builder, jamais à ce track.

#### EL17 : `/red-backlog` — l'ordre topologique de promotion

`RedBacklog(graph)` topo-trie les Ideas émises selon les arêtes `constrains` (L→L+1) et `seeds` (L nomme un besoin plus profond) — l'ordre exact d'ouverture des `/goal` par l'app-builder. 

Chaque Idea porte `anchors_above[]` (incluant les nœuds `NoEmit` `journey`/`view` qui la contraignent sans émettre), de sorte que S64+ ouvre les `/goal` dans l'ordre architecturalement correct. La **forme de miroir attendue** est annexée via `LevelMirrorForm` (EL10) — `product/journey` → Gherkin N0, `invariant` → property N1, `operation` → fixture N2 — **jamais écrite** (le miroir est la responsabilité de l'utilisateur via `/goal`).

### Le schéma `besoin` — graphe content-adressé ordonné au-dessus du mur

Le BesoinGraph vit dans un **schéma Postgres distinct** `besoin`, append-only, content-adressé via `records.Hash(Canonicalize(graph))`. Chaque nœud `LevelNode` porte :

- `level` : l'altitude (rung SOURCE ou bande transversale)
- `body` : le JSONB du corpus déclaré
- `refs[]` : références sortantes resolues @version
- `provenance` : qui, quand (traçabilité)
- `status` : `empty | drafting | resolved`
- `OpenQuestions[]` : les manques portés (jamais bloquants)
- **Aucun champ `Version`, aucun `Mirror`** — c'est un besoin, pas une vérité

Le graphe lui-même :
- Append-only (jamais de suppression)
- Project-scopé (deux projets, deux graphes disjoints, RLS S55)
- **Jamais un graphe du noyau** — c'est du staging au-dessus du mur

### EL10 : `LevelMirrorForm` — la forme de miroir attendue pour chaque rung

Seule table nouvelle, **à construire**, qui déclare la forme de miroir que chaque rung **devrait** porter une fois promu en truth :

- `product` → Gherkin N0 (e2e, scénarios d'acceptation)
- `journey` → Gherkin N0 (workflow end-to-end)
- `view` → fixture-écran (état + données affichées)
- `control`, `action` → fixture N2 (état → commande → état + events)
- `operation` → fixture N2 (idem)
- `entity` → property N1 (invariants structurels) + contrat schema
- `invariant` → property N1 (∀ non-exemplifiée)
- `policy` → property N1 ou policy-fixture (selon nature)

Pour les 5 rungs déjà couverts par `derive-mirror`, la table **délègue** (zéro duplication). Pour les 3 nouveaux (`product`, `journey`, `view`), elle porte la forme fraîchement déclarée, avec **validateurs déterministes** (Gherkin parsable pour `journey`, but+zones+données pour `view`).

### EL09 : Complétude du besoin — le détecteur de monstre au-dessus du mur

`BesoinCompleteness(graph) → {complete, monsters[]}` applique la **loi de complétude** au BesoinGraph :

- Un nœud `resolved` sans son miroir-de-niveau énonçable = **monstre** (`NEED_LEVEL_WITHOUT_MIRROR`).
- Un miroir-de-niveau ne reflétant aucun nœud = **orphelin** (`ORPHAN_NEED_MIRROR`).
- Un nœud `resolved` dont les 4 métadonnées ont disparu = **monstre**.

La détection est **fonction pure** (comptage/appariement), jamais un LLM.

### EL11 : Le hook `Stop:besoin-gate` — non-bypassable, scopé

Le binaire Go `back/hooks/stop/besoin-gate` (distinct du `Stop` complétude-kernel existant) applique les deux gates :

1. **`¬CanDescend.enough`** → bloque la descente (le niveau n'est pas assez déclaré).
2. **`BesoinCompleteness` détecte un monstre** → bloque aussi (elle sont en **OU**, pas ET — chacune bloque indépendamment).

Renvoie un `BlockReason` actionnable (`how_to_fix[]` : `declare_missing_metadata`, `resolve_ref`, `state_invariant_as_forall`, `assign_authority`, `narrow_option_space`).

**Critique** : le hook est **scopé aux sessions avec un BesoinGraph ouvert** — no-op sinon (pas de sur-tirage sur chaque session kernel). Il porte sa fault-injection par disjonction (casser le `enough` → bloque ; injecter un monstre → bloque ; une session sans BesoinGraph → no-op).

### EL18 : Capitalisation du besoin — réutilisation cross-app via le mur

À la résolution complète d'un BesoinGraph, le système **capture l'ancre réutilisable** et le **motif de résolution comme mémoire procédurale** — via `firewall.ViaIdea` (jamais `ToKernel`, discipline CE03).

La **provenance du besoin** (le `graph_hash`) est portée dans le champ libre `MemoryItem.Provenance`, de sorte que l'Idea promue peut toujours **se résoudre jusqu'au graphe source**. La **réutilisation cross-app** passe par un **name-match canonicalisé** sur la clé `(level, normalized-intent-hash)` — si elle existe, elle rejoue le motif de résolution avec un `ReplayCost` meilleur que `DeriveCost` ; sinon, zero faux-positifs (pas de réutilisation prétendue). Sans cette normalisation explicite, la réutilisation cross-app est une **OpenQuestion déclarée** (pas une capacité verte).

### Le Workbench `/compound-besoin` — l'écran du forçage visible

La route `/compound-besoin` est un **wizard tunnel vertical** où chaque étape = un rung SOURCE (`product → … → entity`) + bandes. L'étape N+1 est **VERROUILLÉE** tant que `CanDescend(N).enough` n'est pas satisfait (la gate rendue visible, `missing[]` + `OpenQuestions[]` inline). 

Les **ancres prior** s'affichent en lecture-seule (compound visible), incluant les nœuds `NoEmit` qui contraignent. Un panneau « Compounding » affiche le compteur `ShrinkOptionSpace` (l'entier, pas un jugement) et l'historique de réutilisation cross-app (marqué OpenQuestion si la normalisation n'est pas live).

À la fin, `EmitRequirementsDoc(graph)` projette déterministiquement l'architecture-following requirements doc : 7 rungs ordonnés + bandes + métadonnées + OpenQuestions portées + liste des Ideas (avec `Proposes` issu de `LevelToProposes`, statut de grill, `graph_hash`). Les boutons exécutables « Projeter vers idea-intake » (porte légale) et « Ouvrir comme goals » (hand-off à S64) font passer les Ideas dans `/ideas` live avec provenance humaine.

### La porte légale d'intégration : aucun contournement

**Règle inviolable** : tout ce qui monte du besoin vers les idées passe par `idea-intake` (provenance `human`, utterance verbatim, statut `draft`). **Aucun écrit direct du kernel** — le schema `besoin` est distinct, la promotion vient plus tard (S66+, via `/goal`). Les rungs `NoEmit` n'émettent aucune Idea mais **constraignent latéralement** (leur rôle est de figer l'architecture, pas de créer une candidate-vérité).

Le **BesoinGraph EST la verticale KRD §23**, et le **RedBacklog en EST le tri topologique**. Chaque Idea porte son `anchors_above[]` et sa forme de miroir attendue (EL10) — de sorte que l'app-builder S64+ reçoit un besoin **déjà structuré, ordonné, content-adressé**, au lieu d'une intention floue. Le compound s'applique **en profondeur** (chaque niveau rétrécit l'OptionSpace inférieur, mesurément) ET **dans le temps** (réutilisation d'ancres cross-app via le mur, sous noms canonicalisés — anti-false-positif).
