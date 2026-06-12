import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyIntent, emitApp, initBuilderState } from "../v2/builder";
import { bareTree } from "../v2/composition";
import { filesOf } from "./emit-files";

/**
 * V3 — le MIROIR de l'ÉMISSION EN FICHIERS (ADR 0062) : « VS Code doit être sur le
 * projet en cours » — au déploiement, l'app du projet devient de VRAIS fichiers
 * (le workspace de l'env). L'émission est un ÉMETTEUR DÉTERMINISTE (§6) : même
 * app → mêmes fichiers, octet pour octet. Jamais un LLM.
 */

function appWithKernel() {
	let st = initBuilderState([], bareTree());
	st = applyIntent(st, "greffe le paiement sous app").state;
	st = applyIntent(
		st,
		"capture l'idée : au paiement, débiter une seule fois",
	).state;
	st = applyIntent(st, "promeus la dernière idée").state;
	return { app: emitApp(st), name: "Ma boutique" };
}

describe("filesOf — l'app émise en fichiers, déterministiquement", () => {
	it("REPRODUCTIBLE : même app → mêmes fichiers (chemins ET contenus)", () => {
		const { app, name } = appWithKernel();
		expect(filesOf(name, app)).toEqual(filesOf(name, app));
	});

	it("les chemins sont uniques, relatifs, sans traversée (fail-closed)", () => {
		const { app, name } = appWithKernel();
		const files = filesOf(name, app);
		const paths = files.map((f) => f.path);
		expect(new Set(paths).size).toBe(paths.length);
		for (const p of paths) {
			expect(p.startsWith("/")).toBe(false);
			expect(p.includes("..")).toBe(false);
		}
	});

	it("le README porte la version d'app, le schéma porte chaque entité", () => {
		const { app, name } = appWithKernel();
		const files = filesOf(name, app);
		const readme = files.find((f) => f.path === "README.md");
		const schema = files.find((f) => f.path === "schema.sql");
		expect(readme?.content).toContain(app.version);
		expect(readme?.content).toContain(name);
		for (const e of app.entities)
			expect(schema?.content.toLowerCase()).toContain(
				e.name.replace(/-/g, "_"),
			);
	});

	it("TOTAL : une app vide émet quand même un workspace lisible (README seul minimum)", () => {
		const st = initBuilderState([], bareTree());
		const files = filesOf("Vide", emitApp(st));
		expect(files.length).toBeGreaterThan(0);
		expect(files.some((f) => f.path === "README.md")).toBe(true);
	});

	it("∀ : jamais une exception (totalité sur noms arbitraires)", () => {
		const { app } = appWithKernel();
		fc.assert(
			fc.property(fc.string({ maxLength: 40 }), (n) => {
				expect(() => filesOf(n, app)).not.toThrow();
			}),
		);
	});
});
