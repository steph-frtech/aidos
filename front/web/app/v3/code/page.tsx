import { getTranslations } from "next-intl/server";
import { CodeClient } from "./CodeClient";

/**
 * /v3/code — CODE : votre éditeur en direct, sur le PROJET en cours, par ENVIRONNEMENT.
 *
 * SERVER Component : lit `process.env.AIDOS_VSCODE_URL` (l'openvscode-server hôte,
 * routé par Traefik sur vscode.sagedesk.fr) et la PARSE — la base (origine + chemin)
 * et le jeton (?tkn=…) sont extraits ICI puis passés au client, qui RÉÉCRIT le
 * paramètre `folder` par onglet (dev/staging/prod → le workspace émis du projet ;
 * AIDOS → le dépôt du moteur). Le jeton vit dans `.env.local` — jamais dans le code
 * suivi ; il n'atteint le client que par ce rendu. Env absent : l'état amical + replis.
 *
 * SÉCURITÉ : le jeton gate l'IDE — quiconque a l'URL a l'éditeur. Le vrai gating
 * multi-utilisateur (auth par compte, pas par secret partagé) est une OpenQuestion
 * ADR 0052-bis ; ne pas considérer ce jeton comme une authentification.
 * Le mur intact : la page LIE un éditeur et émet des fichiers d'app — aucune vérité.
 */

/** Les libellés passés au client (motif KEYS — un client ne peut pas getTranslations). */
const KEYS = [
	"codeTitle",
	"codeIntro",
	"codeOpenBtn",
	"codeFrameHint",
	"codeFrameTitle",
	"codeUnconfiguredTitle",
	"codeUnconfiguredHint",
	"codeFallbackV2",
	"codeFallbackLocal",
	"codeProjectLabel",
	"codeEnvAidos",
	"codeEmitBtn",
	"codeEmitBusy",
	"codeEmitDone",
	"codeEmitFailed",
	"codeEmitNeedDeploy",
	"codeNoProject",
	"detailsLabel",
] as const;

export default async function V3CodeScreen() {
	const t = await getTranslations("v3");
	const raw = process.env.AIDOS_VSCODE_URL ?? null;
	// PARSE serveur : la base + le jeton — fail-closed (URL invalide → non configuré).
	let base: string | null = null;
	let token: string | null = null;
	if (raw !== null) {
		try {
			const u = new URL(raw);
			base = `${u.origin}${u.pathname}`;
			token = u.searchParams.get("tkn");
		} catch {
			base = null;
		}
	}
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));
	return <CodeClient base={base} token={token} t={strings} />;
}
