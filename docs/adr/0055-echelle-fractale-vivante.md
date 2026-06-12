# ADR 0055 — L'échelle fractale vivante : une position dans l'arbre `composes`, pas un jeu clos

- **Statut :** accepté (décision humaine, 2026-06-12)
- **Date :** 2026-06-12
- **Contexte KRD :** §49 (composition fractale) · §108 (le lien `composes`) · §23 (la verticale) · WB2-03 (écran `/v2/idee`) · CLAUDE.md §6/§8 (déterminisme-first) · §9 (anti-overwrite)

## Contexte

Le twin WB2-03 (`front/web/lib/v2/idea.ts`) avait codé l'**échelle fractale** comme un **jeu clos à trois valeurs** : `FractalScale = "cellule" | "kernel" | "feuille"`, stocké tel quel sur la `Coordinate` de l'idée. C'est **conceptuellement FAUX** au regard du KRD : la composition fractale (§49) n'est pas une étiquette qu'on choisit dans une liste, c'est une **structure** — l'arbre de composition `composes` (le 7ᵉ lien, §108) — qui **pousse** au fur et à mesure des ajouts, à profondeur **illimitée**. « Cellule », « kernel », « feuille » ne sont pas des natures intrinsèques d'un besoin : ce sont des **lectures de sa position** dans l'arbre, et la même donnée change de rôle quand l'arbre pousse (une feuille qui reçoit un enfant devient un kernel). Un enum clos fige ce qui doit vivre.

## Décision

1. **L'échelle fractale est une POSITION — un chemin — dans l'arbre `composes`.** L'adresse canonique d'un besoin est son chemin de slugs depuis la racine (ex. `app/paiement/checkout/debit-du-compte`), pas une étiquette. Le twin pur `front/web/lib/v2/composition.ts` porte cette logique (`slugify`, `nodePath`, `nodeByPath`).
2. **L'arbre POUSSE** : `growComposes` greffe un nœud sous un parent de façon **append-only** (le préfixe est intact, §9), **content-adressée** (id = FNV-1a du chemin canonique : même greffe → même id) et **idempotente** (re-greffer le même libellé sous le même parent ne crée rien). La profondeur est **illimitée** (fractal §49) — bornée seulement par le **plancher feuille** et le **plafond racine/fédération**.
3. **Les rôles `racine / cellule / kernel / feuille` sont DÉRIVÉS à la lecture** via `roleOf` (profondeur 0 → racine ; profondeur 1 → cellule ; feuille profonde → feuille ; intérieur profond → kernel) — **jamais stockés** sur le nœud. Le rôle est une lecture de la position, pas un attribut.
4. **Le placement est CALCULÉ, l'humain surcharge.** `placeIntent` propose où attacher un besoin par un **algorithme** de score lexical déterministe (jamais un prompt — §6/§8 déterminisme-first) ; score 0 → la racine (proposer une nouvelle cellule). L'**humain peut surcharger** le placement proposé (§49 : « les frontières des cellules sont posées par jugement humain, pas engendrées par la récursion »).
5. **L'enum hérité `FractalScale` (`cellule | kernel | feuille`) disparaît.** Il ne reste ni dans les types, ni dans les écrans, ni dans les miroirs.

## Conséquences

- **`Coordinate.scale` devient un chemin** validé contre l'arbre vivant (`nodeByPath`), **fail-closed** : un chemin inconnu ou vide est refusé, jamais accepté par défaut.
- **Les empreintes changent** : `ideaHash` et les `frozenVersion` qui couvraient l'ancienne étiquette changent de valeur puisque le canon change — les miroirs qui les épinglaient sont régénérés dans le même geste (un miroir qui épingle l'ancien canon après la décision serait un monstre inversé, cf. ADR 0054 §3).
- **La persistance Postgres de l'arbre `composes` vivant reste S17/S18** (le back-fill du substrat) — **OpenQuestion documentée**, conforme à l'exception bootstrap (§6) : l'écran sème `seedComposes()` (l'arbre canonique déterministe) et propose la croissance ; il n'écrit aucune vérité (le mur, §2).
- Le miroir de reproductibilité `lib/v2/composition.test.ts` (fast-check, 19 propriétés) épingle : validité sous toute croissance, append-only, idempotence, profondeur illimitée, rôles dérivés, placement total/déterministe/membre, bijection chemin↔nœud.

## Addendum (2026-06-12) — les niveaux ne portent pas de nom

Première version : `roleOf` dérivait quatre rôles nommés (racine/cellule/kernel/feuille). Constat utilisateur : l'affichage recréait visuellement une taxonomie à 4 étages — or l'arbre est **illimité**, et au §49 **chaque nœud EST un kernel** (auto-similarité) : nommer les étages intérieurs n'apporte aucune information, et « cellule » est une **frontière déclarée par l'humain**, pas une profondeur.

**Décision (meilleure pratique pour un arbre non borné) : ne pas nommer les niveaux — montrer l'adresse.** `roleOf` est remplacé par `positionOf(nodes, id) → { depth, isRoot, isLeaf }` : les seules lectures stables d'une position sont **topologiques** — `racine` (profondeur 0), `feuille` (aucun enfant), et la **profondeur numérique** `nN` (infinie comme l'arbre). Badges d'écran : `racine`, `feuille · n3`, `n2`… Une feuille greffée cesse d'être feuille (lecture recalculée) ; sa profondeur ne bouge pas.

**Corollaire racine unique** : un projet = **un** produit racine ; le générateur synthétique (`syntheticComposes`) qui créait plusieurs racines « product » est corrigé — tout compose sous l'unique racine (§45 : la fédération est le seul plafond).
