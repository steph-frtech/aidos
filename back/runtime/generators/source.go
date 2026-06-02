package generators

import "encoding/json"

// marshalSource serializes an EntitySource to JSON in a way that round-trips the
// pinned name + fields. It is the body the kernel stores and the emitter hashes; the
// emitter never adds a field the source did not pin (honesty). Field order in the
// marshalled bytes is irrelevant — SourceBody canonicalizes it before hashing.
func marshalSource(s EntitySource) ([]byte, error) {
	// We marshal the WHOLE EntitySource (id, kind, name, fields) as the entity body,
	// matching the {id, kind:"entity", body:<…>} shape the fixture pins. Canonicalize
	// then sorts keys so the hash is stable regardless of map/struct field order.
	return json.Marshal(s)
}

// DecodeEntity decodes an entity AST body (the JSON the kernel SELECT returns) into
// the EntitySource the emitter consumes. It invents nothing: a body missing the
// kind/name/fields decodes to the zero value of those, and validateSource (run in
// Emit) turns the gap into a BlockReason, never a guess.
func DecodeEntity(body []byte) (EntitySource, error) {
	var s EntitySource
	if err := json.Unmarshal(body, &s); err != nil {
		return EntitySource{}, err
	}
	return s, nil
}
