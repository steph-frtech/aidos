// Command materialize is the /project gesture's deterministic materializer: it
// emits the example entities' projections to disk (back/gen/<entity>/ and
// front/web/gen/<entity>/). It is the harness step that writes the projections
// BELOW the wall — it reads the entity AST (here the in-repo examples) and writes
// only gen/ files, each carrying the protected header. Re-running it is a no-op diff
// when no source changed (byte-identical, the determinism contract).
//
// Usage (from back/): go run ./runtime/generators/cmd/materialize -root .
package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"github.com/steph-frtech/aidos/back/runtime/generators"
)

func main() {
	root := flag.String("root", ".", "repo back/ root the relative artifact paths resolve against (use the repo root for front/web)")
	flag.Parse()

	arts, br := generators.Project(generators.ExampleSet(), generators.Targets())
	if br != nil {
		fmt.Fprintf(os.Stderr, "blocked: %s\n", br.Explanation)
		os.Exit(1)
	}
	for _, a := range arts {
		dst := filepath.Join(*root, a.Path)
		if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
			fmt.Fprintf(os.Stderr, "mkdir %s: %v\n", dst, err)
			os.Exit(1)
		}
		if err := os.WriteFile(dst, a.Bytes, 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "write %s: %v\n", dst, err)
			os.Exit(1)
		}
		fmt.Printf("emitted %-10s %s  source:%s  output:%s\n", a.Target, a.Path, a.SourceHash[:12], a.OutputHash[:12])
	}
}
