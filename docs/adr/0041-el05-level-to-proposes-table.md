# ADR 0041 — EL05 : la table déclarée `LevelToProposes` (la jointure honnête avec `ideas.ProposesKinds()`)

- **Statut** : accepted
- **Date** : 2026-06-06
- **Track** : EL (compound du besoin) — EL-E1 « le BesoinGraph : substrat déterministe ordonné au-dessus du mur »
- **Supersède / amende** : aucun (additif). RÉUTILISE le closed set `Proposes` de `back/kernel/ideas` (inchangé).

## Contexte

Le BesoinGraph (EL02/EL03) élicite **9 `Level`** : les 7 rungs SOURCE de la verticale KRD §23
(`product, journey, view, control, action, operation, entity`) + 2 bandes transversales
(`invariant`, `policy`). À la projection (EL16), chaque nœud `resolved` **dont le rung mappe** sort
comme **Idea** via la porte légale `idea-intake`. Une `ideas.Idea` porte un champ `Proposes` dont le
closed set existant est **exactement** `control | policy | operation | action | entity | product`
(`back/kernel/ideas/ideas.go`, `ProposesKinds()`) — **PAS** `journey`, **PAS** `view`, **PAS**
`invariant`.

Il faut donc une **jointure honnête** entre les 9 `Level` de la grammaire et ce closed set de 6
kinds. Le danger anti-Goodhart (§8) : un **cast silencieux** (`journey → product`, `view → view*`)
qui ferait croire que tout rung émet une Idea — alors que `journey`/`view`/`invariant` n'ont **aucune
cible `Proposes` légale**.

## Décision

On construit la table **`LevelToProposes(level) → ProposesKind | NoEmit`** dans
`back/runtime/besoin/proposes.go` (+ son twin TS `front/web/lib/besoin-proposes.ts`). Elle est
**first-class, mirrorée, CLOSE, TOTALE** (domaine = exactement `AllLevels()`), pure et déterministe
(jamais un choix LLM). Le mapping est :

| `Level` | Mapping | Justification |
|---|---|---|
| `control` | **Emit** `control` | self-map : le nom EST un `ProposesKind` |
| `action` | **Emit** `action` | self-map |
| `operation` | **Emit** `operation` | self-map |
| `entity` | **Emit** `entity` | self-map |
| `product` | **Emit** `product` | self-map |
| `policy` (bande) | **Emit** `policy` | `ProposesPolicy` existe dans le closed set |
| `journey` | **NoEmit** | aucun kind `journey` ; le nœud **seede les ancres**, n'émet rien |
| `view` | **NoEmit** | aucun kind `view` ; `view→view*` impossible ; seede les ancres |
| `invariant` (bande) | **NoEmit** | l'invariant ∀ a un **miroir property (N1)**, pas un kind d'Idea ; contraint latéralement (EL14 peut produire ≤1 `Idea{Proposes:policy}` pour la bande policy, jamais pour l'énoncé ∀) |

**Règle d'or — aucun alias silencieux** : la **seule** émission légale est le **self-map** (le rung
dont le nom est un membre de `ideas.ProposesKinds()`). Un `Level` sans kind homonyme est **NoEmit**,
jamais aliasé vers le kind d'un autre rung. Un mapping vers un kind **hors** `ideas.ProposesKinds()`
est une **erreur dure** (`LevelToProposesChecked` renvoie une erreur ; `journey→product` impossible).

## Conséquences

- **Déterminisme-first (§6/§8)** : la table est une **fonction pure totale** sur un set déclaré,
  jamais un jugement LLM. Property de reproductibilité : même `Level` → même `Mapping`.
- **Le mur (§2)** : la table décide **seulement** de la cible `Proposes` ; elle **n'écrit aucune
  Idea** (EL16 le fait via la porte `idea-intake`) et **aucune** vérité `kernel`/`mirrors`/`fitness`.
- **Jointure honnête** : chaque cible Emit est prouvée membre de `ideas.ProposesKinds()` (property
  Go + vitest) — la table mappe **DANS** `ideas`, n'invente aucun kind.
- **`NoEmit` explicite** : `journey`/`view`/`invariant` apparaîtront dans `anchors_above[]` (EL08/
  EL17) — ils **contraignent sans émettre**. Le compteur d'Ideas (EL19) les EXCLUT.

## Alternatives rejetées

1. **Étendre `ideas.ProposesKinds()` avec `journey`/`view`/`invariant`** — rejeté : élargir un closed
   set du Kernel est un **changement de vérité** (idée → miroir → /goal), pas une décision de track
   above-the-wall. La grammaire du besoin doit s'adapter au Kernel, pas l'inverse.
2. **Cast `journey → product`, `view → control`** — rejeté : alias silencieux qui ment sur la
   topologie ; l'anti-Goodhart (§8) l'interdit. `NoEmit` est honnête.
3. **`LevelToProposes` calculé par le LLM d'interview** — rejeté : déterminisme-first ; un mapping de
   table close est une fonction pure, jamais une « convenance LLM ».
