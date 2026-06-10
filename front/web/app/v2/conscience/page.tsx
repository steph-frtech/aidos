import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CONSCIENCE_CASES } from "@/lib/v2/conscience";
import { ConscienceClient } from "./ConscienceClient";

/**
 * /v2/conscience — la conscience, l'agrégateur déterministe (étape WB2-20 ; ROADMAP-fke FK09 ; FKE-6.3 ;
 * FKE-31 ; KRD §8 ; ADR 0007 · 0010 · 0011).
 *
 * La conscience N'INVENTE AUCUN juge (§8 — un évaluateur actif serait « le second agent qui valide », que
 * le Tome refuse comme preuve). Elle AGRÈGE les verdicts qui EXISTENT DÉJÀ : elle compare, paire par paire,
 * les quatre axes d'une vérité — VOULU (idée / miroir attendu), CONSTRUIT (code / projection), PROUVÉ
 * (miroir vert), AUTORISÉ (policy / mur) — et en tire UN rapport, UN voyant 🟢/🔴/🟡 par paire, et SES
 * decision cards (accept / amend / reject / defer).
 *
 * RÉUTILISATION (pas de fork, ADR 0007) : le cœur agrégateur est `reconcile` (réutilisé de FK09
 * lib/conscience.ts, lui-même miroir du Go back/runtime/conscience) — pur, total, déterministe (mêmes
 * verdicts → même rapport). Tout délégué au twin pur lib/v2/conscience.ts.
 *
 * Themed (tokens shadcn) + bilingue (next-intl, FR par défaut). Le mur intact : lecture + proposition —
 * agir sur une card PROPOSE → /goal, jamais une écriture directe.
 */

const KEYS = [
	"eyebrow",
	"title",
	"subtitle",
	"homeTitle",
	"wallNote",
	"samplesHeading",
	"samplesHint",
	"caseAligned",
	"caseRunnerDrift",
	"caseBreakSecurity",
	"caseBreakExperience",
	"reconcileBtn",
	"resetBtn",
	"verdictAligned",
	"verdictDrift",
	"verdictLabel",
	"determinismLabel",
	"tallyGreen",
	"tallyRed",
	"tallyAdvisory",
	"axesHeading",
	"axisVoulu",
	"axisConstruit",
	"axisProuve",
	"axisAutorise",
	"axisVouluHint",
	"axisConstruitHint",
	"axisProuveHint",
	"axisAutoriseHint",
	"pairsHeading",
	"pairsEmpty",
	"colSource",
	"colFacet",
	"colPair",
	"colAxis",
	"colVerdict",
	"colDetail",
	"cardsHeading",
	"noCards",
	"cardBlast",
	"cardDrift",
	"cardAdvisory",
	"cardOptions",
	"cardRecommendation",
	"optAccept",
	"optAmend",
	"optReject",
	"optDefer",
	"proposeNote",
	"determinismNote",
] as const;

export default async function V2ConscienceScreen() {
	const t = await getTranslations("v2Conscience");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-5xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-conscience-back-home"
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
				data-testid="v2-conscience-wall-note"
				className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground"
			>
				{t("wallNote")}
			</p>

			<ConscienceClient cases={CONSCIENCE_CASES} t={strings} />

			<p className="text-[11px] leading-relaxed text-muted-foreground">
				{t("determinismNote")}
			</p>
		</div>
	);
}
