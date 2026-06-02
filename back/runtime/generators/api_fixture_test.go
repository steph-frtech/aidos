package generators_test

// Fixture mirror (S36): the API projection — state (operation + entity AST) → command
// (EmitAPI / EmitContract / VerifyContract) → events (the emitted handler, the contract,
// the verification verdict).
// reflects=runtime.generators.{EmitAPI,EmitContract,VerifyContract}, test_kind=fixture,
// cert_language=operation-dsl/go, liveness=live, authority=below.
//
// This is the Go interpreter of tests/runtime/api_projection.fixture.md — the lien
// porteur. Each sub-test mirrors one fixture row. THE done criterion (Contract) is here:
// the createOrder route passes its contract test.

import (
	"net/http"
	"strings"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

// Fixture A — createOrder emits a Go REST/JSON handler.
func TestAPIFixtureA_EmitsHandler(t *testing.T) {
	art, br := generators.EmitAPI(generators.ExampleCreateOrderOp(), entities.Order())
	if br != nil {
		t.Fatalf("EmitAPI returned a BlockReason on the pinned createOrder+Order: %+v", br)
	}
	src := string(art.Bytes)
	if !strings.Contains(src, generators.ProtectedMarker) {
		t.Errorf("emitted handler missing protected marker %q", generators.ProtectedMarker)
	}
	if !strings.Contains(src, art.SourceHash) {
		t.Error("emitted handler header missing source hash")
	}
	if art.Target != generators.TargetAPI {
		t.Errorf("artifact target = %q, want %q", art.Target, generators.TargetAPI)
	}
	if art.Path != "back/gen/api/order.go" {
		t.Errorf("artifact path = %q, want back/gen/api/order.go", art.Path)
	}
	// method + route taken from the operation, not invented.
	if !strings.Contains(src, "POST") || !strings.Contains(src, "/orders") {
		t.Error("emitted handler does not pin POST /orders from the operation")
	}
	// request body reuses the Order field shape, never re-typed (go/format aligns the
	// field columns, so match the identifier + json tag, not exact spacing).
	if !strings.Contains(src, "OrderRequest") || !strings.Contains(src, `Customer`) || !strings.Contains(src, `json:"customer"`) {
		t.Error("request body does not reuse the Order field shape (S35 EmitGo)")
	}
	// delegates to the operation interpreter, never re-implements the rule.
	if !strings.Contains(src, "operation.Interpret") {
		t.Error("emitted handler does not delegate to the S10 operation interpreter")
	}
	if !art.Protected {
		t.Error("emitted artifact not marked protected")
	}
}

// Fixture B — the emitted api artifact is content-addressed to its source.
func TestAPIFixtureB_ContentAddressed(t *testing.T) {
	op, e := generators.ExampleCreateOrderOp(), entities.Order()
	art, br := generators.EmitAPI(op, e)
	if br != nil {
		t.Fatalf("EmitAPI BlockReason: %+v", br)
	}
	body, err := generators.APISourceBodyForTest(op, e)
	if err != nil {
		t.Fatalf("APISourceBodyForTest: %v", err)
	}
	want := records.Hash(body)
	if art.SourceHash != want {
		t.Errorf("source_hash %q != Hash(Canonicalize(operation ⊕ entity)) %q", art.SourceHash, want)
	}
	// byte-identical re-emit.
	art2, _ := generators.EmitAPI(op, e)
	if string(art.Bytes) != string(art2.Bytes) {
		t.Error("EmitAPI is not byte-identical on a re-emit of the same sources")
	}
	if art.OutputHash != art2.OutputHash {
		t.Error("output_hash differs on a re-emit of the same sources")
	}
}

// Fixture C — an operation referencing an unpinned/incoherent entity is rejected, not guessed.
func TestAPIFixtureC_UnpinnedIORejected(t *testing.T) {
	// The createOrder operation mutates "Order", but we pair it with a different entity
	// — the I/O the operation pins is not pinned by THIS entity AST.
	wrong := entities.Entity{
		Name:       "Widget",
		Attributes: []entities.Attribute{{Name: "id", Type: entities.TypeInt, Required: true, Identifier: true}},
	}
	art, br := generators.EmitAPI(generators.ExampleCreateOrderOp(), wrong)
	if br == nil {
		t.Fatal("EmitAPI must reject an operation/entity mismatch, not guess a route/field")
	}
	if !strings.Contains(br.Explanation, generators.CodeUnknownOperationIO) {
		t.Errorf("BlockReason explanation does not name %s: %q", generators.CodeUnknownOperationIO, br.Explanation)
	}
	if len(br.HowToFix) == 0 {
		t.Error("BlockReason carries no how_to_fix (no prison)")
	}
	if len(art.Bytes) != 0 {
		t.Error("a blocked emit must produce no handler bytes (no silent fallback)")
	}
}

// Contract — createOrder honours its Pact contract (THE done criterion). The provider
// (the emitted handler) is stood up in-process; the verifier replays POST /orders and
// asserts status + field set match the contract.
func TestAPIContract_CreateOrderPassesContractTest(t *testing.T) {
	op, e := generators.ExampleCreateOrderOp(), entities.Order()
	contract, br := generators.EmitContract(op, e)
	if br != nil {
		t.Fatalf("EmitContract BlockReason: %+v", br)
	}
	if len(contract.Interactions) != 1 {
		t.Fatalf("contract pins %d interactions, want 1", len(contract.Interactions))
	}
	it := contract.Interactions[0]
	if it.Request.Method != "POST" || it.Request.Path != "/orders" {
		t.Errorf("contract interaction = %s %s, want POST /orders", it.Request.Method, it.Request.Path)
	}
	if it.Response.Status != 201 {
		t.Errorf("contract response status = %d, want 201", it.Response.Status)
	}

	provider := generators.ReferenceProvider(op, e)
	result := generators.VerifyContract(contract, provider)
	if !result.Pass {
		t.Fatalf("createOrder route did NOT pass its contract test: %s", result.Reason)
	}
	if len(result.Interactions) != 1 {
		t.Errorf("verified %d interactions, want 1", len(result.Interactions))
	}
}

// Contract (negative) — a provider that drops a field FAILS verification (honesty: the
// verifier is not a rubber stamp; it actually asserts the field set).
func TestAPIContract_DroppedFieldFails(t *testing.T) {
	op, e := generators.ExampleCreateOrderOp(), entities.Order()
	contract, _ := generators.EmitContract(op, e)
	bad := func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":1}`)) // drops every other field
	}
	if generators.VerifyContract(contract, bad).Pass {
		t.Fatal("a provider dropping fields must FAIL provider verification (the field-set assertion)")
	}
}
