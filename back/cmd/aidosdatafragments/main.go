// Command aidosdatafragments emits the DP15 DATA-SUBSTRATE service fragments of
// the emitted app as DETERMINISTIC JSON for the /substrate Workbench panel. It is
// a thin CLI shell over runtime/datafragments (the authoritative Go, never forked
// in TS): given -project and -env it prints, on stdout, the FULL palette door
// (surfacing the DP06 doltgres-in-prod refusal VERBATIM) plus the legal core slice
// and each fragment's content address — the panel reads this single source.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): the body is a pure projection of the closed
// palette; same (-project, -env) ⇒ byte-identical JSON. No LLM, no clock, no RNG.
// THE WALL (§2): below-the-line projection, writes NO truth (no kernel/mirrors/
// fitness, no gen/ file) — it only renders the fragments to stdout.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"

	"github.com/steph-frtech/aidos/back/kernel/scope"
	"github.com/steph-frtech/aidos/back/runtime/datafragments"
	"github.com/steph-frtech/aidos/back/runtime/envbindings"
)

// fragmentOut is the per-fragment JSON the panel renders: the ServiceFragment plus
// its content address (HashFragment — the byte-identity / isolation oracle).
type fragmentOut struct {
	datafragments.ServiceFragment
	Hash string `json:"hash"`
}

// output is the full DP15 emission the panel consumes for one (project, env).
type output struct {
	ProjectID string `json:"project_id"`
	Env       string `json:"env"`
	// FullOK is true when the full palette door returned no refusal (off prod), so
	// Full carries the four fragments. In prod FullOK is false and Refusal is set.
	FullOK bool          `json:"full_ok"`
	Full   []fragmentOut `json:"full"`
	// Refusal carries the DP06 verdict VERBATIM when the full door refuses (prod ×
	// doltgres ⇒ DOLTGRES_NOT_ALLOWED_IN_PROD).
	Refusal *refusalOut `json:"refusal,omitempty"`
	// Core is the legal core slice (omits the forbidden doltgres in prod, no error).
	Core []fragmentOut `json:"core"`
	// Keys is the closed palette key set in canonical order.
	Keys []string `json:"keys"`
}

type refusalOut struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func toOut(frags []datafragments.ServiceFragment) ([]fragmentOut, error) {
	out := make([]fragmentOut, 0, len(frags))
	for _, f := range frags {
		h, err := datafragments.HashFragment(f)
		if err != nil {
			return nil, err
		}
		out = append(out, fragmentOut{ServiceFragment: f, Hash: h})
	}
	return out, nil
}

func main() {
	project := flag.String("project", "", "the project the fragments are isolated to")
	env := flag.String("env", "dev", "the deployment environment (prod|staging|dev|local|future_cloud)")
	flag.Parse()

	res := output{
		ProjectID: *project,
		Env:       *env,
		Keys:      datafragments.Keys(),
	}

	// The full palette door — surfaces the DP06 refusal verbatim in prod.
	full, err := datafragments.SubstrateDataFragments(*project, scope.Environment(*env))
	if err != nil {
		var ref *envbindings.Refusal
		if errors.As(err, &ref) {
			res.FullOK = false
			res.Refusal = &refusalOut{Code: ref.Code, Message: ref.Message}
		} else {
			fmt.Fprintln(os.Stderr, "aidosdatafragments:", err)
			os.Exit(1)
		}
	} else {
		fullOut, ferr := toOut(full)
		if ferr != nil {
			fmt.Fprintln(os.Stderr, "aidosdatafragments:", ferr)
			os.Exit(1)
		}
		res.FullOK = true
		res.Full = fullOut
	}

	// The legal core slice — never errors for a known env (omits the gated fragment).
	core, cerr := datafragments.SubstrateCoreFragments(*project, scope.Environment(*env))
	if cerr != nil {
		var ref *envbindings.Refusal
		if errors.As(cerr, &ref) {
			// An unknown env is the only core refusal; surface it on stderr + exit.
			fmt.Fprintln(os.Stderr, "aidosdatafragments:", ref.Error())
			os.Exit(1)
		}
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", cerr)
		os.Exit(1)
	}
	coreOut, ferr := toOut(core)
	if ferr != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", ferr)
		os.Exit(1)
	}
	res.Core = coreOut

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(res); err != nil {
		fmt.Fprintln(os.Stderr, "aidosdatafragments:", err)
		os.Exit(1)
	}
}
