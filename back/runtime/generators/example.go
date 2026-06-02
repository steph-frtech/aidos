package generators

import "github.com/steph-frtech/aidos/back/kernel/operation"

// ExampleCreateOrderOp is the S36 canonical operation example — the spec's createOrder
// in its API-projection form: it VALIDATES the CreateOrderInput, AUTHORIZES via
// canPlaceOrder, MUTATES create Order from its own input, and RETURNS the created order.
// It is faithful to the S36 fixture (`input: Order{...}, mutate create Order, emits
// [OrderPlaced]`) and reuses the S10 operation.Operation type verbatim — it is the
// operation the createOrder API handler exposes over POST /orders. The agent coins no
// step/event the fixture does not pin; it READS this operation from the kernel (the
// authoritative row is written by the aidos CLI), reconstructed here for the mirror /
// the Workbench projection (the wall, §2).
//
// DISTINCT FROM S10's operation.CreateOrder(): that anchor READS a Cart by $.input.cartId
// (a cart-checkout flow); THIS API form mutates Order directly from the request body, so
// the request shape == the Order entity shape (the S36 honesty: request/response field
// set == operation I/O × entity attribute set, no add/drop/rename).
func ExampleCreateOrderOp() operation.Operation {
	return operation.Operation{
		Name:  "createOrder",
		Input: "CreateOrderInput",
		Steps: []operation.Step{
			operation.ValidateStep{Schema: "CreateOrderInput"},
			operation.AuthorizeStep{Policy: "canPlaceOrder"},
			operation.MutateStep{
				Entity: "Order",
				Op:     operation.MutateCreate,
				Data:   map[string]any{"customer": "$.input.customer", "total": "$.input.total"},
				As:     "$.order",
			},
			operation.ReturnStep{Ref: "$.order"},
		},
		Emits: []string{"OrderPlaced"},
	}
}

// ExampleOrder is the S34 fixture entity (reused from the prior pinned artifacts —
// Order: id / total / discount). It is the worked example the fixture mirror and the
// Workbench /emitters panel project. The emitter coins no field beyond these.
func ExampleOrder() EntitySource {
	return EntitySource{
		ID:   "entity-order",
		Kind: KindEntity,
		Name: "Order",
		Fields: []Field{
			{Name: "id", Type: "text"},
			{Name: "total", Type: "numeric"},
			{Name: "discount", Type: "numeric"},
		},
	}
}

// ExampleOrderChanged is ExampleOrder with `discount` removed — the "changed source"
// (Fixture C): a different body ⇒ a different source_hash, the prior artifact now
// stale (no silent drift; version = hash, S02).
func ExampleOrderChanged() EntitySource {
	return EntitySource{
		ID:   "entity-order",
		Kind: KindEntity,
		Name: "Order",
		Fields: []Field{
			{Name: "id", Type: "text"},
			{Name: "total", Type: "numeric"},
		},
	}
}

// ExampleThin is the minimal honest entity (only id) — Fixture E: the emitter emits
// ONLY the pinned field, no invented column/field.
func ExampleThin() EntitySource {
	return EntitySource{
		ID:     "entity-thin",
		Kind:   KindEntity,
		Name:   "Thin",
		Fields: []Field{{Name: "id", Type: "text"}},
	}
}

// ExampleBroken is the malformed AST (no fields) — Fixture F: Emit/Project yields a
// BlockReason, never a panic, never an invented field.
func ExampleBroken() EntitySource {
	return EntitySource{ID: "entity-broken", Kind: KindEntity, Name: "Broken"}
}

// ExampleSet returns the well-formed example entities the /emitters panel projects,
// in a stable order. Broken is excluded — it is the negative fixture.
func ExampleSet() []EntitySource {
	return []EntitySource{ExampleOrder(), ExampleThin()}
}
