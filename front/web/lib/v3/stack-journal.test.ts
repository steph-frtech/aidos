import { describe, expect, it } from "vitest";
import { applyIntent, initBuilderState } from "../v2/builder";
import { bareTree } from "../v2/composition";
import { defaultInstanceConfig, envStackOf } from "./instance";
import { stackJournalOf } from "./stack-journal";

/**
 * V3 — le MIROIR du JOURNAL DE STACK (ADR 0063) : « si on déploie en dev, les
 * tickets dev se créent et se résolvent, comme la doc, etc. » Les effets de stack
 * sont DÉRIVÉS des événements (une projection pure du log), jamais saisis : chaque
 * déploiement engendre son ticket (créé+résolu), sa page de doc, son point de
 * restauration Doltgres (hors prod — le rollback), sa trace de télémétrie.
 */

function lifecycle() {
	let st = initBuilderState([], bareTree());
	st = applyIntent(st, "greffe le paiement sous app").state;
	st = applyIntent(
		st,
		"capture l'idée : au paiement, débiter une seule fois",
	).state;
	st = applyIntent(st, "promeus la dernière idée").state;
	st = applyIntent(st, "déploie l'application en dev").state;
	return st;
}

describe("stackJournalOf — les effets de stack DÉRIVÉS des événements", () => {
	it("un déploiement en dev engendre ticket (créé+résolu), doc, point de restauration BDD, télémétrie", () => {
		const j = stackJournalOf(lifecycle());
		const dev = j.filter((e) => e.env === "dev");
		expect(
			dev.some((e) => e.service === "tickets" && e.action === "resolu"),
		).toBe(true);
		expect(
			dev.some((e) => e.service === "tickets" && e.action === "cree"),
		).toBe(true);
		expect(dev.some((e) => e.service === "docs" && e.action === "publie")).toBe(
			true,
		);
		expect(
			dev.some(
				(e) => e.service === "db" && e.action === "point_de_restauration",
			),
		).toBe(true);
		expect(dev.some((e) => e.service === "telemetry")).toBe(true);
		// chaque entrée référence la version déployée (content-adressée)
		const point = dev.find((e) => e.service === "db");
		expect(point?.ref.startsWith("app:")).toBe(true);
	});

	it("une capture engendre une ébauche de doc ; une promotion engendre un ticket de spec", () => {
		const j = stackJournalOf(lifecycle());
		expect(j.some((e) => e.service === "docs" && e.action === "ebauche")).toBe(
			true,
		);
		expect(j.some((e) => e.service === "tickets" && e.action === "spec")).toBe(
			true,
		);
	});

	it("DÉTERMINISTE et APPEND-ONLY : même état → même journal ; le journal suit le log", () => {
		const st = lifecycle();
		expect(stackJournalOf(st)).toEqual(stackJournalOf(st));
		const more = applyIntent(st, "déploie l'application en staging").state;
		const j1 = stackJournalOf(st);
		const j2 = stackJournalOf(more);
		expect(j2.slice(0, j1.length)).toEqual(j1);
		expect(j2.length).toBeGreaterThan(j1.length);
	});

	it("les POINTS DE RESTAURATION par env (le rollback Doltgres hors prod) s'accumulent", () => {
		let st = lifecycle();
		st = applyIntent(st, "capture l'idée : lister le catalogue").state;
		st = applyIntent(st, "promeus la dernière idée").state;
		st = applyIntent(st, "déploie l'application en dev").state;
		const points = stackJournalOf(st).filter(
			(e) => e.env === "dev" && e.service === "db",
		);
		expect(points.length).toBe(2); // deux déploiements dev = deux points
		expect(points[0].ref).not.toBe(points[1].ref);
	});
});

describe("envStackOf — l'URL PROPRE à chaque projet/environnement", () => {
	it("%project% et %env% substitués : l'app de « ma-boutique » en dev a SON URL", () => {
		const rows = envStackOf("dev", defaultInstanceConfig(), "ma-boutique");
		const app = rows.find((r) => r.key === "app");
		expect(app?.url).toContain("ma-boutique");
		expect(app?.url).toContain("dev");
		expect(app?.url).not.toContain("%");
	});

	it("sans projet : un slug par défaut, jamais un motif brut", () => {
		const rows = envStackOf("dev", defaultInstanceConfig());
		expect(rows.every((r) => !r.url.includes("%"))).toBe(true);
	});
});
