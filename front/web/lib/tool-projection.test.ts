import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	detectDrift,
	emit,
	emitAll,
	isKnownKind,
	markerHash,
	SOURCE_KINDS,
	type Source,
	type SourceKind,
	serializeBody,
	sourceHash,
	TARGETS,
	type Target,
	type ToolingKernel,
	validate,
} from "./tool-projection";
import { aidosTooling } from "./tool-projection-data";

// Reproducibility mirror (∀) for the Tooling-Projection TS twin (FK15). reflects=lib/tool-projection ·
// test_kind=property · cert_language=fast-check · liveness=live. It pins the SAME invariants as the Go
// property mirror (back/kernel/toolproject) so the /tool-projection panel never drifts from Go.

const arbSource: fc.Arbitrary<Source> = fc.record({
	kind: fc.constantFrom(...SOURCE_KINDS) as fc.Arbitrary<SourceKind>,
	id: fc.constantFrom("a", "b", "c", "the-wall", "biome", "scar-1"),
	title: fc.constantFrom("T1", "T2", "Le mur", "Biome"),
	body: fc.constantFrom("body one", "body two", "x"),
});

const arbKernel: fc.Arbitrary<ToolingKernel> = fc
	.array(arbSource, { maxLength: 6 })
	.map((sources) => {
		// Keep ids unique per kind so the stable sort is total.
		const seen = new Set<string>();
		const uniq = sources.filter((s) => {
			const key = `${s.kind}|${s.id}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		return { project: "AIDOS", sources: uniq };
	});

describe("tool-projection (FK15) reproducibility mirror", () => {
	it("Prop 1 — same kernel → byte-identical files (the FK15 done-criterion)", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				const a = emitAll(k);
				const b = emitAll(k);
				expect(a).not.toBeNull();
				for (const t of TARGETS) {
					expect(a?.[t]).toBe(b?.[t]);
				}
			}),
		);
	});

	it("Prop 2 — order-independent (shuffling sources never changes the bytes or the hash)", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				const k2: ToolingKernel = {
					project: k.project,
					sources: [...k.sources].reverse(),
				};
				const f1 = emitAll(k);
				const f2 = emitAll(k2);
				for (const t of TARGETS) {
					expect(f1?.[t]).toBe(f2?.[t]);
				}
				expect(sourceHash(k)).toBe(sourceHash(k2));
			}),
		);
	});

	it("Prop 3 — a clean projection has no drift; a hand-edit yields a drift", () => {
		fc.assert(
			fc.property(arbKernel, fc.constantFrom(...TARGETS), (k, t: Target) => {
				const clean = emit(k, t);
				expect(clean).not.toBeNull();
				expect(detectDrift(k, t, clean as string)).toBeNull();
				// A hand-edit in the body (replace the heading line).
				const edited = (clean as string).replace("Agent", "AGENT_EDITED");
				if (edited !== clean) {
					const d = detectDrift(k, t, edited);
					expect(d).not.toBeNull();
				}
			}),
		);
	});

	it("Prop 4 — the source-hash drives the file marker", () => {
		fc.assert(
			fc.property(arbKernel, (k) => {
				const h = sourceHash(k);
				const files = emitAll(k);
				for (const t of TARGETS) {
					expect(markerHash(files?.[t] as string)).toBe(h);
				}
			}),
		);
	});
});

describe("tool-projection (FK15) worked examples", () => {
	it("CLAUDE.md carries policies + architecture + style, not the agent persona", () => {
		const claude = emit(aidosTooling, "CLAUDE.md");
		expect(claude).not.toBeNull();
		expect(claude).toContain("Le mur");
		expect(claude).toContain("Cinq sous-systèmes");
		expect(claude).toContain("Biome");
		expect(claude).not.toContain("step-executor");
	});

	it("AGENTS.md / memory-bank / .cursorrules carry their own kinds", () => {
		expect(emit(aidosTooling, "AGENTS.md")).toContain("step-executor");
		expect(emit(aidosTooling, "memory-bank.md")).toContain(
			"Discipline de report",
		);
		expect(emit(aidosTooling, ".cursorrules")).toContain("Anti-overwrite");
	});

	it("the FK15 fault-injection: a hand-edited CLAUDE.md is detected as HAND_EDITED", () => {
		const claude = emit(aidosTooling, "CLAUDE.md") as string;
		const edited = claude.replace(
			"L'agent n'écrit jamais",
			"L'agent peut écrire",
		);
		const d = detectDrift(aidosTooling, "CLAUDE.md", edited);
		expect(d?.kind).toBe("HAND_EDITED");
	});

	it("a file with no marker is MISSING_MARKER; an old kernel's file is STALE_HASH", () => {
		expect(
			detectDrift(aidosTooling, "CLAUDE.md", "# hand-written\nno marker\n")
				?.kind,
		).toBe("MISSING_MARKER");
		const oldFile = emit(aidosTooling, "CLAUDE.md") as string;
		const next: ToolingKernel = {
			project: "AIDOS",
			sources: [
				...aidosTooling.sources,
				{
					kind: "policy",
					id: "determinism",
					title: "Determinism",
					body: "Une fonction pure.",
				},
			],
		};
		expect(detectDrift(next, "CLAUDE.md", oldFile)?.kind).toBe("STALE_HASH");
	});

	it("validate rejects an empty project / unknown kind / empty id", () => {
		expect(validate({ project: " ", sources: [] })).toBe("NO_PROJECT");
		expect(
			validate({
				project: "X",
				sources: [
					{ kind: "bogus" as SourceKind, id: "x", title: "", body: "" },
				],
			}),
		).toBe("UNKNOWN_KIND");
		expect(
			validate({
				project: "X",
				sources: [{ kind: "policy", id: " ", title: "", body: "" }],
			}),
		).toBe("EMPTY_ID");
	});

	it("serializeBody is a tooling kernel.link body; isKnownKind closes the set", () => {
		const body = JSON.parse(serializeBody(aidosTooling));
		expect(body.kind).toBe("link");
		expect(body.link_kind).toBe("tooling");
		expect(isKnownKind("policy")).toBe(true);
		expect(isKnownKind("nope")).toBe(false);
	});
});
