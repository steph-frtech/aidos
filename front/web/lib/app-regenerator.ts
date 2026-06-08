/**
 * The project-scoped regeneration twin — the Workbench /app-regenerator source (AIDOS S78,
 * « Régénérer mon app »).
 *
 * The DECLARED projection of the Go package back/runtime/regen: the Runtime action, bound to
 * a user's Kernel cut, that runs the deterministic emitters for ALL of a project's sources
 * (entities + relations + operations sync+async + controls + blobs) toward the project's
 * emission target in ONE pass, classifies what changes (STALE by source-hash / FRESH /
 * UNCHANGED), and REFUSES if any emitted file was hand-edited (GEN_FILE_HAND_EDITED).
 *
 * It COMPOSES the existing S74 emitter twin (lib/relation-emitter: emitDDL/emitTS/emitWorker)
 * — never a second emitter — so the regen preview is byte-identical to what the Go regenerator
 * produces. Reuse, never reinvent.
 *
 * DETERMINISM-FIRST (CLAUDE.md §6/§8): regenerate is a PURE function of its inputs — the same
 * project schema → byte-identical artifacts (byte-stable); the drift verdict is a pure hash
 * inequality (Hash(onDisk) !== recorded outputHash), never an LLM judgment. The Go output is
 * the AUTHORITATIVE truth; this twin reproduces it for the screen. The reproducibility mirror
 * lib/app-regenerator.test.ts (fast-check) pins byte-stability and the hand-edit refusal.
 *
 * THE WALL (CLAUDE.md §2): gen/ is a PROJECTION, regenerable — regenerating writes NO truth.
 * This twin reads a schema + ledger + on-disk bytes and returns values; it never writes a
 * kernel/mirror. The only door to change what it emits is to change the SOURCE.
 */

import {
	type BlockReason,
	emitDDL,
	emitTS,
	emitWorker,
	isBlocked,
	type Schema,
} from "./relation-emitter";

/** The S78 refusal code, additive to the closed BlockReason enum (back/runtime/blockreason). */
export const GEN_FILE_HAND_EDITED = "GEN_FILE_HAND_EDITED";

/** One emitted artifact: a path, its rendered bytes (text), and its content addresses. */
export interface Artifact {
	path: string;
	target: "ddl" | "ts" | "worker";
	bytes: string;
	sourceHash: string;
	outputHash: string;
}

/** One row of the emission ledger: the content addresses recorded the LAST time a file was emitted. */
export interface LedgerEntry {
	path: string;
	sourceHash: string;
	outputHash: string;
}

/** The current on-disk state of one emitted file. */
export interface DiskFile {
	path: string;
	bytes: string;
}

/** The deterministic result of a regeneration: artifacts + the staleness classification. */
export interface Plan {
	artifacts: Artifact[];
	stale: string[];
	fresh: string[];
	unchanged: string[];
}

export interface RegenResult {
	ok: boolean;
	plan?: Plan;
	block?: BlockReason;
}

/**
 * djb2-based stable string hash (hex). Deterministic, dependency-free — used for the twin's
 * content addresses on the client. (The Go truth uses records.Hash/sha256; the twin needs
 * only INTERNAL consistency: the same bytes → the same hash, so the drift inequality and
 * byte-stability hold on the screen. The Go output remains authoritative.)
 */
export function hash(s: string): string {
	let h = 5381;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	}
	// Mix length in so trivial collisions are even less likely; emit unsigned hex.
	const mixed = (h ^ s.length) >>> 0;
	return mixed.toString(16).padStart(8, "0");
}

/** sourceHash of a project: a stable digest of the canonical schema (entities sorted by name). */
export function sourceHash(s: Schema): string {
	const ents = [...s.entities].sort((a, b) =>
		a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1,
	);
	const async = [...(s.asyncOps ?? [])].sort((a, b) =>
		a.name < b.name ? -1 : 1,
	);
	return hash(JSON.stringify({ project: s.project, entities: ents, async }));
}

/** Drifted reports whether on-disk bytes diverge from the recorded outputHash — a hand-edit. */
export function drifted(recordedOutputHash: string, onDisk: string): boolean {
	return hash(onDisk) !== recordedOutputHash;
}

/**
 * emitArtifacts runs the S74 emitter twin over the whole project, in canonical target order
 * (DDL, TS, then Worker iff async). It returns the artifacts or the first BlockReason from a
 * malformed schema (no partial tree).
 */
export function emitArtifacts(s: Schema): Artifact[] | BlockReason {
	const sh = sourceHash(s);
	const out: Artifact[] = [];

	const ddl = emitDDL(s);
	if (isBlocked(ddl)) return ddl;
	out.push({
		path: `gen/${s.project}/schema.sql`,
		target: "ddl",
		bytes: ddl,
		sourceHash: sh,
		outputHash: hash(ddl),
	});

	const ts = emitTS(s);
	if (isBlocked(ts)) return ts;
	out.push({
		path: `gen/${s.project}/model.ts`,
		target: "ts",
		bytes: ts,
		sourceHash: sh,
		outputHash: hash(ts),
	});

	if ((s.asyncOps ?? []).length > 0) {
		const w = emitWorker(s);
		if (isBlocked(w)) return w;
		out.push({
			path: `gen/${s.project}/worker.ts`,
			target: "worker",
			bytes: w,
			sourceHash: sh,
			outputHash: hash(w),
		});
	}
	return out;
}

/**
 * regenerate is the S78 action « Régénérer mon app ». It (1) REFUSES on a hand-edit FIRST
 * (the first tracked on-disk file that drifted from its recorded outputHash blocks the whole
 * pass, fail-closed — no silent overwrite, §9), then (2) emits deterministically by composing
 * the S74 emitters, then (3) classifies staleness by source-hash (stale/fresh/unchanged).
 * Pure: the same schema → byte-identical artifacts.
 */
export function regenerate(
	schema: Schema,
	ledger: LedgerEntry[],
	disk: DiskFile[],
): RegenResult {
	const byPath = new Map<string, LedgerEntry>();
	for (const e of ledger) byPath.set(e.path, e);

	// (1) Hand-edit gate — sorted-path order for determinism.
	const sortedDisk = [...disk].sort((a, b) => (a.path < b.path ? -1 : 1));
	for (const f of sortedDisk) {
		const entry = byPath.get(f.path);
		if (!entry) continue; // untracked file is not a drift
		if (drifted(entry.outputHash, f.bytes)) {
			return {
				ok: false,
				block: {
					code: GEN_FILE_HAND_EDITED,
					severity: "blocking",
					explanation:
						"Régénération refusée : un fichier de l'arbre émis (gen/) a été édité à la main — ses octets sur disque ne correspondent plus à l'output_hash enregistré. gen/ est une projection régénérable, jamais autorée à la main (§9). Une régénération l'écraserait en silence.",
					how_to_fix: [
						"revert_the_hand_edit : restaurez le fichier généré à sa dernière sortie d'émetteur — gen/ se change en changeant SA SOURCE, jamais le fichier émis.",
						"change_the_source_then_regenerate : si l'édition traduisait un vrai besoin, portez-la dans la source via idea → mirror → /goal → approbation, puis régénérez.",
						"rerun « Régénérer mon app » : le blocage se lève quand aucun fichier ne diverge de son output_hash.",
					],
				},
			};
		}
	}

	// (2) Emit.
	const arts = emitArtifacts(schema);
	if (isBlocked(arts)) return { ok: false, block: arts };

	// (3) Classify by source-hash.
	const stale: string[] = [];
	const fresh: string[] = [];
	const unchanged: string[] = [];
	for (const a of arts) {
		const entry = byPath.get(a.path);
		if (!entry) fresh.push(a.path);
		else if (entry.sourceHash !== a.sourceHash) stale.push(a.path);
		else if (entry.outputHash !== a.outputHash) stale.push(a.path);
		else unchanged.push(a.path);
	}
	stale.sort();
	fresh.sort();
	unchanged.sort();

	return { ok: true, plan: { artifacts: arts, stale, fresh, unchanged } };
}
