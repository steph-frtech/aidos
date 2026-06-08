// runner.go — the IMPURE boundary of the S84 self-certification battery and its bridge to the
// S83 build loop. selfcert.go is the PURE deterministic judge (Certify / GateGreen); this file
// holds the injected Runner PORT (which actually shells out to tsc / Biome / Vitest / go test /
// the fixture & property runners / the Pact verifier / dependency-cruiser) and the CertifiedSensors
// adapter that makes the loop's notion of "green" COME FROM the real battery.
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The ONLY non-deterministic surface is the Runner (it
// runs external processes over the sandbox tree). It is isolated behind one interface and its
// per-sensor result is folded by the PURE Certify into the battery verdict. The loop never
// trusts the LLM's word for green — green is the conjunction of the real sensor mirrors. A
// scripted Runner replays the whole gate byte-identically (the fixture mirror pins it).
package selfcert

import "github.com/steph-frtech/aidos/back/runtime/goal"

// Runner is the impure PORT that RUNS one sensor kind over the candidate diff in the sandbox
// and reports its verdict. The build adapter implements it by shelling out to the real tool
// (tsc / Biome / Vitest / go test / fixture & property runners / Pact verifier / dependency-
// cruiser). It is injected so the battery and the loop replay deterministically in tests.
type Runner interface {
	// RunSensor runs ONE sensor kind over the sandbox at sandboxDir for the goal and returns
	// its verdict. It MUST return a verdict for the requested kind; a tool that errors / cannot
	// be run yields SensorRed (anti-passthrough — never silently green).
	RunSensor(kind SensorKind, sandboxDir string, g goal.Goal) SensorVerdict
}

// RunBattery runs the FULL seven-sensor battery over the candidate diff via the Runner and
// folds the results with the pure Certify into the gated report. It runs the sensors in the
// declared canonical order (stable, no map iteration). A sensor the Runner fails to return is
// materialised RED by Certify (anti-passthrough). The verdict is deterministic given a
// deterministic Runner.
func RunBattery(r Runner, sandboxDir string, g goal.Goal) Battery {
	verdicts := make([]SensorVerdict, 0, len(sensorOrder))
	for _, k := range sensorOrder {
		v := r.RunSensor(k, sandboxDir, g)
		// Force the reported kind to the requested kind (a misreporting Runner cannot smuggle a
		// green verdict under a different kind past the gate).
		v.Kind = k
		verdicts = append(verdicts, v)
	}
	return Certify(verdicts)
}

// CertifiedSensors is the ADAPTER that plugs the S84 battery into the S83 build loop's Sensors
// port (buildloop.Sensors). The loop calls Sensors.Run(goal) to learn which mirrors are green;
// CertifiedSensors answers by RUNNING THE REAL BATTERY: the red-set mirrors are reported green
// ONLY when the whole computational battery passed. A diff that breaks an arch boundary or a
// Pact contract yields a red battery here, so NO red-set mirror is green and the loop CANNOT
// declare green — the iteration is blocked before green (the S84 done-criterion).
//
// It also EXPOSES the Last battery report (for the console S86 / the AgentRun record) so the
// per-iteration self-certification is observable. Because Run mutates Last, a CertifiedSensors
// drives one loop at a time (the loop is sequential by construction).
type CertifiedSensors struct {
	Runner     Runner
	SandboxDir string
	// Last is the most recent battery the adapter computed — the per-iteration self-cert report.
	Last Battery
}

// Run implements buildloop.Sensors: it runs the real battery and returns the red-set mirror
// refs that are green. Honest and fail-closed: it returns the red set as green ONLY when the
// battery is fully green; otherwise it returns NONE (so every red-set mirror is red and the
// non-gameable Stop cannot close). The battery is stored in Last for observation.
func (c *CertifiedSensors) Run(g goal.Goal) []string {
	battery := RunBattery(c.Runner, c.SandboxDir, g)
	c.Last = battery
	if !battery.Green {
		return nil // a red battery ⇒ no mirror is green ⇒ the iteration is blocked before green
	}
	out := make([]string, len(g.RedSet))
	copy(out, g.RedSet)
	return out
}
