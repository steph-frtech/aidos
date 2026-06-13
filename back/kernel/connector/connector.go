// Package connector graves the DP20 model: a Connector / Skill / MCP-server is a
// declared, content-addressed Kernel SOURCE (above the waterline), not a hardcoded
// integration. It promotes the DP19 governance SPIKE (back/runtime/spike/
// dp19connectorgov, verdict go) into a real Kernel type, modelled VERBATIM on the
// agentlayer.AgentSpec discipline: CLOSED sets + a pure-total Validate + an S02
// content-address. The future connectors are RECORDS, never hardcoded:
//
//	« un connecteur est une couche gouvernée déclarée — interne / externe / IA / cloud
//	  est une contrainte de la SOURCE, jamais une décision de runtime opaque. »
//
// THE WALL (CLAUDE.md §2). Defining the connector TYPE + its Validation + its
// content-addressing is CODE — this package, like agentlayer, writes NO truth. A
// Connector/Skill/MCP-server INSTANCE is an above-the-line VÉRITÉ: it is graved only
// through idée → miroir → /goal → approbation by the aidos CLI writer role (the agent
// has NO GRANT). A Workbench seed is a below-the-line fixture/projection, never a
// truth-store write.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Validate and ContentID are PURE, TOTAL functions
// of their input — no DB, no clock, no rng, no I/O. The AI-never-direct-to-DB invariant
// is a DECLARED set-membership check over a closed datastore-host set (DatastoreHosts),
// NEVER inferred. Same input ⇒ same verdict / same id (the reproducibility mirror
// connector_property_test.go pins it). The id REUSES the S02 content-address
// (records.Hash / records.Canonicalize), never an RNG, never forked.
//
// REUSE, NEVER REINVENT (CLAUDE.md §3). The authority qualifier is S16
// (authority.AuthorityGraph + authority.Validate), the scope qualifier is S15
// (scope.TruthScope + scope.Validate), the data-truth qualifier is S37
// (db.DataTruthScope). This package forks NONE of them — it composes them, exactly as
// agentlayer.CoucheAgent does.
package connector

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/steph-frtech/aidos/back/gen/db"
	"github.com/steph-frtech/aidos/back/kernel/authority"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/kernel/scope"
)

// Kind is the closed triad a connector source declares: a raw connector, a Skill
// (a replayable gesture), or an MCP-server (one backend op surface, ADR 0009). The set
// is CLOSED — a kind outside it makes Validate error.
type Kind string

const (
	// KindConnector — a raw integration connector (Gmail, Drive, GitHub, Postgres-RO…).
	KindConnector Kind = "connector"
	// KindSkill — a replayable Skill gesture bound to a connector surface.
	KindSkill Kind = "skill"
	// KindMCPServer — an MCP server exposing one backend op surface (ADR 0009).
	KindMCPServer Kind = "mcp_server"
)

var kindOrder = []Kind{KindConnector, KindSkill, KindMCPServer}

// Kinds returns the three connector-source kinds in canonical order (declared, never
// map-derived) so the Workbench card set is never invented.
func Kinds() []Kind {
	out := make([]Kind, len(kindOrder))
	copy(out, kindOrder)
	return out
}

// IsKnownKind reports whether k is one of the three connector-source kinds.
func IsKnownKind(k Kind) bool { return contains(kindOrder, k) }

// Classification is the trust-plane a connector bridges — the CLOSED four-member set
// {internal, external, ai, cloud}. The strict separation interne/externe/IA/cloud is
// encoded as a CONSTRAINT OF THE SOURCE (not a runtime decision): the source DECLARES
// its plane, and the AI-never-direct-to-DB invariant keys on ClassAI. The set is CLOSED
// (honesty, CLAUDE.md §8) — a classification outside it is UNKNOWN_CONNECTOR_CLASS.
type Classification string

const (
	// ClassInternal — an internal datastore/service (e.g. the truth-store Postgres-RO).
	ClassInternal Classification = "internal"
	// ClassExternal — an external SaaS reached via egress (Gmail, Drive, GitHub, Slack…).
	ClassExternal Classification = "external"
	// ClassAI — the AI agent plane. It may NEVER carry an egress to a datastore host
	// (AI-never-direct-to-DB, the load-bearing DECLARED invariant).
	ClassAI Classification = "ai"
	// ClassCloud — a cloud-infra plane (provisioning/portability targets).
	ClassCloud Classification = "cloud"
)

var classificationOrder = []Classification{ClassInternal, ClassExternal, ClassAI, ClassCloud}

// Classifications returns the closed four-member classification set in canonical order.
func Classifications() []Classification {
	out := make([]Classification, len(classificationOrder))
	copy(out, classificationOrder)
	return out
}

// IsKnownClassification reports whether c is a member of the closed classification set.
func IsKnownClassification(c Classification) bool { return contains(classificationOrder, c) }

// AccessScope is a connector's access scope — the CLOSED two-member set {read_only,
// read_write}. A read_write connector REQUIRES a declared authority (S16); a read_only
// one needs none. The set is CLOSED — a scope outside it is UNKNOWN_CONNECTOR_SCOPE.
type AccessScope string

const (
	// ScopeReadOnly — the connector may only read (no authority required).
	ScopeReadOnly AccessScope = "read_only"
	// ScopeReadWrite — the connector may write; it REQUIRES a declared S16 authority.
	ScopeReadWrite AccessScope = "read_write"
)

var accessScopeOrder = []AccessScope{ScopeReadOnly, ScopeReadWrite}

// AccessScopes returns the closed two-member access-scope set in canonical order.
func AccessScopes() []AccessScope {
	out := make([]AccessScope, len(accessScopeOrder))
	copy(out, accessScopeOrder)
	return out
}

// IsKnownScope reports whether s is a member of the closed access-scope set.
func IsKnownScope(s AccessScope) bool { return contains(accessScopeOrder, s) }

// Target is the closed set of bind targets a connector source declares: which concrete
// system the capability resolves to (Gmail / Drive / GitHub-Forgejo / Postgres-RO /
// Snowflake / ERP / CRM / SIRH / Slack…). The set is CLOSED (honesty) — a target a step
// needs is ADDED here above the line (via /goal); it is never invented at runtime.
type Target string

const (
	TargetGmail      Target = "gmail"
	TargetDrive      Target = "drive"
	TargetGitHub     Target = "github_forgejo"
	TargetPostgresRO Target = "postgres_ro"
	TargetSnowflake  Target = "snowflake"
	TargetERP        Target = "erp"
	TargetCRM        Target = "crm"
	TargetSIRH       Target = "sirh"
	TargetSlack      Target = "slack"
)

var targetOrder = []Target{
	TargetGmail, TargetDrive, TargetGitHub, TargetPostgresRO,
	TargetSnowflake, TargetERP, TargetCRM, TargetSIRH, TargetSlack,
}

// Targets returns the closed bind-target set in canonical order.
func Targets() []Target {
	out := make([]Target, len(targetOrder))
	copy(out, targetOrder)
	return out
}

// IsKnownTarget reports whether t is a member of the closed bind-target set.
func IsKnownTarget(t Target) bool { return contains(targetOrder, t) }

// Layer places the connector source relative to the waterline. A ConnectorSource is a
// SOURCE / vérité — it is ALWAYS above the line (it mirrors records.Authority but is
// kept a local type so the package's closed-set discipline is self-contained, exactly
// like agentlayer reuses records.Authority for its Layer field).
type Layer string

const (
	// LayerAbove — above the waterline: a connector source is human-anchored truth.
	LayerAbove Layer = "above"
	// LayerBelow — below the waterline (never valid for a connector source).
	LayerBelow Layer = "below"
)

// datastoreHosts is the DECLARED closed set of host patterns that name a DATASTORE — a
// direct database endpoint the AI must never reach (AI-never-direct-to-DB, KRD §44.3 /
// DP19 A3). It is DECLARED here, above the line, never inferred: the invariant is a pure
// set-membership over this list (a host is a datastore IFF it matches a declared prefix).
// A new datastore family a step needs is ADDED here via /goal — never discovered.
var datastoreHosts = []string{
	"postgres://",
	"postgresql://",
	"mysql://",
	"mongodb://",
	"redis://",
	"snowflake://",
	"jdbc:",
	"truth-store", // the AIDOS truth-store (the DP19 AIDirectDBTarget family)
	"db.internal", // the internal datastore family
	"doltgres://", // the emitted-app data-versioning datastore
}

// DatastoreHosts returns a FRESH copy of the declared datastore-host set. The Workbench
// legend and the property mirror read this single source so the set is never re-invented.
func DatastoreHosts() []string {
	out := make([]string, len(datastoreHosts))
	copy(out, datastoreHosts)
	return out
}

// IsDatastoreHost reports whether host names a datastore — pure set-membership over the
// declared datastore-host set (a case-insensitive prefix/substring match). It is the
// predicate the AI-never-direct-to-DB invariant keys on; it infers nothing.
func IsDatastoreHost(host string) bool {
	h := strings.ToLower(strings.TrimSpace(host))
	if h == "" {
		return false
	}
	for _, d := range datastoreHosts {
		if strings.Contains(h, d) {
			return true
		}
	}
	return false
}

// ConnectorSource is the DP20 declared SOURCE: a content-addressed connector / skill /
// mcp-server record carrying its closed-set classification, scope, egress allow-list,
// data-truth qualifier (S37), authority (S16) and bind target. It is the connector twin
// of agentlayer.CoucheAgent — a governed layer, above the waterline, content-addressed
// (S02). NOTHING here writes truth: a real instance is graved through /goal.
type ConnectorSource struct {
	// Layer is the S02 waterline placement — ALWAYS LayerAbove (a SOURCE is truth).
	Layer Layer `json:"layer"`
	// Kind is connector | skill | mcp_server (closed triad).
	Kind Kind `json:"kind"`
	// Name is the connector's stable name (non-empty).
	Name string `json:"name"`
	// Classification is the trust-plane the source bridges (closed set).
	Classification Classification `json:"classification"`
	// Scope is read_only | read_write (closed set). read_write REQUIRES an authority.
	Scope AccessScope `json:"scope"`
	// EgressHosts is the egress allow-list (the hosts the connector may reach). For a
	// ClassAI source, NO member may be a datastore host (AI-never-direct-to-DB).
	EgressHosts []string `json:"egress_hosts"`
	// Target is the bound concrete system (closed set).
	Target Target `json:"target"`
	// DataTruthScope is the S37 qualifier (reused, never forked) — declared when the
	// connector touches data already produced (§44.3 historical impact).
	DataTruthScope db.DataTruthScope `json:"data_truth_scope"`
	// Authority is the S16 AuthorityGraph (reused, never forked) — who approves the
	// source's admission. REQUIRED (well-formed) for a read_write connector.
	Authority authority.AuthorityGraph `json:"authority"`
	// TruthScope is the S15 qualifier (reused, never forked) — where/when the source holds.
	TruthScope scope.TruthScope `json:"truth_scope"`
	// Version is the content-address (== ContentID), set at gravure time (S02).
	Version string `json:"version,omitempty"`
}

// Validation errors.
var (
	// ErrUnknownKind — Kind is outside the closed {connector, skill, mcp_server} triad.
	ErrUnknownKind = errors.New("connector: UNKNOWN_CONNECTOR_KIND — kind is not connector|skill|mcp_server")
	// ErrUnknownClassification — Classification is outside {internal, external, ai, cloud}.
	ErrUnknownClassification = errors.New("connector: UNKNOWN_CONNECTOR_CLASS — classification is not internal|external|ai|cloud")
	// ErrUnknownScope — Scope is outside {read_only, read_write}.
	ErrUnknownScope = errors.New("connector: UNKNOWN_CONNECTOR_SCOPE — scope is not read_only|read_write")
	// ErrUnknownTarget — Target is outside the closed bind-target set.
	ErrUnknownTarget = errors.New("connector: UNKNOWN_CONNECTOR_TARGET — target is not a declared bind target")
	// ErrAIDirectDBForbidden — an ai-classified connector carries an egress to a datastore
	// host: the load-bearing DECLARED invariant (AI-never-direct-to-DB, §44.3 / DP19 A3).
	ErrAIDirectDBForbidden = errors.New("connector: AI_DIRECT_DB_ACCESS_FORBIDDEN — an ai connector may never egress directly to a datastore")
	// ErrRWRequiresAuthority — a read_write connector declares no well-formed authority.
	ErrRWRequiresAuthority = errors.New("connector: CONNECTOR_RW_REQUIRES_AUTHORITY — a read_write connector must declare an authority (S16)")
	// ErrEmptyName — Name is empty/blank.
	ErrEmptyName = errors.New("connector: name must be non-empty")
	// ErrNotAboveTheLine — a ConnectorSource (a SOURCE/truth) must sit above the waterline.
	ErrNotAboveTheLine = errors.New("connector: a ConnectorSource is a SOURCE and must be above the waterline")
)

// Validate is the PURE, TOTAL shape + wall + invariant guard of a ConnectorSource. It
// composes the S15/S16/S37 reused qualifiers; it forks none. The order is fixed so the
// refusal is deterministic:
//
//  1. CLOSED KIND — Kind ∈ {connector, skill, mcp_server} (else UNKNOWN_CONNECTOR_KIND).
//  2. NAME — non-empty.
//  3. CLOSED CLASSIFICATION — ∈ {internal, external, ai, cloud} (else UNKNOWN_CONNECTOR_CLASS).
//  4. CLOSED SCOPE — ∈ {read_only, read_write} (else UNKNOWN_CONNECTOR_SCOPE).
//  5. CLOSED TARGET — a declared bind target (else UNKNOWN_CONNECTOR_TARGET).
//  6. AI-NEVER-DIRECT-TO-DB — a ClassAI source whose egress_hosts include ANY datastore
//     host is refused (AI_DIRECT_DB_ACCESS_FORBIDDEN). Pure set-membership, DECLARED.
//  7. RW-NEEDS-AUTHORITY — a ScopeReadWrite source must carry a well-formed S16 graph
//     (else CONNECTOR_RW_REQUIRES_AUTHORITY). A read_only source needs none.
//  8. ABOVE THE LINE — a ConnectorSource is a SOURCE (Layer == above).
//  9. SUB-QUALIFIERS — when present, the S16 authority and the S15 scope are well-formed
//     (a connector source is an ACTIVE truth, so an empty scope is rejected by S15).
//
// Pure: no DB, no clock, no I/O. Same input ⇒ same verdict (the property mirror pins it).
func Validate(c ConnectorSource) error {
	if !IsKnownKind(c.Kind) {
		return fmt.Errorf("%w: %q", ErrUnknownKind, c.Kind)
	}
	if strings.TrimSpace(c.Name) == "" {
		return ErrEmptyName
	}
	if !IsKnownClassification(c.Classification) {
		return fmt.Errorf("%w: %q", ErrUnknownClassification, c.Classification)
	}
	if !IsKnownScope(c.Scope) {
		return fmt.Errorf("%w: %q", ErrUnknownScope, c.Scope)
	}
	if !IsKnownTarget(c.Target) {
		return fmt.Errorf("%w: %q", ErrUnknownTarget, c.Target)
	}
	// AI-never-direct-to-DB — the DECLARED, set-membership invariant. An ai connector
	// whose egress includes any datastore host is refused (never inferred for non-ai).
	if c.Classification == ClassAI {
		for _, h := range c.EgressHosts {
			if IsDatastoreHost(h) {
				return fmt.Errorf("%w: %q", ErrAIDirectDBForbidden, h)
			}
		}
	}
	// RW-needs-authority — a read_write connector must declare a well-formed S16 graph.
	if c.Scope == ScopeReadWrite {
		if err := authority.Validate(c.Authority); err != nil {
			return fmt.Errorf("%w: %v", ErrRWRequiresAuthority, err)
		}
	}
	// A ConnectorSource is a SOURCE/truth — it must be above the waterline.
	if c.Layer != LayerAbove {
		return ErrNotAboveTheLine
	}
	// A declared authority must be well-formed (it is the admitter of the source).
	if err := authority.Validate(c.Authority); err != nil {
		// A read_only source may carry an empty authority (the zero graph). Only a
		// non-zero, malformed graph is rejected here; the empty case is allowed for RO.
		if !isZeroAuthority(c.Authority) {
			return fmt.Errorf("connector: authority: %w", err)
		}
	}
	// The S15 TruthScope must be well-formed — a connector source is an ACTIVE truth, so
	// an empty scope is rejected (no source is universal by default, KRD §13.7).
	if err := scope.Validate(scope.Record{Status: scope.StatusActive, Scope: c.TruthScope}); err != nil {
		return fmt.Errorf("connector: scope: %w", err)
	}
	return nil
}

// isZeroAuthority reports whether g is the empty graph (no domain, no approvers). A
// read_only connector source may legitimately carry no authority; a read_write one may
// not (Validate's step 7 already forces the RW case to be well-formed).
func isZeroAuthority(g authority.AuthorityGraph) bool {
	return g.Domain == "" && len(g.Approvers) == 0 && len(g.Veto) == 0 && len(g.Escalation) == 0
}

// canonicalBody renders the content-bearing fields of a ConnectorSource into the
// canonical JSONB body the kernel stores, with the egress allow-list sorted so the
// content address does not depend on the order the hosts were written. The Version
// field is EXCLUDED (it IS the hash — a record never hashes its own id, S02). It
// marshals through records.Canonicalize so object-key order never leaks into the hash.
func canonicalBody(c ConnectorSource) ([]byte, error) {
	egress := append([]string{}, c.EgressHosts...)
	sortStrings(egress)
	body := map[string]any{
		"kind":             string(records.KindLayer),
		"connector_kind":   string(c.Kind),
		"layer":            string(c.Layer),
		"name":             c.Name,
		"classification":   string(c.Classification),
		"scope":            string(c.Scope),
		"egress_hosts":     egress,
		"target":           string(c.Target),
		"data_truth_scope": c.DataTruthScope,
		"authority":        c.Authority,
		"truth_scope":      c.TruthScope,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}

// ContentID returns the S02 content address of a ConnectorSource: Hash(Canonicalize(body)).
// The same source canonicalises to the SAME id (byte-stable, egress order-independent);
// ANY change to a content-bearing field yields a DIFFERENT id (a new version — a new row,
// never an in-place mutation, KRD §44.1). It REUSES records.Hash (the S02 scheme), never
// an RNG, never forked. Pure, total, deterministic — it panics only on an internal
// marshalling bug (the body is a fixed struct), exactly like db.DataTruthScope.ID.
func ContentID(c ConnectorSource) string {
	b, err := canonicalBody(c)
	if err != nil {
		// A fixed struct cannot fail to marshal; treat as a programming bug, not a guess.
		panic(fmt.Sprintf("connector: ConnectorSource body marshal failed: %v", err))
	}
	return records.Hash(b)
}

// CanonicalBody returns the canonical JSONB body the kernel.connector_source row stores.
// Test-facing + the aidos writer use it to round-trip the row content-addressed (the
// agent never calls it to WRITE — the wall: only the aidos CLI role inserts a real source).
func CanonicalBody(c ConnectorSource) ([]byte, error) { return canonicalBody(c) }

// ToRecord builds the content-addressed records.Record (KindLayer) for a ConnectorSource,
// so a graved connector lands under the SAME S02 address scheme as every other layer.
// It is a CONSTRUCTOR for the aidos writer role; it does NOT write to the DB (the wall —
// the agent has no GRANT). The returned record always passes records.Validate.
func ToRecord(c ConnectorSource) (records.Record, error) {
	b, err := canonicalBody(c)
	if err != nil {
		return records.Record{}, err
	}
	return records.NewRecord(records.KindLayer, b)
}

func contains[T comparable](xs []T, x T) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

// sortStrings sorts a string slice in place (small, dependency-free; the egress list is
// tiny). Deterministic — the canonical body never depends on host insertion order.
func sortStrings(xs []string) {
	for i := 1; i < len(xs); i++ {
		for j := i; j > 0 && xs[j-1] > xs[j]; j-- {
			xs[j-1], xs[j] = xs[j], xs[j-1]
		}
	}
}
