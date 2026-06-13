# DP15 — fragments StackManifest des services de DONNÉES

Paquet : `back/runtime/datafragments/` (NEW, additif). Branche build/s00-s47.

## Ce qui a été construit
- `datafragments.go` — `SubstrateDataFragments(projectID, env) []ServiceFragment` (porte
  pleine palette) + `SubstrateCoreFragments(projectID, env)` (slice légale, omet le
  fragment interdit sans erreur) + `CanonicalFragment` / `HashFragment` (S02 réutilisé).
- 4 fragments DONNÉE déterministes, jeu CLOS, images = mesure DP14 (substrate-palette.ts) :
  - `postgres` role=datastore profile=core (5432, postgres:16-alpine)
  - `doltgres` role=datastore profile=non-prod (5433, dolthub/doltgresql:latest) — OPT-IN non-prod
  - `valkey` role=cache profile=core (6379, valkey/valkey:8-alpine)
  - `pgbouncer` role=pooler profile=core (6432, edoburu/pgbouncer:latest, depends_on postgres)
- Chaque fragment : image + port interne + volume bind (device = env-var ${SVC}_{TOKEN}_DATA_PATH,
  jamais de chemin en dur) + healthcheck + depends_on + profile + project_id.
- Isolation par projet : token = `records.Hash("datafragments/v1:"+projectID)[:12]` (même motif que
  provision.isolation, jamais forké) → nom de volume + device var portent le token ⇒ A ≠ B byte-distinct.

## Gate DP06 DÉLÉGUÉ, jamais forké
- Doltgres en prod refusé par `envbindings.ValidateDatastore(env, doltgres)` EXISTANT ⇒
  `DOLTGRES_NOT_ALLOWED_IN_PROD` (*Refusal surfacé verbatim). Aucun nouveau code, aucune règle propre.
- `SubstrateDataFragments` (porte pleine) renvoie le *Refusal en prod ; `SubstrateCoreFragments`
  (porte core) omet doltgres proprement en prod (3 fragments) sans erreur.

## Miroir (RED→VERT, écrit d'abord)
`datafragments_property_test.go` — 9 tests rapid, tous VERTS :
L1 byte-identique (prod : refus déterministe) · L2 palette close 4 peuplée · L3 doltgres prod refusé +
seuls les 3 core légaux en prod · L4 doltgres non-prod accepté profile non-prod · L5 isolation A≠B ·
L6 profils core/non-prod · L7 manifest greffé valide · canonical = fixpoint records.Canonicalize.

## Round-trip DDL+CRUD — NOTE HONNÊTE (pas de re-boot)
- DP15 émet des FRAGMENTS DE SERVICE (topologie compose), PAS du DDL. Le DDL (TargetPgDDL inchangé)
  est rendu par le MÊME émetteur Atlas gen/db, réutilisé par S89 (provision) / S95 (datamigrate).
- Le round-trip DDL+CRUD réel est DÉJÀ prouvé par S89 `provision_apply_test.go` (Testcontainers
  postgres:16-alpine, opt-in AIDOS_RUN_PROVISION_APPLY=1). alphashop-db-1 tournait (healthy) mais
  re-prouver ici DUPLIQUERAIT S89 (interdit : « RÉUTILISE S89/S95, PAS de duplication »). Le boot a
  été mesuré DP14 — pas de re-boot inutile. Le miroir property sur l'émission de fragment EST la preuve DP15.

## Gates passés
GOTOOLCHAIN=local go build ./... OK · go vet ./runtime/datafragments OK · gofmt clean ·
go test ./runtime/datafragments ./kernel/stackmanifest ./runtime/composeemit ./runtime/envbindings OK ·
sweep ./runtime/... ./kernel/... AUCUN FAIL (anti-overwrite : rien de cassé). Front non touché (vitest 2201/e2e intacts). ADR 0006 préservée.

## Signature pour le front (DP16+)
```go
type ServiceFragment struct {
  Key       string                 `json:"key"`        // postgres|doltgres|valkey|pgbouncer
  ProjectID string                 `json:"project_id"`
  Service   stackmanifest.Service  `json:"service"`    // image/role/internal_port/profile/healthcheck/depends_on
  Volumes   []stackmanifest.Volume `json:"volumes"`    // name + device_var (env-var ref)
}
func SubstrateDataFragments(projectID string, env scope.Environment) ([]ServiceFragment, error) // porte pleine (gate prod)
func SubstrateCoreFragments(projectID string, env scope.Environment) ([]ServiceFragment, error) // slice légale
func CanonicalFragment(f ServiceFragment) ([]byte, error)
func HashFragment(f ServiceFragment) (string, error)
func Keys() []string
```
