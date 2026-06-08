// Package contextmap is the pure CONTEXT-MAP primitive of KRD §46 and the app-builder
// EPIC 11 (S101): "la Context-Map est le seul vrai travail humain". Where S100 (package
// cell) gave the cell PARTITION (which bounded contexts exist, how an agent's frontier is
// scoped, and the structural cross-cell wall), S101 gives the DESIGN of the federation's
// edges — the inter-cell CONTRACT PAIRS (consumer expectation ↔ provider surface) that are
// the ONLY way two cells talk, each pair VERIFIED BY PACT before it may carry a cross-cell
// call. "L'architecture est conçue, jamais générée" (§46): a human DESIGNS the Context-Map
// in the Workbench; nothing here invents a cell, a contract, or a field — every pair is
// stated, and the code only JUDGES whether the stated consumer expectation is honored by
// the stated provider surface (the circularity ban, §8 — this package never authors a
// contract it would then satisfy).
//
// This package lands exactly that, as PURE total functions:
//
//   - VerifyPair(pair) → PairVerdict — the pact-verifier semantics made first-rank for a
//     cell-to-cell pair: the pair is HONORED iff EVERY interaction the consumer expects is
//     satisfied by the provider's published surface — same (method, path) AND the provider
//     publishes every field the consumer requires AND the expected status matches. A missing
//     field, a path mismatch, or a status mismatch makes the pair UNHONORED with the precise
//     reason (CONSUMER_FIELD_UNPUBLISHED | PATH_MISMATCH | STATUS_MISMATCH | NO_INTERACTION).
//     This is the field-set + status assertion of runtime/generators.VerifyContract, lifted
//     from one operation to a cell↔cell contract — an algorithm, never an LLM judgment.
//
//   - Federation(map) → cell.Federation — project the designed Context-Map down to the S100
//     federation of contracts_with links, marking each link Honored exactly when its pair
//     VerifyPair says HONORED. The S100 wall (cell.CheckCrossCellAccess) then resolves cross
//     -cell access over this PROJECTED federation: a call across an UNHONORED (or absent) pair
//     is refused — the done-criterion's second half.
//
//   - CheckCrossCellCall(from, to, map) → *cell.BlockReason — the federation wall S101 ships:
//     a cross-cell call FROM cell `from` TO cell `to` is REFUSED unless from == to (own cell)
//     OR a HONORED (Pact-verified) contract pair connects them. A pair that EXISTS but is
//     UNHONORED (the consumer expectation violates the provider's contract) does NOT authorize
//     the call — a violated contract is a closed door. This is CheckCrossCellAccess over the
//     projected federation, the single seam so S100 and S101 share ONE wall.
//
//   - Propose(map, label, parentPhase) → changeset.ChangeSet — persist the Context-Map as
//     Kernel truth THE ONLY LEGAL WAY: a DRAFT ChangeSet (propose → ChangeSet → approval,
//     CLAUDE.md §2 the wall), NEVER a direct write. The package writes NOTHING to truth; it
//     returns the envelope the human approves. The envelope carries a spec delta (the cells +
//     the designed pairs) AND a mirror delta (the pact-verify proof), so it cannot drift past
//     the completeness gate (changeset.SpecHasMirror).
//
// PURE (CLAUDE.md §6/§8 determinism-first): no DB, no clock, no rng, no I/O, no LLM. Every
// function is TOTAL and DETERMINISTIC — same input ⇒ same verdict + same content-hash — so
// the pact verdict and the cross-cell refusal are REPLAYABLE (the rapid property mirror pins
// this). The content-addressed map hash reuses records.Hash(Canonicalize) — NOT forked here.
// READ-ONLY against truth; Propose returns a DRAFT envelope, it does not persist it.
package contextmap

import (
	"encoding/json"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/cell"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Interaction is one consumer expectation OR one provider-published interaction: a method,
// a path, the set of fields exchanged, and the response status. It is the unit a pact
// verification matches consumer-side against provider-side — the same shape on both sides so
// the verdict is a pure set comparison. Fields are an ordered, deduplicated set (canonical).
type Interaction struct {
	// Method is the HTTP method (e.g. "POST"). Verbatim, never inferred.
	Method string `json:"method"`
	// Path is the route the interaction targets (e.g. "/orders").
	Path string `json:"path"`
	// Fields are the named fields exchanged (the consumer REQUIRES these; the provider
	// PUBLISHES these). Compared as a set — order-independent (canonicalised by sortStrings).
	Fields []string `json:"fields"`
	// Status is the expected response status (e.g. 201). 0 means "unspecified" and matches any.
	Status int `json:"status"`
}

// CellSurface is one cell's published provider surface: the interactions it offers to
// contracted neighbors. A consumer's expectation is honored only against what its provider
// publishes here — never against the provider's internals.
type CellSurface struct {
	// Cell is the bounded-context name of the provider cell.
	Cell cell.Ref `json:"cell"`
	// Published are the interactions the cell publishes to its contracted consumers.
	Published []Interaction `json:"published"`
}

// ContractPair is one designed edge of the Context-Map: a CONSUMER cell expecting a set of
// interactions from a PROVIDER cell. It is the human's design unit (§46) — drawn in the
// Workbench, never generated. Whether it is HONORED is COMPUTED by VerifyPair, not declared.
type ContractPair struct {
	// Consumer is the cell that depends on the provider.
	Consumer cell.Ref `json:"consumer"`
	// Provider is the cell that publishes the contracted surface.
	Provider cell.Ref `json:"provider"`
	// Expected are the interactions the consumer requires from the provider.
	Expected []Interaction `json:"expected"`
}

// ContextMap is the human-designed federation map: which cells exist, what each provider
// cell PUBLISHES, and the CONSUMER↔PROVIDER pairs that connect them. It is the only true
// human work (§46); it persists as Kernel truth ONLY via Propose → ChangeSet → approval.
type ContextMap struct {
	// Project is the project_id (S55) the Context-Map belongs to.
	Project string `json:"project"`
	// Cells are the bounded-context names that exist in this federation (sorted, deduplicated
	// by Canonicalize). A pair referencing a cell absent here is UNHONORED (UNKNOWN_CELL).
	Cells []cell.Ref `json:"cells"`
	// Surfaces are each provider cell's published interactions.
	Surfaces []CellSurface `json:"surfaces"`
	// Pairs are the designed consumer→provider contract pairs (the federation's edges).
	Pairs []ContractPair `json:"pairs"`
}

// PairReason is the CLOSED set of WHY a contract pair is UNHONORED. A HONORED pair carries
// ReasonHonored. Every reason names a precise, actionable violation — never a vague "fail".
type PairReason string

const (
	// ReasonHonored — every consumer expectation is satisfied by the provider surface.
	ReasonHonored PairReason = "HONORED"
	// ReasonNoInteraction — the consumer expects nothing; an empty contract is not a pair.
	ReasonNoInteraction PairReason = "NO_INTERACTION"
	// ReasonUnknownCell — the pair references a cell not declared in the Context-Map's Cells.
	ReasonUnknownCell PairReason = "UNKNOWN_CELL"
	// ReasonPathMismatch — the consumer expects a (method, path) the provider does not publish.
	ReasonPathMismatch PairReason = "PATH_MISMATCH"
	// ReasonFieldUnpublished — the consumer requires a field the provider does not publish.
	ReasonFieldUnpublished PairReason = "CONSUMER_FIELD_UNPUBLISHED"
	// ReasonStatusMismatch — the consumer expects a response status the provider does not offer.
	ReasonStatusMismatch PairReason = "STATUS_MISMATCH"
)

// PairVerdict is the deterministic result of verifying ONE contract pair: whether it is
// honored, the reason, and (when unhonored) the precise detail that broke it. It is the
// pact-verifier result lifted to a cell↔cell pair.
type PairVerdict struct {
	// Consumer / Provider echo the pair the verdict is about.
	Consumer cell.Ref `json:"consumer"`
	Provider cell.Ref `json:"provider"`
	// Honored is true iff EVERY consumer expectation is satisfied by the provider surface.
	Honored bool `json:"honored"`
	// Reason is the closed-set verdict (HONORED | one of the violation codes).
	Reason PairReason `json:"reason"`
	// Detail names the precise offending interaction/field (empty when Honored).
	Detail string `json:"detail,omitempty"`
}

// sortStrings returns a sorted, deduplicated copy of in — the canonical field set.
func sortStrings(in []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// fieldSet builds a membership set over an interaction's fields.
func fieldSet(fields []string) map[string]struct{} {
	m := make(map[string]struct{}, len(fields))
	for _, f := range fields {
		m[f] = struct{}{}
	}
	return m
}

// statusMatches reports whether a provider status satisfies a consumer's expected status. A
// 0 on either side means "unspecified" and matches anything (the minimal valid command path).
func statusMatches(expected, published int) bool {
	return expected == 0 || published == 0 || expected == published
}

// publishedFor returns the provider cell's published interactions in the Context-Map (nil if
// the provider declares no surface — then every expectation is unpublished).
func (m ContextMap) publishedFor(provider cell.Ref) []Interaction {
	for _, s := range m.Surfaces {
		if s.Cell == provider {
			return s.Published
		}
	}
	return nil
}

// hasCell reports whether the Context-Map declares the given cell.
func (m ContextMap) hasCell(c cell.Ref) bool {
	for _, x := range m.Cells {
		if x == c {
			return true
		}
	}
	return false
}

// VerifyPair runs the pact-verifier semantics for ONE contract pair against the Context-Map:
// the pair is HONORED iff, for EVERY interaction the consumer expects, the provider publishes
// a matching (method, path) interaction whose status matches AND which publishes every field
// the consumer requires. The FIRST violation determines the (Reason, Detail) — deterministic,
// total, no LLM. This is the done-criterion's first half ("une paire consumer/provider honore
// son contrat") made checkable as a pure function.
func VerifyPair(m ContextMap, pair ContractPair) PairVerdict {
	v := PairVerdict{Consumer: pair.Consumer, Provider: pair.Provider}

	if !m.hasCell(pair.Consumer) {
		v.Reason, v.Detail = ReasonUnknownCell, string(pair.Consumer)
		return v
	}
	if !m.hasCell(pair.Provider) {
		v.Reason, v.Detail = ReasonUnknownCell, string(pair.Provider)
		return v
	}
	if len(pair.Expected) == 0 {
		v.Reason = ReasonNoInteraction
		return v
	}

	published := m.publishedFor(pair.Provider)
	for _, want := range pair.Expected {
		match, ok := findPublished(published, want)
		if !ok {
			v.Reason = ReasonPathMismatch
			v.Detail = fmt.Sprintf("%s %s", want.Method, want.Path)
			return v
		}
		if !statusMatches(want.Status, match.Status) {
			v.Reason = ReasonStatusMismatch
			v.Detail = fmt.Sprintf("%s %s expects %d, provider offers %d", want.Method, want.Path, want.Status, match.Status)
			return v
		}
		have := fieldSet(match.Fields)
		for _, f := range sortStrings(want.Fields) {
			if _, ok := have[f]; !ok {
				v.Reason = ReasonFieldUnpublished
				v.Detail = fmt.Sprintf("%s %s requires field %q", want.Method, want.Path, f)
				return v
			}
		}
	}
	v.Honored, v.Reason = true, ReasonHonored
	return v
}

// findPublished returns the provider interaction matching want's (method, path), if any.
func findPublished(published []Interaction, want Interaction) (Interaction, bool) {
	for _, p := range published {
		if p.Method == want.Method && p.Path == want.Path {
			return p, true
		}
	}
	return Interaction{}, false
}

// VerifyAll returns the verdict for every designed pair, sorted (consumer, provider) so the
// result is deterministic for the panel and the property mirror.
func VerifyAll(m ContextMap) []PairVerdict {
	out := make([]PairVerdict, 0, len(m.Pairs))
	for _, p := range m.Pairs {
		out = append(out, VerifyPair(m, p))
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Consumer != out[j].Consumer {
			return out[i].Consumer < out[j].Consumer
		}
		return out[i].Provider < out[j].Provider
	})
	return out
}

// Federation projects the Context-Map down to the S100 cell.Federation: one contracts_with
// link per designed pair, marked Honored EXACTLY when VerifyPair says HONORED. The S100 wall
// (cell.CheckCrossCellAccess) then resolves cross-cell access over this projected federation
// — so S100 and S101 share ONE wall (no second, divergent gate). Deterministic.
func Federation(m ContextMap) cell.Federation {
	contracts := make([]cell.Contract, 0, len(m.Pairs))
	for _, p := range m.Pairs {
		contracts = append(contracts, cell.Contract{
			A:       p.Consumer,
			B:       p.Provider,
			Honored: VerifyPair(m, p).Honored,
		})
	}
	return cell.Federation{Contracts: contracts}
}

// CheckCrossCellCall is the federation wall S101 ships: a cross-cell call FROM cell `from` TO
// cell `to` is REFUSED (cell.CodeCrossCellNoContract) unless from == to OR a HONORED contract
// pair connects them in the projected federation. A pair that EXISTS but is UNHONORED (the
// consumer expectation VIOLATES the provider's published contract) does NOT authorize the
// call — the done-criterion's second half ("fixture refusant un appel cross-cell qui viole le
// contrat"). It delegates to cell.CheckCrossCellAccess over Federation(m): one wall, reused.
func CheckCrossCellCall(from, to cell.Ref, m ContextMap) *cell.BlockReason {
	return cell.CheckCrossCellAccess(from, to, Federation(m))
}

// canonicalMap is the content-addressed portion of a Context-Map (the design, not lifecycle).
// Fields canonicalised so the hash is stable across re-orderings of the same design.
type canonicalMap struct {
	Kind     string         `json:"kind"` // always "context-map" — namespaces the hash
	Project  string         `json:"project"`
	Cells    []cell.Ref     `json:"cells"`
	Surfaces []CellSurface  `json:"surfaces"`
	Pairs    []ContractPair `json:"pairs"`
}

// Canonicalize returns the Context-Map in canonical form: cells sorted/deduplicated, each
// interaction's fields sorted/deduplicated, surfaces sorted by cell, pairs sorted by
// (consumer, provider). The same DESIGN always yields the same canonical form — so Hash is
// content-addressed and re-emission is idempotent (the property mirror pins this).
func (m ContextMap) Canonicalize() ContextMap {
	out := ContextMap{Project: m.Project}
	out.Cells = sortRefs(m.Cells)

	out.Surfaces = make([]CellSurface, len(m.Surfaces))
	copy(out.Surfaces, m.Surfaces)
	for i := range out.Surfaces {
		out.Surfaces[i].Published = canonInteractions(out.Surfaces[i].Published)
	}
	sort.Slice(out.Surfaces, func(i, j int) bool { return out.Surfaces[i].Cell < out.Surfaces[j].Cell })

	out.Pairs = make([]ContractPair, len(m.Pairs))
	copy(out.Pairs, m.Pairs)
	for i := range out.Pairs {
		out.Pairs[i].Expected = canonInteractions(out.Pairs[i].Expected)
	}
	sort.Slice(out.Pairs, func(i, j int) bool {
		if out.Pairs[i].Consumer != out.Pairs[j].Consumer {
			return out.Pairs[i].Consumer < out.Pairs[j].Consumer
		}
		return out.Pairs[i].Provider < out.Pairs[j].Provider
	})
	return out
}

func sortRefs(in []cell.Ref) []cell.Ref {
	seen := map[cell.Ref]struct{}{}
	out := make([]cell.Ref, 0, len(in))
	for _, r := range in {
		if _, ok := seen[r]; ok {
			continue
		}
		seen[r] = struct{}{}
		out = append(out, r)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func canonInteractions(in []Interaction) []Interaction {
	out := make([]Interaction, len(in))
	copy(out, in)
	for i := range out {
		out[i].Fields = sortStrings(out[i].Fields)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Method != out[j].Method {
			return out[i].Method < out[j].Method
		}
		return out[i].Path < out[j].Path
	})
	return out
}

// Hash is the content-addressed id of the Context-Map's canonical design — the SAME scheme
// records.Hash(Canonicalize) uses (NOT forked). Two equal designs (modulo ordering) share an
// id; a changed design changes the id. The Propose envelope carries this hash.
func (m ContextMap) Hash() (string, error) {
	body, err := json.Marshal(canonicalMap{
		Kind:     "context-map",
		Project:  m.Project,
		Cells:    m.Canonicalize().Cells,
		Surfaces: m.Canonicalize().Surfaces,
		Pairs:    m.Canonicalize().Pairs,
	})
	if err != nil {
		return "", err
	}
	canon, err := records.Canonicalize(body)
	if err != nil {
		return "", err
	}
	return records.Hash(canon), nil
}

// Propose builds the DRAFT ChangeSet that persists the Context-Map as Kernel truth THE ONLY
// LEGAL WAY (propose → ChangeSet → approval, CLAUDE.md §2 the wall): it WRITES NOTHING — it
// returns the envelope a human approves. The spec delta carries the canonical design; the
// mirror delta carries the pact-verify verdicts (so the envelope cannot pass the completeness
// gate without its proof). The Context-Map id is the spec delta's Target — content-addressed.
func Propose(m ContextMap, label, parentPhase string) (changeset.ChangeSet, error) {
	canonical := m.Canonicalize()
	id, err := canonical.Hash()
	if err != nil {
		return changeset.ChangeSet{}, err
	}
	specBody, err := json.Marshal(canonicalMap{
		Kind:     "context-map",
		Project:  canonical.Project,
		Cells:    canonical.Cells,
		Surfaces: canonical.Surfaces,
		Pairs:    canonical.Pairs,
	})
	if err != nil {
		return changeset.ChangeSet{}, err
	}
	mirrorBody, err := json.Marshal(VerifyAll(canonical))
	if err != nil {
		return changeset.ChangeSet{}, err
	}
	spec := &changeset.Delta{Kind: "add", Target: "context-map:" + id, Body: specBody}
	mirror := &changeset.Delta{Kind: "add", Target: "mirror:context-map:" + id, Body: mirrorBody}
	return changeset.Open(label, parentPhase, spec, mirror)
}
