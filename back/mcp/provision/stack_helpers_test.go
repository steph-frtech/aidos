// stack_helpers_test.go — in-process call helpers for the DP13 stack.* handlers.
// They invoke the handler functions DIRECTLY (no transport), so the wall and the
// determinism property mirrors test the handler logic itself, not the wire. Written
// alongside the RED mirrors (the handlers do not exist yet → compile fail).
package main

import (
	"context"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func ctx() context.Context { return context.Background() }

// req is a throwaway CallToolRequest the handlers ignore (they read no transport state).
func req() *mcp.CallToolRequest { return &mcp.CallToolRequest{} }

func callEmit(t *testing.T, in emitInput) emitOutput {
	t.Helper()
	_, out, err := stackEmit(ctx(), req(), in)
	if err != nil {
		t.Fatalf("stackEmit: unexpected transport error: %v", err)
	}
	return out
}

func callSelectProfile(t *testing.T, in selectProfileInput) selectProfileOutput {
	t.Helper()
	_, out, err := stackSelectProfile(ctx(), req(), in)
	if err != nil {
		t.Fatalf("stackSelectProfile: unexpected transport error: %v", err)
	}
	return out
}

func callBootstrap(t *testing.T, in bootstrapInput) bootstrapOutput {
	t.Helper()
	_, out, err := stackBootstrap(ctx(), req(), in)
	if err != nil {
		t.Fatalf("stackBootstrap: unexpected transport error: %v", err)
	}
	return out
}

func callResolvePorts(t *testing.T, in resolvePortsInput) resolvePortsOutput {
	t.Helper()
	_, out, err := stackResolvePorts(ctx(), req(), in)
	if err != nil {
		t.Fatalf("stackResolvePorts: unexpected transport error: %v", err)
	}
	return out
}

func callPrintURLs(t *testing.T, in printURLsInput) printURLsOutput {
	t.Helper()
	_, out, err := stackPrintURLs(ctx(), req(), in)
	if err != nil {
		t.Fatalf("stackPrintURLs: unexpected transport error: %v", err)
	}
	return out
}

func callEngrave(t *testing.T, in engraveInput) engraveOutput {
	t.Helper()
	_, out, err := stackEngraveManifest(ctx(), req(), in)
	if err != nil {
		t.Fatalf("stackEngraveManifest: unexpected transport error: %v", err)
	}
	return out
}
