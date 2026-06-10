import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { GoalWizardClient } from "./GoalWizardClient";

/**
 * /v2/goal — le /goal : idée → ÉCRIRE LE MIROIR → /goal → GEL (étape WB2-11 ; KRD §116 ;
 * ADR 0010 · 0011 · 0053).
 *
 * Ce segment STATIQUE est sa propre route (goal n'est pas un slug du glossaire : aucun conflit avec
 * /v2/[slug]). La transition est conduite comme un wizard XState (via le twin pur lib/v2/goal.ts) +
 * stepper shadcn. L'écran est ACTION-CAPABLE : il écrit un miroir (HasMirror false→true), ouvre un
 * /goal (l'idée descend à sa coordonnée + reçoit une version gelée), et PROPOSE → un ChangeSet DRAFT —
 * jamais une écriture-vérité directe (le mur §2 ; une tentative directe est REFUSÉE par un BlockReason).
 * Themed + bilingue (FR d'abord). Le franchissement est calculé par le code, jamais par un LLM.
 */

// Les clés i18n passées au client (un composant client ne peut pas appeler getTranslations).
const KEYS = [
	"stepIdea",
	"stepMirror",
	"stepFrozen",
	"stateLabel",
	"ideaHeading",
	"ideaIntent",
	"ideaCoordinate",
	"ideaHasMirror",
	"expectedFormLabel",
	"mirrorHeading",
	"mirrorFormLabel",
	"mirrorTextLabel",
	"mirrorTextPlaceholder",
	"mirrorHint",
	"writeMirror",
	"openGoal",
	"directWrite",
	"restart",
	"frozenHeading",
	"versionLabel",
	"changeSetLabel",
	"changeSetStatus",
	"coordinateHeading",
	"hasMirrorLabel",
	"wroteKernelLabel",
	"yes",
	"no",
	"frozenNote",
	"blockHeading",
	"blockCode",
	"blockFix",
	"errFormUnknown",
	"errTextEmpty",
	"errMismatch",
] as const;

export default async function V2GoalScreen() {
	const t = await getTranslations("v2Goal");
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));

	return (
		<div className="mx-auto w-full max-w-3xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-goal-back-home"
				className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
			>
				← {t("title")}
			</Link>
			<section className="space-y-3">
				<span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</span>
				<h1
					data-testid="v2-goal-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p
					data-testid="v2-goal-subtitle"
					className="max-w-2xl text-base leading-relaxed text-foreground"
				>
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-goal-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<GoalWizardClient t={strings} />
		</div>
	);
}
