// cmd/verdict — THROWAWAY (DP10 spike). Runs the REAL probe: snapshot host state,
// build the pure plan, bootstrap the throwaway stack TWICE (teardown between),
// measure deploy.sh's bytes, score the candidates, print the verdict as JSON.
// Exit code 0 = go, 1 = no-go (the verdict is a measure, usable by a script).
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"

	bootstrap "aidos.spike/bootstrap"
)

func main() {
	b := bootstrap.Fixture()
	bootstrap.Teardown(b) // idempotent pre-clean from any prior aborted probe

	state, err := bootstrap.SnapshotObserved()
	if err != nil {
		fmt.Fprintln(os.Stderr, "snapshot:", err)
		os.Exit(2)
	}

	// purity measures on the SAME snapshot (the decision is taken before any effect).
	plan := bootstrap.BuildPlan(b, state)
	planAgain := bootstrap.BuildPlan(b, state)
	planDeterministic := reflect.DeepEqual(plan, planAgain)
	orderDeterministic := reflect.DeepEqual(
		bootstrap.StartOrder(b.Services),
		bootstrap.StartOrder([]bootstrap.Service{b.Services[2], b.Services[0], b.Services[1]}),
	)

	run1 := bootstrap.Bootstrap(b, plan)
	bootstrap.Teardown(b)
	run2 := bootstrap.Bootstrap(b, plan)
	bootstrap.Teardown(b)

	scriptBytes, err := os.ReadFile("/data/scripts/dockers/deploy.sh")
	if err != nil {
		fmt.Fprintln(os.Stderr, "deploy.sh:", err)
		os.Exit(2)
	}
	script := bootstrap.MeasureScript(string(scriptBytes))

	m := bootstrap.Measurement{
		PlanDeterministic:  planDeterministic,
		OrderDeterministic: orderDeterministic,
		Run1:               run1,
		Run2:               run2,
		RunsReproducible:   bootstrap.Reproducible(run1, run2),
		Script:             script,
		Candidates:         bootstrap.ScoreCandidates(script),
	}
	v := bootstrap.Decide(m)

	out := struct {
		Verdict bootstrap.Verdict       `json:"verdict"`
		Harvest bootstrap.HarvestRecord `json:"harvest"`
	}{v, bootstrap.Harvest(v)}
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(out)

	if !v.Go {
		os.Exit(1)
	}
}
