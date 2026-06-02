package links_test

// Versioned-links staleness fixture (state heads → command link → status event),
// interpreted in Go. reflects=kernel.links.Resolve · test_kind=fixture ·
// cert_language=fixture · liveness=live · authority=above (the staleness rule — a link to
// an absent version is red — is the human's, KRD §41–§42).
//
// Materialized source: tests/kernel/links_resolve.fixture.md (the human-readable fixture,
// conceptually stored in the `mirrors` schema; persisted to Postgres at S06 — bootstrap
// exception). It is the LIEN PORTEUR: this test loads the five fixture rows; if the fixture
// intention disappears the test breaks (no silent rot into a monster).
//
// The example targets (createOrder, checkout-submit, checkout-button) are REUSED from S11's
// pinned artifacts — the agent coins no new target, no new kind, no new status.

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/links"
)

// Row 1 — a link pinned to the head is GREEN.
func TestRow1_HeadPinned_Green(t *testing.T) {
	heads := links.Heads{"createOrder": "v3"}
	l := links.Link{
		Kind: links.KindBinds,
		From: links.Ref{ID: "checkout-submit", Version: "v1"},
		To:   links.Ref{ID: "createOrder", Version: "v3"},
	}
	if err := links.Validate(l); err != nil {
		t.Fatalf("a well-formed binds link must validate, got %v", err)
	}
	if got := links.Resolve(l, heads); got != links.StatusGreen {
		t.Fatalf("a head-pinned link must be green, got %q", got)
	}
}

// Row 2 — a link pinned to a NON-head version is STALE (red).
func TestRow2_NonHeadPinned_Stale(t *testing.T) {
	heads := links.Heads{"createOrder": "v3"}
	l := links.Link{
		Kind: links.KindBinds,
		From: links.Ref{ID: "checkout-submit", Version: "v1"},
		To:   links.Ref{ID: "createOrder", Version: "v2"},
	}
	if got := links.Resolve(l, heads); got != links.StatusStale {
		t.Fatalf("a non-head-pinned link must be stale, got %q", got)
	}
}

// Row 3 — THE done criterion. A link to an ABSENT version (heads has no entry for the
// target) is ABSENT — red. The link dangles loudly.
func TestRow3_AbsentTarget_Absent(t *testing.T) {
	heads := links.Heads{} // createOrder has no head — it does not exist
	l := links.Link{
		Kind: links.KindBinds,
		From: links.Ref{ID: "checkout-submit", Version: "v1"},
		To:   links.Ref{ID: "createOrder", Version: "v3"},
	}
	if got := links.Resolve(l, heads); got != links.StatusAbsent {
		t.Fatalf("a link to an absent version must be absent (red), got %q", got)
	}
}

// Row 4 — an UNPINNED `to` (no version) is rejected at Validate, not evaluated.
func TestRow4_Unpinned_Rejected(t *testing.T) {
	l := links.Link{
		Kind: links.KindMirrors,
		From: links.Ref{ID: "checkout-button", Version: "v1"},
		To:   links.Ref{ID: "checkout-button-fixture", Version: ""}, // unpinned
	}
	if err := links.Validate(l); err == nil {
		t.Fatalf("an unpinned link (to has no version) must be rejected by Validate")
	}
}

// Row 5 — an UNKNOWN link kind is rejected at Validate (closed set).
func TestRow5_UnknownKind_Rejected(t *testing.T) {
	l := links.Link{
		Kind: links.Kind("depends_on"),
		From: links.Ref{ID: "a", Version: "v1"},
		To:   links.Ref{ID: "b", Version: "v1"},
	}
	if err := links.Validate(l); err == nil {
		t.Fatalf("an unknown link kind %q must be rejected by Validate (closed set)", l.Kind)
	}
}
