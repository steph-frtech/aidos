# ADR 0042 — EL06 : BesoinThresholds déclaré + métrique OptionSpace énumérable

- **Statut** : accepté
- **Date** : 2026-06-06
- **Track** : EL (compound du besoin), step EL06
- **Contexte** : `docs/plan/ROADMAP-compound-requirements.md` (EL06, EL07, EL08, EL11)

## Contexte

La GATE déterministe par niveau (EL07 `CanDescend`) et le hook `Stop:besoin-gate` (EL11)
ont besoin de seuils : le `≤5 scénarios` du `product`, les champs requis par rung. Deux
risques anti-pattern à trancher :

1. **Magic-number / dérive** — si chaque appelant (EL07, EL11) inline son propre `5` ou sa
   propre liste de champs requis, les seuils dérivent silencieusement. CLAUDE.md §8 :
   *les poids/seuils sont déclarés au-dessus du mur, jamais appris*.
2. **Métrique fabriquée** — l'héritage de contrainte (le compound prouvé, EL08
   `ShrinkOptionSpace`) se mesure sur un `OptionSpace` : l'ensemble des choix qu'un rung
   inférieur admet. Si cet ensemble n'est pas énumérable mais qu'on le compte quand même
   à `0`, on fabrique une métrique — un jugement déguisé en chiffre.

## Décision

EL06 livre **deux** artefacts déclarés, au-dessus du mur, dans `back/runtime/besoin/thresholds.go`
(+ le twin TS `front/web/lib/besoin-thresholds.ts`, hash byte-identique vérifié) :

### 1. `BesoinThresholds` — UN record content-adressé, source unique

- `DefaultThresholds()` retourne le record canonique : `MaxScenarios = 5` (le `≤5` du ROADMAP).
- Les **champs requis par rung ne sont PAS re-déclarés** ici : `RequiredFieldsFor(level)` les
  **source de `spec.go`** (`RequiredFields`). Il n'existe donc **aucune seconde copie** qui
  pourrait dériver. EL07 et EL11 appellent tous deux `RequiredFieldsFor` / lisent `MaxScenarios`.
- `Hash()` est le content-address du record (SHA-256 sur `max_scenarios` + les champs requis par
  niveau en ordre `AllLevels()`). Un property test pin que muter une slice retournée ne change
  pas le hash (immuable) et que le record est reproductible.

### 2. `OptionSpace(L, L+1)` — métrique énumérable par paire de rungs ADJACENTS

- Une `OptionSpace` porte un **ensemble CLOS déclaré** `Choices` quand `Enumerable == true` ;
  `Size()` retourne `len(Choices)` (un entier positif).
- Une paire **non-énumérable** porte `Enumerable == false`, une `OpenQuestion` (la raison
  honnête), et `Size() == -1` (sentinel), **jamais 0**.
- `OptionSpaceFor(from, to)` ne répond que pour une **paire de rungs SOURCE adjacents**
  (`to == NextLevel(from)`) ; toute autre paire (hors grammaire, non-adjacente, inversée) est
  `ok=false` — aucune métrique fabriquée.

#### Les paires v1 (déclarées, justifiées)

| Paire | Verdict | Justification |
|---|---|---|
| `product→journey` | énumérable (7) | archétypes de parcours qu'un persona admet |
| `journey→view` | énumérable (7) | archétypes d'écran qu'un parcours admet |
| `view→control` | énumérable (8) | archétypes de contrôle qu'un écran admet |
| `control→action` | énumérable (3) | formes d'action (command/query/navigation) |
| `action→operation` | énumérable (5) | formes d'opération invoquées |
| `operation→entity` | **OpenQuestion** | les frontières d'agrégat d'entité sont le domaine OUVERT de l'utilisateur (son modèle de données), pas une liste close d'archétypes. Non-énumérable v1, déclaré, jamais fabriqué à 0. |

## Conséquences

- **EL07/EL11** lisent la même source ; un property test (`TestThresholds_RequiredFieldsHaveNoSecondCopy`)
  pin l'absence de seconde copie.
- **EL08** comptera `|OptionSpace|` AVANT vs APRÈS ancres sur ce **set déclaré** ; EL07 consomme
  `ShrinkOptionSpace > 0` comme condition de gate anti-vacuité.
- **Honnêteté** : la paire `operation→entity` est une OpenQuestion portée (non bloquante,
  exception bootstrap §6), pas une complétude prétendue.
- **Mur** : config above-the-line, aucune écriture `kernel`/`mirrors`/`fitness`.

## Alternatives rejetées

- **Inliner `5` et les champs requis dans EL07/EL11** — rejeté : dérive garantie (magic-number).
- **Re-déclarer les champs requis dans `BesoinThresholds`** — rejeté : seconde copie de `spec.go` ;
  on source la grammaire à la place.
- **Compter `operation→entity` à 0 (ou à un nombre arbitraire)** — rejeté : métrique fabriquée ;
  on déclare l'OpenQuestion avec le sentinel `-1`.
