// biome-ignore-all lint/suspicious/noThenProperty: « then » est le terme Gherkin canonique (Given/When/Then), la langue ubiquitaire KRD.
import { assign, setup } from "xstate";
import {
	diagnose,
	type GrillDraft,
	type GrillIssue,
	runGrill,
	type Scenario,
	type SharpenedIntention,
	STEP_SLUG,
} from "../../../lib/v2/grill";

/**
 * WB2-10 — la MACHINE À ÉTATS du wizard /grill (XState v5, ADR 0053).
 *
 * Le geste grill-with-docs (CLAUDE.md §6 phase 1) EST une machine : intention brute → scénarios
 * (≤ 5) → affûtage du langage → revue → intention AFFÛTÉE. Les étapes sont des ÉTATS VISIBLES ;
 * les transitions (SUIVANT/PRÉCÉDENT/AFFÛTER/RECOMMENCER, AJOUTER/RETIRER un scénario) sont
 * explicites et testées.
 *
 * DÉTERMINISME-FIRST (CLAUDE.md §6/§8) : la machine NE JUGE RIEN — elle DÉLÈGUE diagnostic, affûtage
 * et verdict au twin pur lib/v2/grill.ts (diagnose, runGrill). XState orchestre l'état d'écran ;
 * le verdict (sharp/fuzzy/rejected ? quels ADRs candidats ?) est calculé par le code, jamais appris.
 * LE MUR (§2) : AFFÛTER appelle runGrill (hasMirror=false, wroteKernel=false) — aucune écriture-
 * vérité ; la sortie PROPOSE, la promotion reste idée → miroir → /goal.
 */

/** Le contexte porté par la machine : le brouillon en cours + l'intention affûtée + les problèmes. */
export interface GrillContext {
	draft: GrillDraft;
	intention: SharpenedIntention | null;
	issues: GrillIssue[];
}

/** Le brouillon vide initial (avant toute saisie). */
export const EMPTY_DRAFT: GrillDraft = { intent: "", scenarios: [] };

/** Un scénario vierge (ajouté par AJOUTER). */
export const EMPTY_SCENARIO: Scenario = { given: "", when: "", then: "" };

/** Les événements du wizard. */
export type GrillEvent =
	| { type: "SET_INTENT"; intent: string }
	| { type: "ADD_SCENARIO" }
	| { type: "REMOVE_SCENARIO"; index: number }
	| { type: "PATCH_SCENARIO"; index: number; patch: Partial<Scenario> }
	| { type: "SUIVANT" }
	| { type: "PRECEDENT" }
	| { type: "AFFUTER" }
	| { type: "RECOMMENCER" };

/** Les noms d'états du wizard, dans l'ordre du parcours (réutilisés par l'UI pour le stepper). */
export const GRILL_STEPS = [
	"intention",
	"scenarios",
	"revue",
	"affutee",
] as const;
export type GrillStep = (typeof GRILL_STEPS)[number];

export const grillWizardMachine = setup({
	types: {} as { context: GrillContext; events: GrillEvent },
	actions: {
		setIntent: assign({
			draft: ({ context, event }) =>
				event.type === "SET_INTENT"
					? { ...context.draft, intent: event.intent }
					: context.draft,
		}),
		addScenario: assign({
			draft: ({ context }) => ({
				...context.draft,
				scenarios: [...context.draft.scenarios, { ...EMPTY_SCENARIO }],
			}),
		}),
		removeScenario: assign({
			draft: ({ context, event }) =>
				event.type === "REMOVE_SCENARIO"
					? {
							...context.draft,
							scenarios: context.draft.scenarios.filter(
								(_, i) => i !== event.index,
							),
						}
					: context.draft,
		}),
		patchScenario: assign({
			draft: ({ context, event }) =>
				event.type === "PATCH_SCENARIO"
					? {
							...context.draft,
							scenarios: context.draft.scenarios.map((s, i) =>
								i === event.index ? { ...s, ...event.patch } : s,
							),
						}
					: context.draft,
		}),
		// AFFÛTER : délègue au twin pur. ok → intention affûtée posée ; sinon → problèmes (reste sur revue).
		grill: assign(({ context }) => {
			const r = runGrill(context.draft, STEP_SLUG);
			if (r.ok) return { intention: r.intention, issues: r.issues };
			return { intention: null, issues: r.issues };
		}),
		reset: assign({
			draft: () => ({ intent: "", scenarios: [] as Scenario[] }),
			intention: () => null,
			issues: () => [] as GrillIssue[],
		}),
	},
	guards: {
		// AFFÛTER ne franchit vers « affûtée » que si le brouillon n'est pas rejeté (code, pas LLM).
		nonRejete: ({ context }) => {
			const issues = diagnose(context.draft);
			return (
				!issues.includes("intent_too_short") &&
				!issues.includes("too_many_scenarios")
			);
		},
	},
}).createMachine({
	id: "grillWizard",
	initial: "intention",
	context: {
		draft: { intent: "", scenarios: [] },
		intention: null,
		issues: [],
	},
	states: {
		intention: {
			on: {
				SET_INTENT: { actions: "setIntent" },
				SUIVANT: { target: "scenarios" },
			},
		},
		scenarios: {
			on: {
				ADD_SCENARIO: { actions: "addScenario" },
				REMOVE_SCENARIO: { actions: "removeScenario" },
				PATCH_SCENARIO: { actions: "patchScenario" },
				SUIVANT: { target: "revue" },
				PRECEDENT: { target: "intention" },
			},
		},
		revue: {
			on: {
				PRECEDENT: { target: "scenarios" },
				AFFUTER: [
					{ target: "affutee", guard: "nonRejete", actions: "grill" },
					{ actions: "grill" },
				],
			},
		},
		affutee: {
			on: {
				RECOMMENCER: { target: "intention", actions: "reset" },
			},
		},
	},
});
