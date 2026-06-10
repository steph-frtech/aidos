import { getTranslations } from "next-intl/server";
import { LIB_SMOKES, smokeRegistryHash } from "@/lib/v2/lib-smoke";
import { LabClient } from "./LabClient";

/**
 * /v2/lab — le banc de sondes des librairies V2 (étape WB2-01 ; ADR 0010 · 0011 · 0053).
 *
 * Prouve, à l'écran et exécutable, que chaque lib V2 monte client-only (un arbre, un bouton
 * accessible, une machine XState, un formulaire validé, un React Flow). bpmn-js est différé
 * (OpenQuestion) — listé mais non monté. Le registre déterministe (lib/v2/lib-smoke.ts) est la
 * source unique ; son hash (content-addressed) est affiché. Themed + bilingue ; le mur intact.
 */
export default async function V2Lab() {
	const t = await getTranslations("v2Shell");

	return (
		<div className="mx-auto w-full max-w-5xl space-y-8">
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-lab-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("labTitle")}
				</h1>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("labSubtitle")}
				</p>
				<p
					data-testid="v2-lab-hash"
					className="font-mono text-xs text-muted-foreground"
				>
					{t("labRegistryHash")} : {smokeRegistryHash()}
				</p>
			</section>

			<LabClient />

			<section
				data-testid="v2-lab-deferred"
				className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm text-amber-700 dark:text-amber-400"
			>
				{t("labDeferred")} :{" "}
				{LIB_SMOKES.filter((s) => s.deferred)
					.map((s) => s.pkg)
					.join(", ")}
			</section>
		</div>
	);
}
