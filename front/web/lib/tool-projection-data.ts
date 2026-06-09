/**
 * Canonical Tooling-Projection scenarios for the /tool-projection panel (FK15). These are the worked
 * examples the Workbench emits + drift-checks — the AIDOS tooling kernel (the legacy CLAUDE.md /
 * AGENTS.md / .cursorrules / memory-bank content KERNELIZED into sources without loss), plus the FK15
 * fault-injection (a hand-edited CLAUDE.md → drift) and the stale-hash / missing-marker drifts.
 * Pure data; the emit + drift detection are lib/tool-projection.ts (mirroring back/kernel/toolproject).
 */

import type { Source, ToolingKernel } from "./tool-projection";

/** The AIDOS tooling kernel: one source per closed kind (legacy content kernelized). */
export const aidosTooling: ToolingKernel = {
	project: "AIDOS",
	sources: [
		{
			kind: "policy",
			id: "the-wall",
			title: "Le mur",
			body: "L'agent n'écrit jamais kernel/mirrors/fitness ; la vérité passe par idea → mirror → /goal.",
		},
		{
			kind: "policy",
			id: "anti-overwrite",
			title: "Anti-overwrite",
			body: "Jamais réécrire un artefact sans ChangeSet ; ajouter, jamais supprimer.",
		},
		{
			kind: "style",
			id: "biome",
			title: "Biome",
			body: "Biome possède le formatage (tabs, double quotes) au root du monorepo.",
		},
		{
			kind: "architecture",
			id: "subsystems",
			title: "Cinq sous-systèmes",
			body: "Runtime · Kernel · Mirror · Archive · Workbench, chacun dans son répertoire.",
		},
		{
			kind: "memory",
			id: "report-discipline",
			title: "Discipline de report",
			body: "Toujours émettre StructuredOutput, même incomplet ; ne pas sur-polir en fin de tour.",
		},
		{
			kind: "agent-profile",
			id: "step-executor",
			title: "step-executor",
			body: "Exécute une étape isolée et testable ; model opus, high effort.",
		},
	],
};

/** A second source kind list to demonstrate the order-independence visually. */
export const aidosToolingReordered: ToolingKernel = {
	project: "AIDOS",
	sources: [...aidosTooling.sources].reverse() as Source[],
};
