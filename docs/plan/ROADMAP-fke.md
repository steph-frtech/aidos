# ROADMAP — FKE : les deltas code de la discipline (piste FK, post-S117)

> **Statut :** conçue aux grills des 2026-06-07 (ADR 0044 + ADR 0045), **lancement APRÈS S117** (zéro collision avec le build app-builder). Source du concept : `KRD.md` LIVRE XXX (FKE-1.3 anatomie 1-pour-1, FKE-1.4 les deux axes, FKE-3 pipeline, FKE-35.1 WhyTree, FKE-38 cockpit). Chaque étape suit la boucle §6 (grill-with-docs → miroir rouge → tdd → senseurs → complétude → diagnose → UI exécutable + e2e → improve-arch → accrétion + 2 pages Mintlify + Linear). Le mur intact ; **determinism-first** partout (le juge reste le miroir ; le LLM gaté + vérifié) ; tout **additif** (anti-overwrite §9) — le squelette 6-paires généralise N0-N5, les facettes réutilisent les senseurs existants, `caused_by` rejoint les liens §17.

---

## EPIC FK-A — Le système de coordonnées de la vérité (niveau × facette)

## FK01 — `truth_level` stocké + miroir de parité
**Sous-systeme:** Kernel / Archive
**Objectif:** Les 7 niveaux de vérité (Raw→Reconciled) stockés sur les records, écrits UNIQUEMENT par la transition déterministe (calculée depuis idea/changeset/miroir/evidence/conscience).
**Detail:** FKE-5/§5. Migration additive ; « done is computed » = le stockage est un cache prouvé du calcul.
**Criteres de done:** property — `stored_level == computed_level` (miroir de parité, divergence = rouge) ; transition = fonction pure totale ; SemanticDiff `add` ; panel filtre par niveau.

## FK02 — Les 8 facettes déclarées + facet-set effondrable
**Sous-systeme:** Kernel
**Objectif:** Un kernel déclare quelles **lentilles** il instancie (F/I/S/B/R/V/M/X) ; F toujours présente (incompressible : intention + paire de preuve) ; validation refuse une facette vide et une facette manquante requise.
**Detail:** FKE-1.3 (8 facettes, croisées ISO 25010, effondrables). Ensemble clos de lentilles. X = vérité molle (régime ExperienceClaim §13.6).
**Criteres de done:** property — un kernel sans facette fonctionnelle refusé ; une facette déclarée sans ses paires = monstre ; une fonction pure porte F+I+M, un endpoint PII porte tout — round-trip content-adressé.

## FK03 — La grille niveau × facette (les deux axes)
**Sous-systeme:** Kernel / Runtime
**Objectif:** Toute vérité porte ses deux coordonnées — **niveau** (verticale produit→entité) **× facette** (nature). Le graphe/ContextRouter expose la cellule ; la verticale est l'axe **latéral** (couplant), la facette l'axe **orthogonal** (séparant).
**Detail:** FKE-1.4. Réutilise S15 TruthScope (niveau) + FK02 (facette).
**Criteres de done:** property — chaque vérité résout à une cellule (niveau, facette) déterministe ; un ContextPack scope par cellule ; les facettes n'interagissent pas, la verticale couple (test : un changement bas marque les rungs source au-dessus).

## FK04 — Complétude facet-aware (le monstre généralisé)
**Sous-systeme:** Mirror
**Objectif:** La loi de complétude vérifie les paires de **toutes les facettes instanciées** — incompressible = intention + paire de preuve ; une paire requise manquante/divergente de N'IMPORTE QUELLE facette = monstre (une faille sécu, une régression perf, une migration qui perd, un invariant non prouvé = monstres, comme un test manquant).
**Detail:** FKE-1.3 conséquence 5. Étend S12 complétude (aujourd'hui « vérité ↔ miroir vivant »).
**Criteres de done:** fault-injection — retirer une paire d'une facette instanciée → monstre détecté ; un kernel effondré légal passe ; aucun kernel existant conforme invalidé (additif).

---

## EPIC FK-B — Les miroirs étendus (le squelette 1-pour-1, par facette)

## FK05 — Expand E0-E7 : mapping N→E + types de preuve manquants
**Sous-systeme:** Mirror
**Objectif:** Table de mapping N0-N5→E0-E7 (fonction pure) + double-étiquetage additif + ajout des types **E4** (sécurité : gosec/gitleaks/evals-injection), **E6** (runtime : observation+rollback), **E7** (formel) au contrat de preuve.
**Detail:** FKE-16. *Expand* compatible build en cours ; le *contract* (bascule schéma) = FK16.
**Criteres de done:** property — même miroir → même E (mapping total) ; un kernel affiche son evidence E-typée ; zéro miroir N existant modifié.

## FK06 — Dérivation déterministe de s9 (doc dérivée du code)
**Sous-systeme:** Generators
**Objectif:** Émetteur pur `DeriveDoc(kernel) → s9` depuis les ASTs (operations, controls, routes, noms de tests, erreurs) — la moitié basse du doc-miroir, structurée pour la comparaison.
**Detail:** FKE-1.3 décision (a). 
**Criteres de done:** property — même kernel → s9 byte-identique ; s9 structurée (concepts du lexique, behaviors, erreurs).

## FK07 — Les doc-miroirs + data-miroir (comparaison structurelle)
**Sous-systeme:** Mirror
**Objectif:** Comparaison STRUCTURELLE ensembliste s2↔s9 et s1↔s10 (concepts présents/absents, behaviors énumérés, erreurs couvertes) — divergence **structurelle** bloquante, **prose** advisory (LLM signale, n'arbitre jamais) ; data-miroir s3↔s7 déclaré.
**Detail:** FKE-1.3 décision (a). Le juge reste un calcul (§8).
**Criteres de done:** fault-injection — retirer un behavior du code → doc-miroir rouge ; éditer la prose seule → advisory ; property — même paire → même verdict.

## FK08 — Câbler les facettes S/R/V/M/X (les colonnes parallèles)
**Sous-systeme:** Mirror / Runtime / Generators
**Objectif:** Réaliser les 6 paires de chaque facette non-fonctionnelle : **S** (tests sécurité + police/scans, réutilise GV) · **R** (chaos/fault-injection, failover, restore, disjoncteurs/outbox) · **V** (migration expand-contract, backfill, restore — réutilise S95/migrate) · **M** (arch-fitness le 2ᵉ cliquet §47, réutilise S102/FN02) · **X** (ExperienceClaim §13.6, régime soft : informe, ne bloque pas).
**Detail:** FKE-1.3 (les 6 tables de facettes). Chaque facette réutilise un senseur existant.
**Criteres de done:** par facette, fault-injection — casser une paire rougit la bonne colonne ; **X reste advisory** (ne cliquette pas dur) ; property — chaque facette = le squelette 6-paires lu sous son angle.

---

## EPIC FK-C — La conscience & le cockpit

## FK09 — La conscience : agrégateur déterministe + rapport + decision cards
**Sous-systeme:** Runtime / Workbench
**Objectif:** `Reconcile(kernel) → ConsciousnessReport` — fonction pure composant les verdicts des juges EXISTANTS (runner, complétude, SemanticDiff, RealityMirror, senseurs, ledger), paire par paire, sur toutes les facettes instanciées ; produit les decision cards (FKE-31). AUCUN nouveau juge.
**Detail:** FKE-6.3. Route `/conscience`.
**Criteres de done:** property — mêmes verdicts d'entrée → même rapport ; le rapport ne contient que des verdicts sourcés (pas de jugement propre) ; e2e — une divergence produit sa decision card actionnable.

## FK10 — A0-A8 : 6ᵉ axe de l'agentlayer + montée par preuve
**Sous-systeme:** Kernel / Runtime
**Objectif:** `autonomy_level` ∈ {A0..A8} (ensemble clos) déclaré par CoucheAgent ; enforcement fail-closed (action au-dessus du niveau = BlockReason) ; montée calculée depuis l'historique AgentRun (N runs verts E4+ sans incident).
**Detail:** FKE-11/34. A8 jamais sur action critique.
**Criteres de done:** fixture — un A1 tentant un merge refusé ; property — la promotion est une fonction pure de l'historique ; jamais déclarée.

## FK11 — L'écran AI Lab : le cockpit trialogue
**Sous-systeme:** Workbench / Runtime
**Objectif:** Route `/ai-lab` — GAUCHE chat/vibe scopé au nœud (cerveau gauche → slots proposés, jamais de vérité) ; CENTRE la couche navigable = kernel + anatomie 1-pour-1, mur dessiné, voyant 🟢/🔴/🟡 par paire de toutes les facettes (conscience live) ; DROITE decision cards + blast radius + red wave + promotion gate. 2 modes (conversationnel/navigationnel) = même écran à zoom différent.
**Detail:** FKE-38. Compose S58+S60+E4+E5+FK09. Évolution du GraphCockpit.
**Criteres de done:** Playwright e2e — chatter → slot proposé (amber) → valider une card → paire 🔴→🟢 ; écriture-vérité directe depuis le chat refusée ; bas du mur read-only ; cliquer une paire scope gauche+droite. Property — écarts affichés = déterministes (SemanticDiff/blast).

---

## EPIC FK-D — La causalité dans les deux sens

## FK12 — Lien `caused_by` + red-wave inverse déterministe
**Sous-systeme:** Kernel / Links
**Objectif:** Un nouveau type de lien **`caused_by`** (l'arête causale arrière, à côté de composes/contracts_with/impacts, §17), versionné ; et la **remontée déterministe** (inverse de `impacts`/red-wave) d'un miroir rouge vers ses dépendances.
**Detail:** FKE-35.1. Réutilise S17 links + S22 red-wave (le sens avant existe).
**Criteres de done:** property — `caused_by` round-trip versionné ; remontée déterministe (même graphe+symptôme → même chaîne de causes candidates) ; cycle refusé.

## FK13 — WhyTree + geste `/why` (le 5-pourquoi redressé)
**Sous-systeme:** Runtime / Workbench
**Objectif:** `/why` construit un **WhyTree** (arbre fishbone, content-adressé, provenancé) depuis un symptôme : remontée déterministe sur `caused_by` (FK12) ; LLM gaté pour le « pourquoi » hors-graphe **avec cause VÉRIFIÉE (reproduite ou rejetée)** ; **terminaison obligatoire en miroir** (racine → `/learn` → miroir d'anti-récurrence). Extension de `/diagnose` + `/learn`.
**Detail:** FKE-35.1. Pas une facette — geste du loopback, transversal aux 8 facettes.
**Criteres de done:** fixture — un symptôme produit un WhyTree dont chaque cause est reproductible (une cause non reproductible est rejetée) ; un WhyTree sans miroir terminal est refusé (`WHYTREE_NO_MIRROR`) ; property — la remontée graphe est déterministe ; e2e — ingérer un incident, voir l'arbre, approuver le miroir racine, voir le red wave.

---

## EPIC FK-E — Projections d'outillage, lexique & bascule

## FK14 — Lexicon Kernel + linter inter-couches
**Sous-systeme:** Kernel / Mirror
**Objectif:** Le concept nommé à travers les 16 couches (humain/BDD/code/test/DB/API/event/log/metric/MCP/skill/agent/doc/CI/policy/memory) comme source (fork stockage record-kind vs `kind:layer`, tranché ici) ; linter pur détecte un symbole hors lexique par couche.
**Detail:** FKE-21.
**Criteres de done:** fault-injection — renommer une table hors lexique → rouge ; property — vérification = fonction pure du lexique + symboles.

## FK15 — Projections d'outillage + Spécification technique & Tests techniques (générés)
**Sous-systeme:** Generators
**Objectif:** (a) `CLAUDE.md`/`AGENTS.md`/`.cursorrules`/memory-bank émis depuis les kernels (policy/memory/style/architecture/agent-profile) ; (b) **deux projections par kernel** (FKE-20.1) : la **Fiche de Spécification Technique** (assemble Contrat F5 + Modèle F4 + specs des facettes S1/B1/R1/V1/M1 + ADR liés, rangée par couches ISO) et la **Suite de Tests Techniques** (unitaire/intégration N4 + infra N5 + tests sécurité/perf/chaos/arch S3/B3/R3/M3). Jamais hand-éditées (hash-protégées, drift par source-hash) ; jamais la vérité (vues assemblées, pas de double-typage).
**Detail:** FKE-20 + FKE-20.1. D'abord kerneliser le contenu actuel (legacy kernelizer, trust=inferred→validé), sans perte.
**Criteres de done:** property — mêmes kernels → mêmes fichiers byte-identiques (outillage ET fiche tech ET suite de tests) ; un hand-edit détecté ; la fiche technique assemble exactement les déclarations techniques existantes (zéro nouvelle vérité) ; contenu actuel kernelisé sans perte.

## FK16 — Contract E0-E7 : bascule du schéma (STRICTEMENT en dernier)
**Sous-systeme:** Mirror / Archive / Workbench
**Objectif:** Bascule `mirrors`/`cert_language`/panneaux (`/proof-levels` → E0-E7)/docs vers E ; N déprécié via lifecycle, jamais supprimé (append-only) ; migration expand-contract gated DataTruthScope.
**Detail:** FKE-16, *contract*. Dernier de la piste (touche le gelé-prouvé).
**Criteres de done:** zéro perte (chaque miroir N porte son E) ; panels rendent E ; `aidos check` vert sur tout le corpus re-étiqueté ; docs Mintlify à jour.

---

## Note de dépendances (l'ordre `/long-run`)

1. **FK-A d'abord** (coordonnées) : FK01 (truth_level) → FK02 (facettes déclarées) → FK03 (grille) → FK04 (complétude facet-aware). FK02 gate tout le reste (les facettes doivent exister avant qu'on câble leurs miroirs).
2. **FK-B** (miroirs) : FK05 (E0-E7 expand) → FK06 (dérive s9) → FK07 (doc-miroirs) → FK08 (facettes S/R/V/M/X câblées). FK08 consomme FK02.
3. **FK-C** (conscience) : FK09 (agrégateur) dépend de FK04+FK07+FK08 (il compose leurs verdicts) → FK10 (A0-A8) → FK11 (cockpit) dépend de FK09 + S58/S60.
4. **FK-D** (causalité) : FK12 (`caused_by`) → FK13 (WhyTree) dépend de FK12 + RealityMirror (E12) + `/learn`.
5. **FK-E** : FK14 (lexicon), FK15 (projections) parallélisables ; **FK16 (contract E) en TOUT DERNIER** (bascule du schéma gelé).

**Pré-vol :** créer les agents `step-FKnn`, câbler `PLAN.md`/`TEST_PLAN.md`, redémarrer la session. À lancer **après** S117 (le build app-builder doit être vert d'abord).

---

## Annexe — Impacts (sur l'existant, l'app-builder, et le déterminisme)

### Impact sur le MOTEUR existant (S00-S52)
| Cible | Kind | Changement |
|---|---|---|
| `mirrors` schéma + S06 | extend | porte le `facet` + le `truth_level` (FK01/FK02) ; N→E en double-étiquette (FK05) puis bascule (FK16, lifecycle, jamais de suppression). |
| S12 complétude | extend | devient **facet-aware** (FK04) — le monstre = paire manquante/divergente de toute facette instanciée, plus seulement « vérité↔miroir ». |
| S17 links | extend | nouveau type `caused_by` (FK12), additif à composes/contracts_with/impacts. |
| S22 red-wave | extend | gagne son **inverse** (remontée racine, FK12) — le sens avant inchangé. |
| arch-fitness (FN02/S102) | extend | devient la facette **M** (FK08) — déjà le 2ᵉ cliquet, juste nommé facette. |
| S43 reality / `/learn` / `/diagnose` | extend | `/diagnose` produit un **WhyTree** ; `/learn` reçoit la racine (FK13). |
| S52 agentlayer | extend | 6ᵉ axe **A0-A8** (FK10), additif aux 5 axes. |
| ContextRouter S33 | extend | scope par **cellule (niveau×facette)** (FK03). |
| Workbench nav | extend | routes `/ai-lab`, `/conscience`, `/why`, `/proof-levels`(→E). |

### Impact sur l'APP-BUILDER (S53-S117) — convergence, pas conflit
- **E5 (autorat de miroirs, S68-S70)** : l'éditeur de miroirs devient **multi-facette** (l'utilisateur prouve F/I/S/B/R/V/M/X de SA vérité) — FK02/FK08 le sous-tendent. À noter dans E5 (appendice), pas un blocage.
- **E12 (réalité, S106-S109)** : le RealityMirror → **WhyTree** (FK13) ; l'incident remonte sa racine avant de devenir idée. Enrichit S106/S107.
- **E11 (fédération, S100-S105)** : `caused_by` + la conscience facet-aware donnent la cause racine **inter-cellules**.
- **Le cockpit (FK11)** est l'évolution de la passerelle+streaming (S58-S60) + E4 — il les **consomme**, ne les duplique pas.
- **Aucun renumérotage Sxx** : FK est une piste parallèle post-S117 ; elle référence les Sxx, ne les édite pas (anti-overwrite §9).

### Impact DÉTERMINISME / MUR (la garde)
- Tous les juges restent **déterministes** : doc-miroirs = comparaison structurelle (prose advisory) ; conscience = agrégateur (aucun nouveau juge) ; WhyTree = remontée graphe + cause **reproduite** (anti-confabulation) ; X = soft (informe, ne bloque pas — pas de sur-contrainte UX, l'erreur symétrique §13.4).
- Le **mur** intact : le chat de `/ai-lab` propose, ne décide jamais ; truth_level écrit par la transition pure ; le WhyTree finit en miroir (pas de raccourci vers le kernel).
- **Nouveaux ADR :** 0044 (FKE fondu) + 0045 (anatomie complète : 8 facettes/2 axes/WhyTree/cockpit). Forks code différés à leur étape (lexicon record-kind vs layer ; StackManifest idem).
