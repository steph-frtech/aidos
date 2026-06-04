// Package provider is the SINGLE gated exception of the build-agent loop: the ONLY
// package permitted to import an LLM SDK (BA14, the arch-fitness invariant "one single
// LLM function"). Every other package consumes the LLM through the Provider interface
// declared here — never the SDK directly. The deterministic arch-fitness rule
// (back/runtime/agentloop.CheckLLMIsolation) enforces this at build time: an LLM-SDK
// import anywhere but this package (and its sub-packages) flips the rule red.
//
// NO SDK IS WIRED YET. The build-agent track has not bound a concrete LLM SDK; this
// package declares the SEAM (the Provider port) so the rest of the loop is written
// against an interface from day one. When a real SDK lands, its import lives HERE and
// nowhere else — the invariant is already enforced, so it cannot leak.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The LLM is the GATED EXCEPTION — reserved for
// irreducible generation/judgment. Anything that can be a pure function (parse, diff,
// score, render, validate) is code elsewhere and NEVER routed here. This package is the
// smallest possible surface for the one allowed non-deterministic dependency.
package provider

import "context"

// Request is one irreducible-generation request to the LLM exception. Kept minimal — the
// concrete shape grows when an SDK is wired; the seam exists now so the loop never
// imports an SDK outside this package.
type Request struct {
	System string   `json:"system"`
	Prompt string   `json:"prompt"`
	Stops  []string `json:"stops,omitempty"`
}

// Response is the LLM's reply for a Request.
type Response struct {
	Text string `json:"text"`
}

// Provider is the single seam through which the build-agent loop reaches an LLM. The
// concrete implementation (the one place an LLM SDK is imported) lives in this package;
// callers depend on the interface, so the arch-fitness rule keeps the SDK isolated.
type Provider interface {
	// Generate performs the irreducible generation the determinism-first arbiter (BA12)
	// gated to the LLM. Deterministic work never reaches here — it is code.
	Generate(ctx context.Context, req Request) (Response, error)
}
