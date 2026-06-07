# ROADMAP — FKE : les deltas code de la discipline (FK01→FK10)

> **Statut :** conçue au grill du 2026-06-07 (ADR 0044), **lancement APRÈS S117** (décision 8 — zéro collision avec le build app-builder en cours). Source du concept : `KRD.md` LIVRE XXX. Chaque étape suit la boucle §6 (grill → miroir rouge → tdd → senseurs → complétude → diagnose → UI exécutable + e2e → improve-arch → accrétion + 2 pages Mintlify + Linear). Le mur intact ; determinism-first partout ; tout additif (§9).

## FK01 — `truth_level` stocké + miroir de parité
**Sous-systeme:** Kernel / Archive
**Objectif:** Les 7 niveaux de vérité (Raw→Reconciled) stockés sur les records, écrits UNIQUEMENT par la fonction de transition déterministe (calculée depuis idea/changeset/miroir/evidence/conscience) ; migration additive.
**Criteres de done:** property — `stored_level == computed_level` (le miroir de parité, divergence = rouge) ; la transition est une fonction pure totale ; SemanticDiff `add` sur le schéma ; panel filtre par niveau.

## FK02 — Expand E0-E7 : mapping N→E + types de preuve manquants
**Sous-systeme:** Mirror
**Objectif:** La table de mapping N0-N5→E0-E7 déclarée comme fonction pure ; double-étiquetage additif des miroirs existants ; ajout des types E4 (sécurité : gosec/gitleaks/evals-injection), E6 (runtime : observation + rollback prouvé), E7 (formel, slot T2) au contrat de preuve.
**Criteres de done:** property — même miroir → même E (mapping total) ; un kernel affiche son `expected/observed evidence` E-typé ; aucun miroir N existant modifié (additif).

## FK03 — Dérivation déterministe de s9 (doc dérivée du code)
**Sous-systeme:** Generators
**Objectif:** Un émetteur pur `DeriveDoc(kernel) → s9` depuis les ASTs (operations, controls, routes, noms de tests, erreurs) — la moitié basse du doc-miroir.
**Criteres de done:** property — même kernel → s9 byte-identique ; s9 structurée (concepts, behaviors, erreurs) pour la comparaison FK04.

## FK04 — Les doc-miroirs (s2↔s9, s1↔s10) + data-miroir déclaré (s3↔s7)
**Sous-systeme:** Mirror
**Objectif:** La comparaison STRUCTURELLE ensembliste (décision 2) : concepts du lexique présents/absents, behaviors énumérés, erreurs couvertes — divergence structurelle bloquante, prose advisory (LLM signale, n'arbitre jamais) ; le data-miroir s3↔s7 déclaré comme comparaison explicite (modèle humain ↔ DDL/projection).
**Criteres de done:** fault-injection — retirer un behavior du code → doc-miroir rouge ; éditer la prose sans toucher la structure → advisory seulement ; property — même paire → même verdict.

## FK05 — La conscience : agrégateur déterministe + rapport + decision cards
**Sous-systeme:** Runtime / Workbench
**Objectif:** `Reconcile(kernel) → ConsciousnessReport` — fonction pure composant les verdicts existants (runner, complétude, SemanticDiff, RealityMirror, senseurs, ledger) paire par paire ; les decision cards (format §FKE-31) sur divergence ; route `/conscience` exécutable.
**Criteres de done:** property — mêmes verdicts d'entrée → même rapport ; AUCUN nouveau juge (le rapport ne contient que des verdicts sourcés) ; e2e — une divergence produit sa decision card actionnable.

## FK06 — A0-A8 : 6ᵉ axe de l'agentlayer + montée par preuve
**Sous-systeme:** Kernel / Runtime
**Objectif:** `autonomy_level` ∈ {A0..A8} (ensemble clos) déclaré par CoucheAgent ; enforcement fail-closed (une action au-dessus du niveau = BlockReason) ; la MONTÉE est calculée depuis l'historique AgentRun (N runs verts E4+ sans incident), jamais déclarée.
**Criteres de done:** fixture — un agent A1 tentant un merge est refusé ; property — la promotion est une fonction pure de l'historique ; A8 jamais atteignable sur une action critique.

## FK07 — Lexicon Kernel + linter inter-couches
**Sous-systeme:** Kernel / Mirror
**Objectif:** Le concept nommé à travers les 16 couches (humain/BDD/code/test/DB/API/event/log/metric/MCP/skill/agent/doc/CI/policy/memory) comme source (fork stockage : record-kind vs `kind:layer`, tranché ici) ; un linter pur détecte un symbole hors lexique par couche.
**Criteres de done:** fault-injection — renommer une table hors lexique → rouge ; property — vérification = fonction pure du lexique + des symboles.

## FK08 — La loi de complétude 10-slots à gabarit (kernel effondré)
**Sous-systeme:** Mirror
**Objectif:** La complétude vérifie l'anatomie : incompressible = s1 + paire de preuve (décision 7) ; slots effondrés/dérivés déclarés ; un slot requis manquant ou une paire divergente sans décision = monstre.
**Criteres de done:** fault-injection — un kernel sans s1 ou sans paire de preuve bloque ; un kernel-feuille effondré légal passe ; la loi étendue n'invalide aucun kernel existant conforme (additif).

## FK09 — Contract E0-E7 (bascule) — POST-S117 strictement
**Sous-systeme:** Mirror / Archive / Workbench
**Objectif:** Bascule du schéma `mirrors`/`cert_language`/panneaux (`/proof-levels` devient E0-E7)/docs vers E ; N déprécié via lifecycle, jamais supprimé (append-only) ; migration expand-contract gated DataTruthScope.
**Criteres de done:** zéro perte (chaque miroir N porte son E) ; les panels rendent E ; `aidos check` vert sur tout le corpus re-étiqueté ; docs Mintlify mises à jour.

## FK11 — L'écran AI Lab : le cockpit trialogue (chat ↔ couche navigable ↔ impacts à valider)
**Sous-systeme:** Workbench / Runtime
**Objectif:** Route `/ai-lab` — trois zones (§FKE-38) : GAUCHE chat/vibe scopé au nœud sélectionné (cerveau gauche → slots proposés, jamais de vérité) ; CENTRE la couche navigable = le kernel courant + son anatomie 1-pour-1, le mur dessiné, chaque paire avec son voyant 🟢/🔴/🟡 (conscience live) ; DROITE les decision cards + blast radius + red wave + promotion gate. Deux modes (conversationnel/navigationnel) = même écran à zoom différent. Compose S58 (passerelle) + S60 (streaming) + E4 (capture→grill→goal→miroir) + E5 (autorat miroirs) + FK05 (conscience) + §FKE-31 (decision cards).
**Detail:** `KRD.md` FKE-38. Évolution du GraphCockpit (route `/`) vers une route active. Aucun nouveau pouvoir : chat = signaux bruts + slots proposés ; mutation de vérité UNIQUEMENT par clic decision card → ChangeSet → approbation ; bas du mur read-only ; écarts CALCULÉS (SemanticDiff/blast radius), jamais avis LLM. Thémé ccup + bilingue.
**Inputs:** S58, S60, S64-S66 (E4), S68-S70 (E5), FK05 (conscience), FK01 (truth_level), §FKE-31.
**Criteres de done:** Playwright e2e — chatter une intention → voir un slot proposé (amber, dessus) → valider une decision card → voir la paire passer 🔴→🟢 ; un essai d'écriture-vérité directe depuis le chat est refusé (le chat ne propose que) ; le bas du mur est non-éditable ; cliquer une paire scope la gauche + la droite (mode navigationnel). Property — les écarts affichés = sortie déterministe (SemanticDiff/blast), jamais un LLM.

## FK10 — Projections d'outillage : CLAUDE.md/AGENTS.md générés
**Sous-systeme:** Generators
**Objectif:** `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, memory-bank émis depuis les kernels (policy/memory/style/architecture/agent-profile) — jamais hand-édités (hash-protégés, drift par source-hash).
**Criteres de done:** property — mêmes kernels → mêmes fichiers byte-identiques ; un hand-edit est détecté ; le contenu actuel de CLAUDE.md est d'abord kernelisé (legacy kernelizer, trust=inferred→validé) sans perte.
