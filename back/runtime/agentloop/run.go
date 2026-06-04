// run.go — the runnable BA14 arch-fitness rule: scan the live module, apply the policy,
// produce a single pass/fail Verdict. This is what the CLI (`aidos check`), the MCP tool,
// and the Workbench panel call — one deterministic entry point, ONE declared policy.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). Run composes ScanModule (deterministic over a
// fixed tree) and CheckLLMIsolation (pure). Same tree + policy ⇒ same Verdict.
package agentloop

// Verdict is the runnable result of the BA14 arch-fitness rule over a scanned module:
// Passed iff no package outside the gated exception imports an LLM SDK. Violations is the
// full (deterministic, ordered) list when it fails — each carries its actionable
// BlockReason.
type Verdict struct {
	Passed     bool        `json:"passed"`
	Violations []Violation `json:"violations"`
	// ScannedModule is the import path prefix scanned (for the panel/telemetry).
	ScannedModule string `json:"scanned_module"`
}

// Run scans dir as modulePrefix, applies p, and returns the Verdict. A pure-as-possible
// composition: the only I/O is ScanModule reading the .go files.
func Run(dir, modulePrefix string, p Policy) (Verdict, error) {
	g, err := ScanModule(dir, modulePrefix)
	if err != nil {
		return Verdict{}, err
	}
	v := Eval(g, p, modulePrefix)
	return v, nil
}

// Eval is the PURE verdict over an already-built graph (the input the property mirror
// drives): same (graph, policy) ⇒ same Verdict, no I/O. Run is Eval ∘ ScanModule.
func Eval(g ImportGraph, p Policy, scannedModule string) Verdict {
	vs := CheckLLMIsolation(g, p)
	return Verdict{
		Passed:        len(vs) == 0,
		Violations:    vs,
		ScannedModule: scannedModule,
	}
}
