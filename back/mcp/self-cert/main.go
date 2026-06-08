// Command self-cert is the AIDOS Runtime build-loop SELF-CERTIFICATION MCP server (S84; ADR
// 0009: every backend op is an MCP tool).
//
// It is the capability door over the S84 self-certification battery (back/runtime/buildloop/
// selfcert): the deterministic SENSOR BATTERY that gates EVERY diff the build-loop service (S83)
// takes. Given a set of per-sensor verdicts over a candidate diff (types/lint/unit/fixtures/
// properties/Pact contract/arch-fitness of the emitted TS tree via dependency-cruiser), the
// server CERTIFIES the diff: the iteration is GREEN only when every sensor passes; a single red
// sensor (a broken arch boundary or Pact contract) BLOCKS the iteration before green, with the
// actionable BUILD_LOOP_SENSOR_RED BlockReason.
//
// THE WALL (CLAUDE.md §2): this server is PURE COMPUTATION — it folds the sensor verdicts into
// the battery report as VALUES and writes NOTHING. The sensor RUNS (tsc/Vitest/go test/
// dependency-cruiser…) happen in the build adapter over the sandbox (below the line, S82); this
// door judges their results. The kernel/mirrors/fitness are SELECT-only to the agent; there is
// no truth-write tool — a green build proposes its truth through propose→ChangeSet (S85).
//
// Tools (one tool = one backend op):
//
//	selfcert_certify — fold a set of per-sensor verdicts → the gated battery (green | red + BlockReason)
//	selfcert_gate    — the pure seven-sensor conjunction over a verdict set (true iff all green)
//	selfcert_kinds   — read the closed seven-value sensor-kind set
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): every tool is a PURE function of its input — the judge is
// the deterministic mirror, never the LLM. Same verdicts → same battery (anti-passthrough — a
// missing sensor is RED, never silently green). The reproducibility mirrors
// (selfcert_property_test.go + lib/self-cert.test.ts) pin it. Transport: stdio.
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steph-frtech/aidos/back/runtime/buildloop/selfcert"
)

// ── Tool I/O types (flat, JSON-schema-tagged for the picker) ──

type sensorVerdictIn struct {
	Kind   string `json:"kind" jsonschema:"the sensor kind: types|lint|unit|fixture|property|pact|archfit"`
	Green  bool   `json:"green" jsonschema:"true iff the sensor passed over the candidate diff"`
	Detail string `json:"detail,omitempty" jsonschema:"when red, which type error / Pact contract / arch boundary failed"`
}

type certifyInput struct {
	RedSet   []string          `json:"red_set,omitempty" jsonschema:"the goal's red-set mirror refs the battery gates (for the Stop projection)"`
	Verdicts []sensorVerdictIn `json:"verdicts" jsonschema:"the per-sensor verdicts over the candidate diff (the seven kinds; a missing kind is treated RED)"`
}

type sensorVerdictOut struct {
	Kind   string `json:"kind"`
	State  string `json:"state"` // green | red
	Detail string `json:"detail,omitempty"`
}

type certifyOutput struct {
	Green       bool               `json:"green"`   // the COMPUTED gate: true iff every sensor green
	Sensors     []sensorVerdictOut `json:"sensors"` // the full battery in canonical order
	RedSensors  []string           `json:"red_sensors,omitempty"`
	BlockCode   string             `json:"block_code,omitempty"` // BUILD_LOOP_SENSOR_RED when red
	Explanation string             `json:"explanation,omitempty"`
	HowToFix    []string           `json:"how_to_fix,omitempty"`
	StopSensors map[string]string  `json:"stop_sensors,omitempty"` // red-set mirror → green|red (the non-gameable Stop projection)
}

type gateInput struct {
	Verdicts []sensorVerdictIn `json:"verdicts" jsonschema:"the per-sensor verdicts over the candidate diff"`
}
type gateOutput struct {
	Green bool `json:"green"`
}

type kindsOutput struct {
	Kinds []string `json:"kinds"`
}

func toVerdicts(in []sensorVerdictIn) []selfcert.SensorVerdict {
	out := make([]selfcert.SensorVerdict, 0, len(in))
	for _, v := range in {
		state := selfcert.SensorRed
		if v.Green {
			state = selfcert.SensorGreen
		}
		out = append(out, selfcert.SensorVerdict{Kind: selfcert.SensorKind(v.Kind), State: state, Detail: v.Detail})
	}
	return out
}

// certify is the selfcert_certify tool: fold the per-sensor verdicts into the gated battery. PURE.
func certify(_ context.Context, _ *mcp.CallToolRequest, in certifyInput) (*mcp.CallToolResult, certifyOutput, error) {
	b := selfcert.Certify(toVerdicts(in.Verdicts))

	sensors := make([]sensorVerdictOut, 0, len(b.Sensors))
	for _, s := range b.Sensors {
		sensors = append(sensors, sensorVerdictOut{Kind: string(s.Kind), State: string(s.State), Detail: s.Detail})
	}
	red := selfcert.RedSensors(b.Sensors)
	redNames := make([]string, 0, len(red))
	for _, k := range red {
		redNames = append(redNames, string(k))
	}

	out := certifyOutput{Green: b.Green, Sensors: sensors, RedSensors: redNames}
	if b.BlockReason != nil {
		out.BlockCode = string(b.BlockReason.Code)
		out.Explanation = b.BlockReason.Explanation
		out.HowToFix = b.BlockReason.HowToFix
	}
	if len(in.RedSet) > 0 {
		stop := selfcert.ToStopSensors(in.RedSet, b)
		out.StopSensors = make(map[string]string, len(stop))
		for m, st := range stop {
			out.StopSensors[m] = string(st)
		}
	}
	return nil, out, nil
}

// gate is the selfcert_gate tool: the pure seven-sensor conjunction. PURE.
func gate(_ context.Context, _ *mcp.CallToolRequest, in gateInput) (*mcp.CallToolResult, gateOutput, error) {
	return nil, gateOutput{Green: selfcert.GateGreen(toVerdicts(in.Verdicts))}, nil
}

// kinds is the selfcert_kinds tool: the closed seven-value sensor-kind set.
func kinds(_ context.Context, _ *mcp.CallToolRequest, _ struct{}) (*mcp.CallToolResult, kindsOutput, error) {
	ks := selfcert.SensorKinds()
	out := kindsOutput{Kinds: make([]string, len(ks))}
	for i, k := range ks {
		out.Kinds[i] = string(k)
	}
	return nil, out, nil
}

func newMCPServer() *mcp.Server {
	srv := mcp.NewServer(&mcp.Implementation{Name: "aidos-self-cert", Version: "v0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{Name: "selfcert_certify", Description: "S84: self-certify a candidate diff over the real computational sensor battery (types/lint/unit/fixtures/properties/Pact contract/arch-fitness of the emitted tree). Returns the gated battery — GREEN only when every sensor passes; a red arch boundary or Pact contract yields BUILD_LOOP_SENSOR_RED and blocks the iteration before green. Pure; the judge is the mirror, never the LLM (the wall)."}, certify)
	mcp.AddTool(srv, &mcp.Tool{Name: "selfcert_gate", Description: "S84: the pure seven-sensor conjunction — true iff every canonical sensor is present and green (anti-passthrough: a missing or red sensor ⇒ not green)."}, gate)
	mcp.AddTool(srv, &mcp.Tool{Name: "selfcert_kinds", Description: "S84: read the closed seven-value sensor-kind set (types|lint|unit|fixture|property|pact|archfit), in canonical order."}, kinds)
	return srv
}

func main() {
	ctx := context.Background()
	srv := newMCPServer()
	if err := srv.Run(ctx, &mcp.StdioTransport{}); err != nil {
		log.Fatal(fmt.Errorf("self-cert: run: %w", err))
	}
}
