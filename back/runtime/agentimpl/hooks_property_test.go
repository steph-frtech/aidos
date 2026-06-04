package agentimpl

import (
	"testing"

	"pgregory.net/rapid"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Reproducibility / invariant + FAULT-INJECTION mirror (rapid, N1): reflects=
// runtime.agentimpl (the MANDATORY-HOOK enforcer, BA10), test_kind=invariant,
// cert_language=rapid, liveness=live, authority=below.
//
// THE LAW OF BA10 (the turn is ACCEPTED only when every mandatory hook is VERT). The
// four wall axes (zone / capacity / skill / confinement) gate what an action may TOUCH.
// BA10 gates whether a TURN may be ACCEPTED: a governed build-agent's turn is admissible
// ONLY if every HooksObligatoires{Mandatory:true} declared in its resolved implementation
// actually RAN and is GREEN. Presence ≠ green — a mandatory hook that ran and FAILED
// blocks acceptance just as one that never ran does. HooksSatisfied is a PURE TOTAL
// function of (impl, hookVerdicts) → *BlockReason:
//
//	HooksSatisfied(impl, verdicts) == nil  IFF  ∀ h ∈ impl.Hooks where h.Mandatory:
//	                                              (∃ v ∈ verdicts: v matches h ∧ v.Ran ∧ v.Green)
//
// — a missing/un-ran mandatory hook ⇒ AGENT_MANDATORY_HOOK_SKIPPED; a ran-but-red one ⇒
// AGENT_MANDATORY_HOOK_RED. The verdict comes from the HOOK BINARY's own deterministic
// exit/BlockReason (the HookVerdict record), NEVER an agent-self-reported set of names
// (CLAUDE.md §8 — the judge is deterministic, never the transcript). Non-mandatory hooks
// are advisory: they never block acceptance.
//
// FAULT-INJECTION (CLAUDE.md §5 hook-honesty — a hook that never fires is dead): the
// mirror BREAKS what HooksSatisfied watches — it removes a mandatory hook's verdict
// (skipped) and reddens a present one (red) and asserts HooksSatisfied flips to a
// BlockReason. A green run that cannot be reddened by injection would be a dead guard.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): HooksSatisfied is set/predicate evaluation over
// the declared mandatory hooks and the binary-emitted verdicts — no DB, no clock, no
// rng, no I/O, never a judgment. Same input ⇒ same verdict. This block IS the
// reproducibility mirror.

// genPhaseHook draws an arbitrary (phase, hook) pair from a small alphabet so the
// generator regularly hits BOTH the declared and the undeclared case.
func genPhaseHook() *rapid.Generator[ResolvedHook] {
	phases := []string{"PreToolUse", "PostToolUse", "Stop", "SessionStart", ""}
	hooks := []string{"wall", "completeness", "sensors", "audit", ""}
	return rapid.Custom(func(t *rapid.T) ResolvedHook {
		return ResolvedHook{
			Phase:     rapid.SampledFrom(phases).Draw(t, "phase"),
			Hook:      rapid.SampledFrom(hooks).Draw(t, "hook"),
			Mandatory: rapid.Bool().Draw(t, "mandatory"),
		}
	})
}

func genHookSet() *rapid.Generator[[]ResolvedHook] {
	return rapid.SliceOfN(genPhaseHook(), 0, 6)
}

// genVerdict draws a HookVerdict over the same (phase, hook) alphabet with arbitrary
// ran/green flags so the generator hits skipped, red, and green verdicts alike.
func genVerdict() *rapid.Generator[HookVerdict] {
	phases := []string{"PreToolUse", "PostToolUse", "Stop", "SessionStart", ""}
	hooks := []string{"wall", "completeness", "sensors", "audit", ""}
	return rapid.Custom(func(t *rapid.T) HookVerdict {
		return HookVerdict{
			Phase: rapid.SampledFrom(phases).Draw(t, "phase"),
			Hook:  rapid.SampledFrom(hooks).Draw(t, "hook"),
			Ran:   rapid.Bool().Draw(t, "ran"),
			Green: rapid.Bool().Draw(t, "green"),
		}
	})
}

func genVerdictSet() *rapid.Generator[[]HookVerdict] {
	return rapid.SliceOfN(genVerdict(), 0, 8)
}

// refVerdict is the reference lookup: the first verdict matching (phase, hook), if any.
func refVerdict(verdicts []HookVerdict, h ResolvedHook) (HookVerdict, bool) {
	for _, v := range verdicts {
		if v.Phase == h.Phase && v.Hook == h.Hook {
			return v, true
		}
	}
	return HookVerdict{}, false
}

// refSatisfied is the reference semantics: every mandatory hook ran AND is green.
func refSatisfied(impl AgentImplementation, verdicts []HookVerdict) bool {
	for _, h := range impl.Hooks {
		if !h.Mandatory {
			continue
		}
		v, ok := refVerdict(verdicts, h)
		if !ok || !v.Ran || !v.Green {
			return false
		}
	}
	return true
}

// TestProp_HooksSatisfied_NilIffAllMandatoryGreen: the BA10 law — HooksSatisfied returns
// nil IFF every mandatory hook ran and is green (presence is not enough).
func TestProp_HooksSatisfied_NilIffAllMandatoryGreen(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		hooks := genHookSet().Draw(rt, "hooks")
		verdicts := genVerdictSet().Draw(rt, "verdicts")
		impl := AgentImplementation{Hooks: hooks}

		br := HooksSatisfied(impl, verdicts)
		want := refSatisfied(impl, verdicts)

		if (br == nil) != want {
			rt.Fatalf("HooksSatisfied(hooks=%+v, verdicts=%+v) = %+v, want satisfied=%v",
				hooks, verdicts, br, want)
		}
	})
}

// TestProp_HooksSatisfied_NonMandatoryNeverBlocks: a non-mandatory hook — skipped or red —
// NEVER blocks acceptance (only Mandatory:true hooks gate the turn).
func TestProp_HooksSatisfied_NonMandatoryNeverBlocks(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		hk := genPhaseHook().Draw(rt, "hook")
		hk.Mandatory = false
		impl := AgentImplementation{Hooks: []ResolvedHook{hk}}
		// No verdicts at all: a non-mandatory hook that never ran still does not block.
		if br := HooksSatisfied(impl, nil); br != nil {
			rt.Fatalf("a non-mandatory hook must never block acceptance, got %+v", br)
		}
		// A non-mandatory hook that ran red also does not block.
		red := []HookVerdict{{Phase: hk.Phase, Hook: hk.Hook, Ran: true, Green: false}}
		if br := HooksSatisfied(impl, red); br != nil {
			rt.Fatalf("a red non-mandatory hook must never block acceptance, got %+v", br)
		}
	})
}

// TestProp_HooksSatisfied_SkippedCarriesSkippedCode: a mandatory hook with NO verdict
// (never ran) ⇒ AGENT_MANDATORY_HOOK_SKIPPED with a non-empty how_to_fix (never prison).
func TestProp_HooksSatisfied_SkippedCarriesSkippedCode(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		hk := genPhaseHook().Draw(rt, "hook")
		hk.Mandatory = true
		impl := AgentImplementation{Hooks: []ResolvedHook{hk}}
		// Verdict set that does NOT cover this hook (different phase/hook), forcing skipped.
		other := []HookVerdict{{Phase: "X-" + hk.Phase, Hook: "Y-" + hk.Hook, Ran: true, Green: true}}

		br := HooksSatisfied(impl, other)
		if br == nil {
			rt.Fatalf("a mandatory hook with no verdict must block (skipped)")
		}
		if br.Code != blockreason.CodeAgentMandatoryHookSkipped {
			rt.Fatalf("skipped must carry AGENT_MANDATORY_HOOK_SKIPPED, got %q", br.Code)
		}
		if len(br.HowToFix) < 1 {
			rt.Fatalf("AGENT_MANDATORY_HOOK_SKIPPED how_to_fix must be non-empty (never the prison)")
		}
	})
}

// TestProp_HooksSatisfied_RedCarriesRedCode: a mandatory hook that RAN and is NOT green
// ⇒ AGENT_MANDATORY_HOOK_RED with a non-empty how_to_fix. Presence ≠ green.
func TestProp_HooksSatisfied_RedCarriesRedCode(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		hk := genPhaseHook().Draw(rt, "hook")
		hk.Mandatory = true
		impl := AgentImplementation{Hooks: []ResolvedHook{hk}}
		// The hook RAN but is RED (present, not green).
		red := []HookVerdict{{Phase: hk.Phase, Hook: hk.Hook, Ran: true, Green: false}}

		br := HooksSatisfied(impl, red)
		if br == nil {
			rt.Fatalf("a mandatory hook that ran red must block (red)")
		}
		if br.Code != blockreason.CodeAgentMandatoryHookRed {
			rt.Fatalf("red must carry AGENT_MANDATORY_HOOK_RED, got %q", br.Code)
		}
		if len(br.HowToFix) < 1 {
			rt.Fatalf("AGENT_MANDATORY_HOOK_RED how_to_fix must be non-empty (never the prison)")
		}
	})
}

// TestProp_HooksSatisfied_SkippedPrecedesRed: the SKIPPED verdict (a hook that never ran)
// is reported BEFORE a RED one — a hook absent entirely is "skipped", never miscoded as
// "red". The codeOrder fixes precedence deterministically.
func TestProp_HooksSatisfied_SkippedPrecedesRed(t *testing.T) {
	skipped := ResolvedHook{Phase: "Stop", Hook: "audit", Mandatory: true}
	red := ResolvedHook{Phase: "PreToolUse", Hook: "wall", Mandatory: true}
	impl := AgentImplementation{Hooks: []ResolvedHook{skipped, red}}
	verdicts := []HookVerdict{
		{Phase: "PreToolUse", Hook: "wall", Ran: true, Green: false}, // red present
		// skipped hook ("Stop","audit") has NO verdict
	}
	br := HooksSatisfied(impl, verdicts)
	if br == nil {
		t.Fatalf("both a skipped and a red mandatory hook must block")
	}
	if br.Code != blockreason.CodeAgentMandatoryHookSkipped {
		t.Fatalf("a missing mandatory hook is SKIPPED (reported first), got %q", br.Code)
	}
}

// TestProp_HooksSatisfied_GreenWhenNoMandatory: an impl with no mandatory hooks is always
// satisfied (nil), regardless of verdicts — there is nothing to gate.
func TestProp_HooksSatisfied_GreenWhenNoMandatory(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		hooks := genHookSet().Draw(rt, "hooks")
		for i := range hooks {
			hooks[i].Mandatory = false
		}
		verdicts := genVerdictSet().Draw(rt, "verdicts")
		impl := AgentImplementation{Hooks: hooks}
		if br := HooksSatisfied(impl, verdicts); br != nil {
			rt.Fatalf("no mandatory hooks ⇒ always satisfied, got %+v", br)
		}
	})
}

// TestProp_HooksSatisfied_Deterministic: same input ⇒ same verdict (determinism-first).
func TestProp_HooksSatisfied_Deterministic(t *testing.T) {
	rapid.Check(t, func(rt *rapid.T) {
		hooks := genHookSet().Draw(rt, "hooks")
		verdicts := genVerdictSet().Draw(rt, "verdicts")
		impl := AgentImplementation{Hooks: hooks}
		a := HooksSatisfied(impl, verdicts)
		b := HooksSatisfied(impl, verdicts)
		if (a == nil) != (b == nil) {
			rt.Fatalf("non-deterministic block presence")
		}
		if a != nil && b != nil && a.Code != b.Code {
			rt.Fatalf("non-deterministic block code: %q vs %q", a.Code, b.Code)
		}
	})
}

// TestFaultInjection_HooksSatisfied_RemoveOrRedFlipsRed (CLAUDE.md §5 hook-honesty):
// start from a fully-green, satisfied configuration, then INJECT a fault two ways —
// (1) REMOVE a mandatory hook's verdict (skipped) and (2) REDDEN a present one — and
// assert HooksSatisfied flips from nil to the right BlockReason each time. A guard that
// could not be reddened by injection would be dead.
func TestFaultInjection_HooksSatisfied_RemoveOrRedFlipsRed(t *testing.T) {
	impl := AgentImplementation{Hooks: []ResolvedHook{
		{Phase: "PreToolUse", Hook: "wall", Mandatory: true},
		{Phase: "Stop", Hook: "completeness", Mandatory: true},
		{Phase: "PostToolUse", Hook: "sensors", Mandatory: false}, // advisory
	}}
	green := []HookVerdict{
		{Phase: "PreToolUse", Hook: "wall", Ran: true, Green: true},
		{Phase: "Stop", Hook: "completeness", Ran: true, Green: true},
	}
	// Baseline: every mandatory hook ran green ⇒ satisfied.
	if br := HooksSatisfied(impl, green); br != nil {
		t.Fatalf("baseline must be satisfied (all mandatory hooks green), got %+v", br)
	}
	// Injection 1 — REMOVE the wall verdict (the mandatory hook never ran) ⇒ SKIPPED.
	removed := []HookVerdict{
		{Phase: "Stop", Hook: "completeness", Ran: true, Green: true},
	}
	br := HooksSatisfied(impl, removed)
	if br == nil || br.Code != blockreason.CodeAgentMandatoryHookSkipped {
		t.Fatalf("removing a mandatory hook's verdict must flip to SKIPPED, got %+v", br)
	}
	// Injection 2 — REDDEN the wall verdict (it ran but failed) ⇒ RED.
	reddened := []HookVerdict{
		{Phase: "PreToolUse", Hook: "wall", Ran: true, Green: false},
		{Phase: "Stop", Hook: "completeness", Ran: true, Green: true},
	}
	br = HooksSatisfied(impl, reddened)
	if br == nil || br.Code != blockreason.CodeAgentMandatoryHookRed {
		t.Fatalf("reddening a mandatory hook's verdict must flip to RED, got %+v", br)
	}
}
