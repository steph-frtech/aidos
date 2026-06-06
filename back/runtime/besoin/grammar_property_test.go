package besoin

import (
	"errors"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"pgregory.net/rapid"
)

// grammar_property_test.go — the EL02 mirror (∀ invariant, property form, rapid). Written RED first
// (CLAUDE.md Mandat A): the grammar of BesoinLevel must be a CLOSED, TOTAL order with a hard refusal
// for anything out of grammar, transversal bands that the descent never traverses, and the 3
// out-of-scope kernel layers refused (not aliased). Determinism-first: every grammar function is a
// pure total function — same input → same output (the reproducibility property below).

// Property: the SOURCE order is a TOTAL, CLOSED order — exactly the 7 §23 rungs, no duplicate, and
// identical on every re-list (no clock/rng/map iteration leaking in).
func TestSourceOrderIsTotalAndClosed(t *testing.T) {
	want := []Level{
		LevelProduct, LevelJourney, LevelView, LevelControl, LevelAction, LevelOperation, LevelEntity,
	}
	got := Levels()
	if len(got) != len(want) {
		t.Fatalf("Levels() len = %d, want %d", len(got), len(want))
	}
	seen := map[Level]bool{}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("Levels()[%d] = %q, want %q", i, got[i], want[i])
		}
		if seen[got[i]] {
			t.Fatalf("duplicate level %q in order", got[i])
		}
		seen[got[i]] = true
	}
	// Re-listing yields the identical order (determinism, no iteration leak).
	for n := 0; n < 50; n++ {
		again := Levels()
		for i := range again {
			if again[i] != want[i] {
				t.Fatalf("Levels() not stable across calls: [%d]=%q", i, again[i])
			}
		}
	}
}

// Property: NextLevel walks the SOURCE order exactly, stops at the leaf (entity), and Less agrees.
func TestNextLevelWalksSourceOrder(t *testing.T) {
	order := Levels()
	for i := 0; i < len(order)-1; i++ {
		next, ok := NextLevel(order[i])
		if !ok {
			t.Fatalf("NextLevel(%q) ok=false, want a next rung", order[i])
		}
		if next != order[i+1] {
			t.Fatalf("NextLevel(%q) = %q, want %q", order[i], next, order[i+1])
		}
		if less, ok := Less(order[i], next); !ok || !less {
			t.Fatalf("Less(%q,%q) = (%v,%v), want (true,true)", order[i], next, less, ok)
		}
	}
	// entity is the leaf — no next.
	if _, ok := NextLevel(LevelEntity); ok {
		t.Fatalf("NextLevel(entity) ok=true, want leaf (false)")
	}
	// product is the top — no prev.
	if _, ok := PrevLevel(LevelProduct); ok {
		t.Fatalf("PrevLevel(product) ok=true, want top (false)")
	}
}

// Property: transversal bands are NEVER on the descent path — NextLevel/PrevLevel refuse them, and a
// band is never returned by NextLevel of any SOURCE rung.
func TestTransversalBandsNotTraversed(t *testing.T) {
	bands := TransversalBands()
	if len(bands) != 2 {
		t.Fatalf("TransversalBands() len = %d, want 2 (invariant, policy)", len(bands))
	}
	for _, b := range bands {
		if !IsTransversalBand(b) {
			t.Fatalf("%q not reported as a transversal band", b)
		}
		if IsSourceRung(b) {
			t.Fatalf("band %q reported as a SOURCE rung", b)
		}
		if _, ok := NextLevel(b); ok {
			t.Fatalf("NextLevel(band %q) ok=true, want false (bands not traversed)", b)
		}
		if _, ok := PrevLevel(b); ok {
			t.Fatalf("PrevLevel(band %q) ok=true, want false", b)
		}
	}
	// No SOURCE rung's next is a band.
	rapid.Check(t, func(rt *rapid.T) {
		src := rapid.SampledFrom(Levels()).Draw(rt, "src")
		if next, ok := NextLevel(src); ok && IsTransversalBand(next) {
			rt.Fatalf("NextLevel(%q) returned a band %q", src, next)
		}
	})
}

// Property: an out-of-grammar level is a HARD refusal — IsLevel false, ParseLevel errors. No alias.
func TestOutOfGrammarHardRefusal(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		s := rapid.String().Draw(rt, "s")
		l := Level(s)
		if IsLevel(l) {
			return // a real level by chance — covered elsewhere
		}
		if _, err := ParseLevel(s); err == nil {
			rt.Fatalf("ParseLevel(%q) accepted a non-level (no hard refusal)", s)
		}
	})
}

// Property: the 3 out-of-scope-v1 kernel layers are NAMED, refused with ErrOutOfScopeLevel, and are
// NOT Levels (never an alias of a real rung).
func TestOutOfScopeLayersRefusedNotAliased(t *testing.T) {
	oos := OutOfScopeLevels()
	want := map[Level]bool{"saga": true, "temporal": true, "globalinvariant": true}
	if len(oos) != len(want) {
		t.Fatalf("OutOfScopeLevels() len = %d, want %d", len(oos), len(want))
	}
	for _, l := range oos {
		if !want[l] {
			t.Fatalf("unexpected out-of-scope level %q", l)
		}
		if IsLevel(l) {
			t.Fatalf("out-of-scope %q is a Level (must be refused, not aliased)", l)
		}
		if !IsOutOfScope(l) {
			t.Fatalf("IsOutOfScope(%q) = false", l)
		}
		_, err := ParseLevel(string(l))
		if !errors.Is(err, ErrOutOfScopeLevel) {
			t.Fatalf("ParseLevel(%q) err = %v, want ErrOutOfScopeLevel", l, err)
		}
		if _, ok := NextLevel(l); ok {
			t.Fatalf("NextLevel(out-of-scope %q) ok=true", l)
		}
	}
}

// Property: ParseLevel is the inverse of a known level string, round-trips every valid Level, and is
// deterministic (same input → same output).
func TestParseLevelRoundTripsAllLevels(t *testing.T) {
	for _, l := range AllLevels() {
		got, err := ParseLevel(string(l))
		if err != nil {
			t.Fatalf("ParseLevel(%q) err = %v, want nil", l, err)
		}
		if got != l {
			t.Fatalf("ParseLevel(%q) = %q, want round-trip", l, got)
		}
	}
	// Determinism: repeated parse of the same input is identical.
	rapid.Check(t, func(rt *rapid.T) {
		s := rapid.SampledFrom(AllLevels()).Draw(rt, "lvl")
		a, ea := ParseLevel(string(s))
		b, eb := ParseLevel(string(s))
		if a != b || (ea == nil) != (eb == nil) {
			rt.Fatalf("ParseLevel not deterministic for %q", s)
		}
	})
}

// Property: every SOURCE rung except the leaf carries an outgoing reference toward the rung directly
// below it (control→action, action→operation, operation→entity — the constrains edges), and the leaf
// (entity) + the transversal bands carry none.
func TestOutgoingRefsFollowVerticale(t *testing.T) {
	order := Levels()
	for i := 0; i < len(order); i++ {
		refTo, field, ok := OutgoingRef(order[i])
		if i == len(order)-1 {
			if ok {
				t.Fatalf("entity (leaf) has an outgoing ref %q", refTo)
			}
			continue
		}
		if !ok {
			t.Fatalf("OutgoingRef(%q) ok=false, want a deeper rung", order[i])
		}
		if refTo != order[i+1] {
			t.Fatalf("OutgoingRef(%q) -> %q, want %q (verticale)", order[i], refTo, order[i+1])
		}
		if field == "" {
			t.Fatalf("OutgoingRef(%q) has empty ref field", order[i])
		}
	}
	// Bands carry no outgoing SOURCE ref.
	for _, b := range TransversalBands() {
		if _, _, ok := OutgoingRef(b); ok {
			t.Fatalf("band %q has an outgoing SOURCE ref", b)
		}
	}
}

// Property: every Level has a non-empty declared required-field set; SpecOf is total over the
// grammar and refuses non-levels.
func TestSpecTotalOverGrammar(t *testing.T) {
	for _, l := range AllLevels() {
		s, ok := SpecOf(l)
		if !ok {
			t.Fatalf("SpecOf(%q) ok=false, want a spec", l)
		}
		if len(s.RequiredFields) == 0 {
			t.Fatalf("level %q has no required fields declared", l)
		}
	}
	// A non-level has no spec.
	if _, ok := SpecOf(Level("saga")); ok {
		t.Fatalf("SpecOf(saga) ok=true, want false (out of scope)")
	}
}

// Property: policy is a BAND attachable to operation/entity only (EL02 decision), invariant attaches
// to every SOURCE rung, and bands are not attachable to other bands.
func TestBandAttachment(t *testing.T) {
	// policy → operation/entity only.
	for _, rung := range Levels() {
		attach, ok := AttachableTo(LevelPolicy, rung)
		if !ok {
			t.Fatalf("AttachableTo(policy, %q) ok=false", rung)
		}
		want := rung == LevelOperation || rung == LevelEntity
		if attach != want {
			t.Fatalf("AttachableTo(policy, %q) = %v, want %v", rung, attach, want)
		}
	}
	// invariant attaches to every SOURCE rung.
	for _, rung := range Levels() {
		if attach, ok := AttachableTo(LevelInvariant, rung); !ok || !attach {
			t.Fatalf("AttachableTo(invariant, %q) = (%v,%v), want attachable", rung, attach, ok)
		}
	}
	// A SOURCE rung is not a band, so AttachableTo refuses it.
	if _, ok := AttachableTo(LevelProduct, LevelEntity); ok {
		t.Fatalf("AttachableTo(product, entity) ok=true, want false (product is not a band)")
	}
}

// Property: the mapping rungs of the grammar are a subset of the EXISTING closed set
// ideas.ProposesKinds() — the honest join (no forked address space). journey/view are NoEmit (not in
// ProposesKinds), invariant is a band; the SOURCE rungs that DO map (product/control/action/
// operation/entity) are all present in ideas.ProposesKinds(). This pins that EL02's grammar names
// reuse the kernel's closed set, never invent kinds.
func TestMappingRungsSubsetOfProposesKinds(t *testing.T) {
	proposes := map[Level]bool{}
	for _, p := range ideas.ProposesKinds() {
		proposes[Level(string(p))] = true
	}
	// SOURCE rungs that map to a Proposes kind verbatim (journey/view are NoEmit — EL05).
	mapping := []Level{LevelProduct, LevelControl, LevelAction, LevelOperation, LevelEntity}
	for _, m := range mapping {
		if !proposes[m] {
			t.Fatalf("mapping rung %q is NOT in ideas.ProposesKinds() (forked set)", m)
		}
	}
	// journey/view are NOT in the proposes set (NoEmit — they seed anchors, never a silent cast).
	for _, noEmit := range []Level{LevelJourney, LevelView} {
		if proposes[noEmit] {
			t.Fatalf("NoEmit rung %q IS in ideas.ProposesKinds() — unexpected", noEmit)
		}
	}
	// policy is a band that maps to ProposesPolicy.
	if !proposes[LevelPolicy] {
		t.Fatalf("policy band is not in ideas.ProposesKinds()")
	}
}
