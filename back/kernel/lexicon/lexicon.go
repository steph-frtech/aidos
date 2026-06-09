// Package lexicon is the Lexicon Kernel + the inter-layer linter (FK14, KRD FKE-21): a concept
// NAMED across the 16 layers as a single source, and a PURE linter that detects a symbol OUT of
// that lexicon, per layer — a language drift made verifiable by computation.
//
// THE CONCEPT (FKE-21 · langage ubiquitaire inter-couches):
//
//	A concept (e.g. ReturnRequest) must be RECOGNISABLE in every layer: the human name, the BDD
//	step, the code function/type, the test, the DB table, the API route, the event, the log, the
//	metric, the MCP tool, the skill, the agent, the doc, the CI pipeline, the policy, the memory.
//	The Lexicon Kernel binds ONE concept to ITS legal symbol in each of those 16 layers. A symbol
//	observed in a layer that is NOT the lexicon's symbol for that concept-in-that-layer is DRIFT.
//
// THE STORAGE FORK — TRANCHÉ ICI (FK14 objective, ADR 0044 "fork de stockage différé").
//
//	The grill left a fork open: store a lexicon as its OWN record kind, or as a `kind:layer`
//	body with a layer discriminator (like the StackManifest deferred-storage fork). FK14 decides
//	it HERE, the SAME way WhyTree (FK13) and the other link-bodies decided theirs: a Lexicon Kernel
//	rides INSIDE a content-addressed `kernel.link` body with link_kind:"lexicon" — NO new record
//	kind. Rationale: (a) the seven KRDCore kinds stay closed (anti-explosion, KRD §1.3); (b) a
//	lexicon is a binding across layers — a LINK by nature; (c) it reuses records.NewRecord verbatim
//	(content-addressed, append-only) so a renamed symbol yields a NEW version, never a mutation
//	(KRD §12). The 16 layers are a CLOSED vocabulary carried in the body, never invented per call.
//
// THE LINTER (the FK14 done-criterion). Lint(LexiconKernel, []Observation) → []Drift is a PURE
// TOTAL function of (the lexicon, the observed symbols) — same inputs ⇒ byte-identical drifts.
// A renamed DB table (return_requests → orders_returns) observed in layer DB while the lexicon
// pins return_requests there ⇒ ONE Drift (the FK14 fault-injection: rename a table out of lexicon
// → red). An observation in an UNKNOWN layer is itself a drift (UNKNOWN_LAYER); the verification
// is a SET membership check against the lexicon's per-layer symbol, never a prompt.
//
// PURE (determinism-first, CLAUDE.md §8): no DB, no clock, no rng, no I/O, NO LLM. The linter is a
// string-equality over a closed layer set — exactly the kind of deterministic check that MUST be
// code (parse/validate/match), never an "LLM drift agent". READ-ONLY against truth (the wall,
// CLAUDE.md §2): this package writes nothing — freezing/updating a lexicon flows through
// idea → mirror → /goal → human approval (the aidos CLI writer role; the agent has no GRANT).
package lexicon

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/records"
)

// Layer is one of the 16 closed layers a concept must be recognisable in (FKE-21). The set is a
// CLOSED vocabulary: a symbol observed in any other layer is itself a drift (UNKNOWN_LAYER).
type Layer string

const (
	// LayerHuman — the human name (français d'abord), e.g. "demande de retour".
	LayerHuman Layer = "human"
	// LayerBDD — the Gherkin/BDD step name, e.g. create_return_request.
	LayerBDD Layer = "bdd"
	// LayerCode — the code function/type symbol, e.g. createReturnRequest / ReturnRequest.
	LayerCode Layer = "code"
	// LayerTest — the test name, e.g. create_return_request_should_create_pending_return.
	LayerTest Layer = "test"
	// LayerDB — the DB table/relation, e.g. return_requests.
	LayerDB Layer = "db"
	// LayerAPI — the API route, e.g. POST /return-requests.
	LayerAPI Layer = "api"
	// LayerEvent — the domain event, e.g. ReturnRequestCreated.
	LayerEvent Layer = "event"
	// LayerLog — the log line/key, e.g. return_request.created.
	LayerLog Layer = "log"
	// LayerMetric — the metric name, e.g. return_request_created_total.
	LayerMetric Layer = "metric"
	// LayerMCP — the MCP tool, e.g. returns.create_return_request.
	LayerMCP Layer = "mcp"
	// LayerSkill — the skill, e.g. analyze_return_request.
	LayerSkill Layer = "skill"
	// LayerAgent — the agent, e.g. return_request_agent.
	LayerAgent Layer = "agent"
	// LayerDoc — the documentation anchor, e.g. return-request.
	LayerDoc Layer = "doc"
	// LayerCI — the CI/CD pipeline, e.g. test_return_request_kernel.
	LayerCI Layer = "ci"
	// LayerPolicy — the policy, e.g. return_request_access_policy.
	LayerPolicy Layer = "policy"
	// LayerMemory — the memory item kind, e.g. return_request_memory.
	LayerMemory Layer = "memory"
)

// Layers returns the 16 closed layers in canonical order (FKE-21). The order is the contract: the
// serialized body and the Workbench projection iterate it, so the set of layers is never invented.
func Layers() []Layer {
	return []Layer{
		LayerHuman, LayerBDD, LayerCode, LayerTest, LayerDB, LayerAPI, LayerEvent, LayerLog,
		LayerMetric, LayerMCP, LayerSkill, LayerAgent, LayerDoc, LayerCI, LayerPolicy, LayerMemory,
	}
}

// IsKnownLayer reports whether l is one of the 16 closed layers.
func IsKnownLayer(l Layer) bool {
	for _, k := range Layers() {
		if k == l {
			return true
		}
	}
	return false
}

// LexiconKernel binds ONE concept to its legal symbol in each layer (FKE-21). Symbols is the source
// of truth for "what may this concept be called in this layer". A layer absent from Symbols means
// the concept is not (yet) named in that layer — an observation there is then UNKNOWN_SYMBOL drift
// (the lexicon pins nothing for it), NOT a free pass.
type LexiconKernel struct {
	// Concept is the canonical concept id (the human-anchored name of the thing), e.g. ReturnRequest.
	Concept string `json:"concept"`
	// Symbols maps each named layer to the concept's legal symbol in that layer. Closed by Layers().
	Symbols map[Layer]string `json:"symbols"`
}

// Observation is a symbol seen in some layer (read from a real artifact — a table name, a function,
// a metric). The linter judges it against the lexicon's symbol for that layer.
type Observation struct {
	// Layer is the layer the symbol was observed in.
	Layer Layer `json:"layer"`
	// Symbol is the actual symbol seen (e.g. orders_returns where the lexicon pins return_requests).
	Symbol string `json:"symbol"`
}

// DriftKind is the closed reason an observation is out of lexicon.
type DriftKind string

const (
	// DriftUnknownLayer — the observation is in a layer outside the 16 closed layers.
	DriftUnknownLayer DriftKind = "UNKNOWN_LAYER"
	// DriftUnknownSymbol — the lexicon pins NO symbol for this concept in this (known) layer, so the
	// observed symbol cannot be vouched for — it is a drift (the concept is unnamed there).
	DriftUnknownSymbol DriftKind = "UNKNOWN_SYMBOL"
	// DriftRenamed — the lexicon pins a symbol for this layer, and the observed symbol differs from
	// it: a rename out of lexicon (the FK14 fault-injection — rename a table → red).
	DriftRenamed DriftKind = "RENAMED"
)

// Drift is one out-of-lexicon observation: the layer, the observed symbol, the lexicon's expected
// symbol (empty when the lexicon pins none), and the closed reason. Drifts are returned in a stable
// order (by Layer canonical index, then Symbol) so the linter is byte-deterministic.
type Drift struct {
	Layer    Layer     `json:"layer"`
	Symbol   string    `json:"symbol"`
	Expected string    `json:"expected,omitempty"`
	Kind     DriftKind `json:"kind"`
}

// layerIndex maps a layer to its canonical position (for the stable drift order). An unknown layer
// sorts last (index = len(Layers())).
func layerIndex(l Layer) int {
	for i, k := range Layers() {
		if k == l {
			return i
		}
	}
	return len(Layers())
}

// Lint is the PURE inter-layer linter (FK14). For each observation it checks:
//
//  1. the layer is one of the 16 closed layers — else DriftUnknownLayer;
//  2. the lexicon pins a symbol for the concept in that layer — else DriftUnknownSymbol;
//  3. the observed symbol EQUALS the lexicon's symbol — else DriftRenamed.
//
// An observation that passes all three is IN lexicon (no drift). Lint returns every drift in a
// stable order (layer canonical index, then symbol). It is a TOTAL function: same (lexicon,
// observations) ⇒ byte-identical drifts. No clock, no rng, NO LLM — a set-membership check.
//
// "GREEN" (no drift) = an empty slice. The FK14 done-criterion: rename a DB table out of lexicon
// ⇒ exactly one DriftRenamed → red.
func Lint(k LexiconKernel, obs []Observation) []Drift {
	drifts := make([]Drift, 0)
	for _, o := range obs {
		if !IsKnownLayer(o.Layer) {
			drifts = append(drifts, Drift{Layer: o.Layer, Symbol: o.Symbol, Kind: DriftUnknownLayer})
			continue
		}
		want, pinned := k.Symbols[o.Layer]
		if !pinned {
			drifts = append(drifts, Drift{Layer: o.Layer, Symbol: o.Symbol, Kind: DriftUnknownSymbol})
			continue
		}
		if o.Symbol != want {
			drifts = append(drifts, Drift{Layer: o.Layer, Symbol: o.Symbol, Expected: want, Kind: DriftRenamed})
		}
	}
	sort.SliceStable(drifts, func(i, j int) bool {
		li, lj := layerIndex(drifts[i].Layer), layerIndex(drifts[j].Layer)
		if li != lj {
			return li < lj
		}
		return drifts[i].Symbol < drifts[j].Symbol
	})
	return drifts
}

// Clean reports whether the observations are wholly IN lexicon (no drift) — the green verdict.
func Clean(k LexiconKernel, obs []Observation) bool { return len(Lint(k, obs)) == 0 }

// Validate / errors. Each maps 1:1 to a closed BlockReason code surfaced by the MCP + the Workbench.
var (
	// ErrNoConcept — a lexicon with no concept id is rejected (a nameless lexicon names nothing).
	ErrNoConcept = errors.New("lexicon: empty concept (NO_CONCEPT)")
	// ErrUnknownLayer — a lexicon pins a symbol under a layer outside the 16 closed layers.
	ErrUnknownLayer = errors.New("lexicon: symbol under an unknown layer (UNKNOWN_LAYER)")
	// ErrEmptySymbol — a lexicon pins an EMPTY symbol for a layer (a blank name is not a binding).
	ErrEmptySymbol = errors.New("lexicon: empty symbol pinned for a layer (EMPTY_SYMBOL)")
)

// Validate checks a LexiconKernel's shape (pure): a non-empty concept, and every pinned layer is a
// known layer with a non-empty symbol. It does NOT require all 16 layers (a concept may be named in
// a subset — a pure function carries human+code, an endpoint carries more, FKE-21). Validate writes
// nothing (the wall).
func Validate(k LexiconKernel) error {
	if k.Concept == "" {
		return ErrNoConcept
	}
	for l, sym := range k.Symbols {
		if !IsKnownLayer(l) {
			return fmt.Errorf("%w: %q", ErrUnknownLayer, l)
		}
		if sym == "" {
			return fmt.Errorf("%w: layer %q", ErrEmptySymbol, l)
		}
	}
	return nil
}

// SerializeBody renders the content-addressed kernel.link body carrying the Lexicon Kernel — the
// STORAGE FORK decided here (a lexicon rides inside a kernel.link body, link_kind:"lexicon", NOT a
// new record kind). NewRecord(KindLink, body) yields id == version == Hash(Canonicalize(body)): a
// renamed symbol yields a DIFFERENT version (a new lexicon, never an in-place mutation, KRD §12).
// REUSES records.Canonicalize (never forked) — the symbols are emitted in the closed layer order so
// the address is independent of the caller's map iteration order (same lexicon ⇒ same address).
func SerializeBody(k LexiconKernel) ([]byte, error) {
	if err := Validate(k); err != nil {
		return nil, err
	}
	// Emit symbols as an ordered list of {layer,symbol} so the canonical body is map-order independent.
	type pair struct {
		Layer  Layer  `json:"layer"`
		Symbol string `json:"symbol"`
	}
	pairs := make([]pair, 0, len(k.Symbols))
	for _, l := range Layers() {
		if sym, ok := k.Symbols[l]; ok {
			pairs = append(pairs, pair{Layer: l, Symbol: sym})
		}
	}
	body := map[string]any{
		"kind":      string(records.KindLink),
		"link_kind": "lexicon",
		"concept":   k.Concept,
		"symbols":   pairs,
	}
	return json.Marshal(body)
}

// ParseBody is the inverse of SerializeBody: it recovers a LexiconKernel from a kernel.link body
// (the round-trip half). It errors if the body is not a lexicon link body.
func ParseBody(body []byte) (LexiconKernel, error) {
	var probe struct {
		Kind     string `json:"kind"`
		LinkKind string `json:"link_kind"`
		Concept  string `json:"concept"`
		Symbols  []struct {
			Layer  Layer  `json:"layer"`
			Symbol string `json:"symbol"`
		} `json:"symbols"`
	}
	if err := json.Unmarshal(body, &probe); err != nil {
		return LexiconKernel{}, fmt.Errorf("lexicon: invalid link body: %w", err)
	}
	if probe.Kind != string(records.KindLink) {
		return LexiconKernel{}, fmt.Errorf("lexicon: body kind %q is not a kernel.link", probe.Kind)
	}
	if probe.LinkKind != "lexicon" {
		return LexiconKernel{}, fmt.Errorf("lexicon: body link_kind %q is not lexicon", probe.LinkKind)
	}
	syms := make(map[Layer]string, len(probe.Symbols))
	for _, p := range probe.Symbols {
		syms[p.Layer] = p.Symbol
	}
	return LexiconKernel{Concept: probe.Concept, Symbols: syms}, nil
}

// Record builds the content-addressed kernel.link Record for a Lexicon Kernel (the materialized,
// replayable lexicon). It REUSES records.NewRecord — the same content-address path as every other
// kernel record, so id == version == Hash(Canonicalize(body)). Writes nothing (the wall): the
// caller hands this Record to the aidos CLI writer role via a ChangeSet, never the agent.
func Record(k LexiconKernel) (records.Record, error) {
	body, err := SerializeBody(k)
	if err != nil {
		return records.Record{}, err
	}
	return records.NewRecord(records.KindLink, body)
}
