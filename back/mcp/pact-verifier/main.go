// Command pact-verifier is the AIDOS Runtime Pact provider-verification MCP server (S36).
//
// It is the single capability door (ADR 0009: every backend op is an MCP tool) for Pact
// PROVIDER VERIFICATION (CLAUDE.md §3, the frozen N3/N5 "Pact between cells" + "Pact
// provider verification" slots). Given a projected operation+entity, it emits the Pact
// contract (the consumer expectation), stands the emitted handler up IN-PROCESS (ADR 0026:
// net/http/httptest, no external Ruby daemon), replays the interaction, and reports
// whether the provider honours the contract — PASS/FAIL + the verified interactions.
//
// THE DONE CRITERION runs through here: pact_verify on createOrder must PASS — the
// createOrder route passes its contract test.
//
// Tools (one per backend op):
//
//	pact_verify — verify a projected operation's handler against its Pact contract
//	              (provider verification); returns pass/fail + the contract + the route.
//
// CONTEXT FUEL, NEVER TRUTH (the wall, §2): this server reaches NOTHING above the wall.
// It READS the operation/entity sources (here the in-repo createOrder/Order example, the
// agent-side SELECT-only mirror of the kernel) and runs a verification; it writes no
// truth. Recording last_verified_at into runtime.api_contract is the aidos writer role's
// job (below the line), not this server's.
//
// DETERMINISM-FIRST (CLAUDE.md §6): EmitContract + VerifyContract are pure/total; the
// verifier is an algorithm (field-set + status assertions), not an LLM judgment.
//
// Transport: stdio.
package main

import (
	"context"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/operation"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

// verifyInput names which projected operation to verify. The closed set is the
// operations S36 projects; currently only createOrder (the canonical example). An
// unknown operation is refused, never guessed.
type verifyInput struct {
	Operation string `json:"operation" jsonschema:"the projected operation to verify (e.g. createOrder)"`
}

type verifyOutput struct {
	Pass         bool     `json:"pass" jsonschema:"true iff every interaction honoured the contract"`
	Reason       string   `json:"reason" jsonschema:"human-readable verdict detail"`
	Method       string   `json:"method" jsonschema:"the verified HTTP method"`
	Route        string   `json:"route" jsonschema:"the verified HTTP route"`
	Interactions []string `json:"interactions" jsonschema:"the verified interaction descriptions"`
	ContractJSON string   `json:"contract_json" jsonschema:"the Pact-v3 contract body that was verified"`
	OperationID  string   `json:"operation_hash" jsonschema:"the content address of operation ⊕ entity"`
}

// sourcesFor resolves a named projected operation to its (operation, entity) sources.
// It coins nothing: an unknown name returns ok=false and the server refuses, never
// guesses a route/handler.
func sourcesFor(name string) (operation.Operation, entities.Entity, bool) {
	switch name {
	case "createOrder", "":
		return generators.ExampleCreateOrderOp(), entities.Order(), true
	default:
		return operation.Operation{}, entities.Entity{}, false
	}
}

func (s *server) verify(_ context.Context, _ *mcp.CallToolRequest, in verifyInput) (*mcp.CallToolResult, verifyOutput, error) {
	op, e, ok := sourcesFor(in.Operation)
	if !ok {
		return nil, verifyOutput{Pass: false, Reason: "unknown operation " + in.Operation + " — no contract to verify (not guessed)"}, nil
	}
	contract, br := generators.EmitContract(op, e)
	if br != nil {
		return nil, verifyOutput{Pass: false, Reason: br.Explanation}, nil
	}
	cj, err := generators.ContractJSON(contract)
	if err != nil {
		return nil, verifyOutput{}, err
	}
	method, route := generators.MethodRoute(op, e.Name)

	result := generators.VerifyContract(contract, generators.ReferenceProvider(op, e))
	return nil, verifyOutput{
		Pass:         result.Pass,
		Reason:       result.Reason,
		Method:       method,
		Route:        route,
		Interactions: result.Interactions,
		ContractJSON: string(cj),
		OperationID:  contract.SourceHash,
	}, nil
}

type server struct{}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-pact-verifier", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "pact_verify",
		Description: "Verify a projected operation's emitted handler against its Pact contract (provider verification, in-process). Returns pass/fail + the contract + the route.",
	}, (&server{}).verify)
	return srv
}

func main() {
	if err := newMCPServer().Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatalf("pact-verifier: run: %v", err)
	}
}
