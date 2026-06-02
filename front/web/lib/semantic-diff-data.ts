/**
 * The three canonical §44.1 SemanticDiff example pairs the /semantic-diff panel renders (AIDOS step
 * S21) — they mirror back/runtime/semanticdiff/semanticdiff_fixture_test.go and the `aidos diff`
 * catalogue (back/cmd/aidos/diff.go), so the screen and the CLI classify identically.
 *
 * The example artifacts (checkout-button / refund-policy / help-link) are REUSED from prior steps;
 * this step coins no business rule. THE DONE CRITERIA are visible: the incompatible enabled_when
 * pair is an override, the EU→EU+US scope pair is a rescope (not override), the cosmetic→load-bearing
 * pair is a reweight. blast_radius/requires_authority/red_wave are REFERENCED (S15/S16/S17), never
 * recomputed; sentence is the plain-language reading (KRD §44.1: not a YAML patch).
 */

import type { Artifact } from "./semantic-diff";

export interface DiffExample {
	readonly id: string;
	readonly old: Artifact;
	readonly next: Artifact;
	readonly blastRadius: string;
	readonly requiresAuthority: string;
	readonly redWave: string;
	/** i18n key suffix for the plain-language sentence (messages: semanticDiff.sentence.<key>). */
	readonly sentenceKey: "override" | "rescope" | "reweight";
}

export const EXAMPLES: readonly DiffExample[] = [
	{
		id: "checkout-button",
		old: {
			version: "v1",
			body: {
				kind: "control",
				name: "checkout-button",
				enabled_when: {
					call: "&&",
					args: ["$.form.valid", { call: "!", args: ["$.submitting"] }],
				},
			},
		},
		next: {
			version: "v2",
			body: {
				kind: "control",
				name: "checkout-button",
				enabled_when: "$.form.valid",
			},
		},
		blastRadius: "checkout-button → checkout-action → createOrder (S17 links)",
		requiresAuthority: "UX + Product (S16 AuthorityGraph)",
		redWave: "the control's state fixture mirror re-opens (S17 red wave)",
		sentenceKey: "override",
	},
	{
		id: "refund-policy",
		old: {
			version: "v1",
			body: { kind: "truth", name: "refund-policy", scope: { cells: ["EU"] } },
		},
		next: {
			version: "v2",
			body: {
				kind: "truth",
				name: "refund-policy",
				scope: { cells: ["EU", "US"] },
			},
		},
		blastRadius: "refund-policy widened to the US cell (S15 TruthScope)",
		requiresAuthority: "Product + Legal (S16 AuthorityGraph)",
		redWave:
			"refund-policy's mirrors re-run on the widened scope (S17 red wave)",
		sentenceKey: "rescope",
	},
	{
		id: "help-link",
		old: {
			version: "v1",
			body: {
				kind: "link",
				link_kind: "composes",
				parent: { id: "checkout", version: "v1" },
				child: { id: "help-link", version: "v1" },
				weight: "cosmetic",
			},
		},
		next: {
			version: "v2",
			body: {
				kind: "link",
				link_kind: "composes",
				parent: { id: "checkout", version: "v1" },
				child: { id: "help-link", version: "v1" },
				weight: "load-bearing",
			},
		},
		blastRadius: "the composes link checkout→help-link (KRD §96)",
		requiresAuthority: "Product (S16 AuthorityGraph)",
		redWave: "checkout's emergent invariant may re-open above threshold (S19)",
		sentenceKey: "reweight",
	},
];
