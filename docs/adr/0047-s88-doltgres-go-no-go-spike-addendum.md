---
status: accepted
addends: 0006
step: S88
---

# S88 — Doltgres go/no-go spike : plain-Postgres par DÉFAUT, Doltgres opt-in par app

Cet ADR est l'**addendum** d'ADR 0006 (« Emitted apps run on Doltgres »). Il
**résout la première open-question** d'ADR 0006 — *« Doltgres est-il le datastore
émis par défaut, ou opt-in à côté d'un target plain-Postgres ? »* — par une
**mesure**, jamais une déclaration (§8 « le juge est déterministe », mandat
determinism-first). La décision est un **record content-adressé** produit par une
fonction pure (`runtime/doltgresspike`), pas un avis d'agent.

## Décision

> **Le datastore de l'app émise est plain-Postgres PAR DÉFAUT ; Doltgres est
> opt-in PAR APP.** L'escape hatch (plain-Postgres) est la valeur par défaut **par
> construction** — quel que soit le verdict du spike, Doltgres ne devient JAMAIS le
> défaut. Le spike ne peut que **confirmer** (go : Doltgres est offrable en opt-in)
> ou **durcir** (no-go : Doltgres est retiré même en opt-in jusqu'à ce que les
> caveats beta se lèvent) cette base.

Conséquence directe pour la chaîne : **E10 (S91→S100) reste viable sans
réordonnancement** même si le spike avait été no-go, puisque la cible par défaut
ne change pas.

## Re-cadrage du driver (préambule EPIC 9)

Le cadre #2581 / #2600 est **pgx-spécifique**. L'app émise (S74) utilise un
**client Postgres TS** (postgres.js / node-postgres / adaptateur Drizzle), **pas
pgx**. Les critères go/no-go sont donc **re-formulés driver-neutres** :

- le mode #2581 (parser thread-unsafe sous pgx concurrent) est remplacé par une
  mesure de **STABILITÉ** générique — panic / connexion droppée / résultat corrompu
  sous N connexions concurrentes — qui survit au pivot de driver ;
- le **≈ 5,2×** et l'absence de primitives de lock (#2600) sont **dialecte/moteur-
  level** et **survivent** : ils restent un caveat documenté, borné par un plafond
  de ratio de perf **déclaré** (`MaxPerfRatio = 6.0`, marge au-dessus du 5,2× cité).

Le spike in-repo utilise **pgx comme stand-in Go** du driver TS (le moteur sous
test, Doltgres, est le même) ; la sortie reste « verdict = mesure ».

## Comment la décision est calculée (déterministe)

`doltgresspike.Decide(Measurement, Thresholds) → Decision` est une **fonction
pure et totale** (miroir de reproductibilité : même entrée → `Decision`
byte-identique, même `ID = records.Hash(payload canonique)`). Aucun LLM n'entre :
le verdict est **un comptage + deux comparaisons**.

- **no-go** ssi une instabilité **REPRODUCTIBLE** dépasse le plafond de connexions
  déclaré (`MaxFailedConns = 0`), OU le ratio de perf dépasse `MaxPerfRatio`. Un
  *blip* non-reproductible **ne flippe pas** le défaut (les done-criteria exigent un
  échec **reproductible**). Un ratio non mesuré (0) est traité comme pire cas.
- **go** sinon : Doltgres a survécu aux N connexions dans le plafond déclaré →
  offrable en opt-in.

Les seuils sont **déclarés** (au-dessus de la ligne), font partie du content-
address de la `Decision` (un seuil changé ⇒ un hash différent), donc le verdict ne
peut jamais être silencieusement re-noté.

## Résultat mesuré (Testcontainers)

`go test ./runtime/doltgresspike -run TestDoltgresConcurrencySpike` avec
`AIDOS_RUN_DOLTGRES_SPIKE=1` boote un conteneur **Doltgres** (`dolthub/doltgresql`)
et un **plain-Postgres** baseline, puis soumet **N = 64** connexions concurrentes à
chacun via pgx, mesure stabilité + ratio de perf, **re-run** pour établir la
reproductibilité, et calcule la `Decision`.

Run du 2026-06-08 (`decision 7395fa69c2d7`) : **verdict=go**, `default=plain-
postgres`, `optIn=[doltgres plain-postgres]`, `failed=0/64`, `reproducible=true`.

**Portée honnête du run** : le probe exerce un round-trip **trivial** (`SELECT
$1`), donc il valide **décisivement la stabilité sous concurrence** (le mode
#2581/#2600 ne se reproduit pas contre ce profil) mais **ne stresse pas** la charge
write-heavy où le ≈ 5,2× se manifeste. Le ratio observé (0,30×) n'est donc **pas**
une infirmation du 5,2× — c'est un round-trip lecture sur conteneur chaud. Le 5,2×
reste un **caveat dialecte-level documenté**, ce qui est précisément pourquoi
**plain-Postgres reste le défaut** et Doltgres l'opt-in : on n'adopte Doltgres par
défaut sur aucune app, on l'OFFRE quand le branch/merge/diff/`as of` git-for-data
vaut son surcoût.

## Conséquences

- **S89 (provisioning)** provisionne **plain-Postgres par défaut** ; Doltgres
  n'est provisionné que sur opt-in explicite d'une app, et seulement parce que ce
  spike est **go**. `Decision.OptInAllowed(target)` est la porte déterministe.
- Slot `replaceable` (ADR 0003) **inchangé** : une app peut retomber sur plain-
  Postgres à tout moment ; une app à embeddings ajoute un sidecar Postgres+pgvector
  (Doltgres n'a pas pgvector).
- Le **truth-store de l'OS** reste Postgres (ADR 0004) — **non touché**.
- La 2e open-question d'ADR 0006 (vector via sidecar pgvector vs `VECTOR` Dolt
  natif) reste ouverte, traitée à S91/S89 (sidecar pgvector privilégié).

## Re-test

Le verdict n'est jamais figé : si une app stresse la charge write-heavy et mesure
un ratio > `MaxPerfRatio`, `Decide` rend **no-go** et retire l'opt-in — sans
réordonnancer la chaîne (le défaut était déjà plain-Postgres).
