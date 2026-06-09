package lexicon

import (
	"testing"

	"pgregory.net/rapid"
)

// FK14 property mirror (the reproducibility mirror, CLAUDE.md §6): the linter is a PURE TOTAL
// function of (the lexicon + the observed symbols) — the exact FK14 done-criterion:
// "vérification = fonction pure du lexique + symboles". Same inputs ⇒ byte-identical drifts.

// genLayer draws a layer: mostly a known one, sometimes an unknown one (to exercise UNKNOWN_LAYER).
func genLayer(t *rapid.T) Layer {
	if rapid.Bool().Draw(t, "unknown_layer") {
		return Layer(rapid.SampledFrom([]string{"bogus", "frob", "xyz"}).Draw(t, "ul"))
	}
	return rapid.SampledFrom(Layers()).Draw(t, "layer")
}

func genSymbol(t *rapid.T) string {
	return rapid.SampledFrom([]string{"a", "b", "c", "return_requests", "orders_returns"}).Draw(t, "sym")
}

func genLexicon(t *rapid.T) LexiconKernel {
	k := LexiconKernel{Concept: "C", Symbols: map[Layer]string{}}
	for _, l := range Layers() {
		if rapid.Bool().Draw(t, "pin_"+string(l)) {
			k.Symbols[l] = rapid.SampledFrom([]string{"return_requests", "createReturnRequest", "x"}).Draw(t, "pinned_"+string(l))
		}
	}
	return k
}

func genObs(t *rapid.T) []Observation {
	n := rapid.IntRange(0, 6).Draw(t, "n_obs")
	obs := make([]Observation, n)
	for i := 0; i < n; i++ {
		obs[i] = Observation{Layer: genLayer(t), Symbol: genSymbol(t)}
	}
	return obs
}

// PROPERTY 1 — DETERMINISM: same (lexicon, observations) ⇒ identical drifts, twice.
func TestProperty_Lint_Deterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genLexicon(t)
		obs := genObs(t)
		a := Lint(k, obs)
		b := Lint(k, obs)
		if len(a) != len(b) {
			t.Fatalf("non-deterministic drift count: %d vs %d", len(a), len(b))
		}
		for i := range a {
			if a[i] != b[i] {
				t.Fatalf("non-deterministic drift at %d: %+v vs %+v", i, a[i], b[i])
			}
		}
	})
}

// PROPERTY 2 — THE LINTER IS A PURE FUNCTION OF THE LEXICON + SYMBOLS (the FK14 done-criterion):
// every reported drift is exactly explained by (the observed symbol, the lexicon's symbol for that
// layer) — never by anything outside the inputs.
func TestProperty_Lint_DriftExplainedByLexiconAndSymbols(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genLexicon(t)
		obs := genObs(t)
		drifts := Lint(k, obs)
		// Build an index of which (layer,symbol) pairs the linter flagged.
		flagged := map[Observation]Drift{}
		for _, d := range drifts {
			flagged[Observation{Layer: d.Layer, Symbol: d.Symbol}] = d
		}
		for _, o := range obs {
			d, isFlagged := flagged[o]
			switch {
			case !IsKnownLayer(o.Layer):
				if !isFlagged || d.Kind != DriftUnknownLayer {
					t.Fatalf("unknown layer %q not flagged UNKNOWN_LAYER: %+v", o.Layer, d)
				}
			default:
				want, pinned := k.Symbols[o.Layer]
				switch {
				case !pinned:
					if !isFlagged || d.Kind != DriftUnknownSymbol {
						t.Fatalf("unpinned layer %q not flagged UNKNOWN_SYMBOL", o.Layer)
					}
				case o.Symbol != want:
					if !isFlagged || d.Kind != DriftRenamed || d.Expected != want {
						t.Fatalf("renamed symbol not flagged RENAMED with expected=%q: %+v", want, d)
					}
				default:
					// In lexicon — must NOT be flagged.
					if isFlagged {
						t.Fatalf("in-lexicon observation %+v wrongly flagged %+v", o, d)
					}
				}
			}
		}
	})
}

// PROPERTY 3 — CLEAN ⇔ NO DRIFT: Clean is exactly the empty-drift verdict.
func TestProperty_Clean_IffNoDrift(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genLexicon(t)
		obs := genObs(t)
		if Clean(k, obs) != (len(Lint(k, obs)) == 0) {
			t.Fatal("Clean must equal (no drift)")
		}
	})
}

// PROPERTY 4 — STABLE ORDER: drifts are sorted by (layer canonical index, then symbol).
func TestProperty_Lint_StableOrder(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genLexicon(t)
		obs := genObs(t)
		d := Lint(k, obs)
		for i := 1; i < len(d); i++ {
			li, lj := layerIndex(d[i-1].Layer), layerIndex(d[i].Layer)
			if li > lj || (li == lj && d[i-1].Symbol > d[i].Symbol) {
				t.Fatalf("drifts out of order at %d: %+v then %+v", i, d[i-1], d[i])
			}
		}
	})
}

// PROPERTY 5 — CONTENT-ADDRESSED ROUND-TRIP: a valid lexicon serialises to a kernel.link body and
// parses back to the same bindings (the storage fork is faithful).
func TestProperty_Record_RoundTrip(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		k := genLexicon(t)
		// ensure at least one binding so the lexicon is non-trivial (Validate also accepts empty Symbols)
		if k.Concept == "" {
			k.Concept = "C"
		}
		rec, err := Record(k)
		if err != nil {
			t.Fatalf("Record: %v", err)
		}
		back, err := ParseBody(rec.Body)
		if err != nil {
			t.Fatalf("ParseBody: %v", err)
		}
		if back.Concept != k.Concept || len(back.Symbols) != len(k.Symbols) {
			t.Fatalf("round-trip lost data: %+v vs %+v", back, k)
		}
		for l, sym := range k.Symbols {
			if back.Symbols[l] != sym {
				t.Fatalf("round-trip drift on %q", l)
			}
		}
	})
}
