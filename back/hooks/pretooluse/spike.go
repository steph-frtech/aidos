// spike.go — wires the dormant spike-confinement gate (back/hooks/spike-confinement,
// S28/ADR 0023) INTO the live PreToolUse path (the wall hook fired by .claude/settings.json),
// so it FIRES on every Edit/Write/harvest the agent attempts WHILE an idea is `spiking`
// (ratchet OFF, rigor T0, KRD §84/§60.x) — and on every /harvest that would freeze the
// kernel/mirrors directly (KRD §116/§118).
//
// THE TRIGGER (the smallest wiring). The harness / the idea-intake MCP INJECTS two fields
// onto the PreToolUse event: idea_status (the lifecycle status of the idea driving the
// write, e.g. "spiking") and gesture ("spike"|"harvest"). When the event carries
// idea_status="spiking" OR gesture="harvest", this gate runs BEFORE the bare zone wall
// (Classify) and refuses the SAME way the dormant spike-confinement binary would; otherwise
// it is a no-op and the bare wall decides exactly as before (strictly ADDITIVE — the wall's
// regression mirrors pass UNCHANGED, anti-overwrite §9).
//
// DETERMINISM-FIRST (CLAUDE.md §6/§8): this gate DEFERS to the pure, total exploration
// predicates (exploration.CheckSpikeWrite, exploration.CheckHarvestWrite) — the SAME single
// source the standalone spike-confinement binary defers to. It re-implements NO decision; it
// only adapts the PreToolUse Event into the predicate inputs and adapts the resulting
// runtime/blockreason.BlockReason back onto the wall's BlockReason (JSON-identical shape).
//
// THE WALL (CLAUDE.md §2): the gate is level-1 defense-in-depth and WRITES NOTHING. It reads
// the idea status from the INJECTED event field — it never reaches into the kernel/mirrors
// schemas (the agent has no GRANT; that would be a truth read). Fail-closed: an unparseable
// event is already denied upstream in Run; a spiking write that escapes /spike is denied.
package main

import (
	"github.com/steph-frtech/aidos/back/hooks/pretooluse/wall"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
	"github.com/steph-frtech/aidos/back/runtime/exploration"
)

// statusSpiking mirrors ideas.StatusSpiking without importing the kernel here — the gate is
// below the waterline and reads only the injected string (the canonical value is kept in
// sync by the exploration BDD/property mirrors). It matches the dormant binary's constant.
const statusSpiking = "spiking"

// gestureHarvest is the harvest exploration gesture the harness injects on a harvest write
// (the spike branch keys off IdeaStatus=="spiking", not the "spike" gesture string, so a
// spiking write is confined whatever gesture rides it).
const gestureHarvest = "harvest"

// EvaluateSpike is the gate's PURE decision over a decoded PreToolUse event, deferring to the
// exploration predicates. It returns (Decision, true) when the event is in scope of the gate
// (a harvest gesture, or a spiking-idea write) and a verdict was reached; (zero, false) when
// the gate does not apply and the caller must fall through to the bare zone wall.
//
//   - gesture "harvest" targeting a truth schema ⇒ deny HARVEST_CANNOT_FREEZE ;
//   - gesture "harvest" otherwise                ⇒ allow (proposal — not this gate's concern) ;
//   - a spiking idea's write outside /spike       ⇒ deny SPIKE_WRITE_ESCAPES_ZONE ;
//   - a spiking idea's write under /spike         ⇒ allow ;
//   - anything else                               ⇒ (zero, false): fall through to the wall.
func EvaluateSpike(ev Event) (Decision, bool) {
	if ev.Gesture == gestureHarvest {
		if br := exploration.CheckHarvestWrite(harvestTarget(ev)); br != nil {
			return Decision{Verdict: VerdictDeny, BlockReason: adaptBlock(br)}, true
		}
		return Decision{Verdict: VerdictAllow}, true
	}
	if ev.IdeaStatus == statusSpiking {
		if br := exploration.CheckSpikeWrite(exploration.SpikeWrite{Path: spikePath(ev)}); br != nil {
			return Decision{Verdict: VerdictDeny, BlockReason: adaptBlock(br)}, true
		}
		return Decision{Verdict: VerdictAllow}, true
	}
	return Decision{}, false
}

// harvestTarget is the truth-schema target a harvest write aims at: the explicit schema
// field (flat or nested) wins; harvest is judged on the schema it would freeze, not a path.
func harvestTarget(ev Event) string {
	if ev.Schema != "" {
		return ev.Schema
	}
	return ev.ToolInput.Schema
}

// spikePath is the RAW on-disk write target a spiking session attempts. The spike zone
// "/spike" is an ABSOLUTE prefix (KRD §84), so the gate inspects the un-normalised path: the
// injected SpikePath wins (the shim passes the file_path verbatim, leading slash intact),
// falling back to the flat Path then the Claude Code nested file_path for a raw in-Go probe.
func spikePath(ev Event) string {
	if ev.SpikePath != "" {
		return ev.SpikePath
	}
	if ev.Path != "" {
		return ev.Path
	}
	return ev.ToolInput.FilePath
}

// adaptBlock maps the exploration core's runtime/blockreason.BlockReason onto the wall's
// BlockReason (the JSON-identical refusal shape Run() already emits). It copies, never
// re-authors: the code/severity/explanation/how_to_fix come verbatim from the single-sourced
// reason registry, so `aidos explain` and the Workbench render the SAME actionable door.
func adaptBlock(br *blockreason.BlockReason) *wall.BlockReason {
	if br == nil {
		return nil
	}
	fix := make([]string, len(br.HowToFix))
	copy(fix, br.HowToFix)
	return &wall.BlockReason{
		Code:        wall.BlockCode(br.Code),
		Severity:    string(br.Severity),
		Explanation: br.Explanation,
		HowToFix:    fix,
	}
}
