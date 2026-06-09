package projectevolve

import "testing"

// Fixture mirror for S108 — the three done-criteria of the per-project medium loop made
// executable (ROADMAP-app-builder §S108):
//   1. a variant that breaks the fixed user mirror is KILLED (Cull / Niches drop it);
//   2. a green élite is promotable ONLY with authority approval;
//   3. the sandbox can never write a truth (every emitted write is a can_write zone;
//      Promote yields a PROPOSAL, never a truth-write; a cross-project variant is refused).

func fixedMirror() FixedMirror {
	return FixedMirror{ProjectID: "shop", MirrorID: "m-createOrder", Behavior: "createOrder"}
}

// --- Done-criterion 1: a mirror-breaking variant is killed ------------------------

func TestVariantBreakingMirrorIsKilled(t *testing.T) {
	m := fixedMirror()
	variants := []Variant{
		{ProjectID: "shop", ID: "v-green", Niche: "createOrder/fast", Mirror: MirrorGreen, OutOfSample: OutOfSampleGreen, Fitness: 0.9},
		{ProjectID: "shop", ID: "v-broken", Niche: "createOrder/fast", Mirror: MirrorRed, OutOfSample: OutOfSampleGreen, Fitness: 0.99},
	}

	cull := Cull(m, variants)
	if len(cull.Survivors) != 1 || cull.Survivors[0].ID != "v-green" {
		t.Fatalf("expected only v-green to survive, got %+v", cull.Survivors)
	}
	if len(cull.Killed) != 1 || cull.Killed[0] != "v-broken" {
		t.Fatalf("expected v-broken killed, got %v", cull.Killed)
	}

	// Even though the broken variant has the HIGHER fitness (0.99 > 0.9), it can never be
	// an élite — the score never overrides the mirror (anti-Goodhart).
	niches := Niches(m, variants)
	key := "shop::createOrder/fast"
	elite, ok := niches[key]
	if !ok {
		t.Fatalf("expected an élite for niche %q, got none", key)
	}
	if elite.ID != "v-green" {
		t.Fatalf("the mirror-breaker became the élite — the score overrode the mirror: %+v", elite)
	}
}

// --- Done-criterion 2: a green élite is promotable only with authority -------------

func TestGreenEliteNeedsAuthorityToPromote(t *testing.T) {
	m := fixedMirror()
	v := Variant{ProjectID: "shop", ID: "v-green", Niche: "createOrder/fast", Mirror: MirrorGreen, OutOfSample: OutOfSampleGreen, Fitness: 0.9}

	// Without approval: refused, even though the mirror AND out-of-sample are green.
	denied := Promote(m, v, false)
	if denied.Verdict != PromotionRefused {
		t.Fatalf("expected promotion refused without authority, got %v", denied.Verdict)
	}
	if denied.Proposal != nil {
		t.Fatalf("a refused promotion must carry no proposal")
	}

	// With approval: a PROPOSAL — never a truth-write.
	approved := Promote(m, v, true)
	if approved.Verdict != PromotionProposed {
		t.Fatalf("expected promotion proposed with authority, got %v (%s)", approved.Verdict, approved.Reason)
	}
	if approved.Proposal == nil {
		t.Fatalf("an approved promotion must carry a proposal")
	}
	if approved.Proposal.WritesTruth {
		t.Fatalf("the sandbox wrote a truth — it must only PROPOSE (WritesTruth must be false)")
	}
	if !approved.Proposal.Proposal {
		t.Fatalf("the promotion must be marked a proposal")
	}
}

// A green-mirror variant that FAILS out-of-sample is still refused even WITH authority
// (§87 — out-of-sample is the only honest signal).
func TestOutOfSampleRedRefusedEvenWithAuthority(t *testing.T) {
	m := fixedMirror()
	v := Variant{ProjectID: "shop", ID: "v-overfit", Niche: "createOrder/fast", Mirror: MirrorGreen, OutOfSample: OutOfSampleRed, Fitness: 0.95}
	res := Promote(m, v, true)
	if res.Verdict != PromotionRefused {
		t.Fatalf("expected refusal on out-of-sample red, got %v", res.Verdict)
	}
}

// --- Done-criterion 3: the sandbox can never write a truth ------------------------

func TestSandboxCannotWriteTruth(t *testing.T) {
	m := fixedMirror()
	variants := []Variant{
		{ProjectID: "shop", ID: "v-green", Niche: "createOrder/fast", Mirror: MirrorGreen, OutOfSample: OutOfSampleGreen, Fitness: 0.9},
		{ProjectID: "shop", ID: "v-cheap", Niche: "createOrder/cheap", Mirror: MirrorGreen, OutOfSample: OutOfSampleGreen, Fitness: 0.8},
	}
	run := RunMediumLoop(m, variants)

	if len(run.Emitted) == 0 {
		t.Fatalf("expected the run to emit branches/reports/ideas")
	}
	// EVERY emitted write must be under a can_write zone — never the kernel/mirrors/authority/fitness.
	for _, w := range run.Emitted {
		if !confineEmitted(w.Path) {
			t.Fatalf("the loop emitted a write OUTSIDE the sandbox (governs a truth): %q", w.Path)
		}
	}
	// Every niche still requires authority to promote.
	for key := range run.Niches {
		if _, ok := run.GateableBy[key]; !ok {
			t.Fatalf("niche %q is not gated by authority", key)
		}
	}
}

// A variant from a FOREIGN project can never be promoted into this project (the S55 wall).
func TestCrossProjectVariantRefused(t *testing.T) {
	m := fixedMirror() // project "shop"
	foreign := Variant{ProjectID: "blog", ID: "v-foreign", Niche: "createOrder/fast", Mirror: MirrorGreen, OutOfSample: OutOfSampleGreen, Fitness: 0.99}
	res := Promote(m, foreign, true)
	if res.Verdict != PromotionRefused {
		t.Fatalf("expected a cross-project variant refused, got %v", res.Verdict)
	}
	if res.BlockReason == nil {
		t.Fatalf("a cross-project refusal must carry a BlockReason")
	}

	// And it is culled, never an élite of this project.
	cull := Cull(m, []Variant{foreign})
	if len(cull.Survivors) != 0 {
		t.Fatalf("a foreign-project variant must not survive the cull")
	}
}
