// Package selfcert is the S84 Runtime COMPUTATIONAL SELF-CERTIFICATION of the build loop —
// the deterministic SENSOR BATTERY that gates EVERY diff the build-loop service (S83) takes.
// At each iteration the loop hands its candidate diff to Certify, which runs the REAL sensors
// over the emitted/affected tree and returns a per-sensor verdict. The iteration is GREEN only
// when EVERY sensor passes; a single red sensor BLOCKS the iteration BEFORE green is claimed.
//
// THE BATTERY (ROADMAP-app-builder S84 — the seven computational sensor kinds, §139/§140):
//
//	types     — the emitted code TYPES (tsc for the emitted TS tree / `go build` for Go).
//	lint      — the linter (Biome-or-ESLint for TS / gofmt/vet for Go).
//	unit      — the unit tests (Vitest / `go test`).
//	fixture   — the workflow fixtures (state → command → events).
//	property  — the invariant ∀ properties (fast-check / rapid).
//	pact      — the Pact CONTRACT between cells (consumer↔provider verification).
//	archfit   — the ARCH-FITNESS of the EMITTED tree (dependency-cruiser for the emitted TS
//	            tree, ADR 0036 routing §292 — go-arch-lint/depguard cease to apply to gen/;
//	            the emitted-functional rules CheckEmittedFunctional / CheckLLMIsolation are the
//	            in-process deterministic family).
//
// THE FAULT-INJECTION DONE-CRITERION (S84 mirror). A diff that breaks an ARCH BOUNDARY (an
// emitted-functional rule, an LLM-isolation rule, or a dependency-cruiser forbidden edge) or a
// PACT CONTRACT reddens the corresponding sensor and the iteration is BLOCKED before the loop
// can declare green. Certify NEVER lets a red battery through: GateGreen is a pure conjunction
// over every sensor verdict (anti-passthrough — a missing/unreadable sensor is RED, never
// silently green).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8). The battery is the canonical "the judge is the
// deterministic mirror, never the LLM": each sensor is a pure verdict over the diff (a parse /
// a type-check / a test run / an arch-fitness AST scan), NEVER an "LLM that judges if the code
// is good". Certify, GateGreen, ToStopSensors and Report are PURE, TOTAL functions over the
// SensorVerdict set — same verdicts ⇒ same battery verdict. The reproducibility mirror
// (selfcert_property_test.go) pins same-input → same-output. The only impure surface is the
// Runner port (it shells out to tsc/vitest/go test/dependency-cruiser); injected, scripted in
// tests so the gate replays deterministically.
//
// THE WALL (CLAUDE.md §2). This package WRITES NO TRUTH and returns VALUES: the Battery report
// and, on a red sensor, the actionable BUILD_LOOP_SENSOR_RED BlockReason. The sensors READ the
// sandbox tree (below the line, S82); they never write the kernel/mirrors/fitness. A loop that
// fails self-certification stops honestly (it never claims a green it did not earn, §8).
package selfcert

import (
	"sort"

	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/goal"
)

// SensorKind is one of the SEVEN closed computational sensor kinds the battery runs at each
// diff (ROADMAP S84). The set is CLOSED — a new sensor kind is a truth change (idée→miroir→
// /goal), never an ad-hoc string.
type SensorKind string

const (
	// SensorTypes — the emitted code type-checks (tsc / go build). A type error reddens it.
	SensorTypes SensorKind = "types"
	// SensorLint — the linter passes (Biome-or-ESLint / gofmt+vet).
	SensorLint SensorKind = "lint"
	// SensorUnit — the unit tests pass (Vitest / go test).
	SensorUnit SensorKind = "unit"
	// SensorFixture — the workflow fixtures (state→command→events) pass.
	SensorFixture SensorKind = "fixture"
	// SensorProperty — the invariant ∀ properties (fast-check / rapid) pass.
	SensorProperty SensorKind = "property"
	// SensorPact — the Pact CONTRACT between cells verifies (the contract sensor).
	SensorPact SensorKind = "pact"
	// SensorArchFit — the ARCH-FITNESS of the emitted tree (dependency-cruiser / emitted-
	// functional rules). A broken arch boundary reddens it.
	SensorArchFit SensorKind = "archfit"
)

// sensorOrder is the DECLARED canonical order the battery runs and reports its sensors in
// (never map iteration — projections must be stable). It also defines the FULL battery: a
// Certify input is only complete when it carries a verdict for every kind here.
var sensorOrder = []SensorKind{
	SensorTypes,
	SensorLint,
	SensorUnit,
	SensorFixture,
	SensorProperty,
	SensorPact,
	SensorArchFit,
}

// SensorKinds returns the seven closed sensor kinds in canonical order.
func SensorKinds() []SensorKind {
	out := make([]SensorKind, len(sensorOrder))
	copy(out, sensorOrder)
	return out
}

// IsKnownKind reports whether k is one of the seven closed sensor kinds.
func IsKnownKind(k SensorKind) bool {
	for _, kk := range sensorOrder {
		if kk == k {
			return true
		}
	}
	return false
}

// SensorState is a single sensor's CLOSED two-value verdict — there is NO "unknown": an
// unreadable / missing / errored sensor is treated as RED (anti-passthrough, KRD §82). The
// battery cannot go green on absent evidence.
type SensorState string

const (
	// SensorRed — the sensor failed (or its verdict is missing/unreadable). BLOCKS the iteration.
	SensorRed SensorState = "red"
	// SensorGreen — the sensor passed.
	SensorGreen SensorState = "green"
)

// SensorVerdict is ONE sensor's outcome over the candidate diff: its kind, its verdict, and —
// when red — the actionable Detail the BlockReason surfaces (which arch boundary, which Pact
// contract, which type error). Pure data, a projection of what the sensor reported.
type SensorVerdict struct {
	Kind   SensorKind  `json:"kind"`
	State  SensorState `json:"state"`
	Detail string      `json:"detail,omitempty"`
}

// Battery is the FULL self-certification report over one diff — the seven sensor verdicts in
// canonical order plus the COMPUTED gate verdict. It is produced by Certify and consumed by
// the build loop (it feeds goal.IsClosed via ToStopSensors) and by the console (S86). The
// gate is GREEN iff every sensor is green.
type Battery struct {
	// Sensors are the seven sensor verdicts in canonical order (always the full battery).
	Sensors []SensorVerdict `json:"sensors"`
	// Green is the COMPUTED conjunction: true iff every sensor is green. NEVER declared.
	Green bool `json:"green"`
	// BlockReason is the actionable BUILD_LOOP_SENSOR_RED refusal when the battery is red,
	// nil when green. A green battery is not a refusal.
	BlockReason *blockreason.BlockReason `json:"block_reason,omitempty"`
}

// CodeBuildLoopSensorRed is the S84 self-certification refusal: a computational sensor reddened
// the candidate diff, so the iteration is blocked before green. Declared here with its rule
// (the self-cert battery owns it), surfaced on every red battery.
const CodeBuildLoopSensorRed blockreason.Code = "BUILD_LOOP_SENSOR_RED"

// GateGreen is the PURE, TOTAL conjunction over a set of sensor verdicts: true iff EVERY one of
// the seven canonical sensors is present AND green (anti-passthrough — a MISSING kind is red,
// never silently green; an unknown extra kind is ignored). Same verdicts ⇒ same gate. This is
// the determinism-first heart: the iteration's green is a function of the sensor mirrors, never
// the LLM's word.
func GateGreen(verdicts []SensorVerdict) bool {
	byKind := indexVerdicts(verdicts)
	for _, k := range sensorOrder {
		v, ok := byKind[k]
		if !ok || v.State != SensorGreen {
			return false // anti-passthrough: missing or red ⇒ not green
		}
	}
	return true
}

// indexVerdicts folds a verdict slice into a kind→verdict map, last-wins on a duplicate (a
// later sensor run supersedes an earlier one for the same kind). Pure helper.
func indexVerdicts(verdicts []SensorVerdict) map[SensorKind]SensorVerdict {
	m := make(map[SensorKind]SensorVerdict, len(verdicts))
	for _, v := range verdicts {
		m[v.Kind] = v
	}
	return m
}

// RedSensors returns the kinds of every sensor that is NOT green (red or missing), in canonical
// order — the precise list a BlockReason names. Pure.
func RedSensors(verdicts []SensorVerdict) []SensorKind {
	byKind := indexVerdicts(verdicts)
	var red []SensorKind
	for _, k := range sensorOrder {
		v, ok := byKind[k]
		if !ok || v.State != SensorGreen {
			red = append(red, k)
		}
	}
	return red
}

// Certify is the PURE assembly of the full Battery report from a complete set of sensor
// verdicts (the impure sensor RUNS happen in the Runner port; Certify is the deterministic
// judge over their results). It normalises the verdicts into canonical order, computes the
// gate, and attaches the actionable BlockReason when red. Same verdicts ⇒ same Battery.
//
// THE GATE (S84): Green is GateGreen(verdicts) — a pure conjunction. A diff that breaks an
// arch boundary or a Pact contract arrives here as a RED archfit/pact verdict, so Green is
// false and the BlockReason fires: the iteration is blocked BEFORE green. Certify never lets a
// red battery declare green (anti-passthrough).
func Certify(verdicts []SensorVerdict) Battery {
	byKind := indexVerdicts(verdicts)
	ordered := make([]SensorVerdict, 0, len(sensorOrder))
	for _, k := range sensorOrder {
		if v, ok := byKind[k]; ok {
			ordered = append(ordered, v)
		} else {
			// A missing sensor is materialised RED (anti-passthrough), so the report is the
			// full battery and the gate cannot pass on absent evidence.
			ordered = append(ordered, SensorVerdict{Kind: k, State: SensorRed, Detail: "sensor not run"})
		}
	}
	green := GateGreen(ordered)
	b := Battery{Sensors: ordered, Green: green}
	if !green {
		b.BlockReason = sensorRedBlockReason(RedSensors(ordered), byKind)
	}
	return b
}

// sensorRedBlockReason builds the canonical actionable BUILD_LOOP_SENSOR_RED refusal — code,
// blocking severity, French explanation naming the red sensors (with their detail), non-empty
// how_to_fix (never a prison, KRD §44.5). Pure constructor.
func sensorRedBlockReason(red []SensorKind, byKind map[SensorKind]SensorVerdict) *blockreason.BlockReason {
	names := make([]string, 0, len(red))
	for _, k := range red {
		if v, ok := byKind[k]; ok && v.Detail != "" {
			names = append(names, string(k)+" ("+v.Detail+")")
		} else {
			names = append(names, string(k))
		}
	}
	list := joinFR(names)
	return &blockreason.BlockReason{
		Code:     CodeBuildLoopSensorRed,
		Severity: blockreason.SeverityBlocking,
		Explanation: "Refus d'auto-certification — la boucle-build (S84) auto-certifie CHAQUE diff sur les senseurs " +
			"computationnels réels (types/lint/unit/fixtures/propriétés/contrat Pact/arch-fitness de l'arbre émis). " +
			"Un ou plusieurs senseurs sont ROUGES : " + list + ". L'itération est BLOQUÉE avant que le vert soit " +
			"revendiqué — le juge est le miroir déterministe, jamais le LLM (CLAUDE.md §8). Un diff qui casse une " +
			"frontière arch (dependency-cruiser / mandat fonctionnel émis) ou un contrat Pact rougit son senseur ici.",
		HowToFix: []string{
			"fix_the_diff : corrigez le diff candidat pour faire passer le(s) senseur(s) rouge(s) — le vert se calcule, il ne se déclare pas (§8).",
			"read_the_sensor : ouvrez le détail du senseur rouge (l'erreur de type / le contrat Pact rompu / la frontière arch franchie) ; chaque senseur est déterministe et reproductible.",
			"no_bypass : une itération ne peut pas être déclarée verte tant qu'un senseur est rouge (anti-passthrough) ; il n'y a pas de contournement — c'est le mur §8.",
		},
	}
}

// joinFR joins a list of names with French enumeration (« a, b et c »). Pure helper.
func joinFR(names []string) string {
	switch len(names) {
	case 0:
		return "(aucun)"
	case 1:
		return names[0]
	default:
		head := names[:len(names)-1]
		out := ""
		for i, h := range head {
			if i > 0 {
				out += ", "
			}
			out += h
		}
		return out + " et " + names[len(names)-1]
	}
}

// ToStopSensors projects a Battery onto the goal.StopInput.Sensors map keyed by the red-set
// mirror refs — the bridge from "which computational sensors passed" to the NON-GAMEABLE Stop
// (S83 buildloop.Drive reuses goal.IsClosed verbatim). The rule is honest and fail-closed: if
// the battery is NOT green, EVERY red-set mirror is marked SensorRed (the iteration cannot
// close); only a fully-green battery marks the red-set mirrors green. So the loop can declare
// GREEN only when the whole computational battery passed — it cannot fabricate a pass. Pure.
func ToStopSensors(redSet []string, b Battery) map[string]goal.SensorState {
	state := goal.SensorRed
	if b.Green {
		state = goal.SensorGreen
	}
	out := make(map[string]goal.SensorState, len(redSet))
	for _, m := range redSet {
		out[m] = state
	}
	return out
}

// Report is a STABLE, sorted human/console projection of a battery: the red sensor kinds first
// (so the console surfaces the blockers), then green, each as "kind:state". Pure, deterministic.
func Report(b Battery) []string {
	type row struct {
		kind  string
		state string
		red   bool
	}
	rows := make([]row, 0, len(b.Sensors))
	for _, s := range b.Sensors {
		rows = append(rows, row{kind: string(s.Kind), state: string(s.State), red: s.State != SensorGreen})
	}
	sort.SliceStable(rows, func(i, j int) bool {
		if rows[i].red != rows[j].red {
			return rows[i].red // red first
		}
		return rows[i].kind < rows[j].kind
	})
	out := make([]string, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.kind+":"+r.state)
	}
	return out
}
