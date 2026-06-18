import type { Source } from "@/lib/gateway-sdk";
import type { Dashboard, Signal } from "@/lib/ops-observability";

/**
 * View model for the /ops-observability panel (S92). The panel is action-capable
 * (CLAUDE.md §7): the user EMITS OTel signals (the emitted app's logs/spans/errors) and
 * BUILDS the ops dashboard from them — the surface to operate the app daily. The BUILD is
 * routed LIVE through the Go `ops_dashboard` tool via the passerelle (ADR 0092 flip), the
 * twin compute kept as the optimistic demo fallback (`source:"live"|"demo"`). THE WALL:
 * every build writes no truth (wroteKernel === false), surfaced explicitly here.
 */
export interface OpsView {
	ok: boolean;
	/** the dashboard rendered for the active project (null before the first build). */
	dashboard: Dashboard | null;
	/** the WALL PROOF: building a dashboard wrote no kernel (always false). */
	wroteKernel: boolean;
	/** the raw signals buffered for the active project (drives the "emit" feed). */
	signals: Signal[];
	/** whether the rendered dashboard came from the live gateway or the demo twin. */
	source: Source;
	/** a human note on the last action. */
	message?: string;
}

export const OPS_INITIAL: OpsView = {
	ok: false,
	dashboard: null,
	wroteKernel: false,
	signals: [],
	source: "demo",
};
