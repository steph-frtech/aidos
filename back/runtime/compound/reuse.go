package compound

// CE05 — the REUSE ROUTER. It CLOSES the capitalisation loop: CE03 CAPTURES a green goal's motif
// (a procedural recall + a behavior-macro candidate), CE04 EXPANDS a captured behavior (pure
// dry-run), and CE05 REUSES that corpus on the NEXT similar goal so its effort/tokens DROP.
//
// THE ROUTER (determinism-first, CLAUDE.md §6/§8). Reuse is an ALGORITHM over a DECLARED corpus,
// NEVER an LLM. Routing is a NAME MATCH: a next-goal unit reuses iff its name equals a captured
// unit's name (procedural recall, below the line) or a captured behavior unit's name (behavior
// expansion, via the wall); otherwise it derives fresh (paid full). This mirrors S33's MatchRole
// (a pure read over declared roles, never a prompt) applied to capitalisation. Same (corpus,
// next) ⇒ same plan; no clock, no rng, no I/O, never panics. The reproducibility mirror
// reuse_property_test.go pins it. WHAT reuses is the corpus, not a judgment — an "LLM deciding
// what to reuse" would be a determinism gap; the rule is code.
//
// THE WALL (CLAUDE.md §2). Reuse READS the corpus and RECALLS below the line; it WRITES NO truth
// (WroteKernel ALWAYS false). A behavior reuse RECALLS the captured macro's shape, but FREEZING
// it into the kernel STILL goes idée → miroir → /goal (CE04's expansion is a dry-run) — every
// behavior route carries ViaWall=true so the door is explicit and testable. A procedural recall
// is /brain fuel below the line (ViaWall=false). There is no path from this router to the kernel.
//
// THE PAYOFF + THE FRONTIER. A SIMILAR goal reuses its shared units ⇒ EffortAfter < EffortBefore
// (the compound payoff CE01 measured: 8 of 9 units replayed). A DISSIMILAR goal shares no unit ⇒
// reuses NOTHING ⇒ EffortAfter == EffortBefore (the anti-false-positive frontier — capitalisation
// reuses the SHARED motif, never fabricates a reuse; CE02's intrinsic_substance is forbidden).

import "errors"

// Origin is WHERE a routed unit's effort comes from. CLOSED: a unit is recalled from procedural
// memory, expanded from a captured behavior-macro, or derived fresh (paid full).
type Origin string

const (
	// OriginReusedProcedural — the unit matched a captured PROCEDURAL recall (a gesture motif,
	// KindProcedural, S31). Replayed below the line; costs ReplayCost, not DeriveCost.
	OriginReusedProcedural Origin = "reused_procedural"
	// OriginReusedBehavior — the unit matched a captured BEHAVIOR-MACRO (§24.6). Its shape is
	// recalled (an expansion, CE04); freezing still goes via /goal (ViaWall). Costs ReplayCost.
	OriginReusedBehavior Origin = "reused_behavior"
	// OriginDerivedFresh — the unit matched NOTHING in the corpus (intrinsic / dissimilar). It is
	// derived from scratch; costs DeriveCost (paid full).
	OriginDerivedFresh Origin = "derived_fresh"
)

// DECLARED token costs (above the line, never learned — CLAUDE.md §8). They mirror the CE01 spike
// twin (lib/compound.ts REPLAY_COST + the per-unit derive estimate): replaying a captured unit is
// far cheaper than deriving it. The reduction is computed against these declared constants.
const (
	// DeriveCost is the token cost to DERIVE one unit from scratch (no capture available).
	DeriveCost = 80
	// ReplayCost is the token cost to REPLAY one captured unit (procedural recall / behavior
	// expansion). Same constant as the spike twin's REPLAY_COST.
	ReplayCost = 20
)

// CapturedUnit is one reusable unit a prior goal capitalised (CE03): its name (the match key) and
// the channel it was captured through (procedural memory / behavior-macro). It is a READ-ONLY
// view of the corpus; the router never writes it.
type CapturedUnit struct {
	// Name is the unit's stable id — the router's match key (a name equality, never a fuzzy LLM
	// similarity; determinism-first).
	Name string `json:"name"`
	// Channel is the CE02 sink the unit was captured through (procedural_memory / behavior_macro).
	Channel Channel `json:"channel"`
}

// Corpus is the capitalisation corpus a prior green goal left behind (CE03/CE04): its procedural
// recalls and its behavior-macro candidates, plus the source goal id for provenance. The router
// reads it to route a NEXT goal's units. Empty = nothing captured yet (every next unit derives).
type Corpus struct {
	// Procedural are the captured KindProcedural recalls (gesture units).
	Procedural []CapturedUnit `json:"procedural"`
	// Behavior are the captured behavior-macro candidates (spec units, §24.6).
	Behavior []CapturedUnit `json:"behavior"`
	// SourceGoal is the goal that captured this corpus — carried into provenance ("who").
	SourceGoal string `json:"source_goal"`
}

// NextGoal is the SUBSEQUENT goal the router routes against the corpus: its id and the ordered
// list of work-units it requires. A unit reuses iff its name matches a captured unit.
type NextGoal struct {
	// GoalID is the next goal's id.
	GoalID string `json:"goal_id"`
	// Required is the ordered list of work-unit names the goal needs (the routing input).
	Required []string `json:"required"`
}

// Route is the router's decision for ONE required unit: where its effort came from, what it cost,
// and whether reaching its sink crosses the wall (true only for behavior reuse — freezing via
// /goal). Ordered to match NextGoal.Required (auditable, deterministic).
type Route struct {
	// Name is the routed unit's name.
	Name string `json:"name"`
	// Origin is reused_procedural / reused_behavior / derived_fresh.
	Origin Origin `json:"origin"`
	// Tokens is the unit's cost under this routing (ReplayCost when reused, DeriveCost when fresh).
	Tokens int `json:"tokens"`
	// ViaWall is true iff freezing this routed unit crosses the wall via /goal — true ONLY for a
	// behavior reuse (its expansion is a dry-run, CE04). A procedural recall is below the line.
	ViaWall bool `json:"via_wall"`
}

// ReusePlan is the router's result for a next goal — the per-unit routing + the computed effort
// delta. It is VALUES only; it WRITES NO truth (WroteKernel ALWAYS false, the wall).
type ReusePlan struct {
	// Goal echoes the routed goal id (provenance).
	Goal string `json:"goal"`
	// SourceGoal echoes the corpus's source goal (the reuse traces back to what captured it).
	SourceGoal string `json:"source_goal"`
	// Routes is the per-unit routing, ordered as NextGoal.Required.
	Routes []Route `json:"routes"`
	// EffortBefore is the cost to DERIVE EVERY unit from scratch (no reuse) — DeriveCost × units.
	EffortBefore int `json:"effort_before"`
	// EffortAfter is the cost WITH reuse — reused units cost ReplayCost, fresh units DeriveCost.
	EffortAfter int `json:"effort_after"`
	// SavedTokens is EffortBefore − EffortAfter (≥ 0; > 0 iff ≥1 unit reused).
	SavedTokens int `json:"saved_tokens"`
	// ReductionFrac is SavedTokens / EffortBefore in [0,1] (0 when nothing reused or no units).
	ReductionFrac float64 `json:"reduction_frac"`
	// ReusedProcedural / ReusedBehavior / DerivedFresh are the routing tallies.
	ReusedProcedural int `json:"reused_procedural"`
	ReusedBehavior   int `json:"reused_behavior"`
	DerivedFresh     int `json:"derived_fresh"`
	// WroteKernel is ALWAYS false — the router reads + recalls, it never writes truth (the wall).
	WroteKernel bool `json:"wrote_kernel"`
}

// ErrEmptyGoal — a next goal with no id and no required units; the router never guesses a plan
// (the honesty rule — no fabricated reuse).
var ErrEmptyGoal = errors.New("compound: next goal has no id and no required units")

// Reuse routes a NEXT goal's required units against the capitalisation Corpus. PURE, TOTAL.
//
//   - Each required unit whose name matches a captured PROCEDURAL unit ⇒ reused_procedural
//     (ReplayCost, below the line).
//   - Each remaining unit whose name matches a captured BEHAVIOR unit ⇒ reused_behavior
//     (ReplayCost, ViaWall — freezing still via /goal).
//   - Every other unit ⇒ derived_fresh (DeriveCost, paid full).
//
// EffortBefore = DeriveCost × |units| (derive everything); EffortAfter sums the routed costs. A
// SIMILAR goal ⇒ EffortAfter < EffortBefore (tokens ▼). A DISSIMILAR goal ⇒ they are equal (no
// false positive). WroteKernel is always false (the wall). Matching is name equality — a router,
// never an LLM (determinism-first).
func Reuse(corpus Corpus, next NextGoal) (ReusePlan, error) {
	if next.GoalID == "" && len(next.Required) == 0 {
		return ReusePlan{}, ErrEmptyGoal
	}

	// DECLARED match sets — name → captured (procedural takes precedence over behavior when a
	// name appears in both, since a procedural recall is the cheaper, below-the-line sink).
	proc := make(map[string]bool, len(corpus.Procedural))
	for _, u := range corpus.Procedural {
		proc[u.Name] = true
	}
	beh := make(map[string]bool, len(corpus.Behavior))
	for _, u := range corpus.Behavior {
		beh[u.Name] = true
	}

	plan := ReusePlan{
		Goal:       next.GoalID,
		SourceGoal: corpus.SourceGoal,
		Routes:     make([]Route, 0, len(next.Required)),
	}
	for _, name := range next.Required {
		switch {
		case proc[name]:
			plan.Routes = append(plan.Routes, Route{
				Name: name, Origin: OriginReusedProcedural, Tokens: ReplayCost, ViaWall: false,
			})
			plan.ReusedProcedural++
			plan.EffortAfter += ReplayCost
		case beh[name]:
			plan.Routes = append(plan.Routes, Route{
				Name: name, Origin: OriginReusedBehavior, Tokens: ReplayCost, ViaWall: true,
			})
			plan.ReusedBehavior++
			plan.EffortAfter += ReplayCost
		default:
			plan.Routes = append(plan.Routes, Route{
				Name: name, Origin: OriginDerivedFresh, Tokens: DeriveCost, ViaWall: false,
			})
			plan.DerivedFresh++
			plan.EffortAfter += DeriveCost
		}
	}

	plan.EffortBefore = DeriveCost * len(next.Required)
	plan.SavedTokens = plan.EffortBefore - plan.EffortAfter
	if plan.EffortBefore > 0 {
		plan.ReductionFrac = float64(plan.SavedTokens) / float64(plan.EffortBefore)
	}
	return plan, nil
}
