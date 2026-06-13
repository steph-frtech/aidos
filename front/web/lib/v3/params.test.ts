import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { STAGES, THE_DOOR } from "../adoption";
import { KNOWN_MODELS_BY_PROVIDER, PROVIDERS } from "../agentlayer";
import { AGENTS } from "../agentlayer-data";
import { TRUTH_KINDS } from "../authority";
import { CHECKOUT_REGULATORY } from "../authority-data";
import { CRITICAL_CEILING, LEVELS } from "../autonomy";
import { mirrorForms } from "../besoin-completeness";
import { SOURCE_ORDER } from "../besoin-grammar";
import { BEHAVIOR_CATALOGUE } from "../compound";
import { CHECKOUT_BUDGET } from "../economics-data";
import { FACETS } from "../facets";
import { PAIR_KINDS } from "../v2/anatomy";
import { ENV_LADDER, INTENT_KINDS } from "../v2/builder";
import { LINK_KINDS } from "../v2/links";
import { SCREENS } from "../v2/screens";
import { ABOVE_ZONES, BELOW_ZONES } from "../wall";
import { CANONICAL_PHRASES, type ParamSection, paramCatalog } from "./params";

/**
 * V3 — le MIROIR du CATALOGUE DES PARAMÈTRES DÉCLARÉS (ADR 0060). L'écran
 * /v3/parametrage doit exposer TOUS les jeux clos / caps / specs DÉCLARÉS de la
 * V1 + V2 (jamais des fixtures de démo) : les gestes du chat, l'échelle, les
 * niveaux, les facettes, les preuves, les seuils, les écrans — ET les agents
 * avec leur harness gouverné, l'échelle d'autonomie, les budgets, l'adoption,
 * les behaviors, le mur, les autorités, les liens, l'anatomie. Le twin
 * paramCatalog est PUR & TOTAL & DÉTERMINISTE : même entrée → même catalogue.
 */

const byId = (sections: readonly ParamSection[], id: string): ParamSection => {
	const s = sections.find((x) => x.id === id);
	if (!s) throw new Error(`section absente du catalogue : ${id}`);
	return s;
};

describe("paramCatalog — le catalogue des paramètres déclarés (twin pur)", () => {
	it("DÉTERMINISME — deux appels rendent le MÊME catalogue (deepEqual), avec ou sans extra", () => {
		expect(paramCatalog()).toEqual(paramCatalog());
		expect(paramCatalog({ screensCount: 12 })).toEqual(
			paramCatalog({ screensCount: 12 }),
		);
		fc.assert(
			fc.property(fc.nat({ max: 500 }), (n) => {
				expect(paramCatalog({ screensCount: n })).toEqual(
					paramCatalog({ screensCount: n }),
				);
			}),
		);
	});

	it("FORME — ids uniques ; chaque section a ≥ 1 ligne ; chaque ligne a label + value + source réels", () => {
		const sections = paramCatalog({ screensCount: 7 });
		const ids = sections.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const s of sections) {
			expect(s.id.length).toBeGreaterThan(0);
			expect(s.titleKey.length).toBeGreaterThan(0);
			expect(s.rows.length).toBeGreaterThanOrEqual(1);
			for (const r of s.rows) {
				expect(r.label.length).toBeGreaterThan(0);
				expect(typeof r.value).toBe("string");
				expect(r.value.length).toBeGreaterThan(0);
				// · la valeur reste lisible (tronquée à ~200 caractères, jamais un pavé)
				expect(r.value.length).toBeLessThanOrEqual(200);
				// · la source est un vrai chemin de module déclaré ("lib/…")
				expect(r.source).toMatch(/^lib\//);
			}
		}
	});

	it("COUVERTURE — le catalogue porte AU MOINS les 16 sections déclarées", () => {
		const ids = paramCatalog().map((s) => s.id);
		for (const required of [
			"chat",
			"environnements",
			"niveaux",
			"facettes",
			"preuves",
			"seuils",
			"ecrans",
			"agents",
			"autonomie",
			"budgets",
			"adoption",
			"behaviors",
			"mur",
			"autorites",
			"liens",
			"anatomie",
		]) {
			expect(ids).toContain(required);
		}
		expect(ids.length).toBeGreaterThanOrEqual(16);
	});

	it("CHAT — les 9 intentions du jeu clos, chacune avec sa phrase canonique", () => {
		const s = byId(paramCatalog(), "chat");
		expect(INTENT_KINDS).toHaveLength(9);
		expect(s.rows).toHaveLength(INTENT_KINDS.length);
		for (const k of INTENT_KINDS) {
			const row = s.rows.find((r) => r.label === k);
			expect(row?.value).toBe(CANONICAL_PHRASES[k]);
		}
		expect(CANONICAL_PHRASES.capturer_idee).toBe("capture l'idée : <besoin>");
	});

	it("ENVIRONNEMENTS — les 3 barreaux de l'échelle, dans l'ordre déclaré", () => {
		const s = byId(paramCatalog(), "environnements");
		expect(ENV_LADDER).toHaveLength(3);
		expect(s.rows).toHaveLength(ENV_LADDER.length);
		expect(s.rows.map((r) => r.value)).toEqual([...ENV_LADDER]);
	});

	it("NIVEAUX — les 7 barreaux SOURCE de la verticale (§23), dans l'ordre", () => {
		const s = byId(paramCatalog(), "niveaux");
		expect(SOURCE_ORDER).toHaveLength(7);
		expect(s.rows).toHaveLength(SOURCE_ORDER.length);
		expect(s.rows[0].value).toBe("product");
		expect(s.rows[s.rows.length - 1].value).toBe("entity");
	});

	it("FACETTES — les 8 lentilles canoniques F→X", () => {
		const s = byId(paramCatalog(), "facettes");
		expect(FACETS).toHaveLength(8);
		expect(s.rows).toHaveLength(FACETS.length);
		expect(s.rows.map((r) => r.label)).toEqual(FACETS.map((f) => f.letter));
	});

	it("PREUVES — les formes de miroir du jeu clos (mirrorForms)", () => {
		const s = byId(paramCatalog(), "preuves");
		expect(s.rows).toHaveLength(mirrorForms().length);
		expect(s.rows.map((r) => r.value)).toEqual(mirrorForms());
	});

	it("SEUILS — MIN_INTENT_LEN et MIN_MIRROR_LEN, lus de leurs modules", () => {
		const s = byId(paramCatalog(), "seuils");
		expect(s.rows).toHaveLength(2);
		expect(s.rows[0].source).toContain("lib/v2/idea.ts");
		expect(s.rows[1].source).toContain("lib/v2/goal.ts");
	});

	it("ÉCRANS — le registre V2 toujours ; le compte de la session SEULEMENT si fourni", () => {
		const sans = byId(paramCatalog(), "ecrans");
		expect(sans.rows).toHaveLength(1);
		expect(sans.rows[0].value).toBe(String(SCREENS.length));

		const avec = byId(paramCatalog({ screensCount: 12 }), "ecrans");
		expect(avec.rows).toHaveLength(2);
		expect(avec.rows[0].value).toBe("12");
		fc.assert(
			fc.property(fc.nat({ max: 500 }), (n) => {
				const e = byId(paramCatalog({ screensCount: n }), "ecrans");
				expect(e.rows[0].value).toBe(String(n));
			}),
		);
	});

	it("AGENTS — chaque CoucheAgent contribue SON harness complet (8 lignes par agent)", () => {
		const s = byId(paramCatalog(), "agents");
		expect(s.rows).toHaveLength(AGENTS.length * 8);
		for (const a of AGENTS) {
			const id = a.spec.id;
			const modele = s.rows.find((r) => r.label === `${id} · modèle`);
			expect(modele?.value).toBe(`${a.spec.modele} (${a.spec.provider})`);
			// · les droits gouvernés — le mur rendu noir sur blanc (noyau/fitness JAMAIS)
			const droits = s.rows.find((r) => r.label === `${id} · droits`);
			expect(droits?.value).toContain("modifie noyau : NON");
			expect(droits?.value).toContain("modifie fitness : NON");
			// · zones, stop conditions, réglages, outils — le harness gouverné entier
			expect(
				s.rows.find((r) => r.label === `${id} · zones lecture`)?.value,
			).toBe(a.spec.zonesLecture.join(" · "));
			expect(
				s.rows.find((r) => r.label === `${id} · zones écriture`)?.value,
			).toBe(a.spec.zonesEcriture.join(" · "));
			expect(
				s.rows.find((r) => r.label === `${id} · stop conditions`)?.value,
			).toBe(a.spec.stopConditions.join(" · "));
			const knobs = s.rows.find((r) => r.label === `${id} · réglages`);
			expect(knobs?.value).toContain(`température ${a.spec.temperature}`);
			expect(knobs?.value).toContain(`${a.spec.maxTurns} tours max`);
			expect(
				s.rows.find((r) => r.label === `${id} · outils & skills`),
			).toBeDefined();
		}
		// · le modèle déclaré du fixture est bien claude-opus-4-8 (anthropic)
		expect(s.rows.some((r) => r.value === "claude-opus-4-8 (anthropic)")).toBe(
			true,
		);
	});

	it("MODÈLES — le jeu clos de modèles par provider (jamais découvert)", () => {
		const s = byId(paramCatalog(), "modeles");
		expect(s.rows).toHaveLength(PROVIDERS.length);
		const anthropic = s.rows.find((r) => r.label === "anthropic");
		expect(anthropic?.value).toBe(
			KNOWN_MODELS_BY_PROVIDER.anthropic.join(" · "),
		);
		expect(anthropic?.value).toContain("claude-opus-4-8");
	});

	it("AUTONOMIE — les 9 échelons A0..A8 + la ligne du plafond critique A7", () => {
		const s = byId(paramCatalog(), "autonomie");
		expect(s.rows).toHaveLength(LEVELS.length + 1);
		expect(s.rows[0].label).toBe("A0");
		expect(s.rows[LEVELS.length - 1].label).toBe("A8");
		const plafond = s.rows[s.rows.length - 1];
		expect(plafond.label).toBe("plafond critique");
		expect(plafond.value).toContain(`A${CRITICAL_CEILING}`);
	});

	it("BUDGETS — les 5 axes du HarnessCostBudget déclaré (§66.3), jamais les rows de démo", () => {
		const s = byId(paramCatalog(), "budgets");
		expect(s.rows).toHaveLength(5);
		const values = s.rows.map((r) => r.value).join(" | ");
		expect(values).toContain(`≤ ${CHECKOUT_BUDGET.maxCiMinutes} min`);
		expect(values).toContain(`≤ ${CHECKOUT_BUDGET.maxLlmTokensPerGoal}`);
		expect(values).toContain(CHECKOUT_BUDGET.expectedRiskReduction);
		for (const r of s.rows) {
			expect(r.source).toContain("lib/economics-data.ts");
		}
	});

	it("ADOPTION — un échelon par tier T0..T4 (requiert · accorde) + la porte unique", () => {
		const s = byId(paramCatalog(), "adoption");
		expect(s.rows).toHaveLength(STAGES.length + 1);
		expect(s.rows.slice(0, STAGES.length).map((r) => r.label)).toEqual([
			...STAGES,
		]);
		expect(s.rows[0].value).toContain("tests");
		expect(s.rows[s.rows.length - 1].value).toBe(THE_DOOR);
	});

	it("BEHAVIORS — le catalogue fermé §24.6, joint en une ligne", () => {
		const s = byId(paramCatalog(), "behaviors");
		expect(s.rows).toHaveLength(1);
		for (const kind of BEHAVIOR_CATALOGUE) {
			expect(s.rows[0].value).toContain(kind);
		}
	});

	it("MUR — la surface déclarée : au-dessus (gelé) et sous (libre) la ligne", () => {
		const s = byId(paramCatalog(), "mur");
		expect(s.rows).toHaveLength(2);
		expect(s.rows[0].value).toBe(ABOVE_ZONES.map((z) => z.name).join(" · "));
		expect(s.rows[0].value).toContain("kernel");
		expect(s.rows[0].value).toContain("fitness");
		expect(s.rows[1].value).toBe(BELOW_ZONES.map((z) => z.name).join(" · "));
	});

	it("AUTORITÉS — les 7 sortes de vérité + le graphe §13.8 verbatim (approbateurs/veto/escalade)", () => {
		const s = byId(paramCatalog(), "autorites");
		expect(s.rows).toHaveLength(4);
		expect(TRUTH_KINDS).toHaveLength(7);
		expect(s.rows[0].value).toBe(TRUTH_KINDS.join(" · "));
		expect(s.rows[1].value).toBe(CHECKOUT_REGULATORY.approvers.join(" · "));
		expect(s.rows[2].value).toBe(CHECKOUT_REGULATORY.veto.join(" · "));
		expect(s.rows[3].value).toBe(CHECKOUT_REGULATORY.escalation.join(" · "));
	});

	it("LIENS — les 6 familles closes (§17/§41), chacune avec son mapping canonique", () => {
		const s = byId(paramCatalog(), "liens");
		expect(LINK_KINDS).toHaveLength(6);
		expect(s.rows).toHaveLength(LINK_KINDS.length);
		expect(s.rows.map((r) => r.label)).toEqual([...LINK_KINDS]);
	});

	it("ANATOMIE — les 6 paires-miroir du jeu clos, dans l'ordre canonique", () => {
		const s = byId(paramCatalog(), "anatomie");
		expect(PAIR_KINDS).toHaveLength(6);
		expect(s.rows).toHaveLength(PAIR_KINDS.length);
		expect(s.rows.map((r) => r.value)).toEqual([...PAIR_KINDS]);
	});
});
