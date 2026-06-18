import { describe, expect, it } from "vitest";
import type { BuilderState } from "../v2/builder";
import { projectStateToBacklog } from "./backlog";

/**
 * ADR 0073 Plan B — MIROIR 2 : le backlog gouverné (projection truth-store dérivée du rejeu).
 * Lois PURES (le twin ne fait aucun I/O) : DÉTERMINISME (même état → même backlog), le FILTRE
 * NoEmit (journey/view/invariant n'émettent aucune idée), l'INTÉGRITÉ RÉFÉRENTIELLE (chaque arête
 * dag référence un changeset existant), et mirror_delta TOUJOURS fourni (sinon l'apply Blocked).
 * Le twin lit UNIQUEMENT state.ideas + state.kernels → on construit des états minimaux (cast).
 */

const idea = (
	level: string,
	scale: string,
	intent: string,
	provenance: "humain" | "incident" = "humain",
) => ({ coordinate: { level, facet: "F", scale }, intent, provenance });

const kernel = (scale: string, version: string) => ({
	coordinate: { level: "operation", facet: "F", scale },
	version,
});

const stateOf = (
	ideas: ReturnType<typeof idea>[],
	kernels: ReturnType<typeof kernel>[],
) => ({ ideas, kernels }) as unknown as BuilderState;

describe("projectStateToBacklog — le backlog gouverné (ADR 0073 Plan B)", () => {
	it("DÉTERMINISTE : même état → même backlog (pur, zéro horloge/aléa)", () => {
		const s = stateOf(
			[idea("operation", "app/op", "faire X")],
			[kernel("app/op", "v1")],
		);
		expect(projectStateToBacklog(s)).toEqual(projectStateToBacklog(s));
	});

	it("FILTRE NoEmit : journey/view/invariant n'émettent AUCUNE idée (seul un rung Emit le fait)", () => {
		const s = stateOf(
			[
				idea("operation", "app/op", "X"),
				idea("view", "app/v", "Y"),
				idea("journey", "app/j", "Z"),
			],
			[],
		);
		const b = projectStateToBacklog(s);
		expect(b.ideas).toHaveLength(1);
		expect(b.ideas[0].proposes).toBe("operation");
	});

	it("source humain→human / incident→incident ; intent repris VERBATIM", () => {
		const s = stateOf(
			[idea("operation", "a/b", "Verbatim !", "incident")],
			[],
		);
		expect(projectStateToBacklog(s).ideas[0]).toMatchObject({
			source: "incident",
			intent: "Verbatim !",
			detail: "Verbatim !",
		});
	});

	it("INTÉGRITÉ : chaque arête dag référence un changeset existant ; tout changeset a un mirror_delta", () => {
		const s = stateOf(
			[],
			[kernel("a/b", "v1"), kernel("c/d", "v2")],
		);
		const b = projectStateToBacklog(s);
		const ids = new Set(b.changesets.map((c) => c.id));
		expect(b.dagEdges.length).toBe(b.changesets.length);
		expect(b.dagEdges.every((e) => ids.has(e.changeset))).toBe(true);
		expect(b.changesets.every((c) => c.mirrorDelta.target.length > 0)).toBe(true);
		expect(b.changesets.every((c) => c.specDelta.kind === "add")).toBe(true);
	});

	it("un état vide → un backlog vide (total, jamais une exception)", () => {
		const b = projectStateToBacklog(stateOf([], []));
		expect(b).toEqual({ ideas: [], changesets: [], dagEdges: [] });
	});
});
