package checkout

import (
	"encoding/json"

	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// jsonMarshal is the single marshal seam (kept so the canonicalizer reuse stays one
// call). It is json.Marshal verbatim — no custom encoder, no map-order leak (the
// canonicalizer downstream sorts keys).
func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

// RunSlice drives the WHOLE KRD loop for the checkout slice, in order, by CALLING the
// prior teeth — it implements nothing new. It returns the recorded Trace (the ordered
// events + every stage artifact) or the first BlockReason that stops the loop (never a
// panic, never a partial silent success). PURE given the injected OrderStore seam and
// the two stamps in Input: re-running from the same clean phase yields the SAME events
// and the SAME content-addressed ASTs (the reproducibility property pins it).
//
// THE WALL (§2). RunSlice does not side-write truth: the kernel write is PROPOSED as a
// DRAFT ChangeSet (changeset.Open) and admitted only by changeset.Apply through the
// completeness gate (the door). The order persistence is the injected seam, below the
// waterline. The agent has no GRANT; any other kernel write is refused by S04.
func RunSlice(in Input) (Trace, *blockreason.BlockReason) {
	var tr Trace

	// (1) INTAKE — the seed Idea enters the ideas schema as a candidate-truth (S27).
	// No freeze, no kernel write: an idea carries no version and no mirror by
	// construction.
	idea, err := SeedIdea()
	if err != nil {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return Trace{}, &br
	}
	tr.Idea = idea
	tr.Events = append(tr.Events, EventIdeaIntaken)

	// Reconstruct the content-addressed ASTs the slice will promote (read-only over
	// the prior anchors — the wall). Needed up-front so the goal's spec_delta and the
	// red-set target are the createOrder op's real id, never an invented ref.
	asts, abr := kernelASTs()
	if abr != nil {
		return Trace{}, abr
	}
	tr.ASTs = asts

	// (2) GOAL — a /goal opens from the idea and WRITES THE RED SET for createOrder
	// (the red IS the goal, S29). The spec_delta proposes the createOrder operation;
	// the mirror_delta proves it (an idea with no mirror is a vœu — rejected). The red
	// set is derived by REUSING S22's Impact over the bumped createOrder source. No
	// kernel truth is written here — OpenGoal opens a DRAFT ChangeSet, never applies it.
	g, gbr := openCheckoutGoal(in.ParentPhase, idea, asts)
	if gbr != nil {
		return Trace{}, gbr
	}
	tr.Goal = g
	tr.Events = append(tr.Events, EventGoalOpened)

	// (3) APPROVED CHANGESET — the candidate ASTs enter the kernel ONLY through the
	// door: changeset.Apply admits the DRAFT envelope to APPLIED iff the completeness
	// gate holds (the spec_delta carries its mirror_delta — no monster, S20/§98). This
	// is the human-approval cadence stand-in: the slice never side-writes truth.
	applied, abr2 := changeset.Apply(g.ChangeSet, unixNanos(in.AppliedAtNs), changeset.SpecHasMirror)
	if abr2 != nil {
		// A refused changeset is an honest stop, not a panic.
		br := blockreason.For(blockreason.CodeNoRedSet)
		return Trace{}, &br
	}
	tr.ChangeSet = applied
	tr.Events = append(tr.Events, EventChangeSetApplied)

	// (4) MIRROR LIVE — the mirror reflecting createOrder is alive (no monster, S06).
	// The completeness gate the changeset already passed is what guarantees this: a
	// spec_delta admitted to APPLIED carries its living mirror_delta. The event records
	// the invariant the gate enforced.
	if applied.MirrorDelta == nil {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return Trace{}, &br
	}
	tr.Events = append(tr.Events, EventMirrorLive)

	// (5) EMIT — the projections emit deterministically (S34/S36/S37/S38). The Order
	// entity projects to Go struct / Postgres DDL / TS type; the byte-identical
	// reproducibility is the emitter's own property (the slice asserts the artifacts
	// are present and stable, it re-implements no emitter).
	arts, ebr := emitProjections()
	if ebr != nil {
		return Trace{}, ebr
	}
	tr.Artifacts = arts
	tr.Events = append(tr.Events, EventArtifactsEmitted)

	// (6) ORDER PLACED — createOrder runs over the cart and creates the Order (S10 via
	// the injected seam). The placed order's line items MATCH the cart (no phantom, no
	// dropped item); a malformed/empty cart is a BlockReason, never an invented order.
	order, obr := in.Store.CreateOrder(in.Cart)
	if obr != nil {
		return Trace{}, obr
	}
	tr.Order = order
	tr.Events = append(tr.Events, EventOrderPlaced)

	// (7) PHASE SEALED — the slice seals a new STABLE phase on the dag (S23). The phase
	// id is the content address of the cut (deterministic); the chainable next step
	// consumes it. The cut pins the createOrder op id the slice promoted.
	sealed, sbr := sealPhase(asts)
	if sbr != nil {
		return Trace{}, sbr
	}
	tr.SealedPhase = sealed
	tr.Events = append(tr.Events, EventPhaseSealed)

	return tr, nil
}

// openCheckoutGoal opens the /goal for the checkout slice (S29). The spec_delta
// proposes the createOrder operation (target = the op id); the mirror_delta proves it
// (a non-nil delta — an idea with no mirror is rejected). The red set is derived by
// REUSING S22's Impact: the createOrder op is the bumped source, a single load-bearing
// edge to its mirror makes that mirror red — the red set is exactly that failing
// mirror. The goal pins the idea, the DRAFT changeset and the red set; it writes no
// truth.
func openCheckoutGoal(parentPhase string, idea ideas.Idea, asts KernelASTs) (goal.Goal, *blockreason.BlockReason) {
	specBody, _ := jsonMarshal(map[string]any{
		"operation": "createOrder",
		"op_id":     asts.OperationID,
	})
	mirrorBody, _ := jsonMarshal(map[string]any{
		"reflects":  "examples.checkout.full-loop",
		"test_kind": "gherkin",
	})
	spec := changeset.Delta{Kind: "add", Target: "createOrder", Body: specBody}
	mirror := changeset.Delta{Kind: "add", Target: "examples.checkout.full-loop", Body: mirrorBody}

	// The S22 red-wave input: createOrder is the bumped source; one load-bearing edge
	// from its mirror to it; heads pin the current (stale) version so the mirror reddens.
	bumped := []string{"createOrder"}
	edges := []goal.Edge{checkoutEdge(asts.OperationID)}
	heads := map[string]string{"createOrder": asts.OperationID}

	in := goal.OpenInput{
		Idea: goal.Idea{
			ID:          idea.ID,
			SpecDelta:   spec,
			MirrorDelta: &mirror,
		},
		ParentPhase: parentPhase,
		Bumped:      bumped,
		Edges:       edges,
		Heads:       heads,
		Budgets:     goal.Budgets{},
	}
	return goal.OpenGoal(in)
}

// emitProjections runs the Order entity through the S34 emitter set (Go struct,
// Postgres DDL, TS type) — the Src projections of the slice. It reuses
// generators.Project verbatim and asserts nothing here beyond a non-error emit; the
// byte-identical reproducibility is the emitter's own property mirror.
func emitProjections() ([]generators.Artifact, *blockreason.BlockReason) {
	src := generators.ExampleOrder()
	arts, br := generators.Project([]generators.EntitySource{src}, generators.Targets())
	if br != nil {
		return nil, br
	}
	return arts, nil
}
