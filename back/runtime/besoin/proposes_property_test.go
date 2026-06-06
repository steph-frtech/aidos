package besoin

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"pgregory.net/rapid"
)

// proposes_property_test.go — the EL05 mirror (∀ invariant, property form, rapid). Written RED first
// (CLAUDE.md Mandat A): the declared table LevelToProposes(level) → ProposesKind | NoEmit is the
// honest join with the EXISTING closed set ideas.ProposesKinds(). It must be:
//   - TOTAL    : every valid Level maps to exactly one Mapping (a ProposesKind OR NoEmit).
//   - CLOSED   : every Emit target is a member of ideas.ProposesKinds() — no kind invented.
//   - NO ALIAS : no level silently maps to ANOTHER level's kind (journey→product forbidden, view→
//                view* impossible). A non-source-kind level either maps to itself or is NoEmit.
//   - NoEmit   : journey and view (no legal Proposes target) are NoEmit — they seed anchors, never
//                emit. invariant is NoEmit (its mirror is a property, not an idea kind; it constrains
//                laterally). The other rungs map to their own kind.
//   - DETERMINISTIC: same Level → same Mapping on every call, no clock/rng/IO/LLM (the table is a pure
//                total function, not an LLM choice).

// Property: LevelToProposes is TOTAL over every valid Level — each maps to exactly one Mapping, with
// no panic, no zero value. (rapid samples valid Levels.)
func TestLevelToProposes_TotalOverAllLevels(t *testing.T) {
	all := AllLevels()
	rapid.Check(t, func(rt *rapid.T) {
		i := rapid.IntRange(0, len(all)-1).Draw(rt, "i")
		l := all[i]
		m := LevelToProposes(l)
		if m.Kind != MappingEmit && m.Kind != MappingNoEmit {
			rt.Fatalf("LevelToProposes(%q).Kind = %q, want emit|no_emit", l, m.Kind)
		}
		if m.Kind == MappingEmit && m.Proposes == "" {
			rt.Fatalf("LevelToProposes(%q) is Emit but Proposes is empty", l)
		}
		if m.Kind == MappingNoEmit && m.Proposes != "" {
			rt.Fatalf("LevelToProposes(%q) is NoEmit but carries Proposes %q", l, m.Proposes)
		}
	})
}

// Property: every Emit target is a member of the EXISTING closed set ideas.ProposesKinds() — the
// table maps INTO ideas, never invents a kind. A target outside the closed set is a hard error.
func TestLevelToProposes_EmitTargetIsInClosedSet(t *testing.T) {
	closed := map[ideas.Proposes]bool{}
	for _, p := range ideas.ProposesKinds() {
		closed[p] = true
	}
	for _, l := range AllLevels() {
		m := LevelToProposes(l)
		if m.Kind != MappingEmit {
			continue
		}
		if !closed[m.Proposes] {
			t.Fatalf("LevelToProposes(%q) emits %q, NOT in ideas.ProposesKinds() %v", l, m.Proposes, ideas.ProposesKinds())
		}
	}
}

// Property: NO SILENT ALIAS. A level that maps to a ProposesKind maps to its OWN kind (the kind whose
// string equals the level string) — never to another level's kind. journey→product is forbidden;
// view has no kind so it must be NoEmit. invariant must be NoEmit. The only legal Emit levels are the
// 5 source-kind rungs (control/action/operation/entity/product) plus the policy band.
func TestLevelToProposes_NoSilentAlias(t *testing.T) {
	// The levels whose name IS a member of ideas.ProposesKinds() (self-mapping is the only legal Emit).
	selfKind := map[Level]ideas.Proposes{
		LevelControl:   ideas.ProposesControl,
		LevelAction:    ideas.ProposesAction,
		LevelOperation: ideas.ProposesOperation,
		LevelEntity:    ideas.ProposesEntity,
		LevelProduct:   ideas.ProposesProduct,
		LevelPolicy:    ideas.ProposesPolicy,
	}
	for _, l := range AllLevels() {
		m := LevelToProposes(l)
		if want, ok := selfKind[l]; ok {
			if m.Kind != MappingEmit {
				t.Fatalf("level %q must Emit (its name is a ProposesKind), got NoEmit", l)
			}
			if m.Proposes != want {
				t.Fatalf("level %q aliases to %q, want self-kind %q (no silent alias)", l, m.Proposes, want)
			}
			continue
		}
		// journey, view, invariant have NO ProposesKind: they MUST be NoEmit (never aliased).
		if m.Kind != MappingNoEmit {
			t.Fatalf("level %q has no ProposesKind, must be NoEmit, got Emit %q (silent alias!)", l, m.Proposes)
		}
	}
}

// Property: the explicit NoEmit set is exactly {journey, view, invariant}. journey/view have no
// Proposes target (they seed anchors); invariant's mirror is a property, not an idea kind.
func TestLevelToProposes_NoEmitSetIsExact(t *testing.T) {
	wantNoEmit := map[Level]bool{LevelJourney: true, LevelView: true, LevelInvariant: true}
	for _, l := range AllLevels() {
		m := LevelToProposes(l)
		isNoEmit := m.Kind == MappingNoEmit
		if isNoEmit != wantNoEmit[l] {
			t.Fatalf("NoEmit(%q) = %v, want %v", l, isNoEmit, wantNoEmit[l])
		}
	}
	if got := len(NoEmitLevels()); got != len(wantNoEmit) {
		t.Fatalf("NoEmitLevels() len = %d, want %d", got, len(wantNoEmit))
	}
	for _, l := range NoEmitLevels() {
		if !wantNoEmit[l] {
			t.Fatalf("NoEmitLevels() contains unexpected %q", l)
		}
	}
}

// Property: a mapping toward a kind OUTSIDE ideas.ProposesKinds() is a HARD error (the table refuses,
// never an LLM guess). LevelToProposes on an out-of-grammar string returns NoEmit-with-error.
func TestLevelToProposes_OutOfGrammarIsHardError(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		raw := rapid.StringMatching(`[a-z]{3,12}`).Draw(rt, "raw")
		l := Level(raw)
		if IsLevel(l) {
			return // skip valid levels — this property is about out-of-grammar input
		}
		_, err := LevelToProposesChecked(l)
		if err == nil {
			rt.Fatalf("LevelToProposesChecked(%q) returned nil error for out-of-grammar level", raw)
		}
	})
}

// Property: REPRODUCIBLE — same Level → same Mapping on every call (determinism-first). No
// clock/rng/map-iteration leak.
func TestLevelToProposes_Reproducible(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		all := AllLevels()
		l := all[rapid.IntRange(0, len(all)-1).Draw(rt, "i")]
		first := LevelToProposes(l)
		for n := 0; n < 50; n++ {
			again := LevelToProposes(l)
			if again != first {
				rt.Fatalf("LevelToProposes(%q) not reproducible: %+v vs %+v", l, again, first)
			}
		}
	})
}

// Property: the table is TOTAL in the strong sense — its domain is EXACTLY AllLevels() (no level
// missing, no extra entry). Proven by counting the explicit table against AllLevels.
func TestLevelToProposes_DomainIsExactlyAllLevels(t *testing.T) {
	tbl := levelProposesTable
	if len(tbl) != len(AllLevels()) {
		t.Fatalf("table size %d != AllLevels() size %d", len(tbl), len(AllLevels()))
	}
	for _, l := range AllLevels() {
		if _, ok := tbl[l]; !ok {
			t.Fatalf("table missing entry for valid level %q", l)
		}
	}
	for l := range tbl {
		if !IsLevel(l) {
			t.Fatalf("table has entry for non-level %q", l)
		}
	}
}
