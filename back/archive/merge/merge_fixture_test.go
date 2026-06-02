package merge_test

// N2 FIXTURE MIRROR — conceptually stored in the `mirrors` schema, materialized here for the Go
// runner (the mirrors Postgres schema is back-filled at S06; this is the executable red→green
// proof, CLAUDE.md §6 bootstrap exception).
//
//	# reflects: archive.merge.MergeSemantic · test_kind: fixture · cert_language: operation-dsl/go · authority: above
//
// Each case is the frozen N2 shape: state (the base stable phase + the relevant mirror verdicts) →
// command (the left/right branch heads to merge) → events (the MergeResult). These ARE the done
// criteria (KRD §122/§130):
//   - THE done criterion: a textually-clean refund EU/US pair (disjoint deltas, git would auto-merge)
//     with a RED merged-cut mirror ⇒ CONFLICT, refund ∈ conflicting_mirrors, BLOCKED → requires_authority;
//   - two disjoint-line changes breaking the SAME emergent cart invariant ⇒ CONFLICT (red git never sees);
//   - a free-space promo-banner / help-link pair ⇒ CLEAN (a candidate stable phase, S23);
//   - an unevaluable / no-common-ancestor pair ⇒ UNRESOLVABLE → OpenQuestion (NEVER a fabricated
//     `clean`, NEVER an auto-merge of the unknown).
//
// The example ids (refund, cart, pay-button, amount-field, promo-banner, help-link) are REUSED from
// the prior pinned steps — they are the METHOD's examples, not invented business rules. The fixture
// is a MEANS-TEST toward the human red (clean text + red mirror ⇒ blocked); the S23 IsStable oracle
// (reusing the S18 aggregate + S22 red wave) is the truth, never a rule the agent invents and grades.

import (
	"slices"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/merge"
	"github.com/steph-frtech/aidos/back/archive/phases"
)

// red is a red mirror verdict over the merged cut (S07 shape: Pass == false).
func red(id string) phases.SensorStatus { return phases.SensorStatus{ID: id, Pass: false} }

// green is a green mirror verdict over the merged cut.
func green(id string) phases.SensorStatus { return phases.SensorStatus{ID: id, Pass: true} }

func TestMergeSemantic_Fixtures(t *testing.T) {
	cases := []struct {
		name           string
		base           merge.Base
		left           merge.Branch
		right          merge.Branch
		wantStatus     merge.Status
		wantConflict   []string // exact, sorted; the conflicting mirror ids when conflict
		wantAuthority  bool
		wantOpenQ      bool // expect a non-empty OpenQuestion (unresolvable)
		wantHashFilled bool // expect merged_cut@hash present (clean/conflict)
	}{
		{
			// THE DONE CRITERION (§122): base v0 with refund GREEN. left pins refund@v2-EU, right pins
			// refund@v2-US — DISJOINT deltas (different constraint ids: git would auto-merge cleanly,
			// no overlapping hunk). But the merged cut reddens the `refund` invariant. The MIRROR, not
			// the diff, decides: CONFLICT, refund ∈ conflicting_mirrors, BLOCKED → requires_authority.
			name: "a clean text merge with a red mirror is blocked",
			base: merge.Base{
				ID:      "v0",
				Cut:     phases.Cut{"refund": "v1"},
				Sensors: []phases.SensorStatus{green("refund")},
			},
			left:  merge.Branch{Ancestor: "v0", Deltas: phases.Cut{"refund-eu": "v2-EU"}, AddedSensors: []phases.SensorStatus{red("refund")}},
			right: merge.Branch{Ancestor: "v0", Deltas: phases.Cut{"refund-us": "v2-US"}},
			// the merged refund mirror reddens (the EU/US selections cannot both hold the invariant)
			wantStatus:     merge.StatusConflict,
			wantConflict:   []string{"refund"},
			wantAuthority:  true,
			wantHashFilled: true,
		},
		{
			// Two branches touching DISJOINT lines that break the SAME emergent cart invariant (KRD
			// §122): left changes the pay-button control, right changes the amount-field control — text
			// git would merge cleanly — but both reopen "cart.own_mirror" (empty ⇒ nothing payable).
			// CONFLICT the red git never sees.
			name: "two branches breaking the same emergent invariant conflict",
			base: merge.Base{
				ID:      "cart-v0",
				Cut:     phases.Cut{"cart": "v1"},
				Sensors: []phases.SensorStatus{green("cart.own_mirror")},
			},
			left:           merge.Branch{Ancestor: "cart-v0", Deltas: phases.Cut{"pay-button": "v2"}, AddedSensors: []phases.SensorStatus{red("cart.own_mirror")}},
			right:          merge.Branch{Ancestor: "cart-v0", Deltas: phases.Cut{"amount-field": "v2"}},
			wantStatus:     merge.StatusConflict,
			wantConflict:   []string{"cart.own_mirror"},
			wantAuthority:  true,
			wantHashFilled: true,
		},
		{
			// A merge whose merged cut is FULLY GREEN is CLEAN (§109 aggregate green): left adds a
			// promo-banner control (free space), right adds a help-link control (free space) — disjoint
			// deltas, no mirror reddens. CLEAN, conflicting_mirrors == [], a candidate stable phase (S23).
			name: "a merge whose merged cut is fully green is clean",
			base: merge.Base{
				ID:      "view-v0",
				Cut:     phases.Cut{"view": "v1"},
				Sensors: []phases.SensorStatus{green("view.own_mirror")},
			},
			left:           merge.Branch{Ancestor: "view-v0", Deltas: phases.Cut{"promo-banner": "v2"}, AddedSensors: []phases.SensorStatus{green("promo-banner.mirror")}},
			right:          merge.Branch{Ancestor: "view-v0", Deltas: phases.Cut{"help-link": "v2"}, AddedSensors: []phases.SensorStatus{green("help-link.mirror")}},
			wantStatus:     merge.StatusClean,
			wantConflict:   []string{},
			wantAuthority:  false,
			wantHashFilled: true,
		},
		{
			// An UNRESOLVABLE merge becomes an OpenQuestion, NEVER a guessed clean (no common ancestor):
			// left descends from "a", right from "b", base is "v0" — they share no ancestor, so the
			// merge is unmappable. MergeSemantic refuses to guess `clean` and refuses to auto-merge.
			name: "an unresolvable merge becomes an OpenQuestion, never a guessed clean",
			base: merge.Base{
				ID:  "v0",
				Cut: phases.Cut{"x": "v1"},
			},
			left:       merge.Branch{Ancestor: "a", Deltas: phases.Cut{"y": "v2"}},
			right:      merge.Branch{Ancestor: "b", Deltas: phases.Cut{"z": "v2"}},
			wantStatus: merge.StatusUnresolvable,
			wantOpenQ:  true,
		},
		{
			// Identity ⇒ clean no-op: merging base into itself (empty deltas, no red sensors) is a
			// green merged cut — CLEAN, no spurious conflict (§122 sanity).
			name: "merging a base with itself is a clean no-op",
			base: merge.Base{
				ID:      "v0",
				Cut:     phases.Cut{"refund": "v1"},
				Sensors: []phases.SensorStatus{green("refund")},
			},
			left:           merge.Branch{Ancestor: "v0"},
			right:          merge.Branch{Ancestor: "v0"},
			wantStatus:     merge.StatusClean,
			wantConflict:   []string{},
			wantAuthority:  false,
			wantHashFilled: true,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := merge.MergeSemantic(tc.base, tc.left, tc.right, nil)

			if got.Status != tc.wantStatus {
				t.Fatalf("status = %q, want %q (result=%+v)", got.Status, tc.wantStatus, got)
			}
			if tc.wantStatus == merge.StatusUnresolvable {
				if !tc.wantOpenQ {
					t.Fatalf("test misdeclared: unresolvable must expect an OpenQuestion")
				}
				if got.OpenQuestion == "" {
					t.Fatalf("unresolvable must carry an OpenQuestion, got empty (NEVER a fabricated clean)")
				}
				if got.MergedCutHash != "" {
					t.Fatalf("unresolvable must not fabricate a merged_cut@hash, got %q", got.MergedCutHash)
				}
				return
			}

			if !slices.Equal(got.ConflictingMirrors, tc.wantConflict) {
				t.Fatalf("conflicting_mirrors = %v, want %v", got.ConflictingMirrors, tc.wantConflict)
			}
			if got.RequiresAuthority != tc.wantAuthority {
				t.Fatalf("requires_authority = %v, want %v", got.RequiresAuthority, tc.wantAuthority)
			}
			if tc.wantHashFilled && got.MergedCutHash == "" {
				t.Fatalf("expected a merged_cut@hash for a %s merge, got empty", tc.wantStatus)
			}
			if tc.wantStatus == merge.StatusConflict && !got.RequiresAuthority {
				t.Fatalf("a conflict must require authority (override, KRD §11/§12)")
			}
		})
	}
}
