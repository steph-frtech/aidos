package generators_test

// Re-emit byte-equality guard (S36): the materialized back/gen/api/order.go +
// createOrder.pact.json on disk MUST equal what EmitAPI/EmitContract render from the
// same sources. A hand-edit of the generated handler (forbidden, CLAUDE.md §4/§9) is
// caught here — gen/ never drifts from its source. reflects=back/gen/api materialization,
// test_kind=integration (filesystem), liveness=live, authority=below.

import (
	"os"
	"testing"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

func TestMaterializedAPIHandlerMatchesEmit(t *testing.T) {
	art, br := generators.EmitAPI(generators.ExampleCreateOrderOp(), entities.Order())
	if br != nil {
		t.Fatalf("EmitAPI BlockReason: %+v", br)
	}
	onDisk, err := os.ReadFile("../../gen/api/order.go")
	if err != nil {
		t.Skipf("materialized handler not present (run materialize-api): %v", err)
	}
	if string(onDisk) != string(art.Bytes) {
		t.Fatal("back/gen/api/order.go drifted from EmitAPI output — gen/ is generated-only, never hand-edited")
	}
}

func TestMaterializedContractMatchesEmit(t *testing.T) {
	contract, br := generators.EmitContract(generators.ExampleCreateOrderOp(), entities.Order())
	if br != nil {
		t.Fatalf("EmitContract BlockReason: %+v", br)
	}
	want, err := generators.ContractJSON(contract)
	if err != nil {
		t.Fatalf("ContractJSON: %v", err)
	}
	onDisk, err := os.ReadFile("../../gen/api/createOrder.pact.json")
	if err != nil {
		t.Skipf("materialized contract not present (run materialize-api): %v", err)
	}
	if string(onDisk) != string(want) {
		t.Fatal("back/gen/api/createOrder.pact.json drifted from EmitContract output")
	}
}
