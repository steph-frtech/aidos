package functional

// slice.go — the FN01 fixture: the checkout SLICE (S46 / S34) reproduced here as a
// confined value. The probe NEVER imports back/ (the wall + module isolation, §84):
// it copies the pinned Order entity verbatim from back/runtime/generators/example.go
// (ExampleOrder: id/total/discount) so the functional re-emitter can be measured
// against the imperative emitter's known byte-output without coupling.
//
// All values here are immutable data, constructed by pure functions — no package-level
// mutable var holds the slice (the no-global mandate, FN's core invariant).

// Field is one pinned entity attribute (name + canonical type token). A plain value
// type, copied by value through the whole pipeline — never a pointer aliased and
// mutated.
type Field struct {
	Name string
	Type string
}

// Entity is the pinned source the emitter projects. The functional pipeline takes it
// by value and returns new values; it is never mutated in place.
type Entity struct {
	Name   string
	Fields []Field
}

// orderSlice returns the checkout slice's Order entity — a PURE constructor (same
// call → same value, no global read). This is the FN01 input: the exact ExampleOrder
// from S34, so the functional projection can be byte-compared to the imperative one.
func orderSlice() Entity {
	return Entity{
		Name: "Order",
		Fields: []Field{
			{Name: "id", Type: "text"},
			{Name: "total", Type: "numeric"},
			{Name: "discount", Type: "numeric"},
		},
	}
}

// sourceHash is the S34 source content-address the imperative emitter stamps in the
// header for ExampleOrder. The probe pins it as a constant (it is NOT recomputed here:
// hashing is the real emitter's job — the spike only needs the value to prove the
// functional renderer reproduces the SAME header bytes). Recorded, never invented:
// taken from the live emitter dump at FN01 build time.
const sourceHash = "48ca46ab72de24677321cb0a55c75b4239fa1d5b85d588dde66f6aebb1bdf0a2"
