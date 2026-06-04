// identity_property_test.go — BA18: the reproducibility + invariant mirror for the
// capability-token identity binding. Same input ⇒ same token/verdict (determinism-first),
// and the binding invariant holds for EVERY identity: a token verifies against EXACTLY one
// LayerRef and no other (owner_agent is not forgeable).
package agentimpl

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"pgregory.net/rapid"
)

func tokImpl(layerRef string) AgentImplementation {
	return AgentImplementation{
		LayerRef:       layerRef,
		Role:           "executor",
		Model:          "claude",
		Provider:       agentlayer.ProviderAnthropic,
		AllowedPaths:   []string{"apps/demo/"},
		ForbiddenPaths: WallForbiddenPaths(),
		ResourceLimits: agentlayer.ResourceLimits{MaxMemoryMB: 256, MaxCPUMillis: 1000, MaxWallSeconds: 30},
	}
}

// REPRODUCIBILITY: MintToken is a pure function of the identity — same LayerRef ⇒ same
// token, repeatedly (no clock/rng/I/O).
func TestProp_Identity_MintDeterministic(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ref := rapid.StringMatching(`[a-z]+:[a-z]+@v[0-9]+`).Draw(t, "ref")
		t1 := MintToken(tokImpl(ref))
		t2 := MintToken(tokImpl(ref))
		if t1 != t2 {
			t.Fatalf("MintToken is non-deterministic for %q: %q != %q", ref, t1, t2)
		}
		if len(t1) != 64 {
			t.Fatalf("token must be a 64-hex content-hash; got len %d", len(t1))
		}
	})
}

// INVARIANT: a minted token verifies against its OWN LayerRef and is REFUSED for every
// other LayerRef (the token binds the process to EXACTLY one CoucheAgent@version — not
// forgeable for another identity).
func TestProp_Identity_BindsExactlyOneIdentity(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		mine := rapid.StringMatching(`[a-z]+:[a-z]+@v[0-9]+`).Draw(t, "mine")
		other := rapid.StringMatching(`[a-z]+:[a-z]+@v[0-9]+`).Draw(t, "other")

		tok := MintToken(tokImpl(mine))

		ours := VerifyToken(tok, mine)
		if !ours.Verified {
			t.Fatalf("token must verify against its own LayerRef %q", mine)
		}

		if other != mine {
			theirs := VerifyToken(tok, other)
			if theirs.Verified {
				t.Fatalf("token for %q must NOT verify against %q (no forgeable owner_agent)", mine, other)
			}
			if theirs.Reason == nil || theirs.Reason.Code != blockreason.CodeAgentIdentityUnverified {
				t.Fatalf("wrong-identity refusal must be AGENT_IDENTITY_UNVERIFIED; got %+v", theirs.Reason)
			}
		}
	})
}

// INVARIANT (fail-closed): an empty or non-hex token NEVER verifies, for any expected
// identity.
func TestProp_Identity_EmptyOrJunkNeverVerifies(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		ref := rapid.StringMatching(`[a-z]+:[a-z]+@v[0-9]+`).Draw(t, "ref")
		junk := rapid.String().Filter(func(s string) bool {
			// anything that is not exactly the minted token
			return CapabilityToken(s) != MintToken(tokImpl(ref))
		}).Draw(t, "junk")

		v := VerifyToken(CapabilityToken(junk), ref)
		if v.Verified {
			t.Fatalf("a token %q that is not the identity's content-hash must NOT verify for %q", junk, ref)
		}
		if v.Reason == nil || v.Reason.Code != blockreason.CodeAgentIdentityUnverified {
			t.Fatalf("refusal must carry AGENT_IDENTITY_UNVERIFIED; got %+v", v.Reason)
		}
	})
}
