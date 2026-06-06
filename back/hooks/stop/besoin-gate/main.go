package main

import (
	"encoding/json"
	"io"
	"os"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// Run is the binary entrypoint: decode the Stop event, compute the PURE gate decision (Decide),
// write the BlockReason JSON to stdout on a block, and return the process exit code (0 = allow,
// 2 = block). A decode error fails CLOSED (block) — an unparseable event is a failure made
// explicit (KRD §82), never a silent pass. A no-op (no `besoin` session) writes nothing and
// allows (the hook does not over-fire — §5).
func Run(stdin io.Reader, stdout io.Writer) int {
	ev, err := DecodeEvent(stdin)
	if err != nil {
		writeBlock(stdout, []blockreason.BlockReason{blockBecauseUndecodable(err)})
		return exitBlock
	}

	d := Decide(ev)
	if d.Verdict == VerdictBlock {
		writeBlock(stdout, d.BlockReasons)
	}
	return ExitCode(d)
}

// writeBlock encodes the actionable refusals to stdout so the harness surfaces them.
func writeBlock(w io.Writer, reasons []blockreason.BlockReason) {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(reasons)
}

func main() {
	os.Exit(Run(os.Stdin, os.Stdout))
}
