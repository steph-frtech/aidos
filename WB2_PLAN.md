# WB2_PLAN — Workbench V2 + Docs V2 (exécutable par /long-run)

> **V2 = refonte propre, à NEUVES URLs, l'ancien GARDÉ.** Workbench V2 sous le préfixe de route **`/v2`** (les routes actuelles restent intactes) ; Docs V2 = une **nouvelle arborescence Mintlify** organisée **par concept** avec le **bon vocabulaire KRD** (idée · mur · kernel · verticale · facette · paires-miroir · liens §17 · cellules · arbres), l'ancienne doc conservée. Chaque écran utilise la **bonne lib par usage** (ADR 0053) : arbres = **React Arborist** (dense) / **react-aria Tree** (petit a11y) ; wizards = **XState v5 + React Hook Form + Zod** + stepper shadcn ; workflows = **React Flow** (visuel) / **XState** (exécutable) ; graphe 3D = react-force-graph-3d (ADR 0051). Thème ADR 0010 (Tailwind+shadcn, **pas de MUI**), i18n ADR 0011 (FR défaut). Discipline §6 à chaque étape : grill-with-docs → miroir rouge (twin `lib/` + vitest/fast-check) → tdd → senseurs → complétude → diagnose → écran V2 exécutable + e2e Playwright → improve-arch → 2 pages Mintlify V2 → ticket Linear. « Done » calculé : red→vert ∧ vert antérieur intact ∧ aucun monstre. **Le mur** : tout écran V2 PROPOSE ; aucune écriture kernel/mirrors/fitness hors idée→miroir→/goal. Déterminisme-first : la donnée (arbres/machines/graphes) = projections pures testées dans `lib/`, les libs ne sont que du rendu.

---

## WB2-00 — Fondation V2 : route `/v2`, shell, nav, tokens, glossaire partagé
**Sous-systeme:** Workbench
**Objectif:** Groupe de routes `app/v2/` (layout + shell + header V2 + nav par concept), distinct des routes actuelles (gardées) ; tokens shadcn (ADR 0010), bilingue (ADR 0011) ; un module `lib/v2/glossary.ts` = le vocabulaire canonique KRD (slug → terme FR/EN + définition) source unique des libellés V2.
**Detail:** ADR 0053 + le schéma complet (idée→mur→verticale×facette×anatomie→liens→arbres). Aucune route existante touchée.
**Inputs:** ADR 0010, 0011, 0053.
**Criteres de done:** `/v2` rend le shell + la nav ; property — le glossaire est total (chaque concept a FR+EN+def) ; e2e — `/v2` 200, l'ancien `/` 200 (coexistence) ; aucun terme franglais dans la nav V2 (lint vocabulaire).

## WB2-01 — Librairies V2 installées + ADR câblé + sondes
**Sous-systeme:** Workbench
**Objectif:** Installer react-arborist, react-aria-components, xstate + @xstate/react, react-hook-form, zod, @xyflow/react (bpmn-js différé) ; un composant de démonstration minimal par lib (smoke) prouvant qu'elles montent en client-only (dynamic ssr:false si besoin) + build OK.
**Detail:** ADR 0053. bpmn-js = OpenQuestion (différé).
**Inputs:** WB2-00.
**Criteres de done:** `next build` vert avec toutes les libs ; un smoke e2e par lib (un arbre, une machine XState, un React Flow montent) ; tailles de bundle notées (lazy par route).

## WB2-02 — La carte des concepts (l'accueil V2)
**Sous-systeme:** Workbench
**Objectif:** Page d'accueil `/v2` = le **schéma complet** interactif : idée (étage d'entrée) → MUR (/goal) → verticale (7 niveaux) × facette (8) × anatomie (6 paires-miroir) → liens §17 → les arbres. Chaque bloc cliquable mène à son écran. Diagramme rendu (React Flow read-only) + le bon vocabulaire partout.
**Detail:** le schéma complet KRD ; glossaire WB2-00.
**Inputs:** WB2-00, WB2-01.
**Criteres de done:** e2e — chaque bloc du schéma navigue vers son écran ; property — les libellés viennent du glossaire (pas de chaîne en dur).

## WB2-03 — L'Idée (l'étage d'entrée) — wizard XState
**Sous-systeme:** Workbench / Kernel
**Objectif:** Écran `/v2/idee` : capturer un **besoin** (candidat-vérité, §115) via un **wizard XState + RHF + Zod** : texte → coordonnée cible (niveau × facette × échelle fractale) → provenance (humain|incident) → forme de miroir attendue ; `HasMirror=false` ; PROPOSE, n'écrit aucune vérité (le mur).
**Detail:** §115-116 (idée = vérité sans gel ni miroir), EL idea-intake. Wizard = ADR 0053.
**Inputs:** WB2-00, WB2-01.
**Criteres de done:** twin `lib/v2/idea.ts` pur (besoin → coordonnée, déterministe) + property ; e2e — parcours wizard complet → une idée proposée (amber), jamais une écriture-vérité ; XState : états visibles, transitions testées.

## WB2-04 — L'arbre de composition (kernels) — React Arborist
**Sous-systeme:** Workbench / Kernel
**Objectif:** `/v2/kernels` : l'**arbre fractal** des kernels (`composes`, §17) — produit→parcours→…→entité, chaque nœud = un kernel à son niveau, virtualisé (React Arborist), drill-down. Clic → l'anatomie du kernel (WB2-06).
**Detail:** §49 composition fractale ; ADR 0053 (Arborist pour l'arbre dense).
**Inputs:** WB2-00, WB2-01.
**Criteres de done:** twin `lib/v2/kernel-tree.ts` (composition → arbre, pur, ordonné) + property ; e2e — déplier/replier, naviguer 200+ nœuds (virtualisation), clic → anatomie ; aucun nœud orphelin.

## WB2-05 — Verticale × facette (les deux axes) — la grille navigable
**Sous-systeme:** Workbench
**Objectif:** `/v2/grille` : la grille **niveau × facette** (7×8) navigable, sommes Σ par ligne/colonne, clic d'une cellule → ses kernels/specs. Le bon vocabulaire des 8 facettes (F·I·S·B·R·V·M·X) + 7 niveaux.
**Detail:** FKE-1.4 les deux axes.
**Inputs:** WB2-04.
**Criteres de done:** twin `lib/v2/grid.ts` (sommes déterministes, Σ = total) + property ; e2e — clic cellule → specs, sommes cohérentes.

## WB2-06 — L'anatomie 1-pour-1 (6 paires-miroir + le mur)
**Sous-systeme:** Workbench
**Objectif:** `/v2/anatomie/[kernel]` : les **6 paires-miroir** d'un kernel autour du **mur** (Spec↔Doc · Comportement↔Résultats · Scénarios↔Tests · Modèle↔Projection · Contrat↔Code · Evidence-attendue↔Evidence-observée), au-dessus = déclaré, en-dessous = prouvé (machine), voyant 🟢/🔴/🟡 par paire.
**Detail:** FKE-1.3 anatomie.
**Inputs:** WB2-05.
**Criteres de done:** twin pur (paires + voyants) + property ; e2e — le mur dessiné, bas read-only, voyants déterministes.

## WB2-07 — Le Version DAG — React Flow
**Sous-systeme:** Workbench / Archive
**Objectif:** `/v2/dag` : le **DAG de versions** (S24) content-adressé, append-only, branches/merges, rendu **React Flow** (nœuds = versions, arêtes = ChangeSets). Identité = hash de version.
**Detail:** S24 DAG ; ADR 0053 (React Flow visuel).
**Inputs:** WB2-01.
**Criteres de done:** twin `lib/v2/version-dag.ts` (DAG pur, topo-trié) + property — acyclique, hash stable ; e2e — pan/zoom, une branche s'affiche.

## WB2-08 — Les 6 liens (§17) — explorateur
**Sous-systeme:** Workbench / Kernel
**Objectif:** `/v2/liens` : les **six liens** (verticaux `composes` · horizontaux `depends_on` · généalogiques `supersedes` · provenance · triggers/binds · mirrors), tous pinnés @version ; filtrer par type, voir les arêtes (React Flow) entre kernels.
**Detail:** §41 les six liens.
**Inputs:** WB2-04, WB2-07.
**Criteres de done:** twin (liens typés, @version) + property — tout lien pointe une version, jamais une identité ; e2e — filtre par type d'arête.

## WB2-09 — Les cellules (bounded contexts) + Pact — la fédération
**Sous-systeme:** Workbench
**Objectif:** `/v2/cellules` : les **cellules** (features = kernels grossiers, §49) ; par cellule : sa grille niveau×facette (somme Σ), ses liens internes `composes` ↓ et ses contrats `depends_on`/**Pact** → vers les autres cellules ; clic cellule → drill-down ; clic case → ses specs.
**Detail:** §49 fédération de bounded contexts + Pact.
**Inputs:** WB2-05, WB2-08.
**Criteres de done:** twin `lib/v2/cellules.ts` (rollups + liens, déterministe) + property — Σ cohérente, aucune spec perdue ; e2e — naviguer cellule → cases → specs.

## WB2-10 — Le geste /grill — wizard XState
**Sous-systeme:** Workbench / Runtime
**Objectif:** `/v2/grill` : le geste **grill-with-docs** comme machine XState (≤5 scénarios, affûtage du langage, seed docs) + RHF/Zod ; sortie = intention affûtée + ADRs candidats. PROPOSE.
**Detail:** skill grill-with-docs ; §6 phase 1.
**Inputs:** WB2-03.
**Criteres de done:** twin (machine déterministe) + property ; e2e — parcours grill complet ; stepper shadcn.

## WB2-11 — Le /goal (idée → miroir → goal → gel) — le franchissement du mur
**Sous-systeme:** Workbench / Kernel
**Objectif:** `/v2/goal` : la transition **idée → écrire le miroir → /goal → gel** (machine XState) ; montre le MUR franchi (HasMirror false→true, version frozen) ; l'écran PROPOSE → ChangeSet → approbation (jamais une écriture directe).
**Detail:** §116 promouvoir = écrire le miroir = /goal.
**Inputs:** WB2-03, WB2-06, WB2-10.
**Criteres de done:** twin — la transition est pure (idée+miroir → kernel proposé) ; e2e — au /goal l'idée descend à sa coordonnée + reçoit une version ; écriture-vérité directe refusée au mur.

## WB2-12 — Les fixtures Operation DSL exécutables — XState
**Sous-systeme:** Workbench / Kernel
**Objectif:** `/v2/operations/[op]` : une fixture S10 `état → commande → events` rendue + **exécutée** comme machine **XState** ; rejouer la fixture, voir les events ; visualisation du graphe d'états (React Flow).
**Detail:** S10 Operation DSL ; ADR 0053 (XState exécutable).
**Inputs:** WB2-01.
**Criteres de done:** twin — l'interpréteur de fixture est pur (mêmes commandes → mêmes events) ; e2e — rejouer une fixture, états/events visibles.

## WB2-13 — Scénarios & workflows visuels — React Flow
**Sous-systeme:** Workbench
**Objectif:** `/v2/workflows` : éditeur/afficheur de **scénarios/workflows** (le pipeline FKE-3, un flux de la verticale) en **React Flow** — nœuds custom (étape/gate/décision), pan/zoom ; lecture des fixtures, édition proposée.
**Detail:** FKE-3 pipeline ; ADR 0053 (React Flow visuel).
**Inputs:** WB2-01, WB2-12.
**Criteres de done:** twin (graphe pur depuis la fixture) + property ; e2e — le pipeline s'affiche, on déplace un nœud (édition proposée, non écrite).

## WB2-14 — Policy DSL — l'arbre de règles (React Arborist)
**Sous-systeme:** Workbench / Kernel
**Objectif:** `/v2/policy` : la **Policy DSL** (§24.4) = arbre récursif ALLOW/DENY (combinateurs all/any/not) rendu **React Arborist** ; voir l'évaluation (tous ALLOW passent, tout DENY bloque), scopes RESOURCE/OPERATION/ENTITY/FIELD.
**Detail:** §24.4 Policy DSL.
**Inputs:** WB2-01.
**Criteres de done:** twin — l'évaluateur de policy est pur + property (DENY domine) ; e2e — l'arbre se déplie, un cas évalue.

## WB2-15 — AI Lab V2 : le chat (Claude) qui agit sur tous les niveaux
**Sous-systeme:** Workbench / Runtime
**Objectif:** `/v2/ai-lab` (refonte du modèle corrigé) : GAUCHE chat langage naturel (Claude, cerveau gauche) → place les specs sur la verticale (niveau×facette×paire) ; gaté + vérifié (clamp) ; le mur (PROPOSE) ; fallback déterministe.
**Detail:** FKE-38 corrigé ; ADR 0053.
**Inputs:** WB2-05, WB2-06.
**Criteres de done:** twin — placement gaté pur (clamp à l'espace déclaré) + property ; e2e — un besoin → specs placées multi-niveaux ; écriture-vérité refusée.

## WB2-16 — AI Lab V2 : descente d'anatomie (valider → paire suivante)
**Sous-systeme:** Workbench
**Objectif:** Dans `/v2/ai-lab` : valider une spec → génère la paire suivante de l'anatomie (Spec→Comportement→Scénarios→Modèle→Contrat→Evidence), par facette ; enrichissement Claude gaté + fallback template déterministe (§6 : la chaîne est du code).
**Detail:** la descente d'anatomie ; ADR 0053.
**Inputs:** WB2-15.
**Criteres de done:** twin — `validateAndDescend` pur (which-pair déterministe) + property ; e2e — la descente chaîne, dernière paire → réalisée.

## WB2-17 — AI Lab V2 : impact sur le DAG existant (vague de rouge) + résolution
**Sous-systeme:** Workbench
**Objectif:** À droite : les specs **existantes** que le besoin impacte (rouge) ; résolution (rouge→vert) quand le besoin est validé ; cohérent partout (liste, grille, cellules, graphe).
**Detail:** S22 impact / red wave.
**Inputs:** WB2-15, WB2-09.
**Criteres de done:** twin — `impactResolved` pur + property ; e2e — valider tout → tout le rouge passe vert.

## WB2-18 — Le graphe 3D des specs (vue d'ensemble) — react-force-graph-3d
**Sous-systeme:** Workbench
**Objectif:** `/v2/graphe` : graphe 3D façon Obsidian, axes verticale × facette × profondeur d'anatomie ; nœuds = specs + DAG existant, liens = descente + impacts ; couleurs (proposé/validé/réalisé/impacté/résolu).
**Detail:** ADR 0051.
**Inputs:** WB2-15, WB2-17.
**Criteres de done:** twin `buildSpecGraph` pur + property (positions déterministes) ; e2e — le graphe monte, tourne/zoome.

## WB2-19 — Le WhyTree (5-pourquoi redressé) — React Arborist
**Sous-systeme:** Workbench / Runtime
**Objectif:** `/v2/why` : l'arbre **caused_by** (FKE-35.1) — d'un symptôme à la cause racine, remontée déterministe sur les liens, LLM gaté pour le hors-graphe (cause VÉRIFIÉE), terminaison obligatoire en miroir ; rendu React Arborist.
**Detail:** FKE-35.1 WhyTree.
**Inputs:** WB2-08.
**Criteres de done:** twin — remontée pure + property (déterministe) ; un WhyTree sans miroir terminal refusé ; e2e — un symptôme → arbre.

## WB2-20 — La Conscience (agrégateur) + decision cards
**Sous-systeme:** Workbench
**Objectif:** `/v2/conscience` : l'agrégateur **déterministe** des verdicts existants (FK09) — compare voulu/construit/prouvé/autorisé, voyants par paire, decision cards (accept/amend/reject/defer) ; PROPOSE → /goal.
**Detail:** FK09 conscience (agrégateur, pas un nouveau juge).
**Inputs:** WB2-06, WB2-15.
**Criteres de done:** twin — reconcile pur + property (même verdicts → même rapport) ; e2e — voyants + cards.

## WB2-21 — Émetteurs : specs → DDL/types + aperçu de l'app émise
**Sous-systeme:** Workbench / Runtime
**Objectif:** `/v2/emetteurs` : montrer l'émission depuis les entités (DDL · types Go/TS · contrats), byte-stable ; aperçu de l'app émise. Réutilise les émetteurs réels (S34/S35/gen).
**Detail:** S34 émetteurs ; ADR 0052.
**Inputs:** WB2-04, WB2-06.
**Criteres de done:** property — re-émission byte-identique ; e2e — voir le DDL + les types émis.

## WB2-22 — Déployer : émettre l'app web → prod (gaté)
**Sous-systeme:** Workbench / Runtime
**Objectif:** `/v2/deploy` : émettre une vraie app web (vitrine + panier + checkout) depuis les specs → conteneuriser → déployer derrière Traefik ; aperçu live ; le bouton GATÉ (auth/rate-limit, l'OpenParenthèse sécurité d'ADR 0052).
**Detail:** ADR 0052 + gate sécurité.
**Inputs:** WB2-21.
**Criteres de done:** e2e — déploiement → URL live + aperçu ; le bouton refuse sans auth (gate) ; le mur (action sous la ligne).

## WB2-23 — Docs V2 : nouvelle arborescence Mintlify par concept
**Sous-systeme:** Documentation
**Objectif:** Nouvelle section Mintlify V2 (URLs neuves, l'ancienne gardée) : index « Les concepts » organisé par le schéma (idée · mur · kernel · verticale · facette · paires-miroir · liens · arbres · cellules · gestes · AI Lab · émission/déploiement) ; `docs.json` enregistre la section V2 ; prose FR (vous), termes KRD verbatim.
**Detail:** mandat doc §6 ; le bon vocabulaire.
**Inputs:** WB2-00 (glossaire).
**Criteres de done:** `mint validate` + `mint broken-links` clean ; chaque concept a sa page ; aucun terme franglais (lint vocabulaire).

## WB2-24 — Docs V2 : une page « Pour moi » par écran V2 (internals)
**Sous-systeme:** Documentation
**Objectif:** Pour chaque écran V2, la page internals (Implémentation · Méta · Méta-méta) — les libs utilisées (ADR 0053), les twins `lib/`, les miroirs, la place dans le cliquet KRD.
**Detail:** mandat doc §6 (deux pages par étape).
**Inputs:** WB2-23 + les écrans WB2-02..22.
**Criteres de done:** chaque écran V2 a ses 2 pages ; liens internes valides ; poussé sur steph-frtech/docs.

## WB2-25 — Cohérence finale + lint vocabulaire + release V2
**Sous-systeme:** Workbench / Documentation
**Objectif:** Passe de cohérence : nav V2 complète, **lint vocabulaire** (aucun franglais, le bon mot partout, du glossaire), suite e2e V2 verte, suite vitest verte ; bascule prod : la V2 servie à sa nouvelle URL (sous-domaine ou `/v2`), l'ancienne gardée.
**Detail:** cohérence d'ensemble.
**Inputs:** WB2-00..24.
**Criteres de done:** lint vocabulaire 0 écart ; e2e V2 complète verte ; build + déploiement V2 live ; l'ancien Workbench/doc toujours 200.
