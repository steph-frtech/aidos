package main

// pact-verifier MCP tests + fault injection (S36). The server's pact_verify op must:
//   - PASS on createOrder (THE done criterion: the createOrder route passes its contract test);
//   - REFUSE an unknown operation (no guessed route/handler — honesty);
//   - FAIL when the provider drifts from the contract (fault injection: break what it
//     watches, assert it goes red — CLAUDE.md §5 hook/sensor honesty).

import (
	"context"
	"net/http"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

func TestPactVerify_CreateOrderPasses(t *testing.T) {
	_, out, err := (&server{}).verify(context.Background(), nil, verifyInput{Operation: "createOrder"})
	if err != nil {
		t.Fatalf("verify error: %v", err)
	}
	if !out.Pass {
		t.Fatalf("createOrder did NOT pass its contract test: %s", out.Reason)
	}
	if out.Method != "POST" || out.Route != "/orders" {
		t.Errorf("verified %s %s, want POST /orders", out.Method, out.Route)
	}
	if out.ContractJSON == "" || out.OperationID == "" {
		t.Error("verdict missing contract json / operation hash")
	}
}

func TestPactVerify_UnknownOperationRefused(t *testing.T) {
	_, out, err := (&server{}).verify(context.Background(), nil, verifyInput{Operation: "deleteUniverse"})
	if err != nil {
		t.Fatalf("verify error: %v", err)
	}
	if out.Pass {
		t.Fatal("an unknown operation must be refused (no guessed contract), not pass")
	}
}

// Fault injection: a provider that drops a field must FAIL provider verification — the
// verifier asserts the field set, it is not a rubber stamp.
func TestPactVerify_FaultInjection_DroppedFieldFails(t *testing.T) {
	op, e := generators.ExampleCreateOrderOp(), entities.Order()
	contract, br := generators.EmitContract(op, e)
	if br != nil {
		t.Fatalf("EmitContract: %+v", br)
	}
	broken := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":1}`))
	})
	if generators.VerifyContract(contract, broken).Pass {
		t.Fatal("a drifting provider must FAIL verification (the field-set assertion did not fire)")
	}
}

func TestNewMCPServerRegistersTool(t *testing.T) {
	if newMCPServer() == nil {
		t.Fatal("newMCPServer returned nil")
	}
}
