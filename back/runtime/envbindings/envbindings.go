// Package envbindings is the DP06 per-environment connection-binding
// PROJECTION (ROADMAP-provisioning-deploy EPIC B, ADR 0065): each of the FIVE
// closed environments (scope.Environments() — prod, staging, dev + the DP06
// additive local, future_cloud) DECLARES its connection bindings — default +
// allowed datastores, URL pattern, TLS, network, managed — as a pure
// BELOW-THE-LINE projection. The Environment model REUSES scope.Environment
// (S15), never a parallel enum (the DP06 fork: Environment résolu = projection,
// jamais une source).
//
// THE A1 GATE (ADR 0065, addendum to ADR 0006 — accepted BEFORE this step,
// authority = SPEC-stack-2026 verbatim "PostgreSQL = la prod. Doltgres = hors
// prod uniquement."): prod imposes Postgres — ValidateDatastore(prod, doltgres)
// is REFUSED with the closed code DOLTGRES_NOT_ALLOWED_IN_PROD. The refusal
// codes are PACKAGE-LOCAL (the DP02 stackmanifest motif), not new members of
// the frozen runtime/blockreason enum (CLAUDE.md §9).
//
// PURE (CLAUDE.md §6 determinism-first): no DB, no clock, no rng, no I/O —
// the bindings table is DECLARED, the gate is a total function, the projection
// is content-addressed via records.Hash(records.Canonicalize(...)) (S02
// reused, never forked). URL patterns carry ${VAR} REFERENCES ONLY
// (${APP_NAME}, ${DOMAIN}, ${APP_PORT}, ${MANAGED_URL}) — never a value (the
// DP03–DP05 law). THE WALL (§2): this package writes nothing; widening the
// closed environment set was the truth change (idea → mirror → /goal,
// ADR 0065), this projection only consumes it.
package envbindings

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
)

// Datastore is the CLOSED datastore set of the emitted app (ADR 0006/0065):
// postgres (the prod truth) and doltgres (git-for-data, non-prod only).
type Datastore string

const (
	// DatastorePostgres — the prod datastore (SPEC-stack-2026: « PostgreSQL = la prod. »).
	DatastorePostgres Datastore = "postgres"
	// DatastoreDoltgres — git-for-data for the emitted app, NON-PROD ONLY (ADR 0065).
	DatastoreDoltgres Datastore = "doltgres"
)

var datastoreOrder = []Datastore{DatastorePostgres, DatastoreDoltgres}

// Datastores returns the closed datastore set in canonical order.
func Datastores() []Datastore {
	out := make([]Datastore, len(datastoreOrder))
	copy(out, datastoreOrder)
	return out
}

// IsKnownDatastore reports whether d is a member of the closed set.
func IsKnownDatastore(d Datastore) bool {
	for _, k := range datastoreOrder {
		if k == d {
			return true
		}
	}
	return false
}

// Binding is ONE environment's declared connection binding — a below-the-line
// projection value, never a kernel source. Every URL is a ${VAR} pattern.
type Binding struct {
	// Environment — the scope.Environment (S15) this binding belongs to.
	Environment scope.Environment `json:"environment"`
	// DefaultDatastore — postgres in prod/future_cloud, doltgres elsewhere (ADR 0065).
	DefaultDatastore Datastore `json:"default_datastore"`
	// AllowedDatastores — the datastores the A1 gate admits in this environment.
	AllowedDatastores []Datastore `json:"allowed_datastores"`
	// URLPattern — the public URL as ${VAR} REFERENCES only, never a value
	// (dev convention: https://${APP_NAME}-dev.${DOMAIN} — EXIGENCE 1).
	URLPattern string `json:"url_pattern"`
	// TLS — whether the environment terminates TLS (Traefik certresolver).
	TLS bool `json:"tls"`
	// Network — the docker network the stack joins (traefik_default per
	// /data/dockers conventions; "default" on the local machine; "managed" cloud).
	Network string `json:"network"`
	// Managed — true when the environment is a managed-cloud target (future_cloud).
	Managed bool `json:"managed"`
}

// The closed refusal codes (package-local, DP02 motif — never new members of
// the frozen blockreason enum).
const (
	// CodeUnknownEnvironment — the environment is outside the closed five-member set.
	CodeUnknownEnvironment = "UNKNOWN_ENVIRONMENT"
	// CodeUnknownDatastore — the datastore is outside the closed set.
	CodeUnknownDatastore = "UNKNOWN_DATASTORE"
	// CodeDoltgresNotAllowedInProd — the A1 gate (ADR 0065): prod imposes Postgres.
	CodeDoltgresNotAllowedInProd = "DOLTGRES_NOT_ALLOWED_IN_PROD"
)

// Refusal is the typed, actionable refusal of this projection (a
// BlockReason-style door, never a prison).
type Refusal struct {
	Code    string
	Message string
}

func (e *Refusal) Error() string { return fmt.Sprintf("%s: %s", e.Code, e.Message) }

// AsRefusal reports whether err is (or wraps) a *Refusal and stores it in
// target — a thin errors.As wrapper so callers and the mirror need not import errors.
func AsRefusal(err error, target **Refusal) bool { return errors.As(err, target) }

// bindings is the DECLARED table — one row per closed environment, in the
// scope.Environments() canonical order. Declared, never learned (§8).
var bindings = []Binding{
	{
		Environment:       scope.EnvProd,
		DefaultDatastore:  DatastorePostgres,
		AllowedDatastores: []Datastore{DatastorePostgres},
		URLPattern:        "https://${APP_NAME}.${DOMAIN}",
		TLS:               true,
		Network:           "traefik_default",
	},
	{
		Environment:       scope.EnvStaging,
		DefaultDatastore:  DatastoreDoltgres,
		AllowedDatastores: []Datastore{DatastorePostgres, DatastoreDoltgres},
		URLPattern:        "https://${APP_NAME}-staging.${DOMAIN}",
		TLS:               true,
		Network:           "traefik_default",
	},
	{
		Environment:       scope.EnvDev,
		DefaultDatastore:  DatastoreDoltgres,
		AllowedDatastores: []Datastore{DatastorePostgres, DatastoreDoltgres},
		URLPattern:        "https://${APP_NAME}-dev.${DOMAIN}",
		TLS:               true,
		Network:           "traefik_default",
	},
	{
		Environment:       scope.EnvLocal,
		DefaultDatastore:  DatastoreDoltgres,
		AllowedDatastores: []Datastore{DatastorePostgres, DatastoreDoltgres},
		URLPattern:        "http://localhost:${APP_PORT}",
		TLS:               false,
		Network:           "default",
	},
	{
		Environment:       scope.EnvFutureCloud,
		DefaultDatastore:  DatastorePostgres,
		AllowedDatastores: []Datastore{DatastorePostgres, DatastoreDoltgres},
		URLPattern:        "${MANAGED_URL}",
		TLS:               true,
		Network:           "managed",
		Managed:           true,
	},
}

// Bindings returns the five declared bindings in scope.Environments() canonical
// order (a fresh copy — the table is never mutable from outside).
func Bindings() []Binding {
	out := make([]Binding, len(bindings))
	copy(out, bindings)
	for i := range out {
		ds := make([]Datastore, len(bindings[i].AllowedDatastores))
		copy(ds, bindings[i].AllowedDatastores)
		out[i].AllowedDatastores = ds
	}
	return out
}

// BindingsFor returns the binding declared for env, or an UNKNOWN_ENVIRONMENT
// refusal for an out-of-set environment (fail-closed, never guessed).
func BindingsFor(env scope.Environment) (Binding, error) {
	for _, b := range Bindings() {
		if b.Environment == env {
			return b, nil
		}
	}
	return Binding{}, &Refusal{
		Code:    CodeUnknownEnvironment,
		Message: fmt.Sprintf("environment %q is outside the closed set (want prod|staging|dev|local|future_cloud — ADR 0065); widening the set is a truth change: idea → mirror → /goal", env),
	}
}

// ValidateDatastore is the PURE A1 gate: refuses an unknown environment, an
// unknown datastore, and — THE rule (ADR 0065, SPEC-stack-2026 verbatim) —
// doltgres in prod. Everything else passes (doltgres stays opt-in off prod).
func ValidateDatastore(env scope.Environment, ds Datastore) error {
	if !scope.IsKnownEnvironment(env) {
		return &Refusal{
			Code:    CodeUnknownEnvironment,
			Message: fmt.Sprintf("environment %q is outside the closed set (want prod|staging|dev|local|future_cloud)", env),
		}
	}
	if !IsKnownDatastore(ds) {
		return &Refusal{
			Code:    CodeUnknownDatastore,
			Message: fmt.Sprintf("datastore %q is outside the closed set (want postgres|doltgres)", ds),
		}
	}
	if env == scope.EnvProd && ds == DatastoreDoltgres {
		return &Refusal{
			Code:    CodeDoltgresNotAllowedInProd,
			Message: "prod imposes Postgres (SPEC-stack-2026: « PostgreSQL = la prod. Doltgres = hors prod uniquement. », ADR 0065 addendum to 0006) — pick postgres in prod, or deploy doltgres to local/dev/staging",
		}
	}
	return nil
}

// CanonicalBindings renders the whole projection as S02-canonical bytes
// (records.Canonicalize — keys sorted, no insignificant whitespace): the body
// the TS twin reproduces byte-for-byte.
func CanonicalBindings() ([]byte, error) {
	body, err := json.Marshal(map[string]any{"bindings": Bindings()})
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(body)
}

// HashBindings is the content address of the canonical projection
// (records.Hash — S02 reused, never forked). Same table ⇒ same address on any
// machine; the Go address is AUTHORITATIVE and pinned by the property mirror,
// the TS twin and the Playwright e2e.
func HashBindings() (string, error) {
	canon, err := CanonicalBindings()
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}
