import type { Resolution } from "@/lib/connections";
import type {
	BindingChangeSet,
	CockpitRefusal,
	SensorStatus,
} from "@/lib/env-binding-cockpit";
import type { GatewayBlockReason } from "@/lib/gateway";

/**
 * View types shared by the DP09 cockpit Server Actions and the client panel
 * (« déclarer/éditer un binding d'environnement » — propose → ChangeSet →
 * approbation ; matrice recalculée = projection pure DP07). A "use server"
 * module may only export async functions, so these live here.
 */

export interface ProposeView {
	done: boolean;
	/** the S58 gateway tool the gesture went through (changeset_open). */
	door?: string;
	/** the draft was refused fail-closed (DP06 A1 / closed sets / DP08). */
	refusal?: CockpitRefusal;
	/** the PROPOSED (never admitted) content-addressed S20 envelope. */
	proposal?: BindingChangeSet;
}

export const PROPOSE_INITIAL: ProposeView = { done: false };

export interface ApproveView {
	done: boolean;
	/** the S58 gateway tool the gesture went through (changeset_apply). */
	door?: string;
	refusal?: CockpitRefusal;
	/** the APPLIED envelope (the cockpit sandbox — the wall intact). */
	applied?: BindingChangeSet;
	/** the recomputed rows of the edited environment (pure DP07 projection). */
	matrixRows?: Resolution[];
	/** the content address of the WHOLE recomputed matrix. */
	hash?: string;
	/** whether it still equals the Go-pinned zero-changeset address. */
	sameAsSeeded?: boolean;
	/** the DP08 sensor re-sensed after the recompute. */
	sensor?: SensorStatus;
}

export const APPROVE_INITIAL: ApproveView = { done: false };

export interface WallProbeView {
	probed: boolean;
	/** the gateway outcome — refused_truth_write for kernel_write. */
	outcome?: string;
	blockReason?: GatewayBlockReason;
}

export const WALL_PROBE_INITIAL: WallProbeView = { probed: false };
