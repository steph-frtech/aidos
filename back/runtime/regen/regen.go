// Package regen is S78 — the project-scoped regeneration action, « Régénérer mon app ».
//
// WHAT IT IS. A Runtime action, bound to a user's Kernel cut, that runs the deterministic
// emitters for ALL of a project's sources — entities, relations, operations (sync AND
// async), controls and blobs — toward the project's emission target, in ONE pass. It is
// the orchestrator the preview/deploy track (E10: S94/S96/S98) re-uses to re-project an
// app from a stable phase. It does NOT re-implement a single emitter: it COMPOSES the
// authoritative S74 emitter relemit.EmitAll (which already fans the multi-entity AST
// across DDL/TS/Worker — sync handlers, async workers+outbox, blob handling — for a whole
// project Schema). Reuse, never reinvent (CLAUDE.md §3, ADR 0007).
//
// BELOW THE WATERLINE (CLAUDE.md §2/§8). gen/ is a PROJECTION, regenerable from its
// source; regenerating it writes no truth. So Regenerate is Runtime plumbing: it reads
// the Schema (a Kernel cut), reads the ledger of prior output_hashes (read-only), reads
// the on-disk bytes, and returns a Plan + an optional BlockReason. It NEVER touches the
// kernel/mirrors/fitness schemas. The only way to change what it emits is to change the
// SOURCE (idea → mirror → /goal), never the emitted file.
//
// THE TWO DONE-CRITERIA (the S78 property mirror):
//
//   - BYTE-STABLE. Regenerate(schema,…) is a pure function of records.Canonicalize(schema):
//     the same project sources → byte-identical artifacts (same path, bytes, output_hash),
//     run after run, regardless of input order. An LLM could never guarantee this; a pure
//     composition of pure emitters does by construction.
//
//   - REFUSES A HAND-EDIT. Before it would (re)emit, it checks every emitted file present
//     on disk against the output_hash the emitter previously recorded (the ledger). If ANY
//     file drifted — its on-disk bytes no longer hash to the recorded output_hash, i.e. it
//     was hand-edited — the whole regeneration is REFUSED with CodeGenFileHandEdited,
//     fail-closed (the FIRST drift blocks; no partial pass that silently overwrites a human
//     edit, §9 non-destruction). The drift is COMPUTED (a pure hash inequality), never an
//     LLM judgment (§8 — the judge is deterministic).
//
// STALENESS BY SOURCE-HASH. A regenerated artifact is STALE when the source it was emitted
// from has changed since the last emission — detected by comparing the artifact's
// source_hash (= the entity/schema content address) carried in the ledger. The Plan
// surfaces the stale paths so the Workbench can show "what « Régénérer mon app » will
// rewrite" before the write. Stale ≠ drift: a stale file is an OUT-OF-DATE projection
// (the source moved, normal — regenerate it); a drifted file is a HAND-EDITED projection
// (forbidden — refuse). The two are independent computations over the same ledger.
package regen

import (
	"sort"

	"github.com/steph-frtech/aidos/back/kernel/entities/relemit"
	"github.com/steph-frtech/aidos/back/kernel/records"
	"github.com/steph-frtech/aidos/back/runtime/blockreason"
)

// LedgerEntry is one row of the emission ledger: the content addresses the emitter
// recorded the LAST time it wrote this path. It is the read-only memory regen consults to
// (a) detect a hand-edit (compare the on-disk bytes' hash to OutputHash) and (b) detect a
// stale projection (compare the freshly-emitted artifact's SourceHash to this SourceHash).
// regen never authors the ledger — the emitter / the changeset that applied the projection
// does (below the line). An empty ledger means "never emitted" (a first regeneration:
// nothing can be drifted, everything is fresh-new, none stale).
type LedgerEntry struct {
	Path       string `json:"path"`
	SourceHash string `json:"source_hash"`
	OutputHash string `json:"output_hash"`
}

// DiskFile is the CURRENT on-disk state of one emitted file: its path and its raw bytes.
// regen takes the disk state as an explicit INPUT (it does no file I/O itself — that keeps
// it a pure, testable function; the MCP/CLI seam reads the files and passes them in). A
// path present on disk but absent from the ledger is an UNTRACKED file under gen/ — not a
// drift (the emitter never recorded it), surfaced separately so the caller can decide.
type DiskFile struct {
	Path  string `json:"path"`
	Bytes []byte `json:"bytes"`
}

// Plan is the deterministic result of a regeneration: the artifacts to (re)write and the
// classification of what changes. It is content-addressed through the artifacts' own
// hashes. Artifacts are in relemit's canonical order (DDL, TS, then Worker iff async), so
// the plan is byte-stable. Stale lists the emitted paths whose SOURCE moved since the last
// emission (an out-of-date projection that regeneration brings current); Fresh lists paths
// the ledger never recorded (first emission of that file); Unchanged lists paths whose
// source_hash AND output_hash already match the ledger (a no-op rewrite). The three sets
// partition the artifacts. All lists are sorted (determinism).
type Plan struct {
	Artifacts []relemit.Artifact `json:"artifacts"`
	Stale     []string           `json:"stale"`
	Fresh     []string           `json:"fresh"`
	Unchanged []string           `json:"unchanged"`
}

// Regenerate is the S78 action. Given a project's full source cut (a relemit.Schema —
// entities+relations+async), the emission ledger, and the current on-disk bytes of the
// emitted tree, it:
//
//  1. REFUSES ON A HAND-EDIT, FIRST. For every disk file the ledger tracks, it compares the
//     on-disk bytes' hash to the recorded OutputHash (generators-grade Drifted). The first
//     drift (in deterministic, sorted path order) refuses the whole regeneration with
//     CodeGenFileHandEdited — fail-closed, no partial overwrite. This runs BEFORE emission
//     so a regeneration never destroys a human edit (§9). A missing/empty ledger ⇒ nothing
//     tracked ⇒ no drift possible.
//
//  2. EMITS deterministically, by composing relemit.EmitAll (the authoritative S74
//     emitter). A malformed schema short-circuits to relemit's own BlockReason (honesty —
//     never a partial tree). The artifacts come back in relemit's canonical order.
//
//  3. CLASSIFIES staleness by SOURCE-HASH. Each fresh artifact's SourceHash is compared to
//     the ledger entry for its path: source moved ⇒ Stale; no ledger row ⇒ Fresh; source
//     and output both match ⇒ Unchanged.
//
// Regenerate does NO file I/O and is a pure function of its inputs (Canonicalize(schema)
// for the bytes, plus the ledger/disk for the classification) — the property mirror pins
// that the artifacts are byte-stable across runs and order-independent.
func Regenerate(schema relemit.Schema, ledger []LedgerEntry, disk []DiskFile) (Plan, *blockreason.BlockReason) {
	// (1) Hand-edit gate — fail-closed, BEFORE any emission. Index the ledger by path, then
	// walk the disk files in sorted path order (determinism: the SAME drifted set always
	// refuses on the SAME first path).
	byPath := indexLedger(ledger)
	if br := firstHandEdit(disk, byPath); br != nil {
		return Plan{}, br
	}

	// (2) Emit — compose the authoritative S74 emitter. A malformed schema is relemit's
	// BlockReason, surfaced verbatim (no second emitter, no guessed fallback).
	artifacts, br := relemit.EmitAll(schema)
	if br != nil {
		return Plan{}, br
	}

	// (3) Classify by source-hash (stale/fresh/unchanged), deterministically.
	plan := Plan{Artifacts: artifacts}
	for _, a := range artifacts {
		entry, tracked := byPath[a.Path]
		switch {
		case !tracked:
			plan.Fresh = append(plan.Fresh, a.Path)
		case entry.SourceHash != a.SourceHash:
			// The source the file was emitted from has moved → out-of-date projection.
			plan.Stale = append(plan.Stale, a.Path)
		case entry.OutputHash != a.OutputHash:
			// Source identical but recorded output differs — the emitter changed shape; the
			// projection is out-of-date too (treat as stale: it must be rewritten).
			plan.Stale = append(plan.Stale, a.Path)
		default:
			plan.Unchanged = append(plan.Unchanged, a.Path)
		}
	}
	sort.Strings(plan.Stale)
	sort.Strings(plan.Fresh)
	sort.Strings(plan.Unchanged)
	return plan, nil
}

// indexLedger maps each ledger entry by its path. A ledger with duplicate paths keeps the
// LAST (an append-only ledger's head); regen reads, never writes, the ledger.
func indexLedger(ledger []LedgerEntry) map[string]LedgerEntry {
	byPath := make(map[string]LedgerEntry, len(ledger))
	for _, e := range ledger {
		byPath[e.Path] = e
	}
	return byPath
}

// firstHandEdit returns the BlockReason for the FIRST drifted file, in deterministic
// (sorted-path) order, or nil if no tracked file was hand-edited. A file present on disk
// but ABSENT from the ledger is untracked, not a drift (the emitter never recorded it) —
// it is skipped here (the caller surfaces untracked files separately). The drift test is
// generators.Drifted (Hash(onDisk) != recorded OutputHash) — a pure hash inequality.
func firstHandEdit(disk []DiskFile, byPath map[string]LedgerEntry) *blockreason.BlockReason {
	sorted := make([]DiskFile, len(disk))
	copy(sorted, disk)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Path < sorted[j].Path })
	for _, f := range sorted {
		entry, tracked := byPath[f.Path]
		if !tracked {
			continue
		}
		if Drifted(entry.OutputHash, f.Bytes) {
			br := blockreason.For(blockreason.CodeGenFileHandEdited)
			return &br
		}
	}
	return nil
}

// Drifted reports whether a file's on-disk bytes diverge from the output_hash the emitter
// recorded — i.e. it was hand-edited. It REUSES records.Hash (the ONE content-address of
// the truth-store, S01) — the SAME hash the S74 emitters stamp into an Artifact.OutputHash
// — so regen and the entity emitters share one drift definition (no second hash algorithm;
// a drift is a hash inequality, the same one everywhere). The OutputHash a relemit.Artifact
// carries is therefore directly comparable to Hash(onDisk).
func Drifted(recordedOutputHash string, onDisk []byte) bool {
	return records.Hash(onDisk) != recordedOutputHash
}
