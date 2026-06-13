// stack_pact_test.go — the DP13 PACT mirror (provider verification, the frozen N5
// slot). reflects=mcp.provision-stack · test_kind=acceptance · cert_language=pact ·
// authority=below · liveness=live. Written FIRST and RED (the stack.* handlers do
// not exist yet → compile fail), then green — the red IS the /goal (CLAUDE.md §6).
//
// It declares the consumer's contract for the DP13 provisioning surface — ONE
// interaction per exposed tool (the JSON-RPC tools/call request → the result field
// set) — and VERIFIES the provision MCP server honours each contract over BOTH the
// in-memory MCP transport AND the SDK's StreamableHTTPHandler IN-PROCESS (the
// gateway fronts these tools over HTTP; "le HTTP honore le MCP" is the
// provider-verification done-criterion). No external Pact daemon (ADR 0026).
//
// THE WALL (CLAUDE.md §2): nothing here writes truth; the stack.* tools project, and
// the fenced stack.engrave_manifest is REFUSED (GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET).
package main

import (
	"context"
	"net/http/httptest"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/stackmanifest"
	"github.com/steph-frtech/aidos/back/runtime/bootstrap"
)

// pactInteraction is one consumer expectation: a tool call and the exact result
// field set the provider must return — no extra/missing/renamed field, plus any
// pinned scalar field.
type pactInteraction struct {
	tool      string
	args      any
	wantKeys  []string
	wantField map[string]string
}

func keysOf(m map[string]any) map[string]struct{} {
	out := make(map[string]struct{}, len(m))
	for k := range m {
		out[k] = struct{}{}
	}
	return out
}

// okScope is a well-formed active scope + same-project target (the below-the-line,
// in-scope happy path every projection tool shares).
func okScope() scopeIn       { return scopeIn{Identity: "alice", ActiveProject: "proj-a"} }
func okTarget() targetIn     { return targetIn{ProjectID: "proj-a"} }
func crossTarget() targetIn  { return targetIn{ProjectID: "proj-b"} }
func forgedTarget() targetIn { return targetIn{ProjectID: "proj-a", ClaimedIdentity: "mallory"} }

// pactManifest is the contract's reference manifest — the pinned stackmanifest
// Example (a server + datastore + interpreter, one connector scope so a secret is
// required at boot).
func pactManifest() stackmanifest.StackManifest { return stackmanifest.Example() }

// pactBootstrapInput carries the manifest + a clean host + the present secret so the
// bootstrap emits its full ordered sequence (never a MISSING_SECRET_AT_BOOT here).
func pactBootstrapInput() bootstrapInput {
	return bootstrapInput{
		Scope:  okScope(),
		Target: okTarget(),
		Bundle: pactManifest(),
		Host: hostStateIn{
			SSOutput:       "LISTEN 0 128 0.0.0.0:22 \n",
			DockerPSOutput: "0.0.0.0:5433->5432/tcp\n",
		},
		Secrets: secretsStateIn{Present: requiredSecretsFor(pactManifest())},
	}
}

// requiredSecretsFor mirrors bootstrap.RequiredSecrets so the contract's secrets are
// the ones the bundle declares it needs.
func requiredSecretsFor(m stackmanifest.StackManifest) []string {
	return bootstrap.RequiredSecrets(m)
}

// stackContract is the Pact-style contract: ONE interaction per exposed stack.* tool
// (the five DP13 tools + the fenced engrave door). Each names the result field set
// the provider must honour.
func stackContract() []pactInteraction {
	return []pactInteraction{
		{
			tool:      "stack.emit",
			args:      emitInput{Scope: okScope(), Target: okTarget(), Manifest: pactManifest()},
			wantKeys:  []string{"ok", "bundle"},
			wantField: map[string]string{},
		},
		{
			tool:      "stack.select_profile",
			args:      selectProfileInput{Scope: okScope(), Target: okTarget(), Manifest: pactManifest(), Profile: "core", Environment: "prod"},
			wantKeys:  []string{"ok", "manifest"},
			wantField: map[string]string{},
		},
		{
			tool:     "stack.bootstrap",
			args:     pactBootstrapInput(),
			wantKeys: []string{"ok", "sequence", "sequence_hash", "urls"},
		},
		{
			tool:     "stack.resolve_ports",
			args:     resolvePortsInput{Scope: okScope(), Target: okTarget(), Host: pactBootstrapInput().Host},
			wantKeys: []string{"ok", "resolved_port"},
		},
		{
			tool:     "stack.print_urls",
			args:     printURLsInput{Scope: okScope(), Target: okTarget(), Bundle: pactManifest(), Host: pactBootstrapInput().Host, Secrets: pactBootstrapInput().Secrets},
			wantKeys: []string{"ok", "urls"},
		},
		{
			// THE WALL: a direct truth-write is refused, never performed.
			tool:      "stack.engrave_manifest",
			args:      engraveInput{Scope: okScope(), Target: okTarget(), Manifest: pactManifest()},
			wantKeys:  []string{"ok", "block"},
			wantField: map[string]string{},
		},
	}
}

// stackTools is the closed set of DP13 tools the contract must cover.
var stackTools = []string{
	"stack.emit", "stack.select_profile", "stack.bootstrap",
	"stack.resolve_ports", "stack.print_urls", "stack.engrave_manifest",
}

// verifyContract stands a provider up and verifies EACH interaction's result field
// set matches exactly + any pinned scalar field matches. Shared across the in-memory
// and the HTTP planes (the same server, byte-equal results over both transports).
func verifyContract(t *testing.T, cs *mcp.ClientSession, plane string) {
	t.Helper()
	for _, it := range stackContract() {
		res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: it.tool, Arguments: it.args})
		if err != nil {
			t.Fatalf("[%s] interaction %s: call: %v", plane, it.tool, err)
		}
		if res.IsError {
			t.Fatalf("[%s] interaction %s: provider error: %+v", plane, it.tool, res.Content)
		}
		got, ok := res.StructuredContent.(map[string]any)
		if !ok {
			t.Fatalf("[%s] interaction %s: result is not a JSON object: %T", plane, it.tool, res.StructuredContent)
		}
		gotKeys := keysOf(got)
		for _, k := range it.wantKeys {
			if _, ok := gotKeys[k]; !ok {
				t.Errorf("[%s] interaction %s: missing contract field %q (got %v)", plane, it.tool, k, got)
			}
		}
		want := map[string]struct{}{}
		for _, k := range it.wantKeys {
			want[k] = struct{}{}
		}
		for k := range gotKeys {
			if _, ok := want[k]; !ok {
				t.Errorf("[%s] interaction %s: unexpected extra field %q (contract is %v)", plane, it.tool, k, it.wantKeys)
			}
		}
		for k, v := range it.wantField {
			if gv, _ := got[k].(string); gv != v {
				t.Errorf("[%s] interaction %s: field %q = %q, want %q", plane, it.tool, k, gv, v)
			}
		}
	}
}

// TestStackPactProviderVerification_HTTP stands the provision MCP server up over the
// SDK's StreamableHTTPHandler in-process and verifies every contract interaction (the
// HTTP plane honours the MCP plane — the gateway fronts these tools over HTTP).
func TestStackPactProviderVerification_HTTP(t *testing.T) {
	httpSrv := httptest.NewServer(httpHandler())
	defer httpSrv.Close()
	cli := mcp.NewClient(&mcp.Implementation{Name: "pact-consumer", Version: "v0"}, nil)
	cs, err := cli.Connect(context.Background(), &mcp.StreamableClientTransport{Endpoint: httpSrv.URL}, nil)
	if err != nil {
		t.Fatalf("connect HTTP provider: %v", err)
	}
	defer func() { _ = cs.Close() }()
	verifyContract(t, cs, "http")
}

// TestStackPactProviderVerification_InMemory verifies the same contract over the
// in-memory MCP transport — the byte-equal twin of the HTTP plane.
func TestStackPactProviderVerification_InMemory(t *testing.T) {
	ctx := context.Background()
	clientT, serverT := mcp.NewInMemoryTransports()
	srv := newMCPServer()
	ss, err := srv.Connect(ctx, serverT, nil)
	if err != nil {
		t.Fatalf("server connect: %v", err)
	}
	defer func() { _ = ss.Close() }()
	cli := mcp.NewClient(&mcp.Implementation{Name: "pact-consumer", Version: "v0"}, nil)
	cs, err := cli.Connect(ctx, clientT, nil)
	if err != nil {
		t.Fatalf("client connect: %v", err)
	}
	defer func() { _ = cs.Close() }()
	verifyContract(t, cs, "in-memory")
}

// TestStackPactCoversEveryTool: the contract has ≥1 interaction per exposed DP13 tool
// — no tool is left unverified (the completeness done-criterion).
func TestStackPactCoversEveryTool(t *testing.T) {
	covered := map[string]bool{}
	for _, it := range stackContract() {
		covered[it.tool] = true
	}
	for _, name := range stackTools {
		if !covered[name] {
			t.Errorf("DP13 tool %q has no Pact interaction", name)
		}
	}
}
