// identity.go — BA18: AGENT IDENTITY/AUTH toward MCP servers (gap K3). The loop presents
// the content-hash of its AgentImplementation as a CAPABILITY TOKEN; each MCP server
// (agentimpl/scheduler/agentloop) re-derives the EXPECTED token from the CoucheAgent@version
// it is asked to act for, and verifies the presented token MATCHES it. The effect:
// owner_agent/owner is PROVEN, never chain-declared — a writer cannot self-assert an owner it
// does not hold, because the owner is DERIVED from a token the loop cannot forge for another
// identity.
//
// THE WALL (CLAUDE.md §2): "the writer's identity is proven, not chain-declared." Below the
// line, the only owner a process can claim is the one its token binds it to. The MCP servers
// never read a self-asserted owner_agent field; they read the token, re-derive the expected
// token for the claimed identity, and compare. A mismatch (missing/malformed/another
// identity) is refused fail-closed with AGENT_IDENTITY_UNVERIFIED.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): MintToken and VerifyToken are PURE, TOTAL functions —
// no DB, no clock, no rng, no I/O. The token IS the S01/S02 content-address (records.Hash ∘
// records.Canonicalize) of the identity body, so the same identity always mints the same
// token (the reproducibility mirror identity_property_test.go pins it). This is a hashing
// problem — code, never an LLM. Verification is a constant-time-irrelevant string compare of
// two content-hashes; no judgment, no generation.
package agentimpl

import (
	"encoding/json"

	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// CapabilityToken is the unforgeable identity proof a build-agent loop presents to an MCP
// server: the 64-hex SHA-256 content-address of the agent's identity (its CoucheAgent@version
// via LayerRef). It is NOT a bearer secret to be guarded — it is a derivation a server can
// independently recompute from the identity it expects; presenting a token for one identity
// can never authenticate as another, because the hash differs.
type CapabilityToken string

// IdentityVerdict is the deterministic result of verifying a presented token against the
// identity an MCP server expects. Verified is true ONLY when the token binds the caller to
// EXACTLY that CoucheAgent@version. On refusal, Reason carries the actionable
// AGENT_IDENTITY_UNVERIFIED BlockReason (never a prison — how_to_fix is non-empty).
type IdentityVerdict struct {
	Verified bool                     `json:"verified"`
	Reason   *blockreason.BlockReason `json:"reason,omitempty"`
}

// identityBody is the canonical, minimal JSON shape the token hashes over. It carries ONLY
// the LayerRef (CoucheAgent@version): the identity is the layer the projection points back
// to, NOT the mutable runtime knobs. Two projections of the SAME CoucheAgent@version share an
// identity (and thus a token); a different @version is a different identity. The "kind"
// discriminator namespaces the address so an agent-identity hash can never collide with some
// other content-addressed body that happened to carry the same LayerRef string.
func identityBody(layerRef string) []byte {
	raw, _ := json.Marshal(map[string]any{
		"kind":      "agent_capability_token",
		"layer_ref": layerRef,
	})
	canon, _ := records.Canonicalize(raw)
	return canon
}

// MintToken derives the capability token of an AgentImplementation: the content-hash of its
// identity (LayerRef = CoucheAgent@version). PURE and TOTAL — same identity ⇒ same token.
// This is what the loop presents on EVERY MCP call. It cannot be minted for an identity the
// loop does not project (the LayerRef comes from the governed, content-addressed SOURCE).
func MintToken(a AgentImplementation) CapabilityToken {
	return CapabilityToken(records.Hash(identityBody(a.LayerRef)))
}

// MintTokenFor derives the token an MCP server EXPECTS for a given CoucheAgent@version it is
// asked to act for. It is the server-side twin of MintToken: the server never trusts a
// self-asserted owner, it re-derives the token the holder of that identity WOULD present, and
// compares. PURE and TOTAL.
func MintTokenFor(layerRef string) CapabilityToken {
	return CapabilityToken(records.Hash(identityBody(layerRef)))
}

// VerifyToken is the deterministic gate every MCP server (agentimpl/scheduler/agentloop) runs
// before honouring a call: the presented token is accepted ONLY when it equals the token the
// EXPECTED identity (expectedLayerRef) would mint. A missing token (empty), a malformed token
// (not a content-hash), or a token minted for ANOTHER identity all fail the equality check
// and are refused fail-closed with AGENT_IDENTITY_UNVERIFIED. The owner is PROVEN by the
// token, never read from a self-declared request field. PURE and TOTAL.
func VerifyToken(presented CapabilityToken, expectedLayerRef string) IdentityVerdict {
	expected := MintTokenFor(expectedLayerRef)
	if presented != "" && presented == expected {
		return IdentityVerdict{Verified: true}
	}
	br := blockreason.For(blockreason.CodeAgentIdentityUnverified)
	return IdentityVerdict{Verified: false, Reason: &br}
}
