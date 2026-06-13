"use client";

import { useState } from "react";
import { AppServiceSubstratePanel } from "./AppServiceSubstratePanel";
import { AsyncSubstratePanel } from "./AsyncSubstratePanel";
import type {
	AppServiceSubstrateView,
	AsyncSubstrateView,
	ObservabilitySubstrateView,
	SubstrateView,
} from "./actions";
import { ObservabilitySubstratePanel } from "./ObservabilitySubstratePanel";
import { SubstratePanel } from "./SubstratePanel";

/**
 * SubstrateScreen is the /substrate cockpit shell: it composes the DP15 DATA-substrate
 * panel (Postgres / Doltgres / Valkey / PgBouncer, with the env selector that owns the
 * gesture), the DP16 ASYNC-substrate panel (Windmill / NATS + the demo job trigger) and the
 * DP17 OBSERVABILITY-substrate panel (OTel collector / SigNoz / GlitchTip + the emitted
 * instrumentation + the « écrit aucune vérité » indicator).
 *
 * It also composes the DP18 APP-SERVICE-substrate panel (Forgejo git / Plane tickets /
 * Better-Auth core/auth + the auth cabling S80 × S76 + the « auth de l'app ≠ auth AIDOS »
 * indicator).
 *
 * It HOISTS the selected env from the data panel's selector so the async + observability +
 * app-service twins re-emit for the SAME (project, env) in step — one selector drives all
 * substrate slices. The shell writes nothing (THE WALL §2): every panel is a below-the-line
 * projection of the authoritative Go.
 */
export function SubstrateScreen({
	activeProjectId,
	initialData,
	initialAsync,
	initialObs,
	initialAppsvc,
}: {
	activeProjectId: string | null;
	initialData: SubstrateView;
	initialAsync: AsyncSubstrateView;
	initialObs: ObservabilitySubstrateView;
	initialAppsvc: AppServiceSubstrateView;
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
			<ObservabilitySubstratePanel
				activeProjectId={activeProjectId}
				env={env}
				initial={initialObs}
			/>
			<AppServiceSubstratePanel
				activeProjectId={activeProjectId}
				env={env}
				initial={initialAppsvc}
			/>
		</div>
	);
}
