import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { entry, type Locale } from "@/lib/v2/glossary";
import { GridClient } from "./GridClient";

/**
 * WB2-05 — l'écran de la GRILLE niveau × facette (FKE-1.4 « les deux axes »).
 *
 * Rendu à DEUX routes : /v2/grille (la route de l'étape) ET /v2/verticale (le slug du concept
 * « Verticale » du glossaire — l'axe couplant, atteint depuis la carte/nav de /v2). Les deux
 * segments statiques priment sur la route dynamique /v2/[slug] et CONSERVENT le contrat de
 * navigation WB2-02 : un titre data-testid=v2-concept-title (le libellé canonique) + une définition
 * v2-concept-def.
 *
 * ACTION-CAPABLE (ui-completeness) : cliquer une cellule (niveau, facette) → ses kernels/specs ;
 * chaque spec → son anatomie (WB2-06). Sommes Σ par ligne/colonne/total, cohérentes (Σ = total).
 * Themed + bilingue (FR d'abord). Le mur intact : projection de lecture.
 */

const KEYS = [
	"total",
	"levelAxis",
	"facetAxis",
	"specsHere",
	"emptyCell",
] as const;

export async function GrilleScreen() {
	const t = await getTranslations("v2Grille");
	const locale = (await getLocale()) as Locale;
	const strings = Object.fromEntries(KEYS.map((k) => [k, t(k)]));
	// L'identité CANONIQUE du concept (le glossaire « verticale ») — préserve le contrat WB2-02.
	const concept = entry("verticale");

	return (
		<div className="mx-auto w-full max-w-4xl space-y-8">
			<Link
				href="/v2"
				data-testid="v2-grille-back-home"
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
					data-testid="v2-grille-title"
					className="pt-2 text-xl font-semibold tracking-tight text-foreground"
				>
					{t("title")}
				</h2>
				<p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-grille-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
				{/* Les gestes du niveau « operation » : rejouer ses fixtures (WB2-12) + voir leur pipeline (WB2-13). */}
				<div className="flex flex-wrap gap-3">
					<Link
						href="/v2/operations"
						data-testid="v2-grille-gesture-operations"
						className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
					>
						{t("gestureOperations")} →
					</Link>
					<Link
						href="/v2/workflows"
						data-testid="v2-grille-gesture-workflows"
						className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
					>
						{t("gestureWorkflows")} →
					</Link>
					<Link
						href="/v2/policy"
						data-testid="v2-grille-gesture-policy"
						className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
					>
						{t("gesturePolicy")} →
					</Link>
				</div>
			</section>

			<GridClient t={strings} />
		</div>
	);
}
