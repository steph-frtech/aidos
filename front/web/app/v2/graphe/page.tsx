import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { NEED_SAMPLES } from "@/lib/v2/ai-lab";
import { GrapheClient } from "./GrapheClient";

/**
 * /v2/graphe — le GRAPHE 3D façon Obsidian (étape WB2-18 ; ROADMAP-fke ; ADR 0007 · 0010 · 0011).
 *
 * Quand il y a BEAUCOUP de specs, une liste ne tient pas — un GRAPHE oui. Chaque spec (placée) + chaque
 * spec du DAG existant est un NŒUD posé sur TROIS axes : x = la VERTICALE (niveau), y = la FACETTE,
 * z = la PROFONDEUR d'anatomie (spec → sous-spec). Les LIENS = la descente d'anatomie + l'IMPACT sur le
 * DAG existant. Les couleurs portent l'état (proposé / validé / réalisé ; impacté / résolu).
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : la DONNÉE du graphe est `buildSpecGraph` (réutilisé de v1) —
 * pure, déterministe, content-adressée ; la résolution rouge → vert lit le MÊME `impactResolved` que la
 * liste / la grille / les cellules (cohérent PARTOUT). Tout délégué au twin pur lib/v2/ai-lab.ts.
 *
 * Themed (tokens shadcn) + bilingue (next-intl, FR par défaut). Le mur intact : lecture + proposition.
 */

const KEYS = [
	"eyebrow",
	"title",
	"subtitle",
	"homeTitle",
	"wallNote",
	"samplesHeading",
	"samplesHint",
	"validateAllBtn",
	"resetBtn",
	"tallySpecs",
	"tallyDag",
	"tallyImpacted",
	"tallyResolved",
	"tallyLinks",
	"graphEmpty",
	"graphHint",
	"axisX",
	"axisY",
	"axisZ",
	"legendHeading",
	"legendProposed",
	"legendValidated",
	"legendRealized",
	"legendDag",
	"legendImpacted",
	"legendResolved",
	"linkDescent",
	"linkImpact",
	"determinismNote",
] as const;

export default async function V2GrapheScreen() {
	const t = await getTranslations("v2Graphe");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-5xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-graphe-back-home"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("homeTitle")}
			</Link>

			<header className="space-y-2">
				<p className="text-xs font-semibold tracking-wide text-primary uppercase">
					{t("eyebrow")}
				</p>
				<h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
				<p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
			</header>

			<p
				data-testid="v2-graphe-wall-note"
				className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
			>
				{t("wallNote")}
			</p>

			<GrapheClient samples={NEED_SAMPLES} t={strings} />

			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{t("determinismNote")}
			</p>
		</div>
	);
}
