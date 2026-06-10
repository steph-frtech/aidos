"use client";

import dynamic from "next/dynamic";
import { mountedSmokes } from "@/lib/v2/lib-smoke";

/**
 * WB2-01 — le banc de sondes (« lab ») V2, client-only.
 *
 * Chaque librairie installée à WB2-01 a UNE sonde minimale montée via dynamic(ssr:false) :
 * react-arborist, react-aria-components, xstate, react-hook-form + zod, @xyflow/react.
 * bpmn-js est DIFFÉRÉ (OpenQuestion, ADR 0053) — déclaré dans le registre, non monté.
 *
 * DÉTERMINISME-FIRST : la liste des sondes montées vient du twin pur lib/v2/lib-smoke.ts
 * (mountedSmokes()), jamais d'une chaîne en dur. LE MUR : ce banc PROUVE le montage, il
 * n'écrit aucune vérité.
 */

const ArboristSmoke = dynamic(() => import("./smokes/ArboristSmoke"), {
	ssr: false,
});
const AriaSmoke = dynamic(() => import("./smokes/AriaSmoke"), { ssr: false });
const XStateSmoke = dynamic(() => import("./smokes/XStateSmoke"), {
	ssr: false,
});
const RhfZodSmoke = dynamic(() => import("./smokes/RhfZodSmoke"), {
	ssr: false,
});
const FlowSmoke = dynamic(() => import("./smokes/FlowSmoke"), { ssr: false });

const COMPONENTS: Record<string, React.ComponentType> = {
	arborist: ArboristSmoke,
	aria: AriaSmoke,
	xstate: XStateSmoke,
	"rhf-zod": RhfZodSmoke,
	flow: FlowSmoke,
};

export function LabClient() {
	return (
		<ul
			data-testid="v2-lab-smokes"
			className="grid grid-cols-1 gap-4 sm:grid-cols-2"
		>
			{mountedSmokes().map((s) => {
				const Comp = COMPONENTS[s.id];
				return (
					<li
						key={s.id}
						data-testid={`v2-lab-card-${s.id}`}
						className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
					>
						<span className="text-sm font-semibold text-foreground">
							{s.label}
						</span>
						{Comp ? <Comp /> : null}
					</li>
				);
			})}
		</ul>
	);
}
