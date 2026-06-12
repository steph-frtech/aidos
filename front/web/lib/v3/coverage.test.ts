import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyIntent, initBuilderState, type ScreenRef } from "../v2/builder";
import { GLOSSARY } from "../v2/glossary";

/**
 * V3 — LA LOI DE COUVERTURE TOTALE SUR LE VRAI RÉPERTOIRE (mandat utilisateur :
 * « reprends chaque écran v1+v2 et vérifie qu'on le trouve quelque part »).
 *
 * Ce miroir balaie le VRAI front/web/app : chaque dossier-écran V1, chaque
 * dossier /v2/<slug>, chaque lentille /v3 — et prouve ∀ écran : le chat le
 * résout (« ouvre l'écran <slug> » → ecran_ouvert vers SA route). Un écran
 * ajouté demain qui ne serait pas résolu fait ROUGIR ce miroir.
 */

function scanDirs(base: string): string[] {
	return readdirSync(base)
		.filter((d) => {
			if (d.startsWith("_") || d.startsWith(".")) return false;
			try {
				return statSync(join(base, d)).isDirectory();
			} catch {
				return false;
			}
		})
		.sort();
}

const APP = join(process.cwd(), "app");
const v1Dirs = scanDirs(APP).filter((d) => !["v2", "v3", "api"].includes(d));
// Les écrans V2 réels = les pages dédiées + les CONCEPTS servis par /v2/[slug].
const v2PageDirs = scanDirs(join(APP, "v2")).filter(
	(d) => !d.startsWith("[") && statSyncSafe(join(APP, "v2", d, "page.tsx")),
);
const v2Dirs = [
	...new Set([...v2PageDirs, ...GLOSSARY.map((g) => g.slug)]),
].sort();

function statSyncSafe(pth: string): boolean {
	try {
		return statSync(pth).isFile();
	} catch {
		return false;
	}
}
const v3Dirs = scanDirs(join(APP, "v3"));

const v1Screens: ScreenRef[] = [
	...v1Dirs.map((d) => ({ route: `/${d}`, label: d.replace(/-/g, " ") })),
	...v3Dirs.map((d) => ({ route: `/v3/${d}`, label: `v3 ${d}` })),
];

describe("LA LOI DE COUVERTURE TOTALE — chaque écran du Workbench se trouve", () => {
	it(`∀ écran V1 réel (${v1Dirs.length} dossiers) : « ouvre l'écran <slug> » résout vers SA route`, () => {
		const st = initBuilderState(v1Screens);
		for (const d of v1Dirs) {
			const r = applyIntent(st, `ouvre l'écran ${d}`);
			const ev = r.events.find((e) => e.kind === "ecran_ouvert");
			expect(ev, `écran V1 /${d} introuvable`).toBeDefined();
			expect(ev?.ref, `écran V1 /${d} mal résolu`).toBe(`/${d}`);
		}
	});

	it(`∀ écran V2 réel (${v2Dirs.length} dossiers) : le registre les couvre tous (slug → route)`, () => {
		const st = initBuilderState(v1Screens);
		for (const d of v2Dirs) {
			const r = applyIntent(st, `ouvre l'écran v2 ${d}`);
			const ev = r.events.find((e) => e.kind === "ecran_ouvert");
			expect(ev, `écran V2 /v2/${d} introuvable`).toBeDefined();
			expect(ev?.ref, `écran V2 /v2/${d} mal résolu`).toBe(`/v2/${d}`);
		}
	});

	it(`∀ lentille V3 (${v3Dirs.length}) : atteignable aussi`, () => {
		const st = initBuilderState(v1Screens);
		for (const d of v3Dirs) {
			const r = applyIntent(st, `ouvre l'écran v3 ${d}`);
			const ev = r.events.find((e) => e.kind === "ecran_ouvert");
			expect(ev?.ref, `lentille /v3/${d} mal résolue`).toBe(`/v3/${d}`);
		}
	});
});
