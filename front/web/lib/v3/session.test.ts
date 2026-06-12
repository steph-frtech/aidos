import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyIntent, initBuilderState } from "../v2/builder";
import { replayTo, type SessionTurn, turnsOf } from "./session";

/**
 * V3 — le MIROIR de la SESSION REJOUABLE (ADR 0060) : l'HISTORY n'est pas une
 * fonctionnalité, c'est une CONSÉQUENCE de l'event-sourcing — l'état n'est JAMAIS
 * stocké, il est REJOUÉ (fold du réducteur pur sur le transcript). « Revenir en
 * arrière » = rejouer un PRÉFIXE. Déterministe par construction, prouvé ici.
 */

const msgsArb = fc.array(
	fc.oneof(
		fc.constant(
			"capture l'idée : au checkout, débiter le compte une seule fois",
		),
		fc.constant("promeus la dernière idée"),
		fc.constant("greffe pommes sous app/catalogue"),
		fc.constant("déploie l'application en dev"),
		fc.constant("montre-moi l'état du projet"),
		fc.string({ maxLength: 40 }),
	),
	{ maxLength: 8 },
);

describe("replayTo — l'état est REJOUÉ, jamais stocké", () => {
	it("∀ transcript : replayTo(msgs, n) ≡ le fold du réducteur sur les n premiers messages", () => {
		fc.assert(
			fc.property(msgsArb, fc.nat(), (msgs, pick) => {
				const n = msgs.length === 0 ? 0 : pick % (msgs.length + 1);
				let expected = initBuilderState();
				for (const m of msgs.slice(0, n))
					expected = applyIntent(expected, m).state;
				expect(replayTo(msgs, n)).toEqual(expected);
			}),
		);
	});

	it("∀ : DÉTERMINISTE — même transcript, même n → même état (le voyage est sûr)", () => {
		fc.assert(
			fc.property(msgsArb, fc.nat(), (msgs, pick) => {
				const n = msgs.length === 0 ? 0 : pick % (msgs.length + 1);
				expect(replayTo(msgs, n)).toEqual(replayTo(msgs, n));
			}),
		);
	});

	it("REVENIR EN ARRIÈRE est un préfixe : l'état à n ne dépend JAMAIS des messages > n", () => {
		fc.assert(
			fc.property(msgsArb, fc.string({ maxLength: 30 }), (msgs, extraMsg) => {
				const n = msgs.length;
				const longer = [...msgs, extraMsg, extraMsg];
				expect(replayTo(longer, n)).toEqual(replayTo(msgs, n));
			}),
		);
	});

	it("n hors bornes est TOTAL (clampé) : négatif → état initial ; > longueur → état final", () => {
		const msgs = ["greffe pommes sous app/catalogue"];
		expect(replayTo(msgs, -3)).toEqual(initBuilderState());
		expect(replayTo(msgs, 99)).toEqual(replayTo(msgs, 1));
	});
});

describe("turnsOf — le transcript annoté (chaque tour : attente, événements, impacts)", () => {
	it("∀ transcript : un tour par message, l'état final égale replayTo(msgs, len)", () => {
		fc.assert(
			fc.property(msgsArb, (msgs) => {
				const r = turnsOf(msgs);
				expect(r.turns).toHaveLength(msgs.length);
				expect(r.state).toEqual(replayTo(msgs, msgs.length));
				for (let i = 0; i < r.turns.length; i++) {
					const t: SessionTurn = r.turns[i];
					expect(t.msg).toBe(msgs[i]);
					expect(t.index).toBe(i);
				}
			}),
		);
	});

	it("chaque tour porte son verdict ET ses événements (rien n'est recalculé différemment)", () => {
		const msgs = [
			"capture l'idée : au checkout, débiter le compte une seule fois",
			"promeus la dernière idée",
		];
		const r = turnsOf(msgs);
		expect(r.turns[0].understanding.attente).toBe("capturer_idee");
		expect(r.turns[0].events.some((e) => e.kind === "idee_capturee")).toBe(
			true,
		);
		expect(r.turns[1].events.some((e) => e.kind === "kernel_propose")).toBe(
			true,
		);
		expect(r.state.kernels).toHaveLength(1);
	});
});
