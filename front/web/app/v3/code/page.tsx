import { Code2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * /v3/code — CODE : votre éditeur en direct (mandat utilisateur 2026-06-12).
 *
 * SERVER Component : lit `process.env.AIDOS_VSCODE_URL` (l'openvscode-server hôte,
 * routé par Traefik sur vscode.sagedesk.fr) — l'URL porte le jeton de connexion et
 * n'est JAMAIS exposée ailleurs que dans ce rendu (pas de log, pas de client bundle
 * hors de cette page). Quand l'env est absent : l'état amical + les replis (/v2/code
 * — la descente dans le code — et la piste vscode://file en local).
 *
 * SÉCURITÉ : le jeton (?tkn=…) gate l'IDE — quiconque a l'URL a l'éditeur. Le vrai
 * gating multi-utilisateur (auth par compte, pas par secret partagé) est une
 * OpenQuestion ADR 0052-bis ; ne pas considérer ce jeton comme une authentification.
 * Le mur intact : la page LIE un éditeur, elle n'écrit aucune vérité.
 */
export default async function V3CodeScreen() {
	const t = await getTranslations("v3");
	const url = process.env.AIDOS_VSCODE_URL ?? null;

	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-6">
			<header className="flex flex-col gap-2">
				<h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
					<Code2 className="h-6 w-6 text-primary" aria-hidden />
					{t("codeTitle")}
				</h1>
				<p className="max-w-2xl text-sm text-muted-foreground">
					{t("codeIntro")}
				</p>
			</header>

			{url ? (
				<div className="flex flex-col gap-4">
					<div>
						<a
							data-testid="v3-code-open"
							href={url}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90"
						>
							<ExternalLink className="h-5 w-5" aria-hidden />
							{t("codeOpenBtn")}
						</a>
					</div>
					<p className="text-xs text-muted-foreground">{t("codeFrameHint")}</p>
					<iframe
						data-testid="v3-code-frame"
						src={url}
						title={t("codeFrameTitle")}
						className="h-[70vh] w-full rounded-xl border"
						allow="clipboard-read; clipboard-write"
					/>
				</div>
			) : (
				<div
					data-testid="v3-code-unconfigured"
					className="flex flex-col gap-3 rounded-xl border border-border bg-card/40 p-6"
				>
					<p className="text-base font-medium text-foreground">
						{t("codeUnconfiguredTitle")}
					</p>
					<p className="text-sm text-muted-foreground">
						{t("codeUnconfiguredHint")}
					</p>
					<ul className="list-inside list-disc text-sm text-muted-foreground">
						<li>
							<Link
								href="/v2/code"
								className="font-medium text-primary underline-offset-4 hover:underline"
							>
								{t("codeFallbackV2")}
							</Link>
						</li>
						<li>{t("codeFallbackLocal")}</li>
					</ul>
				</div>
			)}
		</div>
	);
}
