# `interpretsvc` — le SIDECAR INTERPRÉTEUR Go (la clé de voûte)

Le backend **runnable** auquel le serveur **Hono émis** (`honoemit.EmitServer`) route chaque
opération. Le handler émis fait `const result = await deps.interpret(opName, input)` ; **ce service
est ce que ce port `interpret` résout** (ADR 0040 Déc.7 : le callback opération-interpréteur est le
sidecar Go). C'est la pièce qui rend déployable « l'app émise depuis les specs ».

```
client / Workbench
      │  POST /<op> { …input… }
      ▼
serveur Hono émis (honoemit)  ──HTTP──▶  SIDECAR Go (ce service)  ──pgx──▶  Postgres (schéma ÉMIS)
  deps.interpret(op, input)              POST /interpret              tables cart / order / …
                                         → operation.Interpret (RÉUTILISÉ)
```

## Ce que fait le sidecar (par requête `interpret(operation, input)`)

1. **(a)** résout l'opération nommée dans le `Registry` (la coupe Kernel du projet, lecture seule) ;
2. **(b)** construit le `State` (`$.input` = la commande, `$.auth` = l'appelant) ;
3. **(c)** appelle `operation.Interpret(op, state, deps)` — **RÉUTILISÉ verbatim, AUCUNE règle
   réimplémentée** (le mur §2 ; déterminisme-first §6/§8) ;
4. **(d)** les quatre verbes à effet (validate/authorize/read/mutate) atteignent le monde
   **uniquement** par les seams injectés `Deps` — en prod les seams pgx sur le **schéma émis**
   (`dbdeps.go`), dans le miroir des seams en mémoire (`memdeps.go`) ;
5. **(e)** renvoie le `Result` en JSON + la liste **ordonnée** des événements.

## Signature HTTP (le contrat de câblage Hono)

| Méthode + route | Corps | Réponse |
|---|---|---|
| `GET /healthz` | — | `200 { "status": "ok", "operations": [ …noms… ] }` |
| `POST /interpret` | `{ "operation": "<nom>", "input": { … }, "auth": { … } }` | `200 { "operation", "result": { … }, "events": [ … ] }` |

`auth` est optionnel (`$.auth`, défaut `{}`). Erreurs **honnêtes** (jamais de panic, jamais de
succès partiel silencieux) :

| Cas | Statut |
|---|---|
| opération inconnue | `404` |
| authorize DENY | `403` |
| autre erreur interpréteur/seam | `422` |
| corps malformé / méthode invalide | `400` / `405` |

### Le serveur Hono émis l'appelle ainsi

Le port émis `OperationInterpreter = (operation, input) => Promise<unknown>` se mappe sur un
`POST /interpret` avec `{operation, input}`. Le `INTERPRETER_URL` (l'adresse du sidecar) est la
seule config que le serveur émis a besoin de connaître.

## Lancer le service

```bash
# mode DÉMO (aucune base) — un Cart est seedé en mémoire, createOrder tourne tel quel :
go run ./cmd/aidosinterpreter
curl -s localhost:8080/healthz
curl -s -X POST localhost:8080/interpret -H 'content-type: application/json' \
  -d '{"operation":"createOrder","input":{"cartId":"cart-1"},"auth":{"user":{"id":"u-1"}}}'
#  → {"operation":"createOrder","result":{"id":"order-…","items":[…],"status":"pending","userId":"u-1"},
#     "events":["OrderCreated","CartCleared"]}

# mode DB (schéma ÉMIS réel) :
DATABASE_URL='postgres://app:app@localhost:5432/appdb?sslmode=disable' PORT=8080 go run ./cmd/aidosinterpreter
```

Config (env) : `PORT` (défaut `8080`), `DATABASE_URL` (le DSN de l'app émise ; absent → mode démo).

## Le pont State ↔ DB (`dbdeps.go`)

- **read** → `SELECT * FROM <table> WHERE <col>=<val> LIMIT 1` ; la ligne devient une map
  colonne→valeur ; une colonne `text` portant du JSON (la colonne `items` émise) est **décodée** en
  liste/objet pour que `$.cart.items` se résolve structurellement.
- **mutate(create)** → `INSERT … RETURNING *` ; une liste/map est **encodée JSON** pour tenir dans
  une colonne `text`/`jsonb` (l'inverse du décodage read). Id déterministe content-addressed
  (`records.Hash`) quand l'AST ne pin pas d'`id` (seam d'identité ; un schéma futur à séquence/uuid
  le rend no-op).
- **mutate(clear)** → `DELETE FROM <table> WHERE <where…>`. Un `where` vide est **refusé** (jamais
  vider une table).

## Le « marche de plus » — limitations honnêtes (OpenQuestions)

Le sidecar est **réellement runnable aujourd'hui** sur l'ancre `createOrder`, mais l'exécution
opération→DB a des marches que `operation.Interpret` n'expose pas encore — documentées, **non
truquées** :

- **OQ-SIDECAR-clear-where.** `operation.evalMutate` ne forwarde au seam Mutator **que** le `Data`
  du step ; la **cible** du verbe `clear` vit dans le `Where` du step (`{ id: $.cart.id }`), que
  l'interpréteur **ne transmet pas** au Mutator (le mock du Kernel lui-même émet `CartCleared` sans
  cibler — `table.go`). Le seam dérive donc la cible **honnêtement du State** qu'on lui passe (le
  slot `$.<entity>` lié par le read) — c'est de la glue seam sur le State, **pas** une règle
  réimplémentée. Le vrai correctif est que l'interpréteur/AST thread `m.Where` jusqu'au Mutator (un
  changement Kernel, au-dessus de cette surface). En attendant : une cible non dérivable est
  **refusée**, jamais un balayage de table.
- **OQ-SIDECAR-validate.** Le `Validator` ici fait le check minimal (input non-nil passe). Le vrai
  validateur tourne le contrat schéma-entité — un tooth ultérieur.
- **OQ-SIDECAR-policy.** L'`Authorizer` renvoie un verdict configurable (ALLOW/DENY) ; le vrai
  authorizer délègue à l'évaluateur `Policy ∀` sur le ctx vivant — un tooth ultérieur. (Le seam
  suffit aujourd'hui à prouver le court-circuit : un DENY ne crée aucun ordre, prouvé contre la
  vraie DB.)
- **OQ-SIDECAR-expr.** `sum($.cart.items,"price")` pour un `total` calculé n'est pas encore câblé :
  l'Order stocke les items que le cart pin ; le `total` reste ce que l'AST résout (aujourd'hui : non
  posé — le pricing est la même OpenQuestion que la slice §46 a déjà enregistrée).
- **OQ-SIDECAR-registry.** La coupe d'opérations est aujourd'hui l'ancre `createOrder`
  (reconstruite en Go). Un loader réel depuis les lignes `kernel.operation` du projet (décoder le
  JSONB AST → `operation.Operation`) est le tooth suivant ; la forme du service est inchangée
  (`NewRegistry` prend n'importe quelle coupe).

## Le mur (§2) & déterminisme (§6/§8)

Le sidecar **exécute** des opérations — un effet runtime **below-the-line**. Il n'écrit **aucune**
vérité Kernel : il ne touche jamais `kernel`/`mirrors`/`fitness` ; ses écritures DB tombent dans le
schéma de l'app émise. Il **réutilise** `operation.Interpret` — il ne réimplémente aucune règle.
Donné (op, input, State de départ, seams purs), Interpret rend le même (events, result) — la
propriété de reproductibilité (`interpretsvc_property_test.go`) le pin.

## Miroirs (tests)

| Fichier | Forme | Prouve |
|---|---|---|
| `interpretsvc_test.go` | fixture (Go) | createOrder s'exécute via le sidecar → Order créé, cart vidé, `[OrderCreated, CartCleared]` ; DENY/inconnu/cart-absent = échecs typés |
| `interpretsvc_property_test.go` | propriété (`rapid`) | même input+state → même effet (reproductible, N in ⇒ N out) |
| `http_test.go` | intégration HTTP (`httptest`) | le contrat de fil : `/healthz`, `/interpret`, 404/403/400/405 |
| `dbdeps_integration_test.go` | intégration (Testcontainers + Postgres réel) | le pont pgx end-to-end sur le **schéma émis** (read/insert/delete réels) ; skip si Docker absent |
