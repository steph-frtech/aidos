/**
 * WB2-12 — les FIXTURES de la machine de rejeu (XState v5). La machine n'orchestre que le curseur ;
 * elle DÉLÈGUE les frames au twin pur (lib/v2/operations). On épingle ici les transitions :
 *   - état initial : `idle`, curseur 0 (l'état initial idle, aucun event) ;
 *   - AVANCER : avance d'une frame, émet les events cumulés ; au dernier pas → état `finished` ;
 *   - REJOUER_TOUT : saute à la dernière frame (état `finished`) ;
 *   - RECOMMENCER : revient à l'état initial (`idle`, curseur 0) ;
 *   - une fixture REFUSÉE (denied) finit `finished` sans aucun event (le mur §93).
 */

import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import {
	CREATE_ORDER_DENIED,
	CREATE_ORDER_HAPPY,
} from "../../../lib/v2/operations";
import {
	initialReplayContext,
	operationReplayMachine,
} from "./OperationReplayMachine";

function start(fixture = CREATE_ORDER_HAPPY) {
	const actor = createActor(operationReplayMachine, {
		input: initialReplayContext(fixture),
	});
	actor.start();
	return actor;
}

describe("WB2-12 OperationReplayMachine — rejeu pas-à-pas", () => {
	it("démarre à l'état initial (idle, curseur 0, aucun event)", () => {
		const a = start();
		const s = a.getSnapshot();
		expect(s.value).toBe("idle");
		expect(s.context.cursor).toBe(0);
		expect(s.context.allFrames[0].events).toEqual([]);
	});

	it("AVANCER joue les pas un à un et émet les events cumulés jusqu'à finished", () => {
		const a = start();
		const total = a.getSnapshot().context.allFrames.length;
		for (let i = 0; i < total - 1; i++) a.send({ type: "AVANCER" });
		const s = a.getSnapshot();
		expect(s.value).toBe("finished");
		expect(s.context.cursor).toBe(total - 1);
		expect(s.context.allFrames[s.context.cursor].events).toEqual([
			"OrderCreated",
			"CartCleared",
		]);
	});

	it("REJOUER_TOUT saute directement à la dernière frame (finished)", () => {
		const a = start();
		a.send({ type: "REJOUER_TOUT" });
		const s = a.getSnapshot();
		expect(s.value).toBe("finished");
		expect(s.context.cursor).toBe(s.context.allFrames.length - 1);
	});

	it("RECOMMENCER revient à l'état initial (idle, curseur 0)", () => {
		const a = start();
		a.send({ type: "REJOUER_TOUT" });
		a.send({ type: "RECOMMENCER" });
		const s = a.getSnapshot();
		expect(s.value).toBe("idle");
		expect(s.context.cursor).toBe(0);
	});

	it("une fixture REFUSÉE finit finished sans aucun event (le mur §93)", () => {
		const a = start(CREATE_ORDER_DENIED);
		a.send({ type: "REJOUER_TOUT" });
		const s = a.getSnapshot();
		expect(s.value).toBe("finished");
		const last = s.context.allFrames[s.context.cursor];
		expect(last.kind).toBe("denied");
		expect(last.events).toEqual([]);
	});

	it("AVANCER ne dépasse jamais la dernière frame (borné)", () => {
		const a = start();
		for (let i = 0; i < 50; i++) a.send({ type: "AVANCER" });
		const s = a.getSnapshot();
		expect(s.context.cursor).toBe(s.context.allFrames.length - 1);
		expect(s.value).toBe("finished");
	});
});
