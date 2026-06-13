"use client";

import { useState } from "react";
import { AsyncSubstratePanel } from "./AsyncSubstratePanel";
import type { AsyncSubstrateView, SubstrateView } from "./actions";
import { SubstratePanel } from "./SubstratePanel";

/**
 * SubstrateScreen is the /substrate cockpit shell: it composes the DP15 DATA-substrate
 * panel (Postgres / Doltgres / Valkey / PgBouncer, with the env selector that owns the
 * gesture) and the DP16 ASYNC-substrate panel (Windmill / NATS + the demo job trigger).
 *
 * It HOISTS the selected env from the data panel's selector so the async twin re-emits
 * for the SAME (project, env) in step — one selector drives both substrate slices. The
 * shell writes nothing (THE WALL §2): both panels are below-the-line projections of the
 * authoritative Go.
 */
export function SubstrateScreen({
	activeProjectId,
	initialData,
	initialAsync,
}: {
	activeProjectId: string | null;
	initialData: SubstrateView;
	initialAsync: AsyncSubstrateView;
}) {
	const [env, setEnv] = useState<string>(initialData.env);

	return (
		<div className="space-y-12">
			<SubstratePanel
				activeProjectId={activeProjectId}
				initial={initialData}
				onEnvChange={setEnv}
			/>
			<AsyncSubstratePanel
				activeProjectId={activeProjectId}
				env={env}
				initial={initialAsync}
			/>
		</div>
	);
}
