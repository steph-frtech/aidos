// Command secretstore is the AIDOS S91 per-app SECRET-STORE MCP server (ADR 0009:
// every backend op is an MCP tool; app-builder EPIC 9, DP32/ADR 0043).
//
// It is the capability door over runtime/secretstore — the per-app, encrypted-at-rest,
// project_id-scoped secret store:
//
//	set        — store (or add a new version of) a secret VALUE for (project, name).
//	rotate     — rotate a secret: new value live, the OLD value invalidated.
//	inject     — compute the boot-time env (declared keys − present keys); a missing
//	             declared secret → a fail-closed CodeSecretMissingAtBoot BlockReason
//	             (the done-criterion). Values flow OUT only here (boot injection).
//	scan       — the deterministic, gitleaks-style leak scan over an emission: finds a
//	             leaked secret value / known credential pattern. "scan = code."
//	fingerprint— a NON-secret content fingerprint of which keys a project holds (never
//	             a value) — the leak-free "what is stored" view for the Workbench.
//
// THE WALL (CLAUDE.md §2): the store writes the `secrets` projection (below the line),
// NEVER kernel/mirrors/fitness. There is deliberately NO raw `get` tool: a secret VALUE
// only ever leaves the store as a boot-time env var (inject) — the MCP is never a
// read-anything leak channel. DETERMINISM-FIRST (CLAUDE.md §6): the missing-key check
// is a set-difference, the leak scan is regex matching, isolation is the AES-GCM AAD
// bind — no LLM enters. Transport: stdio. The store is process-scoped (the deploy track
// persists the encrypted `secrets` table — DP32); the master key comes from the env.
package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/secretstore"
)

// store is the process-scoped secret store. The master key is derived from the
// AIDOS_SECRET_MASTER_KEY env (a real deployment supplies a KMS-managed key); absent,
// a deterministic dev key is derived so the MCP is runnable in a dev/test session.
var store *secretstore.SecretStore

func init() {
	pass := os.Getenv("AIDOS_SECRET_MASTER_KEY")
	if pass == "" {
		pass = "aidos-dev-secret-master-key"
	}
	st, err := secretstore.New(secretstore.DeriveKey(pass))
	if err != nil {
		log.Fatal(fmt.Errorf("secretstore: init: %w", err))
	}
	store = st
}

type setInput struct {
	Project string `json:"project" jsonschema:"the project_id the secret is scoped to (isolation)"`
	Name    string `json:"name" jsonschema:"the secret name (e.g. db_url, stripe_api_key)"`
	Value   string `json:"value" jsonschema:"the secret VALUE — sealed at rest immediately, never stored in the clear"`
}
type okOutput struct {
	OK    bool                     `json:"ok"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
	Error string                   `json:"error,omitempty"`
}

func setTool(_ context.Context, _ *mcp.CallToolRequest, in setInput) (*mcp.CallToolResult, okOutput, error) {
	if err := store.Set(in.Project, in.Name, in.Value); err != nil {
		return nil, okOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, okOutput{OK: true}, nil
}

func rotateTool(_ context.Context, _ *mcp.CallToolRequest, in setInput) (*mcp.CallToolResult, okOutput, error) {
	if err := store.Rotate(in.Project, in.Name, in.Value); err != nil {
		return nil, okOutput{OK: false, Error: err.Error()}, nil
	}
	return nil, okOutput{OK: true}, nil
}

type injectInput struct {
	Project  string   `json:"project" jsonschema:"the project_id whose app is booting"`
	Declared []string `json:"declared" jsonschema:"the secret keys the app's operations/datastore/connectors DECLARED they require"`
}
type injectOutput struct {
	OK    bool                     `json:"ok"`
	Env   []secretstore.EnvKV      `json:"env,omitempty"`
	Block *blockreason.BlockReason `json:"block,omitempty"`
}

func injectTool(_ context.Context, _ *mcp.CallToolRequest, in injectInput) (*mcp.CallToolResult, injectOutput, error) {
	inj, br := store.InjectEnv(in.Project, in.Declared)
	if br != nil {
		return nil, injectOutput{OK: false, Block: br}, nil
	}
	return nil, injectOutput{OK: true, Env: inj.Env}, nil
}

type scanInput struct {
	Source      string   `json:"source" jsonschema:"the emitted source bytes to scan for leaked secrets"`
	KnownValues []string `json:"known_values,omitempty" jsonschema:"optional: known secret VALUES to search for verbatim (the strongest leak check)"`
}
type scanOutput struct {
	OK       bool                  `json:"ok"`
	Clean    bool                  `json:"clean"`
	Findings []secretstore.Finding `json:"findings"`
}

func scanTool(_ context.Context, _ *mcp.CallToolRequest, in scanInput) (*mcp.CallToolResult, scanOutput, error) {
	findings := secretstore.ScanEmission(in.Source, in.KnownValues)
	return nil, scanOutput{OK: true, Clean: len(findings) == 0, Findings: findings}, nil
}

type fpInput struct {
	Project string `json:"project" jsonschema:"the project_id to fingerprint (which keys it holds — never a value)"`
}
type fpOutput struct {
	OK          bool   `json:"ok"`
	Fingerprint string `json:"fingerprint"`
}

func fingerprintTool(_ context.Context, _ *mcp.CallToolRequest, in fpInput) (*mcp.CallToolResult, fpOutput, error) {
	return nil, fpOutput{OK: true, Fingerprint: store.StoreFingerprint(in.Project)}, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-secretstore", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "set", Description: "S91: store (or add a version of) a secret VALUE for (project, name), encrypted at rest + scoped to the project_id. The value is sealed immediately, never stored in the clear."}, setTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "rotate", Description: "S91: rotate a secret — the new value goes live, the OLD value is invalidated (never returned again). Rotating an absent secret is refused."}, rotateTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "inject", Description: "S91: compute the boot-time env (declared keys − present keys). A missing declared secret → a fail-closed CodeSecretMissingAtBoot BlockReason. Values flow OUT only here. Deterministic set-difference."}, injectTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "scan", Description: "S91: the deterministic gitleaks-style leak scan over an emission — finds a leaked secret value / known credential pattern. 'scan = code, jamais un LLM.'"}, scanTool)
	mcp.AddTool(srv, &mcp.Tool{Name: "fingerprint", Description: "S91: a NON-secret content fingerprint of which keys a project holds (never a value) — the leak-free 'what is stored' view."}, fingerprintTool)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("secretstore: run: %w", err))
	}
}
