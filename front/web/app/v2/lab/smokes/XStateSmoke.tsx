"use client";

import { useMachine } from "@xstate/react";
import { assign, setup } from "xstate";

/**
 * WB2-01 sonde xstate + @xstate/react — une machine à états qui monte client-only.
 * Prouve que le moteur de wizard (WB2-03 idée) monte, transite, et build OK.
 * Machine minimale : repos → (DÉMARRER) → actif → (ARRÊTER) → repos, compteur de tours.
 */
const machine = setup({
	types: {} as { context: { tours: number } },
}).createMachine({
	id: "smoke",
	initial: "repos",
	context: { tours: 0 },
	states: {
		repos: { on: { DEMARRER: "actif" } },
		actif: {
			on: {
				ARRETER: {
					target: "repos",
					actions: assign({ tours: ({ context }) => context.tours + 1 }),
				},
			},
		},
	},
});

export default function XStateSmoke() {
	const [state, send] = useMachine(machine);
	return (
		<div data-testid="v2-smoke-xstate" className="space-y-2 text-sm">
			<p data-testid="v2-smoke-xstate-state" className="text-foreground">
				état : {String(state.value)} · tours : {state.context.tours}
			</p>
			<div className="flex gap-2">
				<button
					type="button"
					data-testid="v2-smoke-xstate-start"
					onClick={() => send({ type: "DEMARRER" })}
					className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-primary/5 hover:text-primary"
				>
					Démarrer
				</button>
				<button
					type="button"
					data-testid="v2-smoke-xstate-stop"
					onClick={() => send({ type: "ARRETER" })}
					className="rounded-md border border-border bg-card px-3 py-1.5 text-foreground hover:bg-primary/5 hover:text-primary"
				>
					Arrêter
				</button>
			</div>
		</div>
	);
}
