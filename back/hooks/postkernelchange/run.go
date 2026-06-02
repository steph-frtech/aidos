// Package main is the AIDOS PostKernelChange hook (CLAUDE.md §5: a non-bypassable rule →
// a Go hook binary). On a kernel hash change it runs the KRD §74/§98 stigmergy line
// `rehash && fire-red-wave --from-mirror`: it re-derives the head hash, computes the red
// wave from the mirror via the PURE engine (runtime.redwave.Impact, reusing S17.Resolve),
// and ENQUEUES the resulting items into runtime.red_work_queue (status=open).
//
// HARNESS-INVOKED, NOT A CALLABLE OP: the harness fires this hook after a kernel hash bump;
// it is not an `aidos` verb and exposes no MCP tool (red-wave-as-a-tool is a later
// OpenQuestion). The binary contains NO red-wave LOGIC — all the computation lives in the
// pure redwave package (determinism-first, CLAUDE.md §6); the hook only wires bump → Impact
// → Enqueue → INSERT.
//
// THE WALL (CLAUDE.md §2, ADR 0020): the hook writes ONLY runtime.red_work_queue, below the
// waterline, through the agent's INSERT+SELECT grant. It never writes truth (kernel/mirrors/
// fitness stay SELECT-only). The fault-injection test proves a real bump fires the wave and
// reddens api/db/types; a hook that never fires is dead (CLAUDE.md §5 hook-honesty).
package main

import (
	"github.com/steph-frtech/aidos/back/kernel/links"
	"github.com/steph-frtech/aidos/back/runtime/redwave"
)

// KernelChange is the harness-supplied input of a PostKernelChange firing: the bumped source
// ids, the versioned link graph (S17 links + the declared load-bearing weight + render layer),
// the current heads (the bumped sources' new heads already moved), and the wave_id (the bump's
// content hash, the `rehash` part of §74's line). Where the bumped set / heads come from at
// runtime (the DAG head resolution) is owned by S02/S24 (OpenQuestion OQ-S22-1, a forward
// dependency); the hook receives them as input so it stays a pure wiring of the engine.
type KernelChange struct {
	// Bumped is the set of kernel source ids the change moved (the new head bumped).
	Bumped []string
	// Edges is the versioned link graph the wave walks (S17 links + load-bearing + layer).
	Edges []redwave.Edge
	// Heads is the current head version per target id (S17 Heads; the bumped heads moved).
	Heads links.Heads
	// WaveID is the bump's content hash (`rehash`) — the id of the wave this firing opens.
	WaveID string
}

// FireRedWave is the §74/§98 `fire-red-wave --from-mirror` step: compute the wave from the
// change (the PURE engine) and stamp it with the wave_id. It is a pure function — it returns
// the rows VALUE to enqueue; the caller persists them. Returning an empty slice for an empty
// bump is the "no bump ⇒ empty wave" case (§42). The hook NEVER re-implements the wave; it
// delegates to redwave.Impact (which reuses S17.Resolve).
func FireRedWave(c KernelChange) []redwave.RedWorkItem {
	wave := redwave.Impact(c.Bumped, c.Edges, c.Heads)
	return redwave.Enqueue(wave, c.WaveID)
}
