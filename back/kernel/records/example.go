package records

import "encoding/json"

// EmptyExampleBody returns the canonical "empty example" JSON body for a kind:
// the record's declared fields present but unfilled (empty strings, empty lists,
// null pointers). The field sets mirror the Tome record shapes — Layer (KRD §21),
// Mirror (§34), Idea (§118), the six link types (§41), ChangeSet (§98), Phase
// stable (§43) — and are NOT invented beyond them. An empty example is the
// minimal valid skeleton each later step fills in; `aidos check` validates that
// the set round-trips as content-addressed JSONB.
//
// Each body carries its own "kind" discriminator so Validate can confirm the
// row's kind matches its body.
func EmptyExampleBody(k Kind) json.RawMessage {
	var m map[string]any
	switch k {
	case KindIdea:
		// KRD §118: a candidate-truth — no freeze, no mirror yet.
		m = map[string]any{
			"kind":       string(KindIdea),
			"proposes":   "", // the layer/kind targeted
			"intent":     "", // the behaviour in prose (not yet falsifiable)
			"provenance": "", // human:"…" | incident:#id
			"status":     "draft",
		}
	case KindTruth:
		// A frozen Kernel truth with its epistemic typing (KRD §13.4–§13.8).
		m = map[string]any{
			"kind":          string(KindTruth),
			"statement":     "", // the falsifiable claim
			"truth_kind":    "", // what kind of claim
			"scope":         "", // where/when/for-whom it holds
			"verifiability": "", // how strongly provable
			"authority":     "", // explicit authority owner
		}
	case KindMirror:
		// KRD §34: the executable proof of a truth.
		m = map[string]any{
			"kind":          string(KindMirror),
			"reflects":      "",  // → the spec layer reflected (mirrors @version)
			"test_kind":     "",  // acceptance|property|fixture|…
			"cert_language": "",  // gherkin|rapid|fast-check|…
			"formal_cap":    nil, // optional z3|tla+|…
			"authority":     "",  // above (test-as-goal) | below (test-as-means)
			"liveness":      "",  // live | dead(orphan)
		}
	case KindLayer:
		// KRD §21: the single meta-type from which every truth is built.
		m = map[string]any{
			"kind":           string(KindLayer),
			"truth_artifact": "",      // schema|∀-predicate|fixture|threshold|…
			"owner":          "",      // human|ai|derived
			"authority":      "",      // above-waterline | below-waterline
			"role":           "",      // SOURCE | PROJECTION
			"sensor":         "",      // computational|inferential|meter
			"zone":           "",      // spike|kernel|src
			"links":          []any{}, // [projects_to|derives_from|…] @version
			"rigor":          "",      // T0|T1|T2
			"generator":      nil,     // (projection only) deterministic emitter
		}
	case KindLink:
		// KRD §41: the six link types — everything points at a version, not an identity.
		m = map[string]any{
			"kind":      string(KindLink),
			"link_kind": "", // vertical|horizontal|genealogical|provenance|triggers|binds|mirrors
			"from":      "", // source layer/version
			"to":        "", // target @version (pinned)
		}
	case KindChangeSet:
		// KRD §98/§44: the atomic reversible envelope of a transition.
		m = map[string]any{
			"kind":    string(KindChangeSet),
			"message": "",      // why this change
			"status":  "DRAFT", // DRAFT|APPLIED|REVERTED (never FAILED)
			"members": []any{}, // the record versions this changeset mutates
		}
	case KindPhase:
		// KRD §43: a stable phase — a coherent cut where all links resolve and all sensors are green.
		m = map[string]any{
			"kind":      string(KindPhase),
			"selection": []any{}, // the pinned version per constraint (the lockfile)
			"green":     false,   // all sensors green simultaneously?
		}
	default:
		return nil
	}
	b, err := json.Marshal(m)
	if err != nil {
		// The maps above are static and always marshalable; a failure here is a
		// programming error, surfaced as null so Validate rejects it loudly.
		return nil
	}
	return b
}

// EmptyExampleSet returns one content-addressed empty-example Record per KRDCore
// kind, in canonical order. Every returned record passes Validate (id == version
// == content hash). This is the set `aidos check` validates and the Workbench
// /records route projects as seven cards.
func EmptyExampleSet() ([]Record, error) {
	kinds := Kinds()
	out := make([]Record, 0, len(kinds))
	for _, k := range kinds {
		r, err := NewRecord(k, EmptyExampleBody(k))
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, nil
}
