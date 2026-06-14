"use client";

import { useEffect, useRef } from "react";
import {
	type FromIframe,
	parseFromIframe,
	type ToIframe,
} from "@/lib/v3/design/bridge-protocol";

/**
 * /v3/design — LA 1re VRAIE <iframe> de /v3 (ADR 0071, Onlook INVERSÉ). Montée sur l'URL
 * live de l'app en dev (envStackOf('dev')), sandbox. Le handshake postMessage (bridge-protocol)
 * relie l'app émise (qui embarque aidos-bridge.embed.ts) à la lentille : l'iframe annonce ses
 * coordonnées (ready), signale les clics (selected), les mutations (mutated) et les éditions
 * visuelles finies (edit-proposed) ; la lentille envoie des commandes optimistes (select/hover/
 * preview-edit/clear-preview) — purement visuelles.
 *
 * LE MUR / TOLÉRANCE (§2 + calque Onlook withTryCatch) : le parseur ne crash jamais (parseFromIframe
 * → message typé OU null) ; l'iframe ne calcule AUCUNE édition de source. L'origine vide (app non
 * déployée) est gérée par le PARENT (DesignClient affiche l'état « non déployé ») — ici on ne monte
 * l'iframe que si devUrl est non vide.
 *
 * NOTE (OpenQuestion ADR 0071) : le rendu cross-origin live n'est pas testé en e2e hermétique
 * (validé à la main sur le déploiement) ; l'e2e teste la lentille + la capture + le mur via le twin.
 */
export function DesignIframe({
	devUrl,
	title,
	command,
	onMessage,
}: {
	/** L'URL live de l'app en dev (envStackOf). Non vide ici (le parent garde le cas vide). */
	readonly devUrl: string;
	readonly title: string;
	/** La dernière commande à pousser dans l'iframe (select/hover/preview-edit/clear-preview). */
	readonly command: ToIframe | null;
	/** Le rappel des messages typés reçus de l'iframe (ready/selected/mutated/edit-proposed). */
	readonly onMessage: (msg: FromIframe) => void;
}) {
	const ref = useRef<HTMLIFrameElement | null>(null);
	// La référence courante du rappel (évite de ré-attacher l'écouteur à chaque rendu).
	const onMessageRef = useRef(onMessage);
	useEffect(() => {
		onMessageRef.current = onMessage;
	}, [onMessage]);

	// L'ÉCOUTE des messages de l'iframe — tolérante (parseFromIframe ne lève jamais). On ne
	// retient que les messages provenant de NOTRE iframe (la source de l'événement).
	useEffect(() => {
		const handler = (ev: MessageEvent) => {
			if (ref.current !== null && ev.source !== ref.current.contentWindow)
				return;
			const msg = parseFromIframe(ev.data);
			if (msg !== null) onMessageRef.current(msg);
		};
		window.addEventListener("message", handler);
		return () => window.removeEventListener("message", handler);
	}, []);

	// LE POUSSAGE d'une commande optimiste vers l'iframe (best-effort — un postMessage qui
	// échoue n'a aucun effet, jamais un crash : le bridge applique l'édition optimiste).
	useEffect(() => {
		if (command === null) return;
		const win = ref.current?.contentWindow;
		if (!win) return;
		try {
			win.postMessage(command, "*");
		} catch {
			// purement visuel — une preview perdue est inoffensive (le requirement reste la vérité).
		}
	}, [command]);

	return (
		<iframe
			ref={ref}
			data-testid="v3-design-iframe"
			title={title}
			src={devUrl}
			// SANDBOX : l'app live tourne isolée ; les scripts (le bridge) et same-origin de SON
			// origine sont autorisés, mais elle ne peut pas naviguer le parent (le mur visuel).
			sandbox="allow-scripts allow-same-origin allow-forms"
			className="h-[32rem] w-full rounded-lg border border-border bg-background"
		/>
	);
}
