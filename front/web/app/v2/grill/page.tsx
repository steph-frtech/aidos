import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GrillWizardClient } from "./GrillWizardClient";

/**
 * /v2/grill — le geste GRILL-WITH-DOCS (CLAUDE.md §6 phase 1 ; étape WB2-10 ; ADR 0010 · 0011 · 0053).
 *
 * Ce segment STATIQUE est sa propre route (grill n'est pas un slug du glossaire : aucun conflit avec
 * /v2/[slug]). Le geste est conduit comme un wizard XState + RHF/Zod (via le twin pur lib/v2/grill.ts)
 * + stepper shadcn. L'écran est ACTION-CAPABLE : il affûte une intention et PROPOSE une intention
 * affûtée + des ADRs candidats (le seul geste de cet étage), sans écrire AUCUNE vérité (le mur, §2).
 * Themed + bilingue (FR d'abord). Le verdict est calculé par le code, jamais par un LLM.
 */

// Les clés i18n passées au client (un composant client ne peut pas appeler getTranslations).
const KEYS = [
	"stepIntention",
	"stepScenarios",
	"stepReview",
	"stepSharpened",
	"stateLabel",
	"intentLabel",
	"intentPlaceholder",
	"intentHint",
	"scenariosLabel",
	"scenariosHint",
	"addScenario",
	"removeScenario",
	"givenLabel",
	"whenLabel",
	"thenLabel",
	"scenarioCount",
	"next",
	"back",
	"sharpen",
	"restart",
	"reviewHeading",
	"reviewIntent",
	"reviewScenarios",
	"sharpenedHeading",
	"sharpenedIntentHeading",
	"verdictHeading",
	"verdictSharp",
	"verdictFuzzy",
	"adrsHeading",
	"noAdrs",
	"docSeedHeading",
	"conceptDoc",
	"internalsDoc",
	"idHeading",
	"hasMirrorLabel",
	"wroteKernelLabel",
	"no",
	"sharpenedNote",
	"errIntent",
	"errNoScenario",
	"errTooMany",
	"errIncomplete",
	"adopt",
] as const;

export default async function V2GrillScreen() {
	const t = await getTranslations("v2Grill");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-3xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-grill-back-home"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("title")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-grill-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p
					data-testid="v2-grill-subtitle"
					className="max-w-2xl text-base leading-relaxed text-foreground"
				>
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-grill-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<GrillWizardClient t={strings} />
		</div>
	);
}
