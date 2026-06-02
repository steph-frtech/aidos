package phases_test

// N2 FIXTURE MIRROR — conceptually stored in the `mirrors` schema, materialized here for the
// Go runner (the mirrors Postgres schema is back-filled at S06; this is the executable red→green
// proof, CLAUDE.md §6 bootstrap exception).
//
//   # reflects: archive.phases.IsStable · test_kind: fixture · cert_language: operation-dsl/go · authority: above
//
// Each case is the frozen N2 shape: state (a cut { constraints, links, sensors } + a heads map)
// → command (IsStable) → events (the verdict { stable, reasons }). These ARE the done criteria
// (KRD §43): an EMPTY phase is STABLE; a cut where every link resolves and every sensor is green
// is STABLE; ANY single red mirror (a red sensor OR a stale/absent link) makes the cut UNSTABLE
// and is named in reasons; the recorded phase id is the content hash of its cut body (S02 reused).
//
// The example ids (createOrder, checkout-submit, createOrder.fixture) are REUSED from S11/S17's
// pinned artifacts — they are the METHOD's examples, not invented business rules. The fixture is
// a MEANS-TEST toward the human red, never a new truth the agent invents and then grades.

import (
	"slices"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/phases"
	"github.com/steph-frtech/aidos/back/kernel/links"
)

func bindsLink(from, fromV, to, toV string) links.Link {
	return links.Link{
		Kind: links.KindBinds,
		From: links.Ref{ID: from, Version: fromV},
		To:   links.Ref{ID: to, Version: toV},
	}
}

// fixtureCase is one N2 state → command → events row.
type fixtureCase struct {
	name        string
	cut         phases.Cut
	heads       links.Heads
	links       []links.Link
	sensors     []phases.SensorStatus
	wantStable  bool
	wantReasons []string // exact, sorted; empty when stable
}

func TestIsStable_Fixtures(t *testing.T) {
	cases := []fixtureCase{
		{
			// THE base done criterion: an empty phase is vacuously stable (no link pends, nothing red).
			name:        "an empty phase is stable",
			cut:         phases.Cut{},
			heads:       links.Heads{},
			links:       nil,
			sensors:     nil,
			wantStable:  true,
			wantReasons: nil,
		},
		{
			// All links resolve + all sensors green ⇒ stable (§43).
			name:  "a cut where every link resolves and every sensor is green is stable",
			cut:   phases.Cut{"createOrder": "v3"},
			heads: links.Heads{"createOrder": "v3"},
			links: []links.Link{
				bindsLink("checkout-submit", "v1", "createOrder", "v3"),
			},
			sensors:     []phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
			wantStable:  true,
			wantReasons: nil,
		},
		{
			// THE done criterion: one red mirror (a red sensor) ⇒ unstable, named in reasons.
			name:  "any red mirror makes the cut unstable",
			cut:   phases.Cut{"createOrder": "v3"},
			heads: links.Heads{"createOrder": "v3"},
			links: []links.Link{
				bindsLink("checkout-submit", "v1", "createOrder", "v3"),
			},
			sensors:     []phases.SensorStatus{{ID: "createOrder.fixture", Pass: false}},
			wantStable:  false,
			wantReasons: []string{"createOrder.fixture"},
		},
		{
			// A dangling (stale) link — pinned off-head — ⇒ unstable, named in reasons.
			name:  "a dangling (stale) link makes the cut unstable",
			cut:   phases.Cut{"createOrder": "v3"},
			heads: links.Heads{"createOrder": "v3"},
			links: []links.Link{
				bindsLink("checkout-submit", "v1", "createOrder", "v2"), // pinned off-head
			},
			sensors:     []phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
			wantStable:  false,
			wantReasons: []string{"checkout-submit@v1->createOrder@v2 (stale)"},
		},
		{
			// An absent link — the target has no head at all — is also red (§41 absent ⇒ red).
			name:  "an absent link makes the cut unstable",
			cut:   phases.Cut{"createOrder": "v3"},
			heads: links.Heads{}, // no head for createOrder
			links: []links.Link{
				bindsLink("checkout-submit", "v1", "createOrder", "v3"),
			},
			sensors:     []phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
			wantStable:  false,
			wantReasons: []string{"checkout-submit@v1->createOrder@v3 (absent)"},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := phases.IsStable(tc.cut, tc.heads, tc.links, tc.sensors)

			if got.Stable != tc.wantStable {
				t.Fatalf("stable = %v, want %v (reasons: %v)", got.Stable, tc.wantStable, got.Reasons)
			}
			// reasons ⇔ stable: empty exactly when stable.
			if (len(got.Reasons) == 0) != got.Stable {
				t.Fatalf("reasons must be empty IFF stable: stable=%v reasons=%v", got.Stable, got.Reasons)
			}
			if tc.wantReasons == nil {
				if len(got.Reasons) != 0 {
					t.Fatalf("want no reasons, got %v", got.Reasons)
				}
			} else if !slices.Equal(got.Reasons, tc.wantReasons) {
				t.Fatalf("reasons = %v, want %v", got.Reasons, tc.wantReasons)
			}
		})
	}
}

// TestIsStable_RecordedPhaseIdIsContentHash — the recorded phase id == version ==
// Hash(Canonicalize(body)) (content-addressed, S02 reused): a stable phase is the kernel's
// lockfile, addressed by the hash of its cut body. THE content-address done criterion.
func TestIsStable_RecordedPhaseIdIsContentHash(t *testing.T) {
	p := phases.IsStable(
		phases.Cut{"createOrder": "v3"},
		links.Heads{"createOrder": "v3"},
		[]links.Link{bindsLink("checkout-submit", "v1", "createOrder", "v3")},
		[]phases.SensorStatus{{ID: "createOrder.fixture", Pass: true}},
	)

	rec, err := p.Record()
	if err != nil {
		t.Fatalf("Record: %v", err)
	}
	if rec.ID != rec.Version {
		t.Fatalf("phase id (%q) must equal version (%q) — content-addressed", rec.ID, rec.Version)
	}
	v, err := p.Version()
	if err != nil {
		t.Fatalf("Version: %v", err)
	}
	if v != rec.Version {
		t.Fatalf("Version() = %q, want %q (same content address)", v, rec.Version)
	}
	if rec.ID == "" {
		t.Fatalf("phase content address must be non-empty")
	}
}

// TestEmptyPhaseRecordIsStableContentAddress — the empty phase records as a well-formed,
// content-addressed STABLE node (the base case persists, not just computes).
func TestEmptyPhaseRecordIsStableContentAddress(t *testing.T) {
	p := phases.IsStable(phases.Cut{}, links.Heads{}, nil, nil)
	if !p.Stable {
		t.Fatalf("the empty phase must be stable")
	}
	rec, err := p.Record()
	if err != nil {
		t.Fatalf("empty phase Record: %v", err)
	}
	if rec.ID == "" || rec.ID != rec.Version {
		t.Fatalf("empty phase must be content-addressed: id=%q version=%q", rec.ID, rec.Version)
	}
}
