# ADR 0044 — FKE fondu au Tome : l'anatomie symétrique du kernel et ses huit décisions

- **Statut :** accepted (grill `/grill-with-docs` du 2026-06-07, décisions humaines une à une)
- **Contexte KRD :** `KRD.md` LIVRE XXX (sections FKE-1…FKE-45) ; piste `FK01-FK10` (`docs/plan/ROADMAP-fke.md`).

## Contexte

L'utilisateur a formalisé **Fractal Kernel Engineering (FKE)** — la discipline universelle du code IA dont KRD est la méthode produit-logiciel et AIDOS le runtime de référence. Son cœur : **l'anatomie symétrique du kernel** — 10 slots en palindrome autour du mur (s1 spec↔s10 doc, s2 use-case↔s9 doc-dérivée-du-code, s3 modèle-humain↔s7 projection-données, s4 scénario↔s5/s6 test+résultat ; s8 le code = seul slot sans reflet, donc agent-owned et optionnel), le mur étant à la fois plan de symétrie et **frontière de langue** (seuls s5/s8 parlent machine). Un document fondateur séparé (`FKE.md` v0.1) a été produit puis **grillé branche par branche** contre le modèle existant. Huit forks réels en sont sortis.

## Décisions (les huit forks tranchés)

1. **Statut : FKE est FONDU DANS le Tome** (`KRD.md`, nouveau LIVRE XXX), un seul document fondateur ; `FKE.md` réduit à un stub. La méthode reste **KRD** ; FKE est sa couche discipline. *(Alternatives rejetées : doc séparé au-dessus du Tome — deux sources de vérité ; FKE remplaçant le Tome — réécriture de la source en pleine construction.)*
2. **Doc-miroirs (s2↔s9, s1↔s10) : le juge est une comparaison STRUCTURELLE ensembliste** — s9/s10 dérivées déterministiquement du code/AST ; divergence structurelle (lexique, behaviors, erreurs) bloquante ; divergence de prose advisory (un LLM signale, n'arbitre jamais). *(Rejetés : jugement LLM — viole « le juge est déterministe » ; byte-identité seule — ne compare jamais à s2, laisse passer la dérive doc.)*
3. **Conscience : un AGRÉGATEUR DÉTERMINISTE** — fonction pure composant les verdicts des juges existants (runner de miroirs, complétude, SemanticDiff, RealityMirror, senseurs, ledger) en un rapport par kernel + decision cards. Aucun nouveau juge. *(Rejetés : organe-évaluateur actif — le « second agent qui valide » que §8 refuse ; statu quo distribué — perd le rapport unifié.)*
4. **7 niveaux de vérité (Raw→Reconciled) : enum STOCKÉ sur les records**, mais écrit uniquement par la fonction de transition déterministe, avec **miroir de parité** `stored_level == computed_level` (divergence = rouge). Le stockage est un cache prouvé du calcul. *(Rejetés : calculé-seulement — perte de queryabilité/historique voulue par l'utilisateur ; documentaire seul.)*
5. **Preuves : migration COMPLÈTE vers E0-E7**, par **expand-contract** — *expand* (compatible build en cours) : mapping N→E déclaré + double-étiquetage additif + types E4 (sécurité), E6 (runtime), E7 (formel) ajoutés au contrat ; *contract* (post-S117, piste FK) : bascule `mirrors`/`cert_language`/panneaux/docs, **N déprécié via lifecycle, jamais supprimé**. *(Rejetés : N gardés avec simple mapping — c'est devenu l'état transitoire ; deux taxonomies libres.)*
6. **A0-A8 : 6ᵉ axe additif de l'agentlayer** (ensemble clos), montée d'autonomie **par preuve calculée** depuis l'historique AgentRun. **Lexicon Kernel : fork de stockage différé** (record-kind vs `kind:layer`), tranché à son étape comme StackManifest. *(Résolus au code, non contestés.)*
7. **Kernel effondré : l'incompressible = s1 (l'intention, même une ligne) + la paire de preuve s4↔s5/s6.** Tout le reste s'effondre ou se dérive pour un kernel-feuille. *(Rejetés : anatomie complète obligatoire — taxe ×10, contraire à §82.5 ; tout effondrable — réintroduit le monstre.)*
8. **Atterrissage : les deltas code = piste `FK01-FK10` lancée APRÈS S117.** Aujourd'hui : documentaire seulement (Tome, ADR, glossaire, Mintlify) + conception du plan. *(Rejetés : entrelacer — collisions sur mirrors/agentlayer/arch-fitness avec le build actif ; fondre dans les épics — éditer un plan en cours d'exécution.)*

## Conséquences

- Le Tome gagne le LIVRE XXX + l'entrée de carte + les termes canoniques (§161 : FKE, conscience, paire-miroir, kernel effondré, Vibe Lab, Promotion Gate) + la ligne de placement (§162 → Livre XXX). Par la formule v8.1, les concepts du LIVRE XXX ont définition + exemples ; **records/hooks/propagation arrivent par FK01-FK10** — d'ici là ce sont des OpenQuestions datées.
- La loi de complétude se renforce à terme (4 familles de paires-miroir, gabarit effondrable) ; le build S53→S117 **n'est pas interrompu**.
- `CONTEXT-MAP.md` gagne les termes partagés ; pages Mintlify concept + internals semées au grill, Implémentation complétée au vert de FK.

## Liens

`KRD.md` LIVRE XXX · `docs/plan/ROADMAP-fke.md` · ADR 0040 (construite TS) · ADR 0043 (IaC Pulumi) · la conversation de grill du 2026-06-07 (provenance).

## Addendum — 2026-06-14

La piste FKE est **BÂTIE & VERTE** (build `FK01→FK16`, git `8727034`). La décision #8 (« atterrissage = piste `FK01-FK10` lancée APRÈS S117 ; aujourd'hui documentaire seulement + conception du plan ») est **dépassée** : les deltas code ont atterri. Preuves dans le truth-store vert — `back/runtime/conscience` (l'agrégateur déterministe de la décision #3, `conscience.go` + miroirs fixture/property), `back/kernel/facets` (l'anatomie des facettes, `facets.go`), `back/kernel/causedby` et `back/kernel/whytree` (la causalité arrière, ADR 0045 décision #6). L'anatomie symétrique, la conscience-agrégateur, les 7 niveaux de vérité et le kernel effondrable ne sont plus « documentaires seulement » : ils sont implémentés et conformes. Les autres décisions (FKE fondu au Tome, doc-miroirs structurels, A0-A8) restent valides telles quelles. Aucune réécriture du corps — seul l'**état d'atterrissage** de la décision #8 est mis à jour.
