# ADR 0036 — FN02 : le « mandat fonctionnel du code émis » (pureté, no-global, graphe d'appel acyclique typé) — portée `gen/` uniquement

- Status: Accepted
- Date: 2026-06-04
- Step: FN02 (Runtime — pas de package : un mandat gravé, comme determinism-first)
- KRD: §84 (spike-gate), §S34 (déterminisme d'émission : même source → mêmes octets), §S46 (slice checkout / composition-acceptance), CLAUDE.md §2 (le mur), §6/§8 (determinism-first), §3 (`go-arch-lint`/`depguard` = slot `arch-fitness`)
- Inputs: FN01 (verdict **GO**, `spike/functional/`), émetteur impératif `back/runtime/generators/emit.go`, règle arch-fitness `back/runtime/agentloop/` (`arch-fitness.json` + `CheckLLMIsolation`)

## Contexte

FN01 a prouvé, par un spike confiné (`spike/functional/`, module isolé, ratchet OFF, T0,
jetable — `TestConfinement` prouve qu'il n'importe rien de `back/`), qu'un émetteur
**pur-fonctionnel** peut reproduire le slice checkout (entité `Order` → struct Go (sqlc) /
DDL Postgres / interface TS) **byte-identique** à l'émetteur impératif sur les trois
cibles, **reproductible** (même entrée → même sortie, 100 rejeux), avec **zéro variable
mutable au scope paquet** — le déterminisme S34 préservé, coût comparable. Verdict
**GO**, calculé (`Decide().Rationale`), jamais déclaré.

L'émetteur impératif actuel (`back/runtime/generators/emit.go`) viole ce style : il tient
`var typeMap = map[string]typeBinding{…}` au **scope paquet** (une globale) et accumule la
sortie en **mutant** un `strings.Builder`. Le spike supprime les deux : `typeBindings()`
retourne la table par **valeur**, le rendu est un fold/map/concat sur des slices
immuables, et `EmitFunctional` compose explicitement `renderGo`/`renderDDL`/`renderTS` —
un graphe d'appel **acyclique** documenté.

L'intention amont (`Lum1104/Understand-Anything`) : **chaque fonction = une couche + un
nœud d'un graphe d'appel ; style fonctionnel ; AUCUNE variable globale mutable ; code
organisé en graphe de fonctions acyclique** — ce qui donne plus tard (FN05) un index
call-graph naturel comme contexte d'agent.

FN02 ne livre **pas** de code : il **grave le mandat** — exactement comme le mandat
determinism-first est un mandat et non un package. C'est un ADR qui définit les invariants
que le code émis doit satisfaire **et leur portée**, que FN03 (émetteurs + miroir de
pureté) et FN04 (règles arch-fitness fail-closed) rendront ensuite exécutables.

## Décisions

1. **Le code émis par AIDOS est FONCTIONNEL par mandat — c'est le determinism-first
   appliqué à la *sortie*.** Un code émis pur (même entrée → même sortie, aucun état
   caché) est, par construction, déterministe et reproductible : la **pureté EST le mandat
   de déterminisme appliqué au code généré**. Ce mandat est gravé au même rang que
   determinism-first (CLAUDE.md §6) ; il n'altère aucun des neuf `phases` du contrat de
   step, il **ne fait qu'AJOUTER** une garde (méta-loop, §5).

2. **Les trois invariants émis (les vérités que FN03/FN04 prouvent) :**
   - **`EMITTED_FUNCTION_PURE`** — chaque fonction émise est **pure** : sa sortie est
     fonction de ses seules entrées, sans effet de bord ni état caché ; ré-évaluée, elle
     rend la même valeur. Conséquence S34 directe : la **ré-émission est byte-identique**
     (le miroir property de FN03 rejoue l'émission N fois et compare les octets).
   - **`EMITTED_NO_GLOBAL_MUTABLE`** — **aucune variable mutable au niveau paquet** dans
     l'arbre émis : pas de `var x = …` mutable de module, pas d'accumulateur partagé ; les
     tables (le `typeBindings()` du spike) sont **construites et retournées par valeur**,
     threadées explicitement. Les constantes (`const`) et types restent permis (immuables).
   - **`EMITTED_CALL_GRAPH_ACYCLIC`** — le graphe d'appel du code émis est **acyclique** :
     la composition est explicite (`renderGo`/`renderDDL`/`renderTS` foldés sur l'entité),
     pas de récursion mutuelle cachée ni de cycle de dépendances entre nœuds. Chaque
     fonction est **une couche + un nœud** ; le graphe est l'index naturel de FN05.

3. **PORTÉE TRANCHÉE : `gen/` UNIQUEMENT — le code ÉMIS, jamais le Go d'AIDOS lui-même.**
   Le mandat s'applique **exclusivement** à l'arbre `back/gen/` (les projections émises :
   structs Go/sqlc, DDL, types TS, handlers, composants Next — l'app de l'utilisateur). Il
   ne s'applique **pas** au moteur AIDOS (`back/runtime`, `back/kernel`, `back/archive`,
   `front/web`…), où les globales/builders/effets restent permis : AIDOS est un OS impératif
   qui *émet* du fonctionnel. Cette frontière est **la** décision portée par cet ADR ; toute
   règle arch-fitness de FN04 (`go-arch-lint`/`depguard`) **scope son chemin sur `back/gen/`**
   et n'inspecte rien d'autre. (Note de cohérence : l'émetteur *source* `emit.go` vit dans
   `back/runtime/generators/` — hors portée ; ce sont ses *sorties* sous `gen/` qui doivent
   être pures. FN03 reformera l'émetteur pour *produire* du pur ; le style de l'émetteur
   lui-même n'est pas contraint par ce mandat.)

4. **Les invariants sont des GATES DÉTERMINISTES fail-closed, JAMAIS un jugement LLM.**
   Conformément à determinism-first et au slot `arch-fitness` gelé (CLAUDE.md §3), ces trois
   règles seront, en FN04, des vérifications **déterministes** : marche d'AST Go
   (`token.VAR` au scope paquet → rouge), analyse de pureté/effets, détection de cycle dans
   le graphe d'appel — outillées par `go-arch-lint`/`depguard` / un walker AST, dans l'esprit
   exact de l'actuelle `CheckLLMIsolation` (`back/runtime/agentloop`, `arch-fitness.json`).
   Elles sont **fail-closed** : un doute → rouge. Aucune des trois n'est un « LLM qui juge
   si c'est fonctionnel » — ce serait une fracture de déterminisme qui bloquerait le step.

5. **Élargir la portée ou assouplir un invariant est un changement de VÉRITÉ.** Le chemin
   couvert (`back/gen/`), la liste des trois invariants, et le seuil fail-closed sont des
   vérités déclarées (au-dessus de la ligne). Les modifier passe par **idée → miroir →
   /goal → approbation humaine** (CLAUDE.md §2), jamais par une édition silencieuse — comme
   l'`allowed_importers` de la règle LLM. Un test property épinglera la parité entre la
   liste d'invariants déclarée ici et la config `arch-fitness.json` de FN04.

6. **Le mandat respecte le mur et ne grave aucune vérité.** FN02 écrit un ADR (un document
   de décision, provenance), pas le `kernel`/`mirrors`/`fitness`. Les miroirs de pureté
   (FN03) et les règles arch-fitness (FN04) sont du code/config sous la ligne ; ils
   *certifient* la sortie émise, ils n'écrivent aucune vérité.

## Conséquences

- **FN03** étend les émetteurs (`back/runtime/generators`) pour **produire** du code
  fonctionnel pur (Go/DDL/TS) et grave le **miroir property de pureté** (rouge d'abord) :
  chaque fonction émise pure (même entrée → même sortie), aucune var mutable de module,
  ré-émission byte-identique — déterminisme S34 préservé. Il branche aussi le vrai
  `records.Hash` (résout OQ-FN01-2) et étend la pureté à **toutes** les cibles émises
  (handlers, composants — résout OQ-FN01-1).
- **FN04** rend les trois invariants exécutables comme règles **arch-fitness fail-closed**
  (`EMITTED_NO_GLOBAL_MUTABLE`, `EMITTED_FUNCTION_PURE`, `EMITTED_CALL_GRAPH_ACYCLIC`) sur
  `back/gen/`, avec **fault-injection** (injecter une globale/un cycle → la règle passe
  rouge), remplaçant le `TestNoGlobalMutableVar` du spike (résout OQ-FN01-3).
- **FN05** consomme le graphe d'appel acyclique (garanti par `EMITTED_CALL_GRAPH_ACYCLIC`)
  comme **index call-graph** fourni en contexte d'agent (complète le ContextRouter S33).
- Le mur reste intact ; aucun des neuf `phases` du contrat de step n'est altéré (garde
  ajoutée, jamais retirée).

## OpenQuestions

- **OQ-FN02-effets-IO** : la portée de `EMITTED_FUNCTION_PURE` côté handlers émis (qui
  *doivent* faire de l'I/O DB) reste à trancher en FN03 — vraisemblablement « pur sauf
  effets déclarés en frontière » (le cœur reste pur, l'I/O est poussée aux bords). FN02 ne
  grave que l'invariant le plus fort pour les émissions sans effet (entité/DDL/types) ; le
  raffinement « functional core, imperative shell » pour les handlers est un raffinement de
  vérité (idée → miroir → /goal) à porter en FN03.
- **OQ-FN02-linear** : le `linear-server` MCP n'est pas authentifié dans cette session
  (OAuth requis, non complétable depuis un exécuteur isolé) ; l'issue `FN02 · …` (projet
  AIDOS `aidos-2a9085453be8`, label `adr`) n'a pu être créée/déplacée en `Done` par
  l'agent — à faire au prochain run authentifié (CLAUDE.md §11, best-effort, ne bloque pas
  le step).
