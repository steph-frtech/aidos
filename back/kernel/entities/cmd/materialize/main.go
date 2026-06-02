// Command materialize is the deterministic materializer for the kernel ENTITY source
// projections: it emits the Order entity's three projections to disk
// (back/gen/order-entity/ and front/web/gen/order-entity/), each carrying the protected
// header. It reads the entity AST (here the in-repo Order example, the agent-side
// SELECT-only mirror of kernel.entity) and writes ONLY gen/ files BELOW the wall — it
// writes no truth. Re-running it is a no-op diff when no source changed (byte-identical,
// the determinism contract). gen/ is generated-only (CLAUDE.md §4/§9): to change a
// projection, change the SOURCE (the Order entity) and re-emit, never edit the output.
//
// Usage (from back/): go run ./kernel/entities/cmd/materialize -root ..
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/steph-frtech/aidos/back/kernel/entities"
)

func main() {
	root := flag.String("root", "..", "repo root the relative artifact paths resolve against (back/gen + front/web/gen)")
	flag.Parse()

	order := entities.Order()
	for _, target := range entities.Targets() {
		a, br := entities.Emit(order, target)
		if br != nil {
			fmt.Fprintf(os.Stderr, "blocked: %s\n", br.Explanation)
			os.Exit(1)
		}
		dst := filepath.Join(*root, a.Path)
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			fmt.Fprintf(os.Stderr, "mkdir %s: %v\n", dst, err)
			os.Exit(1)
		}
		if err := os.WriteFile(dst, a.Bytes, 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "write %s: %v\n", dst, err)
			os.Exit(1)
		}
		fmt.Printf("emitted %-8s %s  source:%s  output:%s\n", a.Target, a.Path, a.SourceHash[:12], a.OutputHash[:12])
	}
}
