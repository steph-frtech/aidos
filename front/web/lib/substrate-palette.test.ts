import { describe, expect, it } from "vitest";
import {
	paletteCounts,
	SUBSTRATE_PALETTE,
	type SubstrateService,
	verdictOf,
} from "./substrate-palette";

/**
 * DP14 — LE MIROIR T0 DE LA MATRICE MESURÉE.
 *
 * Le boot a eu lieu AU SPIKE (zone /spike, jetable) ; ce test N'EN boote AUCUN —
 * il asserte la matrice GRAVÉE + sa forme (jeu clos, chaque entrée a un verdict,
 * les comptes). Déterminisme-first : la palette est une donnée pure, le miroir la
 * vérifie sans LLM ni effet de bord.
 */
describe("DP14 — palette substrat mesurée (spike-gate)", () => {
	it("est un jeu CLOS de 12 services, chaque entrée a un verdict", () => {
		expect(SUBSTRATE_PALETTE).toHaveLength(12);
		for (const s of SUBSTRATE_PALETTE) {
			expect(["go", "no-go"]).toContain(s.verdict);
			expect(["mandatory", "replaceable"]).toContain(s.slot);
			expect([1, 2, 3]).toContain(s.level);
		}
	});

	it("les clés sont uniques (jeu clos, pas de doublon)", () => {
		const keys = SUBSTRATE_PALETTE.map((s) => s.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("couvre les 12 services de la palette spec stack-2026", () => {
		const keys = SUBSTRATE_PALETTE.map((s) => s.key);
		for (const k of [
			"postgres",
			"valkey",
			"pgbouncer",
			"windmill",
			"nats",
			"otel-collector",
			"signoz",
			"glitchtip",
			"forgejo",
			"plane",
			"better-auth",
			"docs",
		])
			expect(keys).toContain(k);
	});

	it("chaque verdict porte une preuve non vide (mesure, jamais avis)", () => {
		for (const s of SUBSTRATE_PALETTE) {
			expect(s.proof.length).toBeGreaterThan(0);
			expect(s.name.length).toBeGreaterThan(0);
			expect(s.layer.length).toBeGreaterThan(0);
		}
	});

	it("la matrice GRAVÉE : 11 go, 1 no-go (Windmill, indispo-registre ghcr)", () => {
		const c = paletteCounts();
		expect(c.total).toBe(12);
		expect(c.go).toBe(11);
		expect(c.noGo).toBe(1);
		// go + no-go couvre tout le jeu clos.
		expect(c.go + c.noGo).toBe(c.total);
	});

	it("Windmill = moteur workflows du slot (mandatory), JAMAIS Temporal", () => {
		const wm = SUBSTRATE_PALETTE.find((s) => s.key === "windmill");
		expect(wm).toBeDefined();
		expect(wm?.layer).toBe("workflow_async");
		expect(wm?.slot).toBe("mandatory");
		// le no-go est une indispo-de-registre, l'alternative Temporal est REFUSÉE.
		expect(wm?.verdict).toBe("no-go");
		expect(wm?.alternative).toContain("Temporal");
		expect(wm?.alternative).toContain("REFUSÉ");
		expect(wm?.proof).toContain("ghcr");
	});

	it("les services CORE prod (level 1) sont mesurés go sauf Windmill (indispo)", () => {
		const level1 = SUBSTRATE_PALETTE.filter((s) => s.level === 1);
		const goLevel1 = level1.filter((s) => s.verdict === "go");
		// tous les level-1 sont go sauf le seul no-go (Windmill).
		expect(level1.length - goLevel1.length).toBe(1);
		expect(level1.find((s) => s.verdict === "no-go")?.key).toBe("windmill");
	});

	it("verdictOf : déterministe, undefined hors palette", () => {
		expect(verdictOf("postgres")).toBe("go");
		expect(verdictOf("windmill")).toBe("no-go");
		expect(verdictOf("inexistant")).toBeUndefined();
		// déterminisme : même entrée → même sortie.
		expect(verdictOf("postgres")).toBe(verdictOf("postgres"));
	});

	it("mandatory + replaceable couvre tout le jeu clos", () => {
		const c = paletteCounts();
		expect(c.mandatory + c.replaceable).toBe(c.total);
	});

	it("paletteCounts est PUR (n'altère pas la palette source)", () => {
		const before: readonly SubstrateService[] = [...SUBSTRATE_PALETTE];
		paletteCounts();
		expect(SUBSTRATE_PALETTE).toEqual(before);
	});
});
