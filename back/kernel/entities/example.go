package entities

// Order is the canonical entity SOURCE example pinned by the S35 spec (and reused
// from S20/S22's `discount` example) — the agent coins no attribute beyond these
// (honesty). The five attributes, IN SOURCE ORDER:
//
//	id        : int         identifier required   → PRIMARY KEY, NOT NULL, Go int64, TS number
//	customer  : string                 required   → NOT NULL, Go string, TS string
//	total     : decimal                required   → NOT NULL, Go pgtype.Numeric, TS string
//	discount  : decimal                            → NULLABLE, Go pgtype.Numeric, TS string OPTIONAL
//	placed_at : timestamptz            required   → NOT NULL, Go pgtype.Timestamptz, TS string
//
// Order is a SOURCE truth above the waterline. This Go value is a fixture-side mirror
// of the kernel.entity body the agent READS (SELECT-only); the agent never writes the
// Order entity into truth — that flows through the aidos CLI writer via a ChangeSet.
func Order() Entity {
	return Entity{
		Name: "Order",
		Attributes: []Attribute{
			{Name: "id", Type: TypeInt, Required: true, Identifier: true},
			{Name: "customer", Type: TypeString, Required: true},
			{Name: "total", Type: TypeDecimal, Required: true},
			{Name: "discount", Type: TypeDecimal, Required: false},
			{Name: "placed_at", Type: TypeTimestamptz, Required: true},
		},
	}
}
