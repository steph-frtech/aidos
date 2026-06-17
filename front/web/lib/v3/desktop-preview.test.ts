/**
 * « Voir Electron » — le MIROIR DE REPRODUCTIBILITÉ du DÉCODEUR (ADR 0093, capacité « voir Electron »).
 *   reflects: front.v3.desktop-preview (le décodeur pur de la sortie moteur -children / -capture)
 *   · test_kind: property+example · cert_language: fast-check/vitest · authority: below (projection, le mur intact)
 *   · liveness: live
 *
 * Le décodeur est PUR & DÉTERMINISTE & TOTAL (CLAUDE.md §6/§8) : il ne ré-émet RIEN (le MOTEUR Go est
 * la source, ADR 0092), il ne fait que TYPER, fail-closed, le texte que le binaire imprime. Ces cas
 * épinglent les critères de done :
 *   (a) un ÉCHANTILLON RÉEL de `-children` (capturé du binaire le 2026-06-17, master shop, 3 enfants)
 *       → la forme typée exacte (snake_case → camelCase, cibles du jeu clos, artefacts triés) ;
 *   (b) DÉTERMINISME : décoder deux fois le même texte → le même objet (référence-égal champ à champ) ;
 *   (c) FAIL-CLOSED : non-JSON, racine non-objet, champ manquant, cible hors-jeu, artifacts non-tableau
 *       → {ok:false} avec une raison (JAMAIS un throw, JAMAIS une forme inventée) ;
 *   (d) la LIGNE de capture `OK <octets> <W>x<H> <bundleHash>` → dimensions+empreinte ; bruit → null.
 * La capture LIVE (le pixel réel) est couverte par le miroir MOTEUR (back/runtime/desktoppreview/
 * runner_electronlive_test.go) — ici on ne juge QUE le décodage déterministe.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
	type DecodeChildrenResult,
	decodeDesktopChildren,
	parseCaptureLine,
} from "./desktop-preview";

/**
 * Un ÉCHANTILLON RÉEL imprimé par `./back/bin/desktop-preview -children` le 2026-06-17 (master shop :
 * une entité Order + le bouton checkout → createOrder). Le décodeur doit le typer SANS perte.
 */
const REAL_CHILDREN = JSON.stringify({
	project: "shop",
	master_hash:
		"332263d1dfc3b2460035ee3f48d037896d9999b072dcb98974d8c1f68b52fa8c",
	children: [
		{
			target: "web-app",
			parent_id:
				"332263d1dfc3b2460035ee3f48d037896d9999b072dcb98974d8c1f68b52fa8c",
			artifacts: [
				"gen/shop/web/CheckoutButton.tsx",
				"gen/shop/web/Dockerfile",
				"gen/shop/web/index.html",
				"gen/shop/web/main.tsx",
			],
		},
		{
			target: "mobile-app",
			parent_id:
				"332263d1dfc3b2460035ee3f48d037896d9999b072dcb98974d8c1f68b52fa8c",
			artifacts: ["gen/shop/mobile/App.tsx", "gen/shop/mobile/package.json"],
		},
		{
			target: "desktop-app",
			parent_id:
				"332263d1dfc3b2460035ee3f48d037896d9999b072dcb98974d8c1f68b52fa8c",
			artifacts: [
				"gen/shop/desktop/main.js",
				"gen/shop/desktop/preload.js",
				"gen/shop/desktop/renderer.tsx",
			],
		},
	],
});

function expectOk(r: DecodeChildrenResult) {
	if (!r.ok) throw new Error(`attendu ok, obtenu échec: ${r.reason}`);
	return r.value;
}

describe("decodeDesktopChildren — décode la sortie -children du moteur", () => {
	it("(a) type l'échantillon réel sans perte (snake_case → camelCase, 3 enfants)", () => {
		const v = expectOk(decodeDesktopChildren(REAL_CHILDREN));
		expect(v.project).toBe("shop");
		expect(v.masterHash).toBe(
			"332263d1dfc3b2460035ee3f48d037896d9999b072dcb98974d8c1f68b52fa8c",
		);
		expect(v.children.map((c) => c.target)).toEqual([
			"web-app",
			"mobile-app",
			"desktop-app",
		]);
		// chaque enfant porte l'adresse-contenu de la maître parente + ses artefacts triés
		for (const c of v.children) {
			expect(c.parentId).toBe(v.masterHash);
			expect(c.artifacts.length).toBeGreaterThan(0);
		}
		expect(v.children[0]?.artifacts).toEqual([
			"gen/shop/web/CheckoutButton.tsx",
			"gen/shop/web/Dockerfile",
			"gen/shop/web/index.html",
			"gen/shop/web/main.tsx",
		]);
	});

	it("(b) déterminisme : deux décodages du même texte → la même forme", () => {
		const a = expectOk(decodeDesktopChildren(REAL_CHILDREN));
		const b = expectOk(decodeDesktopChildren(REAL_CHILDREN));
		expect(a).toEqual(b);
	});

	it("(c) fail-closed : non-JSON → {ok:false}", () => {
		const r = decodeDesktopChildren("pas du json {");
		expect(r.ok).toBe(false);
	});

	it("(c) fail-closed : racine non-objet (tableau/nombre/chaîne) → {ok:false}", () => {
		for (const bad of ["[]", "42", '"x"', "null", "true"]) {
			expect(decodeDesktopChildren(bad).ok).toBe(false);
		}
	});

	it("(c) fail-closed : project manquant → {ok:false}", () => {
		const r = decodeDesktopChildren(
			JSON.stringify({ master_hash: "h", children: [] }),
		);
		expect(r.ok).toBe(false);
	});

	it("(c) fail-closed : master_hash manquant → {ok:false}", () => {
		const r = decodeDesktopChildren(
			JSON.stringify({ project: "p", children: [] }),
		);
		expect(r.ok).toBe(false);
	});

	it("(c) fail-closed : children non-tableau → {ok:false}", () => {
		const r = decodeDesktopChildren(
			JSON.stringify({ project: "p", master_hash: "h", children: {} }),
		);
		expect(r.ok).toBe(false);
	});

	it("(c) fail-closed : cible d'enfant hors-jeu → {ok:false}", () => {
		const r = decodeDesktopChildren(
			JSON.stringify({
				project: "p",
				master_hash: "h",
				children: [{ target: "tv-app", parent_id: "h", artifacts: [] }],
			}),
		);
		expect(r.ok).toBe(false);
	});

	it("(c) fail-closed : artifacts non-tableau-de-chaînes → {ok:false}", () => {
		const r = decodeDesktopChildren(
			JSON.stringify({
				project: "p",
				master_hash: "h",
				children: [{ target: "web-app", parent_id: "h", artifacts: [1, 2] }],
			}),
		);
		expect(r.ok).toBe(false);
	});

	it("(c) fail-closed : children vide est VALIDE (0 enfant ≠ erreur)", () => {
		const v = expectOk(
			decodeDesktopChildren(
				JSON.stringify({ project: "p", master_hash: "h", children: [] }),
			),
		);
		expect(v.children).toEqual([]);
	});

	it("(c) totalité : aucune chaîne arbitraire ne fait crasher (jamais un throw)", () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				const r = decodeDesktopChildren(s);
				// soit un décodage valide, soit un refus typé — jamais une exception
				expect(typeof r.ok).toBe("boolean");
			}),
		);
	});
});

describe("parseCaptureLine — décode la ligne OK du -capture", () => {
	it("(d) décode `OK <octets> <W>x<H> <bundleHash>` réel", () => {
		const r = parseCaptureLine("OK 13901 1280x773 08186b312992253c29da26");
		expect(r).not.toBeNull();
		expect(r?.bytes).toBe(13901);
		expect(r?.width).toBe(1280);
		expect(r?.height).toBe(773);
		expect(r?.bundleHash).toBe("08186b312992253c29da26");
	});

	it("(d) trouve la ligne OK même noyée dans du bruit stdout", () => {
		const r = parseCaptureLine("démarrage…\nCDP up\nOK 100 640x480 abc\nbye\n");
		expect(r?.width).toBe(640);
		expect(r?.height).toBe(480);
	});

	it("(d) bruit sans ligne OK bien formée → null", () => {
		for (const bad of [
			"",
			"KO échec",
			"OK 100",
			"OK 100 640x480",
			"OK x y z",
			"OK 1 640x abc",
		]) {
			expect(parseCaptureLine(bad)).toBeNull();
		}
	});
});
