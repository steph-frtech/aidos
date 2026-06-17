import type {
	ProposedChangeSet,
	RatchetVerdict,
	StructuralMetric,
} from "@/lib/arch-fitness";
import type { Source } from "@/lib/gateway-sdk";

/**
 * Modèles de vue de la lentille V3 /v3/arch-fitness (le cliquet structurel §47). Tenus HORS de
 * actions.ts car un module Next "use server" ne peut exporter que des fonctions asynchrones — les
 * types et valeurs initiales vivent ici, partagés par les Server Actions ET le composant client.
 */
export interface MeasureView {
	ok: boolean;
	metric?: StructuralMetric;
	/** la métrique vient-elle du moteur Go live (passerelle) ou du repli de démo (S59). */
	source?: Source;
}

export interface RatchetView {
	ok: boolean;
	verdict?: RatchetVerdict;
}

export interface GateView {
	ok: boolean;
	metric?: StructuralMetric;
	verdict?: RatchetVerdict;
	/** quelle faute a été injectée dans la coupe candidate (clean | violation | cycle). */
	scenario?: string;
}

export interface ProposeView {
	ok: boolean;
	changeset?: ProposedChangeSet;
}

export const MEASURE_INITIAL: MeasureView = { ok: false };
export const RATCHET_INITIAL: RatchetView = { ok: false };
export const GATE_INITIAL: GateView = { ok: false };
export const PROPOSE_INITIAL: ProposeView = { ok: false };
