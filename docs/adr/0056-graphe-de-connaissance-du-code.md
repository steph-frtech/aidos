# ADR 0056 — Le graphe de connaissance du code : la descente fractale continue sous la feuille

- **Statut :** accepté (décision humaine, 2026-06-12)
- **Date :** 2026-06-12
- **Contexte KRD :** §49 (composition fractale) · §23 (la verticale) · S22 (la vague de rouge / impact) · ADR 0055 (l'échelle fractale vivante) · ADR 0007 (réutiliser, ne pas réinventer) · CLAUDE.md §2 (le mur) · §6/§8 (déterminisme-first) · WB2-26 (écran `/v2/code`)

## Contexte

La descente fractale (§49, ADR 0055) s'arrêtait à la **feuille** : l'arbre `composes` descendait jusqu'au besoin le plus fin (`app/paiement/checkout/debit-du-compte`), puis le **code restait opaque**. Impossible de dire « tel requirement → telle classe, telle fonction, telle ligne », et impossible de répondre à la question d'impact « **si on la modifie, quoi touche quoi ?** ». La verticale (§23) prétend descendre du produit jusqu'au bouton — mais sous la feuille, il n'y avait plus de graphe : juste des fichiers. Deux inspirations externes montrent que ce trou se comble déterministiquement : **graphify** (extraction AST locale du graphe de code, arêtes taguées par confiance, détection des god nodes) et **Bazel** (clés d'action content-adressées, `rdeps`, invalidation fine).

## Décision

1. **La descente fractale CONTINUE sous la feuille, dans le code** : requirement (chemin dans l'arbre `composes`) → **fichier** → **classe** → **fonction/méthode** → **VERSION** (hash content-adressé du corps) → **LIGNE** (span dans le fichier). Le code lui-même devient un **graphe de connaissance** : des nœuds `file | class | function | method` (jeu clos) portant `span` de lignes (1-based) + `version` content-adressée + `parentId` (la contenance method→class→file, même forme que l'arbre `composes`).
2. **Le graphe est EXTRAIT déterministiquement du source réel** par l'**API compilateur TypeScript** — l'esprit graphify (tree-sitter chez eux, même principe : AST local, zéro appel réseau), réutilisation ADR 0007 — **jamais déclaré à la main, jamais généré par un LLM** (§6/§8). Même texte → même graphe ; modifier le corps d'une fonction change **sa** version et elle seule.
3. **Les arêtes `calls`/`imports` sont taguées par CONFIANCE** (graphify) : `extracted` = prouvée par l'AST dans le fichier ; `inferred` = résolue inter-fichiers via les imports (la résolution de module est heuristique). La confiance est une donnée du graphe, jamais cachée.
4. **`impactOf` = le `rdeps` de Bazel = la vague de rouge (S22) au grain code** : la clôture des dépendants inverses (modifier un symbole rougit ses appelants, transitivement) **avec remontée de conteneur** (le fichier d'un impacté est touché). Calculée (BFS ordonné, déterministe même sur cycles), jamais estimée.
5. **`actionKey` à la Bazel** : hash(mon corps + les versions de mes deps **directes**) — la clé d'**invalidation fine** : toute modification, même profonde, invalide finement, jamais globalement.
6. **`diffGraphs`** compare deux instantanés extraits du source (avant/après) et rend `changed / added / removed` + la **redWave** — « si on la modifie, quel impact » devient un calcul sur deux extractions.
7. **`anchorSymbols` = l'ancrage requirement→code** : pour un chemin de l'arbre `composes`, un score **lexical déterministe** classe les symboles candidats (score > 0 seulement) — une **suggestion** ; l'humain tranche (§49 : les frontières sont posées par jugement humain, pas engendrées par la récursion).
8. **`godNodes`** (graphify) : les k symboles au plus fort degré entrant — les points chauds dont la modification rougit le plus.
9. **L'écran `/v2/code`** (WB2-26) rend la descente exécutable : choisir un requirement → voir les symboles ancrés, l'arbre des fichiers, le span de lignes, la version, la clé Bazel, simuler l'impact — et **ouvrir le symbole dans VS Code** via `vscode://file<chemin>:<ligne>` (la ligne exacte). Enregistré dans `lib/v2/screens.ts` (nav complète, WB2-25).

## Conséquences

- **Deux twins, deux mondes** : `front/web/lib/v2/code-graph.ts` est le twin **PUR & CLIENT-SAFE** (aucun import `typescript` — validation, impact, clé Bazel, diff, ancrage, god nodes) ; `front/web/lib/v2/code-extract.ts` est l'**extracteur** (importe `typescript`) — **serveur/test SEULEMENT**, jamais importé par un composant client ; les écrans consomment le graphe sérialisé.
- Le **miroir de reproductibilité** (`code-graph.test.ts` + `code-extract.test.ts`, Vitest + fast-check, **27 tests**) épingle : validation fail-closed, impact total/membre/déterministe/terminant sur cycles, profondeur de vague, clé Bazel (corps + deps directes), diff (identique → vide ; corps changé → vague des appelants), ancrage requirement→code, god nodes, extraction même-texte→même-graphe.
- **L'extraction couvre `lib/v2` d'abord** (les twins purs eux-mêmes — le graphe se lit lui-même) ; le périmètre est **extensible** fichier par fichier, sans changer le modèle.
- **Le mur (§2) est intact** : l'écran **LIT** le code et **SIMULE** l'impact ; il n'écrit aucune vérité — la promotion d'un constat (un god node à refactorer, un ancrage à figer) passe par idée → miroir → `/goal`.
- **OpenQuestions** (exception bootstrap, §6) : un hook **PostToolUse** ré-extrayant le graphe **en continu** à chaque écriture de code (« pré-intégré dès la rédaction ») ; la **persistance des instantanés en Postgres** pour le **diff historique** (deux phases stables → leur redWave) ; l'**extension Go** via `go/ast` (même modèle de nœuds/arêtes, autre extracteur).
