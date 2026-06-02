// Package checkout is the S46 DEMO CHECKOUT SLICE — the canonical end-to-end
// composition acceptance of AIDOS. It drives ONE intention ("a customer places an
// order from their cart") through the FULL KRD loop — Idea → Goal → Kernel → Mirror
// → Src → Stable — by CALLING the prior teeth in order. It authors NO new
// capability, NO new truth table, NO new DSL, NO new emitter, NO new MCP, NO new
// hook: it is a THIN composition (CLAUDE.md §6, the verticale of KRD LIVRE V "de
// l'intention au bouton").
//
// WHAT IT COMPOSES (never re-implements):
//   - S27 ideas.Idea — the seed candidate-truth (intake; no freeze, no kernel write);
//   - S29 goal.OpenGoal — the /goal that writes the red set (the red IS the goal);
//   - S20 changeset.Open/Apply — the ONLY door to the kernel (the agent has no
//     GRANT, §2): the candidate Order entity + createOrder op/control/action enter
//     truth ONLY through an APPROVED ChangeSet, completeness-gated;
//   - S06 mirror records — the createOrder mirror is reflected and LIVE (no monster);
//   - S34/S36/S37/S38 generators — the projections (Go handler, Postgres DDL, Next
//     view) emit deterministically (byte-identical on re-emit);
//   - S10 operation.Interpret — createOrder runs over the cart and creates the Order
//     (the mutate seam persists it; in the back test that seam hits real Postgres);
//   - S23 phases.IsStable — the slice seals a new STABLE phase on the dag.
//
// THE WALL (CLAUDE.md §2). RunSlice writes NO truth itself: it reads the prior
// anchors (entities.Order, operation.CreateOrder, control.CheckoutButton,
// action.CheckoutSubmit — all read-only mirrors of kernel SOURCE rows) and PROPOSES
// the kernel write as an APPROVED ChangeSet (changeset.Apply with the completeness
// gate). A kernel write by any other path is refused by the wall (S04). The order
// persistence is an INJECTED seam (the OrderStore), exactly like the operation
// interpreter's Mutator — the package itself touches no DB.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). RunSlice is PURE given its seam: no clock
// (appliedAt is an argument), no RNG, no map-order leak. Re-running from a clean
// phase yields the SAME content-addressed ASTs (same hashes) and the SAME ordered
// event list — the reproducibility property (slice_property_test.go) pins it.
//
// HONESTY (CLAUDE.md §8). The slice invents NO field, op ref, version, price, tax,
// discount, inventory or payment rule the Idea or the AST does not pin. The Order
// entity carries a `total` attribute (prior S35 truth, read-only); the slice
// persists only the line items the cart pins and NEVER asserts an invented total —
// pricing is a recorded OpenQuestion, not a guessed default.
package checkout

import (
	"github.com/steph-frtech/aidos/back/archive/changeset"
	"github.com/steph-frtech/aidos/back/kernel/action"
	"github.com/steph-frtech/aidos/back/kernel/control"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/generators"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// Event is one stage outcome of the loop, emitted in walk order. The ordered list
// [IdeaIntaken, GoalOpened, ChangeSetApplied, MirrorLive, ArtifactsEmitted,
// OrderPlaced, PhaseSealed] is the N2 `state → command → events` truth form of the
// slice (KRD §93). The order mirrors the loop order — deterministic.
type Event string

const (
	// EventIdeaIntaken — the seed Idea is in the ideas schema (candidate-truth, S27).
	EventIdeaIntaken Event = "IdeaIntaken"
	// EventGoalOpened — a /goal wrote the red set for createOrder (S29).
	EventGoalOpened Event = "GoalOpened"
	// EventChangeSetApplied — the Order + createOrder ASTs entered the kernel via an
	// APPROVED, completeness-gated ChangeSet (S20, the door).
	EventChangeSetApplied Event = "ChangeSetApplied"
	// EventMirrorLive — the mirror reflecting createOrder is alive (no monster, S06).
	EventMirrorLive Event = "MirrorLive"
	// EventArtifactsEmitted — the projections emitted deterministically (S34/36/37/38).
	EventArtifactsEmitted Event = "ArtifactsEmitted"
	// EventOrderPlaced — createOrder ran over the cart and created the Order (S10).
	EventOrderPlaced Event = "OrderPlaced"
	// EventPhaseSealed — the slice sealed a new stable phase on the dag (S23).
	EventPhaseSealed Event = "PhaseSealed"
)

// LineItem is one entry of the cart the customer is about to order. It is the
// COMMAND INPUT to createOrder (the $.cart.items the operation reads), never a
// hand-authored entity. The slice pins exactly what "place an order from a cart"
// needs — a product ref and a quantity — and NOTHING the Idea does not pin (no
// price, no tax: pricing is out of scope, an OpenQuestion).
type LineItem struct {
	Product  string `json:"product"`
	Quantity int    `json:"quantity"`
}

// Cart is the collection of line items the slice's worked example carries (2 items).
type Cart struct {
	ID    string     `json:"id"`
	Items []LineItem `json:"items"`
}

// PlacedOrder is the order createOrder created — its line items MATCH the cart (no
// phantom, no dropped item). The slice asserts the items only; it never asserts an
// invented total (honesty — pricing is out of scope).
type PlacedOrder struct {
	ID    string     `json:"id"`
	Items []LineItem `json:"items"`
}

// OrderStore is the INJECTED persistence seam — the operation interpreter's Mutator
// for the create-Order step. The package never touches a DB; the back test passes a
// real-Postgres-backed store (Testcontainers), a unit test passes an in-memory one.
// CreateOrder must persist EXACTLY the line items it is given (the property mirror
// pins N in ⇒ N out).
type OrderStore interface {
	// CreateOrder persists an order with the given cart line items and returns it.
	// It returns a BlockReason (never a panic, never an invented order) on a
	// malformed cart — e.g. an empty cart, which has no order to place.
	CreateOrder(cart Cart) (PlacedOrder, *blockreason.BlockReason)
}

// Input is the pure input to RunSlice: the seam, the worked cart, and the loop's
// deterministic stamps (the parent phase id and the changeset applied_at). No clock,
// no RNG — both stamps are arguments (determinism-first).
type Input struct {
	Store       OrderStore
	Cart        Cart
	ParentPhase string
	AppliedAtNs int64 // the changeset applied_at as unix-nanos (an argument, never time.Now())
}

// KernelASTs is the content-addressed shape the slice promotes through the door —
// the Order entity + the createOrder op/control/action. The ids are the S02 content
// hashes; re-running from a clean phase yields the SAME ids (reproducibility).
type KernelASTs struct {
	EntityID    string `json:"entity_id"`
	OperationID string `json:"operation_id"`
	ControlID   string `json:"control_id"`
	ActionID    string `json:"action_id"`
}

// Trace is the slice's recorded walk: the ordered events, the seed idea, the opened
// goal, the applied changeset, the content-addressed kernel ASTs, the emitted
// projection artifacts, the placed order and the sealed phase id. It is the oracle
// the fixture mirror asserts against and the value the Workbench panel renders.
type Trace struct {
	Events      []Event               `json:"events"`
	Idea        ideas.Idea            `json:"idea"`
	Goal        goal.Goal             `json:"goal"`
	ChangeSet   changeset.ChangeSet   `json:"changeset"`
	ASTs        KernelASTs            `json:"asts"`
	Artifacts   []generators.Artifact `json:"artifacts"`
	Order       PlacedOrder           `json:"order"`
	SealedPhase string                `json:"sealed_phase"`
}

// SeedIdea is the slice's seed candidate-truth — "a customer places an order from
// their cart", human provenance, proposes an operation. It is a CANDIDATE (no
// freeze, no kernel write); the id is its content hash (S02, via ideas.Hashed). The
// verbatim intent is the ubiquitous language of the slice; the agent paraphrases
// nothing.
func SeedIdea() (ideas.Idea, error) {
	return ideas.Hashed(ideas.Idea{
		Proposes: ideas.ProposesOperation,
		Intent:   "a customer places an order from their cart",
		Provenance: ideas.Provenance{
			Source: ideas.ProvenanceHuman,
			Detail: "a customer places an order from their cart",
		},
		Status: ideas.StatusGrilled,
	})
}

// kernelASTs reconstructs the four content-addressed ids the slice promotes, reusing
// the prior anchors verbatim (entities.Order, operation.CreateOrder,
// control.CheckoutButton, action.CheckoutSubmit) and the S02 content-hash scheme
// (records.Hash ∘ records.Canonicalize) — never a forked hashing path. It invents NO
// ast and NO id; every hash is the content address of a PRIOR anchor read here only
// to reconstruct its id for the mirror / the Workbench projection (the wall, §2).
func kernelASTs() (KernelASTs, *blockreason.BlockReason) {
	fail := func() *blockreason.BlockReason {
		br := blockreason.For(blockreason.CodeNoRedSet)
		return &br
	}

	entID, err := entities.ID(entities.Order())
	if err != nil {
		return KernelASTs{}, fail()
	}
	opBody, err := canonOf(operation.CreateOrder())
	if err != nil {
		return KernelASTs{}, fail()
	}
	ctrlBody, err := control.Canonicalize(control.CheckoutButton())
	if err != nil {
		return KernelASTs{}, fail()
	}
	actBody, err := action.Canonicalize(action.CheckoutSubmit())
	if err != nil {
		return KernelASTs{}, fail()
	}
	return KernelASTs{
		EntityID:    entID,
		OperationID: records.Hash(opBody),
		ControlID:   records.Hash(ctrlBody),
		ActionID:    records.Hash(actBody),
	}, nil
}

// canonOf content-addresses an operation AST through the S02 scheme: marshal →
// records.Canonicalize (sorts object keys, never array order, so step order — which
// is semantic — is preserved). The operation package is an interpreter and exposes
// no canonicalizer, so the slice reuses the single records scheme directly rather
// than forking one (ADR 0007 reuse).
func canonOf(op operation.Operation) ([]byte, error) {
	raw, err := jsonMarshal(op)
	if err != nil {
		return nil, err
	}
	return records.Canonicalize(raw)
}
