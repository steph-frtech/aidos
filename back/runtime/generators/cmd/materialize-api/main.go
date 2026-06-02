// Command materialize-api is the /project gesture for the API projection (S36): it
// emits the createOrder API handler + its Pact contract to disk under back/gen/api/,
// each carrying the protected header. It READS the operation + entity sources (here the
// in-repo examples, the agent-side SELECT-only mirror of the kernel) and writes ONLY
// gen/ files BELOW the wall — it writes no truth. Re-running it is a no-op diff when no
// source changed (byte-identical, the determinism contract). gen/api is generated-only
// (CLAUDE.md §4/§9): to change the handler, change the SOURCE (the operation / the
// entity) and re-emit, never edit the output.
//
// Usage (from back/): go run ./runtime/generators/cmd/materialize-api -root ..
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/steph-frtech/aidos/back/kernel/entities"
	"github.com/steph-frtech/aidos/back/runtime/generators"
)

func main() {
	root := flag.String("root", "..", "repo root the relative artifact paths resolve against (back/gen/api)")
	flag.Parse()

	op := generators.ExampleCreateOrderOp()
	order := entities.Order()

	art, br := generators.EmitAPI(op, order)
	if br != nil {
		fmt.Fprintf(os.Stderr, "blocked: %s\n", br.Explanation)
		os.Exit(1)
	}
	writeFile(filepath.Join(*root, art.Path), art.Bytes)

	contract, br := generators.EmitContract(op, order)
	if br != nil {
		fmt.Fprintf(os.Stderr, "blocked: %s\n", br.Explanation)
		os.Exit(1)
	}
	cj, err := generators.ContractJSON(contract)
	if err != nil {
		fmt.Fprintf(os.Stderr, "contract json: %v\n", err)
		os.Exit(1)
	}
	writeFile(filepath.Join(*root, "back/gen/api/createOrder.pact.json"), cj)

	fmt.Printf("materialized back/gen/api/order.go (source %s) + createOrder.pact.json\n", art.SourceHash)
}

func writeFile(dst string, data []byte) {
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "mkdir %s: %v\n", dst, err)
		os.Exit(1)
	}
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		fmt.Fprintf(os.Stderr, "write %s: %v\n", dst, err)
		os.Exit(1)
	}
}
