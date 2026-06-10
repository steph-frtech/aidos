import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { entry, type Locale } from "@/lib/v2/glossary";
import { IdeaWizardClient } from "./IdeaWizardClient";

/**
 * /v2/idee — l'ÉTAGE D'ENTRÉE : capturer un besoin → une idée (candidat-vérité, §115 ; étape
 * WB2-03 ; ADR 0010 · 0011 · 0053).
 *
 * Ce segment STATIQUE prime sur la route dynamique /v2/[slug] (Next) : l'idée a son propre écran,
 * un wizard XState + RHF/Zod (via le twin pur lib/v2/idea.ts) + stepper shadcn. Le wizard est
 * ACTION-CAPABLE : il capture et PROPOSE une idée (amber), il n'écrit AUCUNE vérité (le mur, §2).
 * Themed + bilingue (FR d'abord). Le verdict est calculé par le code, jamais par un LLM.
 */

// Les clés i18n passées au client (un composant client ne peut pas appeler getTranslations).
const KEYS = [
	"stepIntent",
	"stepCoordinate",
	"stepProvenance",
	"stepReview",
	"stepProposed",
	"stateLabel",
	"intentLabel",
	"intentPlaceholder",
	"intentHint",
	"levelLabel",
	"facetLabel",
	"scaleLabel",
	"provenanceLabel",
	"provenanceHumain",
	"provenanceIncident",
	"next",
	"back",
	"propose",
	"restart",
	"reviewHeading",
	"coordinateHeading",
	"mirrorFormHeading",
	"proposedHeading",
	"proposedNote",
	"ideaId",
	"hasMirrorLabel",
	"wroteKernelLabel",
	"no",
	"errIntent",
	"errLevel",
	"errFacet",
	"errScale",
	"errProvenance",
	"scaleCellule",
	"scaleKernel",
	"scaleFeuille",
] as const;

export default async function V2IdeaScreen() {
	const t = await getTranslations("v2Idee");
	const locale = (await getLocale()) as Locale;
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));
	// L'identité CANONIQUE du concept (le glossaire) — préserve le contrat de navigation
	// /v2 → /v2/idee (le bloc « Idée » mène ici) tout en livrant le wizard sous le concept.
	const concept = entry("idee");

	return (
		<div className="mx-auto w-full max-w-3xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-idee-back-home"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("title")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-concept-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{concept?.[locale].label}
				</h1>
				<p
					data-testid="v2-concept-def"
					className="max-w-2xl text-base leading-relaxed text-foreground"
				>
					{concept?.[locale].def}
				</p>
				<h2
					data-testid="v2-idee-title"
					className="pt-2 text-xl font-semibold tracking-tight text-foreground"
				>
					{t("title")}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-idee-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<IdeaWizardClient t={strings} />
		</div>
	);
}
