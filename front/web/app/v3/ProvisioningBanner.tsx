"use client";

import { useEffect, useState } from "react";
import { provisionStatusAction } from "./environnements/deploy-actions";
import { useV3Session } from "./V3Session";

/**
 * LE BANDEAU DE PROVISIONING (#1, ADR 0040/0043) : « au moment où on crée le projet, on attend
 * que toute la stack du projet monte ». Quand `createProject` lance le déploiement réel, il pose
 * un drapeau `sessionStorage["aidos-provisioning:<slug>"]` ; ce bandeau le lit (il SURVIT au
 * remount de la session, clé par projet) et POLL `provisionStatusAction(slug)` toutes les 4 s
 * jusqu'à ce que la stack réponde (server · base · interpréteur derrière `<slug>-dev`). Tant
 * qu'elle monte : « votre stack se monte… ». Montée : « en ligne » + lien, puis le drapeau tombe.
 * Une LECTURE pure (un GET /healthz), aucune écriture de vérité (le mur §2).
 */
export function ProvisioningBanner() {
	const { projectId, strings: t } = useV3Session();
	const [state, setState] = useState<"idle" | "building" | "up">("idle");
	const [url, setUrl] = useState<string>("");

	useEffect(() => {
		if (projectId === null) return;
		const key = `aidos-provisioning:${projectId}`;
		if (typeof window === "undefined" || !window.sessionStorage.getItem(key)) {
			setState("idle");
			return;
		}
		setState("building");
		let alive = true;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const poll = async () => {
			const r = await provisionStatusAction(projectId).catch(() => ({
				up: false,
				url: "",
			}));
			if (!alive) return;
			setUrl(r.url);
			if (r.up) {
				setState("up");
				window.sessionStorage.removeItem(key);
				return;
			}
			timer = setTimeout(poll, 4000);
		};
		void poll();
		return () => {
			alive = false;
			if (timer) clearTimeout(timer);
		};
	}, [projectId]);

	if (state === "idle") return null;

	return (
		<div
			data-testid="v3-provisioning"
			data-state={state}
			className={[
				"mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs",
				state === "up"
					? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
					: "border-primary/30 bg-primary/5 text-primary",
			].join(" ")}
		>
			{state === "building" ? (
				<>
					<span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
					<span>{t.provisioningBuilding}</span>
				</>
			) : (
				<>
					<span className="h-2 w-2 rounded-full bg-emerald-500" />
					<span>{t.provisioningUp}</span>
					{url !== "" && (
						<a
							href={url}
							target="_blank"
							rel="noreferrer"
							className="font-mono underline"
						>
							{url}
						</a>
					)}
				</>
			)}
		</div>
	);
}
