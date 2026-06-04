// identity_fixture_test.go — BA18: the RED fixture + fault-injection mirror for AGENT
// IDENTITY/AUTH toward MCP servers (gap K3). The loop presents the content-hash of its
// AgentImplementation as a CAPABILITY TOKEN; each MCP server (agentimpl/scheduler/agentloop)
// re-derives the expected token and verifies it binds the calling process to EXACTLY that
// CoucheAgent@version. owner_agent/owner is PROVEN, not chain-declared.
//
// THE FIXTURE (state → cmd → events), the roadmap verbatim:
//   - a call WITH the right token for the server's expected identity is ACCEPTED;
//   - a call WITHOUT a token (empty) is REFUSED (AGENT_IDENTITY_UNVERIFIED);
//   - a call with a MALFORMED token (not the content-hash of the identity) is REFUSED;
//   - a call carrying a token MINTED FOR ANOTHER identity (a different LayerRef) is REFUSED —
//     a writer cannot forge an owner_agent it does not hold.
//
// Written RED first (the types/funcs below do not exist yet): CapabilityToken, MintToken,
// VerifyToken, IdentityVerdict. `go test` fails to COMPILE → that compile-red IS the /goal.
package agentimpl

import (
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/agentlayer"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// identityImpl is the canonical confined projection whose content-hash IS the identity the
// MCP server expects. Two impls that differ only in LayerRef mint DIFFERENT tokens.
func identityImpl(layerRef string) AgentImplementation {
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

// FIXTURE 1 — a call WITH the right token for the expected identity is ACCEPTED.
func TestFixture_Identity_ValidTokenAccepted(t *testing.T) {
	impl := identityImpl("agent:builder@v1")
	tok := MintToken(impl)

	v := VerifyToken(tok, impl.LayerRef)
	if !v.Verified {
		t.Fatalf("a token minted from the impl must verify against its LayerRef; got %+v", v)
	}
	if v.Reason != nil {
		t.Fatalf("an accepted verdict carries no BlockReason; got %+v", v.Reason)
	}
}

// FIXTURE 2 — a call WITHOUT a token (empty) is REFUSED with AGENT_IDENTITY_UNVERIFIED.
func TestFixture_Identity_MissingTokenRefused(t *testing.T) {
	impl := identityImpl("agent:builder@v1")

	v := VerifyToken(CapabilityToken(""), impl.LayerRef)
	if v.Verified {
		t.Fatalf("an empty token must NOT verify (fail-closed)")
	}
	if v.Reason == nil || v.Reason.Code != blockreason.CodeAgentIdentityUnverified {
		t.Fatalf("a missing token refuses with AGENT_IDENTITY_UNVERIFIED; got %+v", v.Reason)
	}
	if len(v.Reason.HowToFix) == 0 {
		t.Fatalf("the BlockReason must carry a non-empty how_to_fix (no prison)")
	}
}

// FIXTURE 3 — a MALFORMED token (not the content-hash of the identity) is REFUSED.
func TestFixture_Identity_MalformedTokenRefused(t *testing.T) {
	impl := identityImpl("agent:builder@v1")

	v := VerifyToken(CapabilityToken("not-a-real-content-hash"), impl.LayerRef)
	if v.Verified {
		t.Fatalf("a malformed token must NOT verify")
	}
	if v.Reason == nil || v.Reason.Code != blockreason.CodeAgentIdentityUnverified {
		t.Fatalf("a malformed token refuses with AGENT_IDENTITY_UNVERIFIED; got %+v", v.Reason)
	}
}

// FIXTURE 4 (FAULT INJECTION) — a token MINTED FOR ANOTHER identity is REFUSED: a writer
// cannot present a token for agent:other@v9 and be accepted as agent:builder@v1. The
// identity is bound to the token, not chain-declared.
func TestFixture_Identity_WrongIdentityRefused(t *testing.T) {
	mine := identityImpl("agent:builder@v1")
	other := identityImpl("agent:other@v9")

	stolenTok := MintToken(other) // a valid token, but for a DIFFERENT identity

	// The server expects "agent:builder@v1" but the presented token binds "agent:other@v9".
	v := VerifyToken(stolenTok, mine.LayerRef)
	if v.Verified {
		t.Fatalf("a token for another identity must NOT verify as ours (no forgeable owner_agent)")
	}
	if v.Reason == nil || v.Reason.Code != blockreason.CodeAgentIdentityUnverified {
		t.Fatalf("a wrong-identity token refuses with AGENT_IDENTITY_UNVERIFIED; got %+v", v.Reason)
	}
}

// FIXTURE 5 — the token is DERIVED from the identity (content-hash), never self-asserted: an
// impl and its LayerRef alone fix the token; two impls with the same LayerRef mint the same.
func TestFixture_Identity_TokenIsContentHash(t *testing.T) {
	a := identityImpl("agent:builder@v1")
	b := identityImpl("agent:builder@v1")
	if MintToken(a) != MintToken(b) {
		t.Fatalf("the token is the content-hash of the identity — same LayerRef ⇒ same token")
	}
	if MintToken(a) == MintToken(identityImpl("agent:builder@v2")) {
		t.Fatalf("a different version mints a different token (the token binds @version)")
	}
	// The token is a 64-hex sha-256 digest (the S01/S02 content-address scheme).
	if len(MintToken(a)) != 64 {
		t.Fatalf("the capability token is a 64-hex content-hash; got len %d", len(MintToken(a)))
	}
}
