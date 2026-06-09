import type { CertLanguage, MirrorIn, TestKind } from "@/lib/contracte";

/**
 * Non-server helpers for the FK16 /proof-levels bascule: the representative sample corpus and the
 * closed validation sets. Kept OUT of the "use server" actions module (which may only export async
 * functions). Pure data; no side effects.
 */

export const VALID_KINDS = new Set<TestKind>([
	"acceptance",
	"e2e",
	"property",
	"fixture",
	"contract",
	"schema",
	"unit",
	"snapshot",
	"meter",
]);

export const VALID_CERTS = new Set<CertLanguage>([
	"gherkin",
	"xstate",
	"fast-check",
	"rapid",
	"zod",
	"pact",
	"type-check",
	"k6",
	"fixture",
	"snapshot",
	"unit",
	"prose",
]);

/** A small, representative pre-FK16 corpus the screen re-labels (the demo input). */
export function defaultCorpus(): MirrorIn[] {
	return [
		{
			mirrorId: "m-journey",
			testKind: "acceptance",
			certLanguage: "gherkin",
			n: "N0",
		},
		{
			mirrorId: "m-invariant",
			testKind: "property",
			certLanguage: "rapid",
			n: "N1",
		},
		{
			mirrorId: "m-workflow",
			testKind: "fixture",
			certLanguage: "fixture",
			n: "N2",
		},
		{
			mirrorId: "m-contract",
			testKind: "contract",
			certLanguage: "pact",
			n: "N3",
		},
		{ mirrorId: "m-unit", testKind: "unit", certLanguage: "unit", n: "N4" },
		{ mirrorId: "m-prose", testKind: "unit", certLanguage: "prose", n: "N4" },
	];
}
