import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WHY_CASES } from "@/lib/v2/why";
import { WhyClient } from "./WhyClient";

/**
 * /v2/why — le WhyTree, l'arbre caused_by (étape WB2-19 ; ROADMAP-fke FK13 ; FKE-35.1 ; ADR 0007 · 0010 · 0011).
 *
 * Un miroir ROUGE est un SYMPTÔME. Le WhyTree remonte DÉTERMINISTIQUEMENT les arêtes caused_by (l'inverse
 * de la vague de rouge), hop par hop, du symptôme à la cause RACINE — le « 5-pourquoi redressé » (fishbone,
 * rendu React Arborist). Chaque cause du graphe est reproductible par construction ; une cause HORS-graphe
 * proposée par le LLM n'entre QUE si elle est VÉRIFIÉE (reproduite ; une cause rejetée est élaguée). L'arbre
 * se TERMINE OBLIGATOIREMENT en miroir — un WhyTree sans miroir terminal est REFUSÉ (WHYTREE_NO_MIRROR).
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : la remontée est `trace` (réutilisé de FK12 lib/caused-by.ts) —
 * pure, déterministe, content-adressée, refus de cycle. Tout délégué au twin pur lib/v2/why.ts.
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
	"buildBtn",
	"resetBtn",
	"tallyNodes",
	"tallyLeaves",
	"tallyOffGraph",
	"tallyDepth",
	"treeEmpty",
	"treeHint",
	"refusedCycle",
	"refusedNoMirror",
	"terminalHeading",
	"terminalCovers",
	"prunedHeading",
	"legendHeading",
	"legendInGraph",
	"legendReproduced",
	"legendLeaf",
	"determinismNote",
] as const;

export default async function V2WhyScreen() {
	const t = await getTranslations("v2Why");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-5xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-why-back-home"
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
				data-testid="v2-why-wall-note"
				className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
			>
				{t("wallNote")}
			</p>

			<WhyClient cases={WHY_CASES} t={strings} />

			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{t("determinismNote")}
			</p>
		</div>
	);
}
