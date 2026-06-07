# ADR 0045 — FKE : l'anatomie complète (8 facettes, 2 axes, WhyTree, cockpit AI Lab)

- **Statut :** accepted (grill itératif du 2026-06-07, suite d'ADR 0044)
- **Contexte KRD :** `KRD.md` LIVRE XXX (FKE-1.3, 1.4, 3, 35.1, 38) ; piste `ROADMAP-fke.md`.
- **Étend :** ADR 0044 (FKE fondu au Tome). 0044 actait les 8 forks initiaux ; ce grill a **raffiné l'anatomie** par re-poussées successives ; cet ADR enregistre le modèle complet.

## Contexte

Après la fusion FKE→Tome (ADR 0044), un grill itératif (« et d'autre ? · une ligne ? · des facettes oubliées ? · le 5-pourquoi ? ») a sharpened l'anatomie du kernel bien au-delà de la forme initiale. Chaque re-poussée a révélé un manque réel — c'est l'anti-Goodhart en action (re-pousser jusqu'à ce que le modèle tienne le croisement externe).

## Décisions

1. **Anatomie strictement 1-pour-1.** Le squelette = **6 paires** déclaré↔prouvé (Spec↔Doc · Comportement↔Résultats · Scénarios↔Tests · Modèle↔Projection · Contrat↔Code · Evidence-attendue↔observée). La vue « 10 slots » est la forme effondrée historique. Le **Contrat (au-dessus) apparie le Code** : plus aucun slot orphelin ; le code reste optionnel **par émission** (kernel déclaratif), pas par absence de partenaire.

2. **Le mur est un plan de symétrie ET une frontière de langue.** La plupart des paires sont ubiquitaires des deux côtés ; seuls les côtés DESSOUS « code » parlent machine (= la zone de l'agent).

3. **8 facettes canoniques (lentilles intrinsèques), croisées ISO 25010**, effondrables : **F** fonctionnel · **I** invariants ∀ · **S** sécurité · **B** performance/budgets · **R** fiabilité/résilience · **V** évolutivité/migration · **M** maintenabilité/structure (le 2ᵉ cliquet §47) · **X** expérience/utilisabilité (vérité molle §13.6). Le sextet est devenu octuor par deux honnêtetés : le **second cliquet** (M) raté, puis le croisement **ISO 25010** révélant **R** (Reliability, diluée dans B/V) et **X** (Usability, repliée dans F). Note : **I (Invariants ∀) n'est pas un attribut de qualité ISO** mais un axe de **rigueur de preuve** (∃ vs ∀) — gardé en facette, de nature distincte. Chaque facette = le même squelette de 6 paires lu sous son angle ; la sécurité a deux paires propres (scénarios↔tests-séc, contrat↔police).

4. **Test de décision (la fermeture par construction).** Une « couche » candidate est : une **facette** ssi question orthogonale sur les *internals d'un kernel* ; sinon une **dimension latérale** (arête entre kernels : Pact/`contracts_with`, `composes` — déjà des liens §17/§18, jamais des facettes) ; sinon une **sous-lentille** (raffinement dans une facette : déterminisme/concurrence⊂I, conformité⊂S, a11y/i18n⊂X, rollback/recovery⊂R, portabilité⊂V) ; sinon une **propriété du graphe** (provenance) ou **du changeset** (reviewability) ou **amont** (ValueCase). Clos à 8 ; une 9ᵉ exige de passer les 4 cases.

5. **Les DEUX axes (FKE-1.4).** Une vérité a deux coordonnées : sa **facette** (NATURE — axe **orthogonal**, qui *sépare*) et son **niveau** dans la verticale produit→entité (NIVEAU — axe **latéral**, qui *couple* : une vérité basse contraint ses rungs SOURCE au-dessus, et le red wave REMONTE cette ligne). Coordonnées complètes : niveau × facette × côté-du-mur × échelle-fractale.

6. **WhyTree / `caused_by` / `/why` (FKE-35.1) — la causalité ARRIÈRE.** Le 5-pourquoi redressé : **pas une facette** (geste du loopback, transversal) ; **déterministe** sur le lien `caused_by` (inverse de `impacts`) ; LLM gaté + **cause vérifiée/reproduite** (anti-confabulation) ; un **arbre** (fishbone) pas une ligne ; **terminaison obligatoire en miroir** (racine → `/learn` → miroir d'anti-récurrence). Red wave = avant ; WhyTree = arrière.

7. **Le cockpit AI Lab (FKE-38).** Trialogue : GAUCHE chat/vibe scopé au nœud · CENTRE la couche navigable (anatomie 1-pour-1, mur dessiné, voyant par paire) · DROITE decision cards + impacts à valider. Le chat ne change jamais une vérité (propose) ; mutation par clic decision card uniquement ; écarts calculés. Route `/ai-lab`.

## Conséquences

- **Loi de complétude renforcée** : le monstre se généralise — une paire requise manquante/divergente de **toute facette instanciée** (pas seulement fonctionnelle) est un monstre. La conscience compare toutes les paires instanciées.
- **Determinism-first préservé partout** : doc-miroirs jugés structurellement, conscience = agrégateur, WhyTree déterministe-sur-graphe + cause vérifiée, X soft (informe, ne bloque pas — pas de sur-contrainte UX). Aucun second juge.
- **Additif (anti-overwrite §9)** : le squelette 6-paires généralise N0-N5 ; les facettes réutilisent les senseurs existants (rapid, gosec, k6, chaos/fault-injection, go-arch-lint, ExperienceClaim S13.6) ; `caused_by` rejoint les liens §17. Tout atterrit par la **piste FK post-S117** (`ROADMAP-fke.md`), zéro collision avec le build app-builder en cours.

## Liens

`KRD.md` LIVRE XXX (FKE-1.3/1.4/3/35.1/38) · ADR 0044 · `docs/plan/ROADMAP-fke.md` · le grill du 2026-06-07 (provenance) · ISO 25010 (croisement externe des facettes).
