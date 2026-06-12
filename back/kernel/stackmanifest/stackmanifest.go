// Package stackmanifest engraves the StackManifest as a first-class Kernel
// SOURCE (DP02, ROADMAP-provisioning-deploy EPIC A — unlocked by the DP01
// measured GO, ADR 0064).
//
// A StackManifest is a DECLARED DSL AST: app name, services (role inside a
// CLOSED set, internal port, profile inside a CLOSED set, healthcheck,
// depends_on), named bind volumes (env-var device references — never a
// hardcoded path, SPEC-stack-2026: no hardcoded URL/secret), the external
// reverse-proxy network and the declared connector scopes. The manifest
// DECLARES topology; it resolves no URL and no secret (that is the
// per-environment projection, EPIC B / DP06+).
//
// Content addressing REUSES records.Hash(records.Canonicalize(body)) (S02,
// never forked): id == version == the SHA-256 of the canonical JSONB body —
// append-only, the head moves by a NEW version. Validation is a PURE total
// function (determinism-first, CLAUDE.md §6/§8): name required, at least one
// role=server service, unique internal ports per app, roles and profiles
// inside their closed sets — an unknown role is a ValidationError
// (UNKNOWN_SERVICE_ROLE), never guessed.
//
// THE WALL (CLAUDE.md §2): stack_manifest is ABOVE-the-line truth. This
// package is pure (no DB, no I/O); the kernel.stack_manifest table (migration
// kernel_stack_manifest_baseline.sql) gives the agent role SELECT only —
// writing a manifest flows through idea → mirror → /goal → human approval.
package stackmanifest

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// KindStackManifest is the record kind discriminator carried by every
// stack_manifest body (the kernel.stack_manifest table of the additive Atlas
// migration). The seven KRDCore kinds (records.Kinds) stay closed —
// stack_manifest is a kernel DSL-AST kind like entity/policy/operation, with
// its own table and its own pure validator (this package).
const KindStackManifest = "stack_manifest"

// Role is the function a service plays in the emitted stack. The set is
// CLOSED (DP02): an unknown role is refused, never guessed.
type Role string

const (
	RoleServer        Role = "server"
	RoleDatastore     Role = "datastore"
	RoleCache         Role = "cache"
	RolePooler        Role = "pooler"
	RoleWorkflow      Role = "workflow" // Windmill — NEVER Temporal (SPEC-stack-2026)
	RoleBus           Role = "bus"
	RoleObservability Role = "observability"
	RoleErrorTracking Role = "errortracking"
	RoleGit           Role = "git"
	RoleTickets       Role = "tickets"
	RoleAuth          Role = "auth"
	RoleDocs          Role = "docs"
	RoleConnector     Role = "connector"
	RoleInterpreter   Role = "interpreter" // the Go sidecar (ADR 0040 D7)
)

var roleOrder = []Role{
	RoleServer, RoleDatastore, RoleCache, RolePooler, RoleWorkflow, RoleBus,
	RoleObservability, RoleErrorTracking, RoleGit, RoleTickets, RoleAuth,
	RoleDocs, RoleConnector, RoleInterpreter,
}

// Roles returns the closed role set in canonical order (enumerable, never
// invented ad hoc — the Workbench and the validator share this single list).
func Roles() []Role {
	out := make([]Role, len(roleOrder))
	copy(out, roleOrder)
	return out
}

// IsKnownRole reports whether r is inside the closed DP02 role set.
func IsKnownRole(r Role) bool {
	for _, k := range roleOrder {
		if k == r {
			return true
		}
	}
	return false
}

// Profile is the compose profile a service belongs to. The set is CLOSED
// (SPEC-stack-2026 §one-shot: core · docs · observability · qa · git ·
// tickets · connectors · non-prod · full).
type Profile string

const (
	ProfileCore          Profile = "core"
	ProfileDocs          Profile = "docs"
	ProfileObservability Profile = "observability"
	ProfileQA            Profile = "qa"
	ProfileGit           Profile = "git"
	ProfileTickets       Profile = "tickets"
	ProfileConnectors    Profile = "connectors"
	ProfileNonProd       Profile = "non-prod"
	ProfileFull          Profile = "full"
)

var profileOrder = []Profile{
	ProfileCore, ProfileDocs, ProfileObservability, ProfileQA, ProfileGit,
	ProfileTickets, ProfileConnectors, ProfileNonProd, ProfileFull,
}

// Profiles returns the closed profile set in canonical order.
func Profiles() []Profile {
	out := make([]Profile, len(profileOrder))
	copy(out, profileOrder)
	return out
}

// IsKnownProfile reports whether p is inside the closed SPEC-stack-2026
// profile set.
func IsKnownProfile(p Profile) bool {
	for _, k := range profileOrder {
		if k == p {
			return true
		}
	}
	return false
}

// Service is one declared service of the stack.
type Service struct {
	Name string `json:"name"`
	Role Role   `json:"role"`
	// Image is the container image — or empty when the service is EMITTED
	// (built from the app's own phase, DP03+).
	Image        string   `json:"image,omitempty"`
	InternalPort int      `json:"internal_port"`
	Profile      Profile  `json:"profile"`
	Healthcheck  string   `json:"healthcheck,omitempty"`
	DependsOn    []string `json:"depends_on,omitempty"`
}

// Volume is a named bind volume per the /data/dockers convention. DeviceVar is
// the ENV VAR REFERENCE for the bind device (e.g. "APP_DATA_PATH") — never a
// hardcoded path.
type Volume struct {
	Name      string `json:"name"`
	DeviceVar string `json:"device_var"`
}

// Network is the reverse-proxy network (traefik_default — external everywhere
// except the traefik deployment that owns it).
type Network struct {
	Name     string `json:"name"`
	External bool   `json:"external"`
}

// StackManifest is the DP02 first-class Kernel source: the declared topology
// of an emitted stack. It declares; it never resolves (no URL, no secret —
// the per-environment projection does that, EPIC B).
type StackManifest struct {
	AppName         string    `json:"app"`
	Services        []Service `json:"services"`
	Volumes         []Volume  `json:"volumes,omitempty"`
	Network         Network   `json:"network"`
	ConnectorScopes []string  `json:"connector_scopes,omitempty"`
}

// ValidationError is the actionable refusal of an invalid manifest (the
// BlockReason discipline: a code, never a guess).
type ValidationError struct {
	Code    string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("stackmanifest: %s: %s", e.Code, e.Message)
}

// The closed refusal codes (DP02 done-criteria).
const (
	CodeStackNameRequired    = "STACK_NAME_REQUIRED"
	CodeStackHasNoServer     = "STACK_HAS_NO_SERVER"
	CodeUnknownServiceRole   = "UNKNOWN_SERVICE_ROLE"
	CodeDuplicateInternal    = "DUPLICATE_INTERNAL_PORT"
	CodeUnknownProfile       = "UNKNOWN_PROFILE"
	CodeServiceNameRequired  = "SERVICE_NAME_REQUIRED"
	CodeDuplicateServiceName = "DUPLICATE_SERVICE_NAME"
)

// Validate is the PURE total validator of a StackManifest (determinism-first):
// name required, every service named and unique, roles and profiles inside
// their closed sets, internal ports unique per app, at least one role=server.
// It never touches the DB and never writes truth.
func Validate(m StackManifest) error {
	if m.AppName == "" {
		return &ValidationError{
			Code:    CodeStackNameRequired,
			Message: "the manifest must declare an app name",
		}
	}
	seenNames := map[string]bool{}
	seenPorts := map[int]string{}
	hasServer := false
	for _, s := range m.Services {
		if s.Name == "" {
			return &ValidationError{
				Code:    CodeServiceNameRequired,
				Message: "every service must be named",
			}
		}
		if seenNames[s.Name] {
			return &ValidationError{
				Code:    CodeDuplicateServiceName,
				Message: fmt.Sprintf("service %q declared twice", s.Name),
			}
		}
		seenNames[s.Name] = true
		if !IsKnownRole(s.Role) {
			return &ValidationError{
				Code: CodeUnknownServiceRole,
				Message: fmt.Sprintf("service %q: role %q is outside the closed set %v",
					s.Name, s.Role, roleOrder),
			}
		}
		if !IsKnownProfile(s.Profile) {
			return &ValidationError{
				Code: CodeUnknownProfile,
				Message: fmt.Sprintf("service %q: profile %q is outside the closed set %v",
					s.Name, s.Profile, profileOrder),
			}
		}
		if prior, dup := seenPorts[s.InternalPort]; dup {
			return &ValidationError{
				Code: CodeDuplicateInternal,
				Message: fmt.Sprintf("services %q and %q both declare internal port %d",
					prior, s.Name, s.InternalPort),
			}
		}
		seenPorts[s.InternalPort] = s.Name
		if s.Role == RoleServer {
			hasServer = true
		}
	}
	if !hasServer {
		return &ValidationError{
			Code:    CodeStackHasNoServer,
			Message: "the stack must declare at least one role=server service",
		}
	}
	return nil
}

// body is the JSON record body of a manifest — the AST plus the kind
// discriminator, the shape stored in kernel.stack_manifest.
type body struct {
	Kind string `json:"kind"`
	StackManifest
}

// CanonicalBody returns the canonical JSONB bytes of a VALID manifest —
// records.Canonicalize over the kind-discriminated body (S02 reused, never
// forked). Same manifest → same bytes, always.
func CanonicalBody(m StackManifest) ([]byte, error) {
	if err := Validate(m); err != nil {
		return nil, err
	}
	raw, err := json.Marshal(body{Kind: KindStackManifest, StackManifest: m})
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// HashManifest returns the content address of a valid manifest:
// records.Hash(records.Canonicalize(body)).
func HashManifest(m StackManifest) (string, error) {
	canon, err := CanonicalBody(m)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// Record is one content-addressed, append-only row of kernel.stack_manifest —
// the same five-column shape as every KRDCore record table (S02). id ==
// version == Hash(Canonicalize(body)); the head moves by inserting a NEW row.
type Record struct {
	ID           string          `json:"id"`
	Body         json.RawMessage `json:"body"`
	Version      string          `json:"version"`
	SupersededBy string          `json:"superseded_by,omitempty"`
}

// NewRecord builds the content-addressed record of a manifest. It validates
// first (an invalid manifest never gets an address), canonicalizes, and sets
// id == version == the content hash. It does NOT write to the DB — the wall:
// only the aidos CLI role writes kernel.stack_manifest, via an approved
// ChangeSet (idea → mirror → /goal → approval).
func NewRecord(m StackManifest) (Record, error) {
	canon, err := CanonicalBody(m)
	if err != nil {
		return Record{}, err
	}
	h := records.Hash(canon)
	return Record{ID: h, Body: canon, Version: h}, nil
}

// Example returns the pinned reference manifest the Workbench /stack-manifest
// route seeds and the e2e proves: the minimal /data/dockers-convention stack —
// one reverse-proxied server, one datastore, the Go interpreter sidecar
// (profile core, ADR 0040 D7), one named bind volume, the external
// traefik_default network, one declared connector scope. Deterministic — a
// fixture, never drawn.
func Example() StackManifest {
	return StackManifest{
		AppName: "alphashop",
		Services: []Service{
			{
				Name:         "app",
				Role:         RoleServer,
				Image:        "node:22-alpine",
				InternalPort: 3000,
				Profile:      ProfileCore,
				Healthcheck:  "wget -q --spider http://localhost:3000/health",
				DependsOn:    []string{"postgres"},
			},
			{
				Name:         "postgres",
				Role:         RoleDatastore,
				Image:        "postgres:17-alpine",
				InternalPort: 5432,
				Profile:      ProfileCore,
				Healthcheck:  "pg_isready -U app",
			},
			{
				Name:         "interpreter",
				Role:         RoleInterpreter,
				Image:        "",
				InternalPort: 8973,
				Profile:      ProfileCore,
				Healthcheck:  "wget -q --spider http://localhost:8973/health",
			},
		},
		Volumes: []Volume{
			{Name: "app_data", DeviceVar: "APP_DATA_PATH"},
		},
		Network:         Network{Name: "traefik_default", External: true},
		ConnectorScopes: []string{"postgres:read-only"},
	}
}
