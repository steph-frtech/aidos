# ADR 0084 — ProvenanceNetwork pondéré (§119.4) : étendre le schéma `provenance` d'un `ProvenanceLink` versionné + gouverné

- **Statut :** accepté (décision humaine, 2026-06-15 : « GO » sur `docs/plan/PLAN-branchements.md`)
- **Date :** 2026-06-15
- **Contexte KRD :** CLAUDE.md §1 (Mandat B — `provenance` est un schéma Postgres : « qui a voulu quoi, quand, pourquoi ») · §2 (le mur — la provenance est au-dessus de la ligne) · §8 (poids **déclarés**, jamais appris ; un override est une décision enregistrée) · §9 (anti-overwrite — étendre, jamais réécrire) · KRD §119.4 (`ProvenanceLink {from, to, relation, weight, authority}`) · KRD §112/§2469 (« on emprunte la topologie pondérée et seuillée ; on refuse le réseau de neurones appris dans le jugement ») · KRD §117 (provenance = source d'une idée) · ADR 0072 (décision-mère : la vérité vit en Postgres, écrite par le Go via le mur) · réutilise S02 (content-address), S20 (ChangeSet), S22 (la vague de rouge pondérée), `back/kernel/ideas/ideas.go` (le type `Provenance` actuel)

## Contexte

Le Tome grave au **§119.4** un réseau de provenance pondéré — « Les idées, documents, incidents et décisions forment un réseau de provenance » :

```yaml
ProvenanceLink:
  from: incident:UX-1043
  to: idea:checkout-help-link
  relation: inspired_by | derived_from | contradicted_by
  weight: weak | medium | strong
  authority: ...
```

avec la règle gravée : « Les poids de provenance peuvent être suggérés automatiquement mais doivent rester **versionnés et gouvernés**. » C'est l'application aux idées/sources de la **topologie pondérée et seuillée** empruntée au §112 (« on emprunte la topologie ; on refuse le réseau de neurones *appris* dans le jugement »).

**Aujourd'hui, seule la provenance BASIQUE est câblée** (preuve d'audit `wi2zxij70`). `back/kernel/ideas/ideas.go` définit `Provenance{Source ProvenanceSource}` avec l'enum FERMÉ `human | incident` (KRD §117), porté par chaque idée et content-adressé dans le corps `{proposes, intent, provenance}`. Le **réseau pondéré, lui, n'existe pas** : `grep -E "ProvenanceLink|ProvenanceNetwork|inspired_by|derived_from|contradicted_by"` sur `back/`/`front/` → le seul hit est un **label UI** (`provenanceLinkLabel` dans `front/web/app/ideas/page.tsx` + `front/web/app/exploration/page.tsx`) — une étiquette i18n sans le moindre schéma derrière. Un nœud du Tome (`ProvenanceLink`) sans matérialisation est un **monstre** : la promesse existe, le chemin non.

## Décision

**Étendre le schéma `provenance` d'un `ProvenanceLink` pondéré, versionné et gouverné, qui matérialise le ProvenanceNetwork du §119.4 — sans toucher au `Provenance{Source}` basique existant (additif §9).**

1. **Le `ProvenanceLink` = une arête content-adressée** `{from, to, relation, weight, authority}` :
   - `from` / `to` = des **refs version-pinnées** vers des nœuds du réseau (`incident:UX-1043`, `idea:checkout-help-link`, `source:…`, `decision:…`) — jamais des FK mobiles, pour qu'une arête enregistrée reste inspectable après que les têtes bougent (même discipline que le red set §63).
   - `relation` = un enum **FERMÉ** `inspired_by | derived_from | contradicted_by` (verbatim §119.4) ; une quatrième relation n'entre que par un ADR (`fail-closed`).
   - `weight` = un enum **FERMÉ ORDONNÉ** `weak | medium | strong` (verbatim §119.4) — un poids **catégoriel déclaré**, jamais un flottant appris ni un score d'un juge LLM (§8/§2469 : « on refuse le réseau de neurones appris dans le jugement »).
   - `authority` = l'autorité qui a posé/pondéré l'arête (qui gouverne).
   - L'arête est content-adressée (réutilise S02 `records.Hash` sur le corps `{from, to, relation, weight}` ; `authority`/horodatage exclus du corps hashé, comme pour les autres records).

2. **Le poids est SUGGÉRÉ automatiquement, mais reste DÉCLARÉ et GOUVERNÉ (§8/§119.4).** La règle gravée du Tome est respectée à la lettre : un poids peut être *proposé* par une heuristique déterministe (ou, en exception LLM gatée, *suggéré* puis re-jugé), mais il ne devient effectif qu'après une **décision enregistrée** — une arête, sa relation et son poids sont posés via `idée→/goal→approbation` ou via un ChangeSet gouverné (S20), **jamais un write direct**. Un poids *appris* (un réseau de neurones qui ajuste les poids dans la boucle) est REFUSÉ : ce serait exactement le « LLM qui note sa propre copie » banni par tout le Tome (§2469). La provenance étant **au-dessus de la ligne** (Mandat B, schéma `provenance`), l'agent n'a aucun GRANT d'écriture — seul l'`aidos` writer role écrit l'arête via un ChangeSet approuvé.

3. **L'arête nourrit la topologie pondérée et seuillée (§112), elle ne juge jamais.** Le ProvenanceNetwork *décrit comment la vague circule* le long des liens de provenance (un `contradicted_by` `strong` pèse plus qu'un `inspired_by` `weak` dans le worklist), jamais *qui tranche* — le juge reste le miroir déterministe (§8). Les seuils d'activation sont **déclarés** (au-dessus de la ligne), jamais appris (§112/§2469). C'est le même emprunt que la propagation pondérée le long de `composes` (S22, la vague de rouge) appliqué cette fois aux idées/sources/incidents/décisions.

4. **Construction en tranches vérifiables** (chacune finit verte, §6) : T1 le type Go `ProvenanceLink` + les deux enums fermés + le content-address + un property test (mêmes `{from,to,relation,weight}` → même hash) ; T2 le schéma Postgres `provenance.provenance_link` (append-only, agent SELECT-only, écrit par l'`aidos` role via ChangeSet) ; T3 le câblage gouverné (poser une arête = idée→/goal ou ChangeSet, refus du write direct + refus d'un poids hors enum + refus d'un poids appris) ; T4 le tool MCP `provenance` (ADR 0009, tout op = un tool) + la lentille Workbench qui rend le réseau (le label `provenanceLinkLabel` cesse de mentir — il pointe enfin vers un vrai schéma).

## Conséquences

- **Positif.** Le ProvenanceNetwork du §119.4 existe enfin : le `provenanceLinkLabel` du front cesse d'être une étiquette orpheline et rend un vrai réseau pondéré. Mandat B respecté (le réseau vit dans le schéma `provenance` Postgres, écrit par le Go via le mur). Determinism-first / anti-Goodhart respectés (poids **déclarés** catégoriels, jamais appris ; un poids n'effectue qu'après une décision enregistrée — §8). Additif §9 strict : on **ajoute** `provenance.provenance_link`, on ne touche PAS au `Provenance{Source ∈ human|incident}` content-adressé dans chaque idée (les deux coexistent — l'un est la *source* d'une idée, l'autre le *réseau* entre nœuds). Réutilise les emprunts déjà gravés (la topologie pondérée §112, le content-address S02, le ChangeSet S20).
- **Coûts assumés.** (a) Un second concept de « provenance » entre dans le vocabulaire (la *source* d'une idée vs le *réseau* d'arêtes) — l'ADR les distingue explicitement pour éviter la confusion (§0). (b) Le réseau est au-dessus de la ligne : poser une arête coûte un passage gouverné (idée→/goal ou ChangeSet), jamais un write en passant — c'est le prix du mur. (c) **OpenQuestions** (forward-deps, ne bloquent pas) : la suggestion *automatique* du poids (heuristique déterministe d'abord ; l'exception LLM gatée re-jugée déterministe est une extension ultérieure) ; l'usage exact des poids dans le seuillage de la vague de rouge (S22 aujourd'hui pondère `composes` ; étendre aux liens de provenance est une précision ultérieure) ; la persistance Postgres effective dépend de S17/S31 (back-fill).
- Le mur, le déterminisme et l'anti-overwrite sont **inchangés** ; le ProvenanceNetwork les *augmente* (un réseau pondéré qui ne peut, par construction, qu'être posé par une décision enregistrée et gouvernée, jamais par un poids appris dans la boucle).
