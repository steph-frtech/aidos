import { getTranslations } from "next-intl/server";
import { DagClient } from "./DagClient";

/**
 * WB2-07 — /v2/dag : le VERSION DAG (S24, KRD §120-§125). L'espace des versions est un DAG, pas une
 * ligne : les NŒUDS = des versions (phases stables, identité = HASH content-addressé), les ARÊTES =
 * des ChangeSets (S20). APPEND-ONLY : la ligne abandonnée reste dessinée (dimmée, jamais détruite) ;
 * la STRATIFICATION de la ligne de flottaison (§124) est dessinée en deux bandes (above = vérité
 * humaine, below = évolutionnaire). Rendu en React Flow (ADR 0053).
 *
 * ACTION-CAPABLE (ui-completeness) : pan/zoom activé ; cliquer un nœud-version l'ouvre (descend dans
 * son détail). Themed + bilingue (FR d'abord, ADR 0010/0011, namespace v2Dag). Le mur intact :
 * projection de lecture, aucune écriture-vérité — la promotion reste idée → miroir → /goal.
 */
export default async function V2DagPage() {
	const t = await getTranslations("v2Dag");

	const strings: Record<string, string> = {
		versions: t("versions"),
		changesets: t("changesets"),
		head: t("head"),
		bandAbove: t("bandAbove"),
		bandBelow: t("bandBelow"),
		canvasLabel: t("canvasLabel"),
		hash: t("hash"),
		parents: t("parents"),
		root: t("root"),
		stratum: t("stratum"),
		reachableFromRoot: t("reachableFromRoot"),
		yes: t("yes"),
		no: t("no"),
		readOnlyNote: t("readOnlyNote"),
	};

	return (
		<div className="mx-auto w-full max-w-5xl space-y-6">
			<section className="space-y-3">
				<p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
					{t("eyebrow")}
				</p>
				<h1
					data-testid="v2-dag-title"
					className="text-3xl font-bold tracking-tight text-foreground"
				>
					{t("title")}
				</h1>
				<p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
					{t("subtitle")}
				</p>
				<div
					data-testid="v2-dag-wall-note"
					className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-primary"
				>
					{t("wallNote")}
				</div>
			</section>

			<DagClient t={strings} />
		</div>
	);
}
