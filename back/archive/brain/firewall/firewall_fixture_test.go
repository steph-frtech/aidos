// MemoryFirewall fixture mirror (AIDOS step S30) — the state→command→events proof of
// the mandatory one-way flow Memory → ContextPack → Idea → Mirror → Goal → Kernel and the
// blocked direct edge Memory → Kernel (KRD §119.1).
//
// mirror record: reflects=brain.memory_item "stale-discount-claim" · test_kind=fixture ·
//
//	cert_language=fixture · authority=above · liveness=alive
//
// It is the BEHAVIOUR spec (Mandat A): every flow edge is a fixture row; the canonical done
// case is `to_kernel → Blocked` with MEMORY_CANNOT_DECLARE_TRUTH and NO kernel write. This
// fixture is a MEANS-test toward the human red, not a new truth.
package firewall_test

import (
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/archive/brain/firewall"
	"github.com/steph-frtech/aidos/back/kernel/ideas"
	"github.com/steph-frtech/aidos/back/kernel/records"
)

// canonicalMemory is the fixture's captured memory: the stale, user-claimed discount rumour.
// taint [user_claim, stale], confidence 0.4 — context fuel, never truth.
func canonicalMemory(t *testing.T) firewall.MemoryItem {
	t.Helper()
	m, err := firewall.Capture(firewall.CaptureInput{
		Content:       "regulars always get 20% off",
		Provenance:    "user_claim:the support lead told me",
		ValidityScope: "EU",
		ExpiresAt:     "2025-12-31",
		Confidence:    0.4,
		Taint:         []firewall.Taint{firewall.TaintUserClaim, firewall.TaintStale},
		Branch:        "main",
	})
	if err != nil {
		t.Fatalf("Capture: %v", err)
	}
	return m
}

// Row 1 — given no memory, when capture_memory ⇒ MemoryCaptured; version==null, mirror==null.
func TestFixture_CaptureMemory_IsFuelNotTruth(t *testing.T) {
	m := canonicalMemory(t)

	// id is the content hash of the canonical body (S01 content-addressing).
	canon, err := m.CanonicalBody()
	if err != nil {
		t.Fatalf("CanonicalBody: %v", err)
	}
	if want := records.Hash(canon); m.ID != want {
		t.Fatalf("id is not the content hash: got %q want %q", m.ID, want)
	}

	// A memory has NO freeze and NO mirror — the type makes them unrepresentable. We assert
	// the absence structurally: the canonical body carries no "version" and no "mirror" key.
	body := string(canon)
	if strings.Contains(body, `"version"`) {
		t.Errorf("a memory must have no version/freeze; body=%s", body)
	}
	if strings.Contains(body, `"mirror"`) {
		t.Errorf("a memory must have no mirror — it is fuel, not truth; body=%s", body)
	}

	// The taint travels on the item.
	if got := m.Taint; len(got) != 2 {
		t.Fatalf("taint not preserved on capture: %v", got)
	}
}

// Row 2 — a memory MAY be proposed into a ContextPack (read side, allowed); taint travels.
func TestFixture_ProposeToContextPack_TaintTravels(t *testing.T) {
	m := canonicalMemory(t)
	entry := firewall.Propose(m, "order-discount")

	if entry.MemoryID != m.ID {
		t.Errorf("contextpack entry must reference the memory: %q", entry.MemoryID)
	}
	if entry.Goal != "order-discount" {
		t.Errorf("contextpack entry goal: %q", entry.Goal)
	}
	// taint contains "stale" — taint travels with the entry (never silently dropped).
	if !containsTaint(entry.Taint, firewall.TaintStale) {
		t.Errorf("contextpack entry must carry the taint forward: %v", entry.Taint)
	}
	if len(entry.Taint) != len(m.Taint) {
		t.Errorf("taint count must be preserved: entry=%v memory=%v", entry.Taint, m.Taint)
	}
}

// Row 3 — THE done case: the direct Memory → Kernel edge is refused at the firewall.
func TestFixture_ToKernel_BlockedTheDoneCase(t *testing.T) {
	m := canonicalMemory(t)
	br := firewall.ToKernel(m)

	// Blocked: a BlockReason is ALWAYS returned for the direct edge (never a kernel write).
	if br == nil {
		t.Fatal("the direct Memory → Kernel edge must be Blocked (got nil — a kernel write would occur)")
	}
	if string(br.Code) != "MEMORY_CANNOT_DECLARE_TRUTH" {
		t.Fatalf("block_reason.code: got %q want MEMORY_CANNOT_DECLARE_TRUTH", br.Code)
	}
	// how_to_fix names the full mandatory flow.
	joined := strings.Join(br.HowToFix, " | ")
	if !strings.Contains(joined, "memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel") {
		t.Errorf("how_to_fix must name the full flow; got %v", br.HowToFix)
	}
	if len(br.HowToFix) == 0 {
		t.Error("a BlockReason with an empty how_to_fix is a prison (forbidden)")
	}
}

// Row 4 — the ONLY legal door: hand the memory to the S27 idea-intake; it becomes a DRAFT idea
// whose provenance points back to the memory and which STILL has no mirror.
func TestFixture_ViaIdea_HandedToIdeaIntake(t *testing.T) {
	m := canonicalMemory(t)
	cand, err := firewall.ViaIdea(m)
	if err != nil {
		t.Fatalf("ViaIdea: %v", err)
	}

	// It becomes a DRAFT idea (S27).
	if cand.Idea.Status != ideas.StatusDraft {
		t.Errorf("idea must be draft: %q", cand.Idea.Status)
	}
	// Provenance points back to the memory id.
	wantProv := "memory:" + m.ID
	if cand.Idea.Provenance.Detail != wantProv {
		t.Errorf("idea provenance must point back to the memory: got %q want %q",
			cand.Idea.Provenance.Detail, wantProv)
	}
	// The idea STILL needs its mirror to ever reach the kernel: the ideas.Idea type carries
	// neither a version nor a mirror field (unrepresentable). We assert no kernel write occurred
	// — ViaIdea returns a candidate value; it does not write the kernel.
	if cand.WroteKernel {
		t.Error("ViaIdea must NOT write the kernel (promotion is the /goal flow, S27)")
	}
}

func containsTaint(ts []firewall.Taint, want firewall.Taint) bool {
	for _, t := range ts {
		if t == want {
			return true
		}
	}
	return false
}
