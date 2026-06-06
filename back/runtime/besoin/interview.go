package besoin

// interview.go — EL13: the backing pur-Go of the umbrella skill `/compound-besoin` — the
// level-by-level FORCED interview. The LLM is the barricaded exception (CLAUDE.md §8): it LEADS the
// elicitation dialogue at ONE level at a time (it phrases the question + paraphrases the utterance),
// but EVERY judgment is DETERMINISTIC and code-authoritative — the LLM defers to the code, never the
// reverse:
//
//   - which level is ENTERABLE is COMPUTED (EnterableLevel, reusing CanDescend), never guessed;
//   - the prior anchors the level reads are COMPUTED (AnchorsAbove, EL08), never re-judged;
//   - the OpenBranches to close are COMPUTED (BranchTree, EL12), never invented;
//   - the gesture to dispatch to (grill/view/action/generic) is a DECLARED, closed table (DispatchOf);
//   - RECORDING an answer is a deterministic Close (RecordAnswer): a parse of Gherkin, a bool-typing of
//     an Expr, a resolve of a ref — and an OFF-ALTITUDE answer is REJECTED BY SCHEMA (EL12 IsOffAltitude),
//     never by an LLM opinion of altitude;
//   - the verdict `resolved`/`enough` is COMPUTED (CanDescend, EL07), NEVER declared by the LLM;
//   - a FUZZY answer (an unverifiable/non-falsifiable utterance) is ROUTED to /spike — via the legal
//     gate idea_capture(draft) → idea_grill → idea_spike (never a direct capture in "spiking"); the
//     interview does NOT descend on a fuzzy answer.
//
// THE WALL (CLAUDE.md §2 + ROADMAP EL13). This file reads only the BesoinGraph + the declared
// thresholds + the three metadata kernel packages (truthtyping/scope/authority, via CertifyMetadata).
// It writes NO truth and NO mirror. The ONLY persistence path of the need is the EL15 MCP
// `besoin-intake` (besoin_capture_*): RecordAnswer returns the next BesoinGraph to be APPENDED there;
// it never touches the kernel/mirrors/fitness. The reproducibility mirror
// (interview_property_test.go) pins same-input → same-output; the acceptance mirror
// (interview_bdd_test.go, tests/runtime/compound-besoin.feature) drives the three done-criteria.

import (
	"encoding/json"
	"fmt"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Gesture is the closed set of existing gestures the umbrella skill DISPATCHES to per level. The set
// is DECLARED (CLAUDE.md §8), never inferred by the LLM: a rung is dialogued through exactly one
// composed gesture. `grill` triages the product intention; `view` elicits the view rung; `action`
// elicits the control+action rungs; `generic` is the level-by-level branch dialogue for the rest
// (journey/operation/entity + the bands).
type Gesture string

const (
	// GestureGrill — the /grill triage of the `product` intention (sharp / fuzzy / bad).
	GestureGrill Gesture = "grill"
	// GestureView — the /view gesture, the `view` rung (goal + zones + data).
	GestureView Gesture = "view"
	// GestureAction — the /action gesture, the `control` + `action` rungs (button + its action-spec).
	GestureAction Gesture = "action"
	// GestureGeneric — the per-level OpenBranch dialogue for the remaining rungs/bands.
	GestureGeneric Gesture = "generic"
)

// dispatchTable is the CLOSED, declared map of every grammar Level to the gesture the umbrella skill
// dispatches its dialogue to. Declared once here (CLAUDE.md §8), never an LLM choice. Its domain is
// exactly the grammar (proven by the property mirror).
var dispatchTable = map[Level]Gesture{
	LevelProduct:   GestureGrill,
	LevelJourney:   GestureGeneric,
	LevelView:      GestureView,
	LevelControl:   GestureAction,
	LevelAction:    GestureAction,
	LevelOperation: GestureGeneric,
	LevelEntity:    GestureGeneric,
	LevelInvariant: GestureGeneric,
	LevelPolicy:    GestureGeneric,
}

// DispatchOf returns the gesture the umbrella skill dispatches a level's dialogue to. For an
// out-of-grammar level it returns GestureGeneric and ok=false (fail-closed; never an LLM guess of a
// gesture). Pure, total, deterministic.
func DispatchOf(level Level) (Gesture, bool) {
	g, ok := dispatchTable[level]
	if !ok {
		return GestureGeneric, false
	}
	return g, true
}

// --- EnterableLevel ---------------------------------------------------------------------------------

// EnterableLevel computes the SOURCE rung the interview may currently work — the first rung (in the
// §23 descent order) that is not yet `enough` under its declared metadata. A rung is enterable iff
// EVERY rung ABOVE it is already `enough` (CanDescend.enough) — the forcing: you do not open a level
// until its parent is right-sized. COMPUTED (it reuses CanDescend, EL07), never guessed by the LLM.
//
// ok=false when no SOURCE rung remains to work (every SOURCE rung is enough — the descent is complete
// to the entity leaf). The transversal bands (invariant/policy) are NOT part of the vertical descent;
// they are dialogued laterally by /besoin-invariant (EL14), so EnterableLevel ranges only over the
// SOURCE rungs. metaOf supplies each level's four metadata (the interview holds them per node).
func EnterableLevel(graph BesoinGraph, metaOf func(Level) Metadata) (Level, bool) {
	if metaOf == nil {
		metaOf = func(Level) Metadata { return Metadata{} }
	}
	for _, l := range Levels() { // Levels() = the SOURCE rungs in descent order (product…entity).
		if !CanDescend(graph, l, metaOf(l)).Enough {
			return l, true // the first not-yet-enough SOURCE rung is the one to work.
		}
	}
	return "", false // every SOURCE rung is enough — the descent is complete.
}

// --- the interview turn -----------------------------------------------------------------------------

// AnswerRouting is the closed set of routings the deterministic recorder may decide for a turn. It is
// COMPUTED from the schema + the metadata verdict, NEVER declared by the LLM.
type AnswerRouting string

const (
	// RouteRecord — the answer matched the level's schema and was recorded (the body appended).
	RouteRecord AnswerRouting = "record"
	// RouteOffAltitude — the answer FAILS the claimed level's besoin_level_schema (EL12 schema
	// mismatch): an attribute body submitted at `product` is rejected here, not descended.
	RouteOffAltitude AnswerRouting = "off_altitude"
	// RouteSpike — the answer is FUZZY (unverifiable): it is routed to /spike via idea_capture(draft) →
	// idea_grill → idea_spike (never a direct capture in "spiking"). The interview does NOT descend.
	RouteSpike AnswerRouting = "spike"
)

// SpikeGate names the three-hop legal /spike route an interview emits as guidance (it does NOT call
// the MCP — EL15 does). The interview NEVER captures directly in "spiking" (idea_spike is an advance,
// not a capture — verified in idea-intake). Declared, never invented.
var SpikeGate = []string{"idea_capture", "idea_grill", "idea_spike"}

// InterviewResult is the PURE output of one interview turn (RecordAnswer). It carries the NEXT
// BesoinGraph (to be APPENDED via the EL15 MCP — the only persistence door), the routing decision, the
// recomputed CanDescend verdict (the `enough`/`resolved` truth — COMPUTED, never declared by the LLM),
// and the remaining open branches. On an off-altitude or fuzzy answer the Graph is UNCHANGED (no
// descent) and a BlockReason names the door.
type InterviewResult struct {
	// Graph is the BesoinGraph after the turn — the SAME graph (no mutation) on a rejected/fuzzy turn,
	// or a graph with the level's body appended/updated on a recorded turn. To be persisted via EL15.
	Graph BesoinGraph `json:"graph"`
	// Level the turn was about.
	Level Level `json:"level"`
	// Routing is the COMPUTED routing (record / off_altitude / spike). Never declared by the LLM.
	Routing AnswerRouting `json:"routing"`
	// Verdict is the recomputed EL07 CanDescend verdict AFTER the turn (the `enough` truth). On an
	// off-altitude/fuzzy turn it is the verdict over the UNCHANGED graph (still not enough).
	Verdict Verdict `json:"verdict"`
	// Resolved mirrors Verdict.Enough — the level is resolved iff CanDescend says enough. COMPUTED.
	Resolved bool `json:"resolved"`
	// OpenBranches are the still-open EL12 branches AFTER the turn (empty when Resolved). Deterministic.
	OpenBranches []OpenBranch `json:"open_branches,omitempty"`
	// SpikeRoute is the legal /spike three-hop route, set ONLY when Routing == spike (advisory; the
	// interview writes nothing — EL15 walks it). Empty otherwise.
	SpikeRoute []string `json:"spike_route,omitempty"`
	// BlockReason names the door when the turn was rejected (off_altitude/spike). nil on a recorded turn.
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// RecordAnswer is the deterministic recorder of one interview turn at `level`. The LLM has phrased the
// question and paraphrased the utterance into `body` (the rung-shaped fields) + `utterance` (the
// verbatim human text); RecordAnswer DECIDES the routing by CODE:
//
//  1. OFF-ALTITUDE (EL12): if `body` does NOT satisfy `level`'s besoin_level_schema (a declared
//     field-set mismatch), the turn is REJECTED (RouteOffAltitude) — the graph is unchanged. An entity
//     `attributes` body submitted at `product` fails here, by SCHEMA, never by an LLM opinion.
//  2. FUZZY → /spike: if the level's metadata routes the node to /spike (CertifyMetadata.RouteToSpike —
//     an unverifiable verifiability), the turn is ROUTED to /spike (RouteSpike) via the legal three-hop
//     gate; the interview does NOT descend.
//  3. RECORD: otherwise the body is appended/updated on the level's node (status drafting), and the
//     EL07 verdict is RECOMPUTED — the `resolved`/`enough` truth is COMPUTED here, NEVER declared.
//
// PURE, TOTAL, DETERMINISTIC: same (graph, level, body, utterance, meta) → same InterviewResult. It
// writes no truth; the returned Graph is to be persisted via the EL15 MCP. The LLM never enters.
func RecordAnswer(graph BesoinGraph, level Level, body map[string]any, utterance string, meta Metadata) InterviewResult {
	res := InterviewResult{Graph: graph, Level: level}

	if !IsLevel(level) {
		br := blockreason.BlockReason{
			Code:        blockreason.Code(CodeNodeAbsent),
			Severity:    blockreason.SeverityBlocking,
			Explanation: fmt.Sprintf("Le niveau %q n'est pas un rung de la grammaire (EL02) : rien à enregistrer.", level),
			HowToFix:    []string{"use_a_grammar_level"},
		}
		res.Routing = RouteOffAltitude
		res.BlockReason = &br
		res.Verdict = CanDescend(graph, level, meta)
		res.OpenBranches = res.Verdict.toOpenBranches(graph, level)
		return res
	}
	if body == nil {
		body = map[string]any{}
	}

	// 1. OFF-ALTITUDE (EL12 schema-mismatch). A body that does not satisfy THIS level's declared
	//    field-set is rejected here — never descended, never an LLM opinion of altitude.
	if IsOffAltitude(level, body) {
		alt := ClassifyAltitude(body)
		expl := fmt.Sprintf("La réponse ne satisfait pas le schéma du niveau %q (mismatch de champs déclaré, EL12) : elle n'est PAS enregistrée à ce niveau.", level)
		fix := []string{"answer_at_the_current_altitude"}
		if alt.Matched {
			expl += fmt.Sprintf(" Elle ressemble au schéma du niveau %q.", alt.Best)
			fix = append(fix, "or_open_level:"+string(alt.Best))
		}
		br := blockreason.BlockReason{
			Code:        blockreason.Code(CodeBodyVacantOrMalformed),
			Severity:    blockreason.SeverityBlocking,
			Explanation: expl,
			HowToFix:    fix,
		}
		res.Routing = RouteOffAltitude
		res.BlockReason = &br
		res.Verdict = CanDescend(graph, level, meta)
		res.OpenBranches = res.Verdict.toOpenBranches(graph, level)
		return res
	}

	// 2. FUZZY → /spike. An unverifiable node is routed to /spike via the legal three-hop gate; the
	//    interview does NOT descend (the verdict is over the unchanged graph). The metadata verdict
	//    REUSES CertifyMetadata (EL04) — the SAME truthtyping classifier the kernel uses, no fork.
	probe := LevelNode{Level: level, Body: rawOf(body), Status: NodeDrafting, Provenance: Provenance{Source: "human", Detail: utterance}}
	if CertifyMetadata(probe, meta).RouteToSpike {
		br := blockreason.BlockReason{
			Code:        blockreason.Code(CodeMetadataIncomplete),
			Severity:    blockreason.SeverityBlocking,
			Explanation: "La réponse est floue (verifiability unverifiable) : elle est routée vers /spike via idea_capture(draft) → idea_grill → idea_spike, JAMAIS une descente. Le besoin ne descend pas tant qu'il n'est pas falsifiable.",
			HowToFix:    append([]string{"route_to_spike"}, SpikeGate...),
		}
		res.Routing = RouteSpike
		res.SpikeRoute = append([]string(nil), SpikeGate...)
		res.BlockReason = &br
		res.Verdict = CanDescend(graph, level, meta)
		res.OpenBranches = res.Verdict.toOpenBranches(graph, level)
		return res
	}

	// 3. RECORD. Append/update the level's node body (status drafting). A pre-existing node for the
	//    level is REPLACED with the merged body (the in-memory interview accumulates the answer); the
	//    Postgres append-only history is owned by EL15 (each capture is a row). The graph_hash recomputes
	//    deterministically. The provenance carries the VERBATIM utterance (never paraphrased).
	next := upsertNode(graph, LevelNode{
		Level:      level,
		Body:       rawOf(body),
		Refs:       outgoingRefsFor(level),
		Provenance: Provenance{Source: "human", Detail: utterance},
		Status:     NodeDrafting,
	})

	res.Graph = next
	res.Routing = RouteRecord
	res.Verdict = CanDescend(next, level, meta)
	res.Resolved = res.Verdict.Enough // COMPUTED — the LLM never declares resolved.
	res.OpenBranches = res.Verdict.toOpenBranches(next, level)
	return res
}

// outgoingRefsFor builds the resolved outgoing reference of a level from its grammar spec (EL02) — the
// constrains edge toward the deeper rung. nil for a leaf / a band (no outgoing SOURCE ref). Pure.
func outgoingRefsFor(level Level) []Ref {
	to, field, ok := OutgoingRef(level)
	if !ok {
		return nil
	}
	return []Ref{{Field: field, To: to}}
}

// upsertNode returns a copy of graph with the node for n.Level set to n — replacing any existing node
// for that level (the in-memory interview accumulates an answer across turns; the Postgres append-only
// row history lives in EL15). The graph_hash recomputes from the canonical node set. Pure, total.
func upsertNode(graph BesoinGraph, n LevelNode) BesoinGraph {
	out := NewGraph(graph.Project)
	out.Edges = append([]Edge(nil), graph.Edges...)
	replaced := false
	for _, existing := range graph.Nodes {
		if existing.Level == n.Level {
			out.Nodes = append(out.Nodes, n)
			replaced = true
			continue
		}
		out.Nodes = append(out.Nodes, existing)
	}
	if !replaced {
		out.Nodes = append(out.Nodes, n)
	}
	return out
}

// toOpenBranches recomputes the EL12 open branches for a level over a graph — the still-open
// Example-Map cells the interview surfaces after a turn. Pure helper on the Verdict (it reads the
// graph, not the verdict's fields, so the branches are the EL12 truth, not a paraphrase). Total.
func (Verdict) toOpenBranches(graph BesoinGraph, level Level) []OpenBranch {
	node, ok := graph.Node(level)
	if !ok {
		return openOnly(BranchTree(level, map[string]any{}))
	}
	body, err := decodeBody(node.Body)
	if err != nil {
		body = map[string]any{}
	}
	return openOnly(BranchTree(level, body))
}

// --- the interview prompt (LLM-facing) --------------------------------------------------------------

// InterviewPrompt is the PURE, DETERMINISTIC briefing the umbrella skill hands the LLM for ONE turn:
// the enterable level, the gesture to dispatch to, the prior anchors to read (read-only grounding),
// and the open branches to close. The LLM PHRASES the question from this; it does not choose the
// level, the gesture, the anchors or the branches — those are all code. A nil/absent enterable level
// yields Done=true (the descent is complete).
type InterviewPrompt struct {
	// Level is the enterable SOURCE rung (EnterableLevel). Empty when Done.
	Level Level `json:"level,omitempty"`
	// Gesture is the dispatched gesture (DispatchOf). Empty when Done.
	Gesture Gesture `json:"gesture,omitempty"`
	// Anchors are the frozen resolved rungs ABOVE the level — the read-only grounding (EL08
	// AnchorsAbove). The LLM reads them; it cannot contradict them.
	Anchors []Anchor `json:"anchors,omitempty"`
	// OpenBranches are the EL12 branches to close at this level (the questions to ask). Deterministic.
	OpenBranches []OpenBranch `json:"open_branches,omitempty"`
	// Done is true when no SOURCE rung remains enterable (the descent reached the entity leaf).
	Done bool `json:"done"`
}

// NextPrompt builds the deterministic interview briefing for the current state of `graph`. It computes
// the enterable level (EnterableLevel), the dispatched gesture (DispatchOf), the prior anchors
// (AnchorsAbove, EL08) and the open branches (BranchTree, EL12). PURE, TOTAL, DETERMINISTIC: same graph
// → same prompt. The LLM only PHRASES from this; every field is code-authoritative.
func NextPrompt(graph BesoinGraph, metaOf func(Level) Metadata) InterviewPrompt {
	level, ok := EnterableLevel(graph, metaOf)
	if !ok {
		return InterviewPrompt{Done: true}
	}
	gesture, _ := DispatchOf(level)
	var body map[string]any
	if node, has := graph.Node(level); has {
		if b, err := decodeBody(node.Body); err == nil {
			body = b
		}
	}
	return InterviewPrompt{
		Level:        level,
		Gesture:      gesture,
		Anchors:      AnchorsAbove(graph, level),
		OpenBranches: BranchTree(level, body),
		Done:         false,
	}
}

// canonicalJSON marshals a value to canonical JSON for the property mirror's determinism assertion
// (the interview result must serialize identically for identical inputs). Errors yield nil. Pure.
func canonicalJSON(v any) []byte {
	b, err := json.Marshal(v)
	if err != nil {
		return nil
	}
	return b
}
